import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService.loginWithGoogle', () => {
  let users: any;
  let refreshTokens: any;
  let google: any;
  let jwt: any;
  let config: any;
  let service: AuthService;

  const profile = (over: any = {}) => ({
    sub: 'sub-1',
    email: 'maria@example.com',
    name: 'Maria',
    picture: 'http://pic',
    ...over,
  });

  const build = () =>
    new AuthService(users, refreshTokens, google, jwt, config);

  beforeEach(() => {
    users = {
      findBySub: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      create: jest.fn(async (input: any) => ({
        id: 2,
        active: true,
        ...input,
      })),
      linkSub: jest.fn(async (user: any, sub: string) => ({
        ...user,
        google_sub: sub,
      })),
      touchLogin: jest.fn(async (user: any, p: any) => ({ ...user, ...p })),
    };
    refreshTokens = {
      issue: jest.fn().mockResolvedValue({ token: 'r', expiresAt: new Date() }),
      revokeAllForUser: jest.fn(),
    };
    google = { verify: jest.fn().mockResolvedValue(profile()) };
    jwt = { signAsync: jest.fn().mockResolvedValue('jwt') };
    config = { signupMode: 'allowlist', allowedEmails: ['maria@example.com'] };
    service = build();
  });

  it('signs in a known user by subject', async () => {
    users.findBySub.mockResolvedValue({
      id: 7,
      active: true,
      email: 'maria@example.com',
      google_sub: 'sub-1',
    });

    const result = await service.loginWithGoogle('token', 'agent');

    expect(result.accessToken).toBe('jwt');
    expect(result.user.id).toBe(7);
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 7 });
    expect(refreshTokens.issue).toHaveBeenCalledWith(7, 'agent');
    expect(users.create).not.toHaveBeenCalled();
  });

  it('creates a new allowed user', async () => {
    const result = await service.loginWithGoogle('token');

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'maria@example.com',
        google_sub: 'sub-1',
      }),
    );
    expect(result.user.id).toBe(2);
  });

  it('rejects a new user that is not on the allowlist with 403', async () => {
    google.verify.mockResolvedValue(profile({ email: 'eve@example.com' }));

    await expect(service.loginWithGoogle('token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(users.create).not.toHaveBeenCalled();
    expect(refreshTokens.issue).not.toHaveBeenCalled();
  });

  it('creates anyone in open mode', async () => {
    config.signupMode = 'open';
    google.verify.mockResolvedValue(profile({ email: 'eve@example.com' }));

    await service.loginWithGoogle('token');

    expect(users.create).toHaveBeenCalled();
  });

  it('matches the allowlist case-insensitively', async () => {
    config.allowedEmails = ['maria@example.com'];
    google.verify.mockResolvedValue(profile({ email: 'Maria@Example.com' }));

    await service.loginWithGoogle('token');

    expect(users.create).toHaveBeenCalled();
  });

  it('links the subject to the pre-provisioned heir on first sign-in', async () => {
    google.verify.mockResolvedValue(profile({ email: 'heir@example.com' }));
    users.findByEmail.mockResolvedValue({
      id: 1,
      active: true,
      email: 'heir@example.com',
    });

    const result = await service.loginWithGoogle('token');

    expect(users.linkSub).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      'sub-1',
    );
    expect(users.create).not.toHaveBeenCalled();
    expect(result.user.id).toBe(1);
  });

  it('links an existing e-mail even when it is not on the allowlist', async () => {
    config.allowedEmails = [];
    users.findByEmail.mockResolvedValue({ id: 1, active: true, email: 'maria@example.com' });

    await expect(service.loginWithGoogle('token')).resolves.toBeDefined();
  });

  it('rejects a different subject for an already linked e-mail', async () => {
    users.findByEmail.mockResolvedValue({
      id: 1,
      active: true,
      email: 'maria@example.com',
      google_sub: 'other-sub',
    });

    await expect(service.loginWithGoogle('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.linkSub).not.toHaveBeenCalled();
    expect(refreshTokens.issue).not.toHaveBeenCalled();
  });

  it('keeps the account when the e-mail changes', async () => {
    google.verify.mockResolvedValue(profile({ email: 'new@example.com' }));
    users.findBySub.mockResolvedValue({
      id: 7,
      active: true,
      email: 'maria@example.com',
      google_sub: 'sub-1',
    });

    const result = await service.loginWithGoogle('token');

    expect(result.user.id).toBe(7);
    expect(users.touchLogin).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      expect.objectContaining({ email: 'new@example.com' }),
    );
    expect(users.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects inactive users with 403 and revokes their sessions', async () => {
    users.findBySub.mockResolvedValue({ id: 7, active: false });

    await expect(service.loginWithGoogle('token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(7);
    expect(refreshTokens.issue).not.toHaveBeenCalled();
  });

  it('propagates verifier rejections', async () => {
    google.verify.mockRejectedValue(new UnauthorizedException());

    await expect(service.loginWithGoogle('bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
