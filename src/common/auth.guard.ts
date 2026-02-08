import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return false;
    }

    // Parse Bearer token and extract user ID
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer') {
      return false;
    }

    // For development: treat token as user ID
    const userId = parseInt(token, 10);
    if (isNaN(userId)) {
      return false;
    }

    request.user = { id: userId };
    return true;
  }
}
