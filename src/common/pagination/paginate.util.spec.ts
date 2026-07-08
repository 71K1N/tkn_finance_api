import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { paginate } from './paginate.util';
import { FindAllQueryDto } from './find-all-query.dto';

describe('paginate', () => {
  function makeRepository(data: any[] = [], totalItems = data.length) {
    return {
      findAndCount: jest.fn().mockResolvedValue([data, totalItems]),
    } as unknown as MongoRepository<any>;
  }

  function makeQuery(
    overrides: Partial<FindAllQueryDto> = {},
  ): FindAllQueryDto {
    return { page: 1, pageSize: 10, ...overrides } as FindAllQueryDto;
  }

  it('applies only the search condition when no filters or baseWhere are given', async () => {
    const repository = makeRepository();
    await paginate(repository, makeQuery({ search: 'foo' }), {
      searchableFields: ['name', 'description'],
    });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          $or: [
            { name: { $regex: 'foo', $options: 'i' } },
            { description: { $regex: 'foo', $options: 'i' } },
          ],
        },
      }),
    );
  });

  it('applies only the filter conditions when no search or baseWhere are given', async () => {
    const repository = makeRepository();
    await paginate(repository, makeQuery({ filters: { name: 'bar' } }), {
      filterableFields: ['name'],
    });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { $regex: 'bar', $options: 'i' } },
      }),
    );
  });

  it('applies only baseWhere when no search or filters are given', async () => {
    const repository = makeRepository();
    await paginate(repository, makeQuery(), {
      baseWhere: { userId: 1 },
    });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1 },
      }),
    );
  });

  it('combines baseWhere, search and filters with $and', async () => {
    const repository = makeRepository();
    await paginate(
      repository,
      makeQuery({ search: 'foo', filters: { status: 'active' } }),
      {
        searchableFields: ['name'],
        filterableFields: ['status'],
        baseWhere: { userId: 1 },
      },
    );

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          $and: [
            { userId: 1 },
            { $or: [{ name: { $regex: 'foo', $options: 'i' } }] },
            { status: { $regex: 'active', $options: 'i' } },
          ],
        },
      }),
    );
  });

  it('filters ObjectId-like values by exact match instead of $regex', async () => {
    const repository = makeRepository();
    const id = '507f1f77bcf86cd799439011';
    await paginate(repository, makeQuery({ filters: { categoryId: id } }), {
      filterableFields: ['categoryId'],
    });

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId: ObjectId.createFromHexString(id) },
      }),
    );
  });

  it('never scopes by baseWhere when it is not provided, even with search and filters', async () => {
    const repository = makeRepository();
    await paginate(
      repository,
      makeQuery({ search: 'foo', filters: { status: 'active' } }),
      {
        searchableFields: ['name'],
        filterableFields: ['status'],
      },
    );

    const [[callArgs]] = (repository.findAndCount as jest.Mock).mock.calls;
    expect(callArgs.where.$and ?? [callArgs.where]).not.toContainEqual(
      expect.objectContaining({ userId: expect.anything() }),
    );
  });
});
