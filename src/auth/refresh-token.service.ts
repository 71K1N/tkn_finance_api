import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RefreshToken } from './entities/refresh-token.entity';
import { AUTH_CONFIG, AuthConfig } from '../config/auth.config';

export interface IssuedRefreshToken {
  token: string;
  userId: number;
  familyId: string;
  expiresAt: Date;
}

export const hashToken = (raw: string) =>
  createHash('sha256').update(raw).digest('hex');

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repository: MongoRepository<RefreshToken>,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** Starts a new session family. */
  issue(userId: number, userAgent?: string | null): Promise<IssuedRefreshToken> {
    const now = Date.now();
    return this.create({
      userId,
      familyId: randomUUID(),
      familyExpiresAt: new Date(now + this.config.refreshAbsoluteTtlMs),
      userAgent: userAgent ?? null,
      now,
    });
  }

  /** Consumes a refresh token and returns its successor in the same family. */
  async rotate(
    raw: string,
    userAgent?: string | null,
  ): Promise<IssuedRefreshToken> {
    const now = Date.now();
    const current = await this.repository.findOne({
      where: { tokenHash: hashToken(raw) } as any,
    });
    if (!current) throw new UnauthorizedException();

    if (current.usedAt) {
      await this.revokeFamily(current.familyId);
      throw new UnauthorizedException();
    }
    if (
      current.revokedAt ||
      current.expiresAt.getTime() <= now ||
      current.familyExpiresAt.getTime() <= now
    ) {
      throw new UnauthorizedException();
    }

    // Conditional update so two concurrent refreshes cannot both consume the token.
    const claim: any = await this.repository.updateOne(
      { _id: current._id, usedAt: null } as any,
      { $set: { usedAt: new Date(now) } },
    );
    if (claim.modifiedCount === 0) {
      await this.revokeFamily(current.familyId);
      throw new UnauthorizedException();
    }

    return this.create({
      userId: current.userId,
      familyId: current.familyId,
      familyExpiresAt: current.familyExpiresAt,
      userAgent: userAgent ?? current.userAgent,
      now,
    });
  }

  async revokeByToken(raw: string): Promise<void> {
    const token = await this.repository.findOne({
      where: { tokenHash: hashToken(raw) } as any,
    });
    if (token) await this.revokeFamily(token.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.repository.updateMany({ familyId, revokedAt: null } as any, {
      $set: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repository.updateMany({ userId, revokedAt: null } as any, {
      $set: { revokedAt: new Date() },
    });
  }

  private async create(input: {
    userId: number;
    familyId: string;
    familyExpiresAt: Date;
    userAgent: string | null;
    now: number;
  }): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Math.min(
        input.now + this.config.refreshTtlMs,
        input.familyExpiresAt.getTime(),
      ),
    );
    await this.repository.save(
      this.repository.create({
        userId: input.userId,
        familyId: input.familyId,
        tokenHash: hashToken(token),
        expiresAt,
        familyExpiresAt: input.familyExpiresAt,
        usedAt: null,
        revokedAt: null,
        userAgent: input.userAgent,
        createdAt: new Date(input.now),
      }),
    );
    return { token, userId: input.userId, familyId: input.familyId, expiresAt };
  }
}
