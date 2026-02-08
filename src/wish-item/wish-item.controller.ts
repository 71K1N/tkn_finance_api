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
  async findAll(
    @User() userId: number,
    @Query('status') status?: string,
  ): Promise<WishItemResponseDto[]> {
    let wishItems;
    if (status) {
      if (!['active', 'completed', 'abandoned', 'on_hold'].includes(status)) {
        throw new BadRequestException(
          'status must be one of: active, completed, abandoned, on_hold',
        );
      }
      wishItems = await this.wishItemService.findByStatus(userId, status);
    } else {
      wishItems = await this.wishItemService.findAll(userId);
    }
    return wishItems.map((w) => new WishItemResponseDto(w));
  }

  @Get(':id')
  async findOne(
    @User() userId: number,
    @Param('id') id: string,
  ): Promise<WishItemResponseDto> {
    const wishItemId = parseInt(id, 10);
    if (isNaN(wishItemId)) {
      throw new BadRequestException('id must be a valid number');
    }
    const wishItem = await this.wishItemService.findOne(wishItemId, userId);
    if (!wishItem) {
      throw new NotFoundException('Wish item not found');
    }
    return new WishItemResponseDto(wishItem);
  }

  @Patch(':id')
  async update(
    @User() userId: number,
    @Param('id') id: string,
    @Body() updateWishItemDto: UpdateWishItemDto,
  ): Promise<WishItemResponseDto> {
    const wishItemId = parseInt(id, 10);
    if (isNaN(wishItemId)) {
      throw new BadRequestException('id must be a valid number');
    }
    try {
      const wishItem = await this.wishItemService.update(
        wishItemId,
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
    @Param('id') id: string,
    @Body('status') status: string,
  ): Promise<WishItemResponseDto> {
    const wishItemId = parseInt(id, 10);
    if (isNaN(wishItemId)) {
      throw new BadRequestException('id must be a valid number');
    }
    if (!['active', 'completed', 'abandoned', 'on_hold'].includes(status)) {
      throw new BadRequestException(
        'status must be one of: active, completed, abandoned, on_hold',
      );
    }
    try {
      const wishItem = await this.wishItemService.updateStatus(
        wishItemId,
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
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    const wishItemId = parseInt(id, 10);
    if (isNaN(wishItemId)) {
      throw new BadRequestException('id must be a valid number');
    }
    try {
      await this.wishItemService.delete(wishItemId, userId);
      return { message: 'Wish item deleted successfully' };
    } catch (error) {
      throw new NotFoundException('Wish item not found');
    }
  }
}
