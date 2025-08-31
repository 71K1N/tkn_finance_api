import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoryModule } from './category/category.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubcategoryModule } from './subcategory/subcategory.module';
import { BankAccountModule } from './bank-account/bank-account.module';
import { TransactionModule } from './transaction/transaction.module';
import { Category } from './category/entities/category.entity';
import { Subcategory } from './subcategory/entities/subcategory.entity';
import { Transaction } from './transaction/entities/transaction.entity';
import { BankAccount } from './bank-account/entities/bank-account.entity';

@Module({
  imports: [
    CategoryModule,
    TypeOrmModule.forRoot({
      database: './src/database/tknfinance.sqlite',
      type: 'sqlite',
      entities: [Category, Subcategory, Transaction, BankAccount],
      synchronize: true,
    }),
    SubcategoryModule,
    BankAccountModule,
    TransactionModule,
    BankAccountModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
