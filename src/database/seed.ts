import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { Category } from '../category/entities/category.entity';
import { Subcategory } from '../subcategory/entities/subcategory.entity';
import { BankAccount } from '../bank-account/entities/bank-account.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Budget, RolloverPolicy } from '../budget/entities/budget.entity';
import { SavingsGoal } from '../savings-goal/entities/savings-goal.entity';
import { CATEGORY_TAXONOMY } from './seed-data';

const SEED_USER_ID = 1;

async function seed() {
  const dataSource = new DataSource({
    type: 'mongodb',
    url: process.env.MONGODB_URI,
    entities: [
      Category,
      Subcategory,
      BankAccount,
      Transaction,
      Budget,
      SavingsGoal,
    ],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();

  const categoryRepo = dataSource.getMongoRepository(Category);
  const subcategoryRepo = dataSource.getMongoRepository(Subcategory);

  let categoriesCreated = 0;
  let categoriesSkipped = 0;
  let subcategoriesCreated = 0;
  let subcategoriesSkipped = 0;

  try {
    for (const categorySeed of CATEGORY_TAXONOMY) {
      const name = categorySeed.name.trim();
      let category = await categoryRepo.findOne({ where: { name } as any });

      if (!category) {
        category = await categoryRepo.save(
          categoryRepo.create({
            name,
            description: categorySeed.description,
            created_by: null,
            updated_by: null,
          }),
        );
        categoriesCreated++;
        console.log(`Categoria criada: ${name}`);
      } else {
        categoriesSkipped++;
        console.log(`Categoria já existe, ignorando: ${name}`);
      }

      for (const subSeed of categorySeed.subcategories) {
        const subName = subSeed.name.trim();
        const existingSub = await subcategoryRepo.findOne({
          where: { name: subName, categoryId: category.id } as any,
        });

        if (!existingSub) {
          await subcategoryRepo.save(
            subcategoryRepo.create({
              name: subName,
              description: subSeed.description,
              categoryId: category.id,
              created_by: null,
              updated_by: null,
            }),
          );
          subcategoriesCreated++;
          console.log(`  Subcategoria criada: ${subName}`);
        } else {
          subcategoriesSkipped++;
          console.log(`  Subcategoria já existe, ignorando: ${subName}`);
        }
      }
    }

    console.log('\nResumo:');
    console.log(
      `Categorias: ${categoriesCreated} criadas, ${categoriesSkipped} ignoradas`,
    );
    console.log(
      `Subcategorias: ${subcategoriesCreated} criadas, ${subcategoriesSkipped} ignoradas`,
    );

    await seedFinancialData(dataSource, subcategoryRepo);
  } catch (err) {
    console.error('Erro ao executar o seed:', err);
    process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
}

/**
 * Seeds ~6 months of paid transactions, a bank account, a budget and a savings
 * goal for SEED_USER_ID, so dashboard charts/insights have real data to render
 * instead of being empty. Skipped entirely if this user already has transactions
 * (idempotency guard — this seed isn't safe to run twice otherwise).
 */
async function seedFinancialData(
  dataSource: DataSource,
  subcategoryRepo: ReturnType<DataSource['getMongoRepository']>,
) {
  const transactionRepo = dataSource.getMongoRepository(Transaction);
  const bankAccountRepo = dataSource.getMongoRepository(BankAccount);
  const budgetRepo = dataSource.getMongoRepository(Budget);
  const savingsGoalRepo = dataSource.getMongoRepository(SavingsGoal);

  const existingTransaction = await transactionRepo.findOne({
    where: { user_id: SEED_USER_ID } as any,
  });
  if (existingTransaction) {
    console.log(
      '\nDados financeiros já existem para o usuário seed, ignorando.',
    );
    return;
  }

  const findSubcategory = async (categoryName: string, subName: string) => {
    const category = await dataSource
      .getMongoRepository(Category)
      .findOne({ where: { name: categoryName } as any });
    if (!category) return null;
    return subcategoryRepo.findOne({
      where: { name: subName, categoryId: category.id } as any,
    });
  };

  const [aluguel, supermercado, combustivel, streaming, salario] =
    await Promise.all([
      findSubcategory('Moradia', 'Aluguel'),
      findSubcategory('Alimentação', 'Supermercado'),
      findSubcategory('Transporte', 'Combustível'),
      findSubcategory('Lazer', 'Streaming'),
      findSubcategory('Renda', 'Salário'),
    ]);

  if (!aluguel || !supermercado || !combustivel || !streaming || !salario) {
    console.log(
      '\nSubcategorias esperadas não encontradas — pulando seed de dados financeiros.',
    );
    return;
  }

  const account = await bankAccountRepo.save(
    bankAccountRepo.create({
      description: 'Conta Corrente',
      balance: 0,
      created_by: SEED_USER_ID,
      updated_by: SEED_USER_ID,
    }),
  );

  const now = new Date();
  let netFlow = 0;
  let transactionsCreated = 0;

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 5);
    const isCurrentMonth = i === 0;

    const entries: {
      name: string;
      amount: number;
      type: 'INCOME' | 'EXPENSE';
      subcategoryId: any;
    }[] = [
      {
        name: 'Salário',
        amount: 6000,
        type: 'INCOME',
        subcategoryId: salario.id,
      },
      {
        name: 'Aluguel',
        amount: 1200,
        type: 'EXPENSE',
        subcategoryId: aluguel.id,
      },
      {
        name: 'Compras do mês',
        amount: 600 + i * 15,
        type: 'EXPENSE',
        subcategoryId: supermercado.id,
      },
      {
        name: 'Combustível',
        amount: 300 + i * 10,
        type: 'EXPENSE',
        subcategoryId: combustivel.id,
      },
      {
        name: 'Streaming e lazer',
        // Spiked in the current month so the AI insights anomaly detector
        // has something real to flag when this seed is used for testing.
        amount: isCurrentMonth ? 550 : 150,
        type: 'EXPENSE',
        subcategoryId: streaming.id,
      },
    ];

    for (const entry of entries) {
      await transactionRepo.save(
        transactionRepo.create({
          name: entry.name,
          description: entry.name,
          amount: entry.amount,
          due_date: monthDate,
          payment_date: monthDate,
          paid_amount: entry.amount,
          subcategory_id: entry.subcategoryId,
          account_id: account.id,
          user_id: SEED_USER_ID,
          type: entry.type,
          created_by: SEED_USER_ID,
          updated_by: SEED_USER_ID,
        }),
      );
      netFlow += entry.type === 'INCOME' ? entry.amount : -entry.amount;
      transactionsCreated++;
    }
  }

  account.balance = netFlow;
  await bankAccountRepo.save(account);

  const aluguelCategory = await dataSource
    .getMongoRepository(Category)
    .findOne({ where: { name: 'Moradia' } as any });
  if (aluguelCategory) {
    await budgetRepo.save(
      budgetRepo.create({
        userId: SEED_USER_ID,
        categoryId: aluguelCategory.id,
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        amount: 1500,
        spent: 0,
        rolloverPolicy: RolloverPolicy.NO_ROLLOVER,
        created_by: SEED_USER_ID,
      }),
    );
  }

  const projectedCompletion = new Date(now);
  projectedCompletion.setMonth(projectedCompletion.getMonth() + 10);
  await savingsGoalRepo.save(
    savingsGoalRepo.create({
      userId: SEED_USER_ID,
      name: 'Viagem para a praia',
      targetAmount: 8000,
      currentSaved: 1200,
      monthlyAllocation: 400,
      projectedCompletionDate: projectedCompletion,
      created_by: SEED_USER_ID,
    }),
  );

  console.log(
    `\nDados financeiros: 1 conta bancária, ${transactionsCreated} transações, 1 orçamento, 1 meta de poupança criados para o usuário seed.`,
  );
}

seed();
