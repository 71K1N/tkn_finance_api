import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import {
  WishItem,
  WishItemStatus,
  WishItemPriority,
} from './entities/wish-item.entity';
import { CreateWishItemDto } from './dto/create-wish-item.dto';
import { UpdateWishItemDto } from './dto/update-wish-item.dto';
import { WebhookService } from '../webhook/webhook.service';
import { WebhookEventType } from '../webhook/entities/webhook-subscription.entity';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../common/mongo.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class WishItemService {
  constructor(
    @InjectRepository(WishItem)
    private wishItemRepository: MongoRepository<WishItem>,
    private webhookService: WebhookService,
  ) {}

  async create(
    userId: number,
    createWishItemDto: CreateWishItemDto,
  ): Promise<WishItem> {
    const priority =
      (createWishItemDto.priority as WishItemPriority) ||
      WishItemPriority.MEDIUM;

    const wishItem = this.wishItemRepository.create({
      userId,
      name: createWishItemDto.name,
      estimatedCost: createWishItemDto.estimatedCost,
      targetDate: createWishItemDto.targetDate,
      priority,
      status: WishItemStatus.ACTIVE,
      linkedGoalId: createWishItemDto.linkedGoalId
        ? toObjectId(createWishItemDto.linkedGoalId)
        : null,
      created_by: userId,
    });
    return this.wishItemRepository.save(wishItem);
  }

  findAll(userId: number, query: FindAllQueryDto) {
    return paginate(this.wishItemRepository, query, {
      searchableFields: ['name'],
      filterableFields: ['status', 'priority', 'linkedGoalId'],
      sortableFields: [
        'name',
        'estimatedCost',
        'targetDate',
        'priority',
        'status',
        'created_at',
        'updated_at',
      ],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere: { userId },
    });
  }

  async findOne(id: ObjectId, userId: number): Promise<WishItem | null> {
    const wishItem = await this.wishItemRepository.findOne({
      where: { _id: id } as any,
    });
    if (wishItem && wishItem.userId === userId) {
      return wishItem;
    }
    return null;
  }

  async update(
    id: ObjectId,
    userId: number,
    updateWishItemDto: UpdateWishItemDto,
  ): Promise<WishItem> {
    const wishItem = await this.findOne(id, userId);
    if (!wishItem) {
      throw new Error('Wish item not found');
    }

    if (updateWishItemDto.name !== undefined) {
      wishItem.name = updateWishItemDto.name;
    }
    if (updateWishItemDto.estimatedCost !== undefined) {
      wishItem.estimatedCost = updateWishItemDto.estimatedCost;
    }
    if (updateWishItemDto.targetDate !== undefined) {
      wishItem.targetDate = updateWishItemDto.targetDate;
    }
    if (updateWishItemDto.priority !== undefined) {
      wishItem.priority = updateWishItemDto.priority as WishItemPriority;
    }

    wishItem.updated_by = userId;
    wishItem.updated_at = new Date();
    return this.wishItemRepository.save(wishItem);
  }

  async updateStatus(
    id: ObjectId,
    userId: number,
    newStatus: 'active' | 'completed' | 'abandoned' | 'on_hold',
  ): Promise<WishItem> {
    const wishItem = await this.findOne(id, userId);
    if (!wishItem) {
      throw new Error('Wish item not found');
    }
    const oldStatus = wishItem.status;
    wishItem.status = newStatus as WishItemStatus;
    wishItem.updated_by = userId;
    wishItem.updated_at = new Date();
    const updated = await this.wishItemRepository.save(wishItem);
    await this.webhookService.emitEvent(
      WebhookEventType.WISH_ITEM_STATUS_CHANGED,
      userId,
      {
        wishItemId: id,
        name: updated.name,
        oldStatus,
        newStatus,
        estimatedCost: updated.estimatedCost,
        targetDate: updated.targetDate,
      },
    );
    return updated;
  }

  async linkToGoal(
    id: ObjectId,
    userId: number,
    goalId: ObjectId,
  ): Promise<WishItem> {
    const wishItem = await this.findOne(id, userId);
    if (!wishItem) {
      throw new Error('Wish item not found');
    }
    wishItem.linkedGoalId = goalId;
    wishItem.updated_by = userId;
    wishItem.updated_at = new Date();
    return this.wishItemRepository.save(wishItem);
  }

  async unlinkFromGoal(id: ObjectId, userId: number): Promise<WishItem> {
    const wishItem = await this.findOne(id, userId);
    if (!wishItem) {
      throw new Error('Wish item not found');
    }
    wishItem.linkedGoalId = null;
    wishItem.updated_by = userId;
    wishItem.updated_at = new Date();
    return this.wishItemRepository.save(wishItem);
  }

  async delete(id: ObjectId, userId: number): Promise<void> {
    const wishItem = await this.findOne(id, userId);
    if (!wishItem) {
      throw new Error('Wish item not found');
    }
    await this.wishItemRepository.delete(id);
  }

  async getByGoal(goalId: ObjectId): Promise<WishItem[]> {
    return this.wishItemRepository.find({
      where: { linkedGoalId: goalId },
    });
  }
}
