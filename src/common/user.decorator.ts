import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const User = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request?.user;
    if (!user) {
      return null;
    }
    return data ? user[data as keyof typeof user] : user.id;
  },
);
