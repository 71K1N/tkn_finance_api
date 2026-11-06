import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Groq from 'groq-sdk';
import { MongoRepository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';
import { Category } from '../category/entities/category.entity';
import { parseTransactionText } from './transaction-text.parser';

const GROQ_MODEL = 'openai/gpt-oss-20b';
const GROQ_TIMEOUT_MS = 4000;

export interface TransactionDraft {
  name: string;
  amount: number | null;
  type: 'EXPENSE' | 'INCOME';
  payment_date: string;
  subcategory_id: string | null;
  account_id: string | null;
}

/** Character classes so "cafe" also finds "Café" without needing a normalized column. */
const ACCENT_CLASSES: Record<string, string> = {
  a: '[aàáâãä]',
  e: '[eèéêë]',
  i: '[iìíîï]',
  o: '[oòóôõö]',
  u: '[uùúûü]',
  c: '[cç]',
  n: '[nñ]',
};

/** Case- and accent-insensitive, whole-string match for `name`. */
function nameMatcher(name: string): RegExp {
  const folded = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const source = [...folded]
    .map(
      (ch) => ACCENT_CLASSES[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^\\s*${source}\\s*$`, 'i');
}

@Injectable()
export class TransactionParserService {
  private readonly logger = new Logger(TransactionParserService.name);
  private readonly groq: Groq | null;

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: MongoRepository<Transaction>,
    @InjectRepository(Subcategory)
    private subcategoryRepository: MongoRepository<Subcategory>,
    @InjectRepository(Category)
    private categoryRepository: MongoRepository<Category>,
  ) {
    this.groq = process.env.GROQ_API_KEY
      ? new Groq({ apiKey: process.env.GROQ_API_KEY })
      : null;
  }

  /** Builds a draft from free text. Read-only: never writes a transaction. */
  async parse(userId: number, text: string): Promise<TransactionDraft> {
    const parsed = parseTransactionText(text);

    const history = parsed.name
      ? await this.findHistory(userId, parsed.name)
      : null;

    let subcategoryId = history?.subcategory_id?.toString() ?? null;
    if (!history && parsed.name) {
      subcategoryId = await this.suggestSubcategory(parsed.name);
    }

    const accountId = history
      ? history.account_id?.toString()
      : await this.findDefaultAccount(userId);

    return {
      ...parsed,
      subcategory_id: subcategoryId,
      account_id: accountId ?? null,
    };
  }

  /** Most recent transaction of this user with the same name that carries a subcategory. */
  private findHistory(userId: number, name: string) {
    return this.transactionRepository.findOne({
      where: {
        user_id: userId,
        name: { $regex: nameMatcher(name) },
        subcategory_id: { $ne: null },
        is_transfer_mirror: { $ne: true },
      } as any,
      order: { created_at: 'DESC' },
    });
  }

  private async findDefaultAccount(userId: number): Promise<string | null> {
    const latest = await this.transactionRepository.findOne({
      where: { user_id: userId, is_transfer_mirror: { $ne: true } } as any,
      order: { created_at: 'DESC' },
    });
    return latest?.account_id?.toString() ?? null;
  }

  /** Asks Groq to pick from the closed list of real subcategory ids; null on any failure. */
  private async suggestSubcategory(name: string): Promise<string | null> {
    if (!this.groq) {
      this.logger.warn('GROQ_API_KEY not set, skipping subcategory suggestion');
      return null;
    }

    try {
      const [subcategories, categories] = await Promise.all([
        this.subcategoryRepository.find(),
        this.categoryRepository.find(),
      ]);
      if (!subcategories.length) return null;

      const categoryNames = new Map(
        categories.map((c) => [c.id.toString(), c.name]),
      );
      const options = subcategories.map((s) => ({
        id: s.id.toString(),
        name: s.name,
        category: categoryNames.get(s.categoryId?.toString()) ?? null,
      }));

      const completion = await this.groq.chat.completions.create(
        {
          model: GROQ_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Você classifica lançamentos financeiros. Recebe o nome de um lançamento e uma ' +
                'lista de subcategorias [{id, name, category}]. Escolha a subcategoria que melhor ' +
                'descreve o lançamento, usando EXCLUSIVAMENTE um id da lista. Se nenhuma servir, ' +
                'use null. Responda em JSON no formato exato: {"subcategory_id": "<id>" | null}',
            },
            {
              role: 'user',
              content: JSON.stringify({ name, subcategories: options }),
            },
          ],
        },
        { timeout: GROQ_TIMEOUT_MS, maxRetries: 0 },
      );

      const content = completion.choices[0]?.message?.content;
      if (!content) return null;

      const { subcategory_id } = JSON.parse(content) as {
        subcategory_id?: unknown;
      };
      if (
        typeof subcategory_id === 'string' &&
        options.some((o) => o.id === subcategory_id)
      ) {
        return subcategory_id;
      }
      if (subcategory_id != null) {
        this.logger.warn(
          `Groq returned a subcategory id outside the list, discarding: ${String(subcategory_id)}`,
        );
      }
      return null;
    } catch (error) {
      this.logger.warn(
        `Groq call failed, returning draft without subcategory: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
