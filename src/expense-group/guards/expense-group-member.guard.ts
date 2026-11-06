import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { ExpenseGroup } from '../entities/expense-group.entity';

@Injectable()
export class ExpenseGroupMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(ExpenseGroup)
    private groupRepository: MongoRepository<ExpenseGroup>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: number | undefined = request.user?.id;
    const rawGroupId: string | undefined = request.params?.groupId;

    // Guards run before pipes, so :groupId is still a raw string here —
    // MongoIdPipe has not converted it yet.
    if (!rawGroupId || !ObjectId.isValid(rawGroupId)) {
      throw new NotFoundException('Expense group not found');
    }

    const groupId = new ObjectId(rawGroupId);
    const group = await this.groupRepository.findOne({
      where: { _id: groupId } as any,
    });
    if (!group) {
      throw new NotFoundException('Expense group not found');
    }

    const isMember =
      group.owner_id === userId ||
      group.members.some((m) => m.user_id === userId && m.active);
    if (!isMember) {
      throw new ForbiddenException(
        'You are not a member of this expense group',
      );
    }

    request.expenseGroup = group;
    return true;
  }
}
