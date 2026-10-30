import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectId } from 'mongodb';
import { CategoryService } from './category.service';
import { Category } from './entities/category.entity';

describe('CategoryService (owner scoping)', () => {
  let service: CategoryService;
  let repo: { findOne: jest.Mock; save: jest.Mock };
  const id = ObjectId.createFromHexString('507f1f77bcf86cd799439011');

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (v) => v),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: getRepositoryToken(Category), useValue: repo },
      ],
    }).compile();
    service = module.get(CategoryService);
  });

  it('updates a category owned by the user', async () => {
    repo.findOne.mockResolvedValue({ name: 'a', user_id: 7 });
    await expect(service.update(id, 7, { name: 'b' })).resolves.toMatchObject({
      name: 'b',
      updated_by: 7,
    });
  });

  it("refuses to edit another user's category", async () => {
    repo.findOne.mockResolvedValue({ name: 'a', user_id: 8 });
    await expect(service.update(id, 7, { name: 'b' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('refuses to edit a shared system category', async () => {
    repo.findOne.mockResolvedValue({ name: 'a', user_id: null });
    await expect(service.update(id, 7, { name: 'b' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets a user read system categories but not private ones of others', async () => {
    repo.findOne.mockResolvedValueOnce({ user_id: null });
    await expect(service.findOne(id, 7)).resolves.toBeTruthy();
    repo.findOne.mockResolvedValueOnce({ user_id: 8 });
    await expect(service.findOne(id, 7)).resolves.toBeNull();
  });
});
