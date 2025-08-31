import { Injectable } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Repository } from 'typeorm';
import { PaymentTransactionDto } from './dto/payment-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}
  create(createTransactionDto: CreateTransactionDto) {
    return this.transactionRepository.save(createTransactionDto);
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
