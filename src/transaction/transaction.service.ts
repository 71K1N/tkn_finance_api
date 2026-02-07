import { Injectable } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Repository } from 'typeorm';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { BudgetService } from '../budget/budget.service';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private readonly budgetService: BudgetService,
  ) {}

  /**
   * Create a transaction and trigger budget threshold checks
   */
  async create(createTransactionDto: CreateTransactionDto) {
    const transaction = await this.transactionRepository.save(createTransactionDto);

    // If this is an expense transaction, check budget thresholds
    if (createTransactionDto.type === 'expense' && transaction.user_id) {
      try {
        // Get current month in YYYY-MM format
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Find budgets for this user in current month
        const budgets = await this.budgetService.findByMonth(transaction.user_id, month);

        // For each budget, check thresholds
        for (const budget of budgets) {
          // Update spent amount first
          await this.budgetService.updateSpent(budget.id);
          // Then check if thresholds crossed
          await this.budgetService.checkThresholds(budget.id);
        }
      } catch (error) {
        // Log error but don't fail the transaction creation
        console.error('Error checking budget thresholds:', error);
      }
    }

    return transaction;
  }

  async findAll(): Promise<TransactionResponseDto[]> {
    const transactions = await this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.subcategory', 'subcategory')
      .leftJoin('subcategory.category', 'category')
      .addSelect('category.id', 'categoryId')
      .getRawAndEntities();

    return transactions.entities.map((transaction, index) => ({
      ...transaction,
      category_id: transactions.raw[index]?.categoryId || null
    }));
  }

  async findOne(id: number): Promise<TransactionResponseDto | null> {
    const result = await this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.subcategory', 'subcategory')
      .leftJoin('subcategory.category', 'category')
      .addSelect('category.id', 'categoryId')
      .where('transaction.id = :id', { id })
      .getRawAndEntities();

    if (result.entities.length > 0) {
      const transaction = result.entities[0];
      return {
        ...transaction,
        category_id: result.raw[0]?.categoryId || null
      };
    }

    return null;
  }

  update(id: number, updateTransactionDto: UpdateTransactionDto) {
    return this.transactionRepository.update(id, updateTransactionDto);
  }

  remove(id: number) {
    return this.transactionRepository.delete(id);
  }

  async payment(id: number, paymentDto: PaymentTransactionDto) {
    const transaction = await this.findOne(id);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return this.transactionRepository.update(id, {
      payment_date: paymentDto.payment_date || new Date(),
      paid_amount: paymentDto.paid_amount
    });
  }
}
