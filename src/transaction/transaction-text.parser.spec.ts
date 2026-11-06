import { parseTransactionText } from './transaction-text.parser';

const TODAY = '2026-03-10';
const parse = (text: string, today = TODAY) =>
  parseTransactionText(text, today);

describe('parseTransactionText', () => {
  describe('amount', () => {
    it.each([
      ['mercado 87,50', 87.5],
      ['mercado R$ 87,50', 87.5],
      ['mercado R$87,50', 87.5],
      ['aluguel R$ 1.234,56', 1234.56],
      ['aluguel 1.234,56', 1234.56],
      ['mercado 87.50', 87.5],
      ['almoço 50 reais', 50],
      ['uber 30', 30],
      ['2 pães 8,00', 8],
    ])('%s -> %p', (text, amount) => {
      expect(parse(text).amount).toBe(amount);
    });

    it('returns null when there is no amount', () => {
      const draft = parse('padaria');
      expect(draft.amount).toBeNull();
      expect(draft.name).toBe('Padaria');
    });

    it('does not take "dia 5" as the amount', () => {
      const draft = parse('farmácia 25,90 dia 5');
      expect(draft.amount).toBe(25.9);
      expect(draft.payment_date).toBe('2026-03-05');
      expect(draft.name).toBe('Farmácia');
    });

    it('does not take dd/mm as the amount', () => {
      const draft = parse('farmácia 10/03 25');
      expect(draft.amount).toBe(25);
      expect(draft.payment_date).toBe('2026-03-10');
    });
  });

  describe('payment_date', () => {
    it.each([
      ['mercado 10 hoje', '2026-03-10'],
      ['mercado 10 ontem', '2026-03-09'],
      ['mercado 10 anteontem', '2026-03-08'],
      ['mercado 10 dia 5', '2026-03-05'],
      ['mercado 10 dia 10', '2026-03-10'],
      ['mercado 10 dia 25', '2026-02-25'],
      ['mercado 10 05/03', '2026-03-05'],
      ['mercado 10 25/12', '2025-12-25'],
      ['mercado 10 10/03/2026', '2026-03-10'],
      ['mercado 10 01/02/25', '2025-02-01'],
      ['mercado 10', '2026-03-10'],
    ])('%s -> %s', (text, date) => {
      expect(parse(text).payment_date).toBe(date);
    });

    it('crosses the month boundary for "ontem"', () => {
      expect(parse('mercado 10 ontem', '2026-03-01').payment_date).toBe(
        '2026-02-28',
      );
    });

    it('skips months that lack the day ("dia 31" in March -> January)', () => {
      expect(parse('mercado 10 dia 31', '2026-03-10').payment_date).toBe(
        '2026-01-31',
      );
    });

    it('never returns a future date, even when one is written out', () => {
      expect(parse('mercado 10 10/03/2027').payment_date).toBe(TODAY);
    });

    it('ignores an impossible date instead of inventing one', () => {
      expect(parse('mercado 10 31/02').payment_date).toBe(TODAY);
    });

    it("uses the caller's local day, so a 23h30 request still lands on that day", () => {
      jest.useFakeTimers();
      try {
        // 23:30 in America/Sao_Paulo (UTC-3) on 2026-03-10 is already 2026-03-11 in UTC.
        jest.setSystemTime(new Date('2026-03-11T02:30:00Z'));
        expect(parseTransactionText('mercado 10').payment_date).toBe(
          '2026-03-10',
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('type', () => {
    it('is EXPENSE by default', () => {
      expect(parse('mercado 87,50').type).toBe('EXPENSE');
    });

    it.each(['recebi 500 do cliente', 'salário 3000', 'Ganhei 50'])(
      '%s is INCOME',
      (text) => {
        expect(parse(text).type).toBe('INCOME');
      },
    );
  });

  describe('name', () => {
    it('drops amount, date and action verbs', () => {
      expect(parse('mercado 87,50 ontem').name).toBe('Mercado');
      expect(parse('paguei luz 120').name).toBe('Luz');
    });

    it('trims dangling connectives', () => {
      expect(parse('recebi 500 do cliente').name).toBe('Cliente');
    });

    it('keeps multi-word names', () => {
      expect(parse('conta de luz 120,00 dia 5').name).toBe('Conta de luz');
    });

    it('is empty when nothing is left', () => {
      expect(parse('87,50').name).toBe('');
    });
  });

  it('full sentence', () => {
    expect(parse('mercado 87,50 ontem')).toEqual({
      name: 'Mercado',
      amount: 87.5,
      type: 'EXPENSE',
      payment_date: '2026-03-09',
    });
  });
});
