import { shiftMonth, todayString } from '../common/date/month-range.util';

export interface ParsedTransactionText {
  name: string;
  amount: number | null;
  type: 'EXPENSE' | 'INCOME';
  /** `YYYY-MM-DD` in APP_TIMEZONE, never later than today. */
  payment_date: string;
}

// `1.234,56` | `1.234` | `87,50` | `87.50` | `87`
const NUMBER = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

const FULL_OR_SHORT_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/;
const DAY_OF_MONTH = /\bdia\s+(\d{1,2})\b/i;
const RELATIVE_DAY = /\b(anteontem|ontem|hoje)\b/i;

const MARKED_AMOUNT = new RegExp(
  String.raw`R\$\s*(${NUMBER})|(${NUMBER})\s*(?:reais|real)\b`,
  'i',
);
const ANY_NUMBER = new RegExp(NUMBER, 'g');

const INCOME_TERMS =
  /\b(recebi|recebido|recebimento|ganhei|sal[aá]rio|receita|rendimento|reembolso)\b/i;
const ACTION_VERBS = /\b(paguei|comprei|gastei|recebi|ganhei)\b/gi;
// Words that dangle at the edges once the amount/date/verb are cut out ("recebi 500 do cliente").
const EDGE_WORDS = new Set([
  'de',
  'do',
  'da',
  'dos',
  'das',
  'no',
  'na',
  'em',
  'com',
  'para',
  'pra',
  'por',
  'um',
  'uma',
  'o',
  'a',
]);

type YMD = { year: number; month: number; day: number };

const pad = (n: number) => String(n).padStart(2, '0');
const format = ({ year, month, day }: YMD) =>
  `${year}-${pad(month)}-${pad(day)}`;

function parseYmd(date: string): YMD {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function isRealDate({ year, month, day }: YMD): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/** Calendar-day subtraction on plain integers; Date is used only as a UTC calendar. */
function minusDays(date: string, days: number): string {
  const { year, month, day } = parseYmd(date);
  const d = new Date(Date.UTC(year, month - 1, day - days));
  return format({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
}

/** Removes `[index, index + length)` from `text`, leaving a space so neighbours don't fuse. */
function cut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

function toAmount(raw: string): number | null {
  let normalized = raw;
  if (raw.includes('.') && raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Latest valid `dia N` that is not after `today`: this month, else walking back. */
function resolveDayOfMonth(day: number, today: string): string | null {
  let month = today.slice(0, 7);
  for (let i = 0; i < 12; i++) {
    const [year, monthNum] = month.split('-').map(Number);
    const candidate = { year, month: monthNum, day };
    if (isRealDate(candidate) && format(candidate) <= today) {
      return format(candidate);
    }
    month = shiftMonth(month, -1);
  }
  return null;
}

/** Latest valid `dd/mm` that is not after `today`: this year, else walking back (29/02). */
function resolveDayMonth(day: number, month: number, today: string) {
  const currentYear = parseYmd(today).year;
  for (let year = currentYear; year > currentYear - 8; year--) {
    const candidate = { year, month, day };
    if (isRealDate(candidate) && format(candidate) <= today) {
      return format(candidate);
    }
  }
  return null;
}

function extractDate(
  input: string,
  today: string,
): { date: string | null; rest: string } {
  const slash = FULL_OR_SHORT_DATE.exec(input);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let date: string | null;
    if (slash[3]) {
      const year =
        slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
      const explicit = { year, month, day };
      // An explicit date that is still to come is clamped: a draft describes the past.
      date = isRealDate(explicit)
        ? format(explicit) <= today
          ? format(explicit)
          : today
        : null;
    } else {
      date = resolveDayMonth(day, month, today);
    }
    if (date) {
      return { date, rest: cut(input, slash.index, slash[0].length) };
    }
  }

  const dayOfMonth = DAY_OF_MONTH.exec(input);
  if (dayOfMonth) {
    const date = resolveDayOfMonth(Number(dayOfMonth[1]), today);
    if (date) {
      return {
        date,
        rest: cut(input, dayOfMonth.index, dayOfMonth[0].length),
      };
    }
  }

  const relative = RELATIVE_DAY.exec(input);
  if (relative) {
    const offsets: Record<string, number> = {
      hoje: 0,
      ontem: 1,
      anteontem: 2,
    };
    return {
      date: minusDays(today, offsets[relative[1].toLowerCase()]),
      rest: cut(input, relative.index, relative[0].length),
    };
  }

  return { date: null, rest: input };
}

function extractAmount(input: string): {
  amount: number | null;
  rest: string;
} {
  const marked = MARKED_AMOUNT.exec(input);
  if (marked) {
    const amount = toAmount(marked[1] ?? marked[2]);
    if (amount !== null) {
      return { amount, rest: cut(input, marked.index, marked[0].length) };
    }
  }

  const numbers = [...input.matchAll(ANY_NUMBER)];
  const chosen =
    numbers.find((m) => /[.,]/.test(m[0])) ?? numbers[numbers.length - 1];
  if (chosen) {
    const amount = toAmount(chosen[0]);
    if (amount !== null) {
      return { amount, rest: cut(input, chosen.index, chosen[0].length) };
    }
  }

  return { amount: null, rest: input };
}

function buildName(input: string): string {
  const words = input
    .replace(ACTION_VERBS, ' ')
    .replace(/[\s,;:!?-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  while (words.length && EDGE_WORDS.has(words[0].toLowerCase())) words.shift();
  while (words.length && EDGE_WORDS.has(words[words.length - 1].toLowerCase()))
    words.pop();

  const name = words.join(' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Turns a free-text sentence ("mercado 87,50 ontem") into the deterministic part of a
 * transaction draft. Dates are cut out before the amount is searched so `dia 5` and
 * `10/03` can never be read as money.
 *
 * `today` is injectable for tests; it defaults to today in APP_TIMEZONE.
 */
export function parseTransactionText(
  text: string,
  today: string = todayString(),
): ParsedTransactionText {
  const { date, rest: withoutDate } = extractDate(text.trim(), today);
  const { amount, rest: withoutAmount } = extractAmount(withoutDate);

  return {
    name: buildName(withoutAmount),
    amount,
    type: INCOME_TERMS.test(text) ? 'INCOME' : 'EXPENSE',
    payment_date: date ?? today,
  };
}
