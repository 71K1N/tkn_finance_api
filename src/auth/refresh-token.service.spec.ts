import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService, hashToken } from './refresh-token.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { AUTH_CONFIG } from '../config/auth.config';

const DAY = 24 * 60 * 60 * 1000;

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let store: any[];
  let repo: any;
  let nextObjectId: number;

  const config = { refreshTtlMs: 7 * DAY, refreshAbsoluteTtlMs: 30 * DAY };

  beforeEach(async () => {
    store = [];
    nextObjectId = 1;
    repo = {
      create: (v: any) => ({ ...v }),
      save: jest.fn(async (v: any) => {
        v._id = nextObjectId++;
        store.push(v);
        return v;
      }),
      findOne: jest.fn(
        async ({ where }: any) =>
          store.find((t) => t.tokenHash === where.tokenHash) ?? null,
      ),
      updateOne: jest.fn(async (filter: any, update: any) => {
        const doc = store.find((t) => t._id === filter._id);
        if (!doc || doc.usedAt !== filter.usedAt) return { modifiedCount: 0 };
        Object.assign(doc, update.$set);
        return { modifiedCount: 1 };
      }),
      updateMany: jest.fn(async (filter: any, update: any) => {
        for (const doc of store) {
          const match = Object.entries(filter).every(([k, v]) => doc[k] === v);
          if (match) Object.assign(doc, update.$set);
        }
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: getRepositoryToken(RefreshToken), useValue: repo },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    }).compile();
    service = module.get(RefreshTokenService);
  });

  afterEach(() => jest.useRealTimers());

  it('stores only the hash of the issued token', async () => {
    const issued = await service.issue(5, 'jest');
    expect(store[0].tokenHash).toBe(hashToken(issued.token));
    expect(JSON.stringify(store[0])).not.toContain(issued.token);
  });

  it('rotates: marks the old token used and issues a successor in the same family', async () => {
    const first = await service.issue(5);
    const next = await service.rotate(first.token);

    expect(next.token).not.toBe(first.token);
    expect(next.familyId).toBe(first.familyId);
    expect(next.userId).toBe(5);
    expect(store[0].usedAt).toBeInstanceOf(Date);
  });

  it('extends the sliding expiry on rotation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = await service.issue(5);
    jest.setSystemTime(new Date('2026-01-05T00:00:00Z'));
    const next = await service.rotate(first.token);

    expect(next.expiresAt.getTime()).toBe(
      new Date('2026-01-05T00:00:00Z').getTime() + 7 * DAY,
    );
    expect(next.expiresAt.getTime()).toBeGreaterThan(
      first.expiresAt.getTime(),
    );
  });

  it('never extends beyond the absolute family limit', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let current = await service.issue(5);
    for (const day of ['2026-01-07', '2026-01-13', '2026-01-19', '2026-01-25']) {
      jest.setSystemTime(new Date(`${day}T00:00:00Z`));
      current = await service.rotate(current.token);
    }
    jest.setSystemTime(new Date('2026-01-28T00:00:00Z'));
    const next = await service.rotate(current.token);

    expect(next.expiresAt.getTime()).toBe(
      new Date('2026-01-01T00:00:00Z').getTime() + 30 * DAY,
    );
  });

  it('rejects once the absolute limit has passed even if the token is unexpired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = await service.issue(5);
    store[0].expiresAt = new Date('2026-03-01T00:00:00Z');
    jest.setSystemTime(new Date('2026-02-01T00:00:00Z'));

    await expect(service.rotate(first.token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired (inactive) token', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = await service.issue(5);
    jest.setSystemTime(new Date('2026-01-09T00:00:00Z'));

    await expect(service.rotate(first.token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects unknown tokens', async () => {
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const first = await service.issue(5);
    const second = await service.rotate(first.token);

    await expect(service.rotate(first.token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(store.every((t) => t.revokedAt instanceof Date)).toBe(true);
    await expect(service.rotate(second.token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects revoked tokens', async () => {
    const first = await service.issue(5);
    await service.revokeByToken(first.token);

    await expect(service.rotate(first.token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokeAllForUser only touches that user', async () => {
    await service.issue(5);
    await service.issue(6);
    await service.revokeAllForUser(5);

    expect(store[0].revokedAt).toBeInstanceOf(Date);
    expect(store[1].revokedAt).toBeNull();
  });
});
