import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { Counter } from './entities/counter.entity';

describe('UserService', () => {
  let service: UserService;
  let users: Record<string, jest.Mock>;
  let counters: Record<string, jest.Mock>;

  beforeEach(async () => {
    users = { updateOne: jest.fn(), findOne: jest.fn() };
    counters = { updateOne: jest.fn(), findOneAndUpdate: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Counter), useValue: counters },
      ],
    }).compile();
    service = module.get(UserService);
  });

  describe('nextUserId', () => {
    it('increments the user counter atomically and returns the new value', async () => {
      counters.findOneAndUpdate.mockResolvedValueOnce({ value: { seq: 2 } });
      counters.findOneAndUpdate.mockResolvedValueOnce({ value: { seq: 3 } });

      expect(await service.nextUserId()).toBe(2);
      expect(await service.nextUserId()).toBe(3);
      expect(counters.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'user' },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
    });

    it('accepts drivers that return the document directly', async () => {
      counters.findOneAndUpdate.mockResolvedValue({ _id: 'user', seq: 2 });
      expect(await service.nextUserId()).toBe(2);
    });
  });

  describe('seed', () => {
    it('upserts the counter and user 1 only on insert, so reruns change nothing', async () => {
      await service.seed('heir@example.com');
      await service.seed('heir@example.com');

      expect(counters.updateOne).toHaveBeenCalledWith(
        { _id: 'user' },
        { $setOnInsert: { seq: 1 } },
        { upsert: true },
      );
      const [filter, update, options] = users.updateOne.mock.calls[0];
      expect(filter).toEqual({ id: 1 });
      expect(Object.keys(update)).toEqual(['$setOnInsert']);
      expect(update.$setOnInsert).toMatchObject({
        id: 1,
        email: 'heir@example.com',
        active: true,
      });
      expect(update.$setOnInsert).not.toHaveProperty('google_sub');
      expect(options).toEqual({ upsert: true });
    });
  });
});
