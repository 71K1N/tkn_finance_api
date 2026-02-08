import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavingsGoal } from './entities/savings-goal.entity';
import { WishItem } from '../wish-item/entities/wish-item.entity';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';

@Injectable()
export class SavingsGoalService {
  constructor(
    @InjectRepository(SavingsGoal)
    private savingsGoalRepository: Repository<SavingsGoal>,
    @InjectRepository(WishItem)
    private wishItemRepository: Repository<WishItem>,
  ) {}

  async create(userId: number, createSavingsGoalDto: CreateSavingsGoalDto): Promise<SavingsGoal> {
    const goal = this.savingsGoalRepository.create({
      userId,
      targetAmount: createSavingsGoalDto.targetAmount,
      currentSaved: 0,
      monthlyAllocation: createSavingsGoalDto.monthlyAllocation,
      projectedCompletionDate: this.calculateProjectedCompletion(0, createSavingsGoalDto.targetAmount, createSavingsGoalDto.monthlyAllocation),
      created_by: userId,
    });
    return this.savingsGoalRepository.save(goal);
  }

  async findAll(userId: number): Promise<SavingsGoal[]> {
    return this.savingsGoalRepository.find({
      where: { userId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number, userId: number): Promise<SavingsGoal | null> {
    const goal = await this.savingsGoalRepository.findOne({ where: { id } });
    if (goal && goal.userId === userId) {
      return goal;
    }
    return null;
  }

  async update(id: number, userId: number, updateSavingsGoalDto: UpdateSavingsGoalDto): Promise<SavingsGoal> {
    const goal = await this.findOne(id, userId);
    if (!goal) {
      throw new Error('Savings goal not found');
    }

    if (updateSavingsGoalDto.targetAmount !== undefined) {
      goal.targetAmount = updateSavingsGoalDto.targetAmount;
    }
    if (updateSavingsGoalDto.monthlyAllocation !== undefined) {
      goal.monthlyAllocation = updateSavingsGoalDto.monthlyAllocation;
    }

    goal.projectedCompletionDate = this.calculateProjectedCompletion(goal.currentSaved, goal.targetAmount, goal.monthlyAllocation);
    goal.updated_by = userId;
    goal.updated_at = new Date();
    return this.savingsGoalRepository.save(goal);
  }

  async deposit(id: number, userId: number, amount: number): Promise<SavingsGoal> {
    const goal = await this.findOne(id, userId);
    if (!goal) {
      throw new Error('Savings goal not found');
    }
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    if (goal.currentSaved + amount > goal.targetAmount) {
      goal.currentSaved = goal.targetAmount;
    } else {
      goal.currentSaved += amount;
    }

    goal.projectedCompletionDate = this.calculateProjectedCompletion(goal.currentSaved, goal.targetAmount, goal.monthlyAllocation);
    goal.updated_by = userId;
    goal.updated_at = new Date();
    return this.savingsGoalRepository.save(goal);
  }

  async withdraw(id: number, userId: number, amount: number): Promise<SavingsGoal> {
    const goal = await this.findOne(id, userId);
    if (!goal) {
      throw new Error('Savings goal not found');
    }
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }
    if (amount > goal.currentSaved) {
      throw new Error('Insufficient funds');
    }

    goal.currentSaved -= amount;
    goal.projectedCompletionDate = this.calculateProjectedCompletion(goal.currentSaved, goal.targetAmount, goal.monthlyAllocation);
    goal.updated_by = userId;
    goal.updated_at = new Date();
    return this.savingsGoalRepository.save(goal);
  }

  async getWishItems(id: number, userId: number): Promise<WishItem[]> {
    const goal = await this.findOne(id, userId);
    if (!goal) {
      throw new Error('Savings goal not found');
    }
    return this.wishItemRepository.find({ where: { linkedGoalId: id }, order: { targetDate: 'ASC' } });
  }

  async getProgress(id: number, userId: number): Promise<{
    targetAmount: number;
    currentSaved: number;
    remaining: number;
    percentageComplete: number;
    monthlyAllocation: number;
    projectedCompletionDate: Date | null;
  }> {
    const goal = await this.findOne(id, userId);
    if (!goal) {
      throw new Error('Savings goal not found');
    }

    const percentageComplete = (goal.currentSaved / goal.targetAmount) * 100;
    return {
      targetAmount: goal.targetAmount,
      currentSaved: goal.currentSaved,
      remaining: Math.max(0, goal.targetAmount - goal.currentSaved),
      percentageComplete: Math.min(100, percentageComplete),
      monthlyAllocation: goal.monthlyAllocation,
      projectedCompletionDate: goal.projectedCompletionDate,
    };
  }

  async delete(id: number, userId: number): Promise<void> {
    const goal = await this.findOne(id, userId);
    if (!goal) {
      throw new Error('Savings goal not found');
    }
    await this.wishItemRepository.update({ linkedGoalId: id }, { linkedGoalId: null });
    await this.savingsGoalRepository.delete(id);
  }

  private calculateProjectedCompletion(currentSaved: number, targetAmount: number, monthlyAllocation: number): Date | null {
    if (currentSaved >= targetAmount) {
      return new Date();
    }
    if (monthlyAllocation <= 0) {
      return null;
    }

    const remaining = targetAmount - currentSaved;
    const monthsNeeded = Math.ceil(remaining / monthlyAllocation);

    const projectedDate = new Date();
    projectedDate.setMonth(projectedDate.getMonth() + monthsNeeded);
    return projectedDate;
  }
}
