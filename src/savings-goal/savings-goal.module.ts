import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingsGoal } from './entities/savings-goal.entity';
import { WishItem } from '../wish-item/entities/wish-item.entity';
import { SavingsGoalService } from './savings-goal.service';
import { SavingsGoalController } from './savings-goal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SavingsGoal, WishItem])],
  providers: [SavingsGoalService],
  controllers: [SavingsGoalController],
  exports: [SavingsGoalService],
})
export class SavingsGoalModule {}
