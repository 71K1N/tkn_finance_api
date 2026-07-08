import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ExpenseGroup } from '../entities/expense-group.entity';

/**
 * Reads the ExpenseGroup loaded by ExpenseGroupMemberGuard onto the request,
 * avoiding a second lookup in the controller/service for the same document.
 */
export const CurrentExpenseGroup = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ExpenseGroup => {
    const request = ctx.switchToHttp().getRequest();
    return request.expenseGroup;
  },
);
