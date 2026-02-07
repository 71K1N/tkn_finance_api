import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers?.authorization || req.headers?.Authorization;

    // Development stub: if Authorization header is `Bearer <id>` we set user.id = <id>
    // Otherwise default to a safe anonymous user id (1) to avoid breaking existing flows.
    let user = { id: 1 };
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const asNum = Number(token);
      if (!Number.isNaN(asNum) && isFinite(asNum)) {
        user = { id: asNum };
      }
    }

    req.user = user;
    return true;
  }
}
