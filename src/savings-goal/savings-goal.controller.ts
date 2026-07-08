import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { ObjectId } from 'mongodb';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';

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
  async findAll(@User() userId: number, @Query() query: FindAllQueryDto) {
    const result = await this.savingsGoalService.findAll(userId, query);
    return {
      data: result.data.map((g) => new SavingsGoalResponseDto(g)),
      pagination: result.pagination,
    };
  }

  @Get(':id')
  async findOne(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
  ): Promise<
    SavingsGoalResponseDto & { linkedWishItems?: WishItemResponseDto[] }
  > {
    const goal = await this.savingsGoalService.findOne(id, userId);
    if (!goal) {
      throw new NotFoundException('Savings goal not found');
    }
    const wishItems = await this.savingsGoalService.getWishItems(id, userId);
    return {
      ...new SavingsGoalResponseDto(goal),
      linkedWishItems: wishItems.map((w) => new WishItemResponseDto(w)),
    };
  }

  @Patch(':id')
  async update(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateSavingsGoalDto: UpdateSavingsGoalDto,
  ): Promise<SavingsGoalResponseDto> {
    try {
      const goal = await this.savingsGoalService.update(
        id,
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
    @Param('id', MongoIdPipe) id: ObjectId,
  ): Promise<SavingsGoalProgressDto> {
    try {
      return await this.savingsGoalService.getProgress(id, userId);
    } catch (error) {
      throw new NotFoundException('Savings goal not found');
    }
  }

  @Post(':id/deposit')
  async deposit(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body('amount') amount: number,
  ): Promise<SavingsGoalResponseDto> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    try {
      const goal = await this.savingsGoalService.deposit(id, userId, amount);
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
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body('amount') amount: number,
  ): Promise<SavingsGoalResponseDto> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    try {
      const goal = await this.savingsGoalService.withdraw(id, userId, amount);
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
    @Param('id', MongoIdPipe) id: ObjectId,
  ): Promise<{ message: string }> {
    try {
      await this.savingsGoalService.delete(id, userId);
      return { message: 'Savings goal deleted successfully' };
    } catch (error) {
      throw new NotFoundException('Savings goal not found');
    }
  }
}
