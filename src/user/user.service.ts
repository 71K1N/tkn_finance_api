import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { User } from './entities/user.entity';
import { Counter } from './entities/counter.entity';

export interface CreateUserInput {
  id?: number;
  email: string;
  name?: string | null;
  picture?: string | null;
  google_sub?: string;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: MongoRepository<User>,
    @InjectRepository(Counter)
    private readonly counterRepository: MongoRepository<Counter>,
  ) {}

  /** Atomically reserves the next user id; the first value after seeding is 2. */
  async nextUserId(): Promise<number> {
    const result: any = await this.counterRepository.findOneAndUpdate(
      { _id: 'user' } as any,
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    const doc = result && 'value' in result ? result.value : result;
    return doc.seq;
  }

  findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } as any });
  }

  findBySub(sub: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { google_sub: sub } as any });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.trim().toLowerCase() } as any,
    });
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.userRepository.create({
      id: input.id ?? (await this.nextUserId()),
      email: input.email.trim().toLowerCase(),
      name: input.name ?? null,
      picture: input.picture ?? null,
      google_sub: input.google_sub,
      active: true,
      last_login_at: null,
    });
    return this.userRepository.save(user);
  }

  async linkSub(user: User, sub: string): Promise<User> {
    user.google_sub = sub;
    return this.userRepository.save(user);
  }

  async touchLogin(
    user: User,
    profile: { email?: string; name?: string | null; picture?: string | null },
  ): Promise<User> {
    user.last_login_at = new Date();
    if (profile.email) user.email = profile.email.trim().toLowerCase();
    if (profile.name !== undefined) user.name = profile.name;
    if (profile.picture !== undefined) user.picture = profile.picture;
    return this.userRepository.save(user);
  }

  async setActive(id: number, active: boolean): Promise<void> {
    await this.userRepository.updateOne({ id } as any, { $set: { active } });
  }

  /**
   * Idempotent startup seed: counter at 1 and the heir as user 1 (no google_sub).
   * Never overwrites an existing counter or user 1.
   */
  async seed(heirEmail: string): Promise<void> {
    await this.counterRepository.updateOne(
      { _id: 'user' } as any,
      { $setOnInsert: { seq: 1 } },
      { upsert: true },
    );
    await this.userRepository.updateOne(
      { id: 1 } as any,
      {
        $setOnInsert: {
          id: 1,
          email: heirEmail,
          name: null,
          picture: null,
          active: true,
          created_at: new Date(),
          last_login_at: null,
        },
      },
      { upsert: true },
    );
  }
}
