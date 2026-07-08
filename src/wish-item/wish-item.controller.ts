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
import { WishItemService } from './wish-item.service';
import { SavingsGoalService } from '../savings-goal/savings-goal.service';
import { CreateWishItemDto } from './dto/create-wish-item.dto';
import { UpdateWishItemDto } from './dto/update-wish-item.dto';
import { WishItemResponseDto } from './dto/wish-item-response.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';
import { ObjectId } from 'mongodb';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';

@Controller('wish-item')
@UseGuards(AuthGuard)
export class WishItemController {
  constructor(
    private readonly wishItemService: WishItemService,
    private readonly savingsGoalService: SavingsGoalService,
  ) {}

  @Post()
  async create(
    @User() userId: number,
    @Body() createWishItemDto: CreateWishItemDto,
  ): Promise<WishItemResponseDto> {
    const wishItem = await this.wishItemService.create(
      userId,
      createWishItemDto,
    );
    return new WishItemResponseDto(wishItem);
  }

  @Get()
  async findAll(@User() userId: number, @Query() query: FindAllQueryDto) {
    const result = await this.wishItemService.findAll(userId, query);
    return {
      data: result.data.map((w) => new WishItemResponseDto(w)),
      pagination: result.pagination,
    };
  }

  @Get(':id')
  async findOne(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
  ): Promise<WishItemResponseDto> {
    const wishItem = await this.wishItemService.findOne(id, userId);
    if (!wishItem) {
      throw new NotFoundException('Wish item not found');
    }
    return new WishItemResponseDto(wishItem);
  }

  @Patch(':id')
  async update(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateWishItemDto: UpdateWishItemDto,
  ): Promise<WishItemResponseDto> {
    try {
      const wishItem = await this.wishItemService.update(
        id,
        userId,
        updateWishItemDto,
      );
      return new WishItemResponseDto(wishItem);
    } catch (error) {
      throw new NotFoundException('Wish item not found');
    }
  }

  @Patch(':id/status')
  async updateStatus(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body('status') status: string,
  ): Promise<WishItemResponseDto> {
    if (!['active', 'completed', 'abandoned', 'on_hold'].includes(status)) {
      throw new BadRequestException(
        'status must be one of: active, completed, abandoned, on_hold',
      );
    }
    try {
      const wishItem = await this.wishItemService.updateStatus(
        id,
        userId,
        status as 'active' | 'completed' | 'abandoned' | 'on_hold',
      );
      return new WishItemResponseDto(wishItem);
    } catch (error) {
      throw new NotFoundException('Wish item not found');
    }
  }

  @Delete(':id')
  async delete(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
  ): Promise<{ message: string }> {
    try {
      await this.wishItemService.delete(id, userId);
      return { message: 'Wish item deleted successfully' };
    } catch (error) {
      throw new NotFoundException('Wish item not found');
    }
  }
}
