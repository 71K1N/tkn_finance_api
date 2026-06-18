import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoryModule } from './category/category.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubcategoryModule } from './subcategory/subcategory.module';
import { BankAccountModule } from './bank-account/bank-account.module';
import { TransactionModule } from './transaction/transaction.module';
import { BudgetModule } from './budget/budget.module';
import { WishItemModule } from './wish-item/wish-item.module';
import { SavingsGoalModule } from './savings-goal/savings-goal.module';
import { WebhookModule } from './webhook/webhook.module';
import { Category } from './category/entities/category.entity';
import { Subcategory } from './subcategory/entities/subcategory.entity';
import { Transaction } from './transaction/entities/transaction.entity';
import { BankAccount } from './bank-account/entities/bank-account.entity';
import { Budget } from './budget/entities/budget.entity';
import { BudgetAlert } from './budget/entities/budget-alert.entity';
import { WishItem } from './wish-item/entities/wish-item.entity';
import { SavingsGoal } from './savings-goal/entities/savings-goal.entity';
import { WebhookSubscription } from './webhook/entities/webhook-subscription.entity';

@Module({
  imports: [
    CategoryModule,
    TypeOrmModule.forRoot({
      type: 'mongodb',
      url: process.env.MONGODB_URI,
      entities: [Category, Subcategory, Transaction, BankAccount, Budget, BudgetAlert, WishItem, SavingsGoal, WebhookSubscription],
      synchronize: true,
      logging: true,
    }),
    SubcategoryModule,
    BankAccountModule,
    TransactionModule,
    BudgetModule,
    WishItemModule,
    SavingsGoalModule,
    WebhookModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
