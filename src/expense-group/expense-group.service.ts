import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import {
  ExpenseGroup,
  GroupMember,
  ShareType,
} from './entities/expense-group.entity';
import { CreateExpenseGroupDto } from './dto/create-expense-group.dto';
import { UpdateExpenseGroupDto } from './dto/update-expense-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { UpdateGroupMemberDto } from './dto/update-group-member.dto';
import { ExpenseBalanceService } from './expense-balance.service';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class ExpenseGroupService {
  constructor(
    @InjectRepository(ExpenseGroup)
    private groupRepository: MongoRepository<ExpenseGroup>,
    private balanceService: ExpenseBalanceService,
  ) {}

  async create(
    userId: number,
    dto: CreateExpenseGroupDto,
  ): Promise<ExpenseGroup> {
    const owner: GroupMember = {
      user_id: userId,
      share_type: ShareType.EQUAL,
      share_value: null,
      active: true,
      joined_at: new Date(),
    };
    const group = this.groupRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      owner_id: userId,
      members: [owner],
      is_active: true,
      created_by: userId,
    });
    return this.groupRepository.save(group);
  }

  findAllForUser(userId: number, query: FindAllQueryDto) {
    return paginate(this.groupRepository, query, {
      searchableFields: ['name', 'description'],
      sortableFields: ['name', 'created_at', 'updated_at'],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere: { $or: [{ owner_id: userId }, { 'members.user_id': userId }] },
    });
  }

  async findByIdOrThrow(id: ObjectId): Promise<ExpenseGroup> {
    const group = await this.groupRepository.findOne({
      where: { _id: id } as any,
    });
    if (!group) {
      throw new NotFoundException('Expense group not found');
    }
    return group;
  }

  ensureOwner(group: ExpenseGroup, userId: number): void {
    if (group.owner_id !== userId) {
      throw new ForbiddenException(
        'Only the group owner can perform this action',
      );
    }
  }

  async update(
    id: ObjectId,
    userId: number,
    dto: UpdateExpenseGroupDto,
  ): Promise<ExpenseGroup> {
    const group = await this.findByIdOrThrow(id);
    this.ensureOwner(group, userId);

    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    group.updated_by = userId;
    group.updated_at = new Date();
    return this.groupRepository.save(group);
  }

  async archive(id: ObjectId, userId: number): Promise<void> {
    const group = await this.findByIdOrThrow(id);
    this.ensureOwner(group, userId);

    group.is_active = false;
    group.updated_by = userId;
    group.updated_at = new Date();
    await this.groupRepository.save(group);
  }

  async addMember(
    id: ObjectId,
    userId: number,
    dto: AddGroupMemberDto,
  ): Promise<ExpenseGroup> {
    const group = await this.findByIdOrThrow(id);
    this.ensureOwner(group, userId);
    this.validateShare(dto.share_type, dto.share_value);

    if (group.members.some((m) => m.user_id === dto.user_id && m.active)) {
      throw new ConflictException('User is already a member of this group');
    }

    const inactiveMember = group.members.find((m) => m.user_id === dto.user_id);
    if (inactiveMember) {
      inactiveMember.active = true;
      inactiveMember.share_type = dto.share_type;
      inactiveMember.share_value = dto.share_value ?? null;
      inactiveMember.joined_at = new Date();
    } else {
      group.members.push({
        user_id: dto.user_id,
        share_type: dto.share_type,
        share_value: dto.share_value ?? null,
        active: true,
        joined_at: new Date(),
      });
    }

    group.updated_by = userId;
    group.updated_at = new Date();
    return this.groupRepository.save(group);
  }

  async updateMember(
    id: ObjectId,
    targetUserId: number,
    actingUserId: number,
    dto: UpdateGroupMemberDto,
  ): Promise<ExpenseGroup> {
    const group = await this.findByIdOrThrow(id);
    this.ensureOwner(group, actingUserId);
    this.validateShare(dto.share_type, dto.share_value);

    const member = group.members.find(
      (m) => m.user_id === targetUserId && m.active,
    );
    if (!member) {
      throw new NotFoundException('Member not found in this group');
    }
    member.share_type = dto.share_type;
    member.share_value = dto.share_value ?? null;

    group.updated_by = actingUserId;
    group.updated_at = new Date();
    return this.groupRepository.save(group);
  }

  async removeMember(
    id: ObjectId,
    targetUserId: number,
    actingUserId: number,
  ): Promise<ExpenseGroup> {
    const group = await this.findByIdOrThrow(id);

    if (group.owner_id !== actingUserId && targetUserId !== actingUserId) {
      throw new ForbiddenException(
        'Only the group owner or the member themselves can remove a member',
      );
    }
    if (targetUserId === group.owner_id) {
      throw new BadRequestException('The group owner cannot be removed');
    }

    const member = group.members.find(
      (m) => m.user_id === targetUserId && m.active,
    );
    if (!member) {
      throw new NotFoundException('Member not found in this group');
    }

    const balances = await this.balanceService.getGroupBalances(id);
    const memberBalance =
      balances.find((b) => b.user_id === targetUserId)?.balance ?? 0;
    if (Math.abs(memberBalance) > 0.01) {
      throw new ConflictException(
        'Cannot remove a member with a non-zero balance; settle up first',
      );
    }

    member.active = false;
    group.updated_by = actingUserId;
    group.updated_at = new Date();
    return this.groupRepository.save(group);
  }

  private validateShare(shareType: ShareType, shareValue?: number): void {
    if (
      shareType !== ShareType.EQUAL &&
      (shareValue === undefined || shareValue === null)
    ) {
      throw new BadRequestException(
        'share_value is required for percentage/fixed share types',
      );
    }
  }
}
