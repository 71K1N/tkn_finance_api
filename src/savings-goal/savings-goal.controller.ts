import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SavingsGoalService } from './savings-goal.service';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';
import {
  SavingsGoalResponseDto,
  SavingsGoalProgressDto,
} from './dto/savings-goal-response.dto';
import { WishItemResponseDto } from '../wish-item/dto/wish-item-response.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';

@Controller('savings-goal')
@UseGuards(AuthGuard)
export class SavingsGoalController {
  constructor(private readonly savingsGoalService: SavingsGoalService) {}

  @Post()
  async create(
    @User() userId: number,
    @Body() createSavingsGoalDto: CreateSavingsGoalDto,
  ): Promise<SavingsGoalResponseDto> {
    const goal = await this.savingsGoalService.create(
      userId,
      createSavingsGoalDto,
    );
    return new SavingsGoalResponseDto(goal);
  }

  @Get()
  async findAll(@User() userId: number): Promise<SavingsGoalResponseDto[]> {
    const goals = await this.savingsGoalService.findAll(userId);
    return goals.map((g) => new SavingsGoalResponseDto(g));
  }

  @Get(':id')
  async findOne(
    @User() userId: number,
    @Param('id') id: string,
  ): Promise<SavingsGoalResponseDto & { linkedWishItems?: WishItemResponseDto[] }> {
    const goalId = parseInt(id, 10);
    if (isNaN(goalId)) {
      throw new BadRequestException('id must be a valid number');
    }
    const goal = await this.savingsGoalService.findOne(goalId, userId);
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }
    const wishItems = await this.savingsGoalService.getWishItems(
      goalId,
      userId,
    );
    return {
      ...new SavingsGoalResponseDto(goal),
      linkedWishItems: wishItems.map((w) => new WishItemResponseDto(w)),
    };
  }

  @Patch(':id')
  async update(
    @User() userId: number,
    @Param('id') id: string,
    @Body() updateSavingsGoalDto: UpdateSavingsGoalDto,
  ): Promise<SavingsGoalResponseDto> {
    const goalId = parseInt(id, 10);
    if (isNaN(goalId)) {
      throw new BadRequestException('id must be a valid number');
    }
    try {
      const goal = await this.savingsGoalService.update(
        goalId,
        userId,
        updateSavingsGoalDto,
      );
      return new SavingsGoalResponseDto(goal);
    } catch (error) {
      throw new NotFoundException('Savings goal not found');
    }
  }

  @Get(':id/progress')
  async getProgress(
    @User() userId: number,
    @Param('id') id: string,
  ): Promise<SavingsGoalProgressDto> {
    const goalId = parseInt(id, 10);
    if (isNaN(goalId)) {
      throw new BadRequestException('id must be a valid number');
    }
    try {
      return await this.savingsGoalService.getProgress(goalId, userId);
    } catch (error) {
      throw new NotFoundException('Savings goal not found');
    }
  }

  @Post(':id/deposit')
  async deposit(
    @User() userId: number,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ): Promise<SavingsGoalResponseDto> {
    const goalId = parseInt(id, 10);
    if (isNaN(goalId)) {
      throw new BadRequestException('id must be a valid number');
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    try {
      const goal = await this.savingsGoalService.deposit(
        goalId,
        userId,
        amount,
      );
      return new SavingsGoalResponseDto(goal);
    } catch (error) {
      if ((error as Error).message?.includes('not found')) {
        throw new NotFoundException('Savings goal not found');
      }
      throw new BadRequestException(
        (error as Error).message || 'Deposit failed',
      );
    }
  }

  @Post(':id/withdraw')
  async withdraw(
    @User() userId: number,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ): Promise<SavingsGoalResponseDto> {
    const goalId = parseInt(id, 10);
    if (isNaN(goalId)) {
      throw new BadRequestException('id must be a valid number');
    }
    if (!amount || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    try {
      const goal = await this.savingsGoalService.withdraw(
        goalId,
        userId,
        amount,
      );
      return new SavingsGoalResponseDto(goal);
    } catch (error) {
      const message = (error as Error).message;
      if (message?.includes('not found')) {
        throw new NotFoundException('Savings goal not found');
      }
      throw new BadRequestException(message || 'Withdrawal failed');
    }
  }

  @Delete(':id')
  async delete(
    @User() userId: number,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    const goalId = parseInt(id, 10);
    if (isNaN(goalId)) {
      throw new BadRequestException('id must be a valid number');
    }
    try {
      await this.savingsGoalService.delete(goalId, userId);
      return { message: 'Savings goal deleted successfully' };
    } catch (error) {
      throw new NotFoundException('Savings goal not found');
    }
  }
}
