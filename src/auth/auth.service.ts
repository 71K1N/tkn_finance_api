import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_CONFIG, AuthConfig } from '../config/auth.config';
import { UserService } from '../user/user.service';
import { User } from '../user/entities/user.entity';
import { GoogleVerifier } from './google.verifier';
import {
  IssuedRefreshToken,
  RefreshTokenService,
} from './refresh-token.service';

export interface PublicUser {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
  refresh: IssuedRefreshToken;
}

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name ?? null,
  picture: user.picture ?? null,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly google: GoogleVerifier,
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async loginWithGoogle(
    idToken: string,
    userAgent?: string | null,
  ): Promise<AuthResult> {
    const profile = await this.google.verify(idToken);

    let user = await this.users.findBySub(profile.sub);

    if (!user) {
      const byEmail = await this.users.findByEmail(profile.email);
      if (byEmail) {
        // A user already bound to another Google subject is never taken over by e-mail.
        if (byEmail.google_sub) throw new UnauthorizedException();
        user = await this.users.linkSub(byEmail, profile.sub);
      } else {
        if (!this.canSignUp(profile.email)) {
          throw new ForbiddenException('Not authorized');
        }
        user = await this.users.create({
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          google_sub: profile.sub,
        });
      }
    }

    if (!user.active) {
      await this.refreshTokens.revokeAllForUser(user.id);
      throw new ForbiddenException('Not authorized');
    }

    user = await this.users.touchLogin(user, profile);
    const refresh = await this.refreshTokens.issue(user.id, userAgent);
    return {
      accessToken: await this.signAccessToken(user.id),
      user: toPublicUser(user),
      refresh,
    };
  }

  async refresh(
    rawToken: string | undefined,
    userAgent?: string | null,
  ): Promise<AuthResult> {
    if (!rawToken) throw new UnauthorizedException();

    const refresh = await this.refreshTokens.rotate(rawToken, userAgent);
    const user = await this.users.findById(refresh.userId);
    if (!user || !user.active) {
      await this.refreshTokens.revokeFamily(refresh.familyId);
      throw new UnauthorizedException();
    }

    return {
      accessToken: await this.signAccessToken(user.id),
      user: toPublicUser(user),
      refresh,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.refreshTokens.revokeByToken(rawToken);
  }

  async me(userId: number): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user || !user.active) throw new UnauthorizedException();
    return toPublicUser(user);
  }

  private canSignUp(email: string): boolean {
    return (
      this.config.signupMode === 'open' ||
      this.config.allowedEmails.includes(email.toLowerCase())
    );
  }

  private signAccessToken(userId: number): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }
}
