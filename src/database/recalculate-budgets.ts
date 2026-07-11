import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { AppModule } from '../app.module';
import { BudgetService } from '../budget/budget.service';
import { Budget } from '../budget/entities/budget.entity';

/**
 * One-off retroactive fix: recalculates `spent` for every existing budget using the
 * corrected BudgetService.calculateSpent() (uppercase EXPENSE type + payment_date
 * instead of created_at). Reuses BudgetService.updateSpent() directly so the
 * calculation logic can't drift from the live code path.
 */
async function recalculateBudgets() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const budgetRepository = app.get<MongoRepository<Budget>>(
    getRepositoryToken(Budget),
  );
  const budgetService = app.get(BudgetService);

  const budgets = await budgetRepository.find();
  console.log(`Recalculando spent de ${budgets.length} budget(s)...`);

  let changed = 0;
  for (const budget of budgets) {
    const before = budget.spent;
    const updated = await budgetService.updateSpent(budget.id);
    if (updated.spent !== before) {
      changed++;
      console.log(
        `  budget ${budget.id.toString()} (userId=${budget.userId}, month=${budget.month}): spent ${before} -> ${updated.spent}`,
      );
    }
  }

  console.log(`Concluído. ${changed} de ${budgets.length} budget(s) atualizados.`);
  await app.close();
}

recalculateBudgets()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha ao recalcular budgets:', err);
    process.exit(1);
  });
