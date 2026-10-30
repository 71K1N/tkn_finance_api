import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  let users: { findById: jest.Mock };
  let guard: JwtAuthGuard;

  const contextFor = (headers: Record<string, string>, handler = () => null) => {
    const request: any = { headers };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => {
    users = { findById: jest.fn().mockResolvedValue({ id: 5, active: true }) };
    guard = new JwtAuthGuard(new Reflector(), jwt, users as any);
  });

  it('accepts a valid token and sets request.user', async () => {
    const token = await jwt.signAsync({ sub: 5 }, { expiresIn: '5m' });
    const { context, request } = contextFor({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ id: 5 });
  });

  it('rejects a missing header', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a malformed token', async () => {
    const { context } = contextFor({ authorization: 'Bearer not.a.jwt' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a non-Bearer scheme', async () => {
    const token = await jwt.signAsync({ sub: 5 });
    const { context } = contextFor({ authorization: `Basic ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync({ sub: 5 }, { expiresIn: '-10s' });
    const { context } = contextFor({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'other' }).signAsync({ sub: 5 });
    const { context } = contextFor({ authorization: `Bearer ${forged}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects the legacy numeric token', async () => {
    const { context } = contextFor({ authorization: 'Bearer 1' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('rejects an inactive user holding a valid token', async () => {
    users.findById.mockResolvedValue({ id: 5, active: false });
    const token = await jwt.signAsync({ sub: 5 });
    const { context } = contextFor({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token for a user that no longer exists', async () => {
    users.findById.mockResolvedValue(null);
    const token = await jwt.signAsync({ sub: 99 });
    const { context } = contextFor({ authorization: `Bearer ${token}` });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('lets @Public() routes through without a token', async () => {
    class Handlers {
      @Public()
      open() {
        return null;
      }
    }
    const { context } = contextFor({}, Handlers.prototype.open);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
