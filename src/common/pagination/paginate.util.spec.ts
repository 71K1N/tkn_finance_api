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

  it('returns pagination totals from the non-aggregation branch', async () => {
    const repository = makeRepository([{ id: '1' }, { id: '2' }], 2);

    const result = await paginate(repository, makeQuery({ pageSize: 2 }), {});

    expect(result.pagination).toEqual({
      currentPage: 1,
      pageSize: 2,
      totalItems: 2,
      totalPages: 1,
    });
  });

  describe('with preQueryStages (aggregation branch)', () => {
    function makeAggregatingRepository(
      data: any[],
      countResult: { count: number }[] = [{ count: data.length }],
    ) {
      const aggregate = jest
        .fn()
        .mockReturnValue({ toArray: async () => countResult });
      const aggregateEntity = jest
        .fn()
        .mockReturnValue({ toArray: async () => data });
      return {
        aggregate,
        aggregateEntity,
        findAndCount: jest.fn(),
      } as unknown as MongoRepository<any> & {
        aggregate: jest.Mock;
        aggregateEntity: jest.Mock;
      };
    }

    it('returns items from aggregateEntity(), carrying id and computed fields', async () => {
      const items = [
        { id: '1', is_planned: true },
        { id: '2', is_planned: false },
      ];
      const repository = makeAggregatingRepository(items);

      const result = await paginate(repository, makeQuery(), {
        preQueryStages: [{ $set: { is_planned: { $literal: true } } }],
      });

      expect(result.data).toEqual(items);
      expect((repository as any).aggregateEntity).toHaveBeenCalled();
    });

    it('counts via raw aggregate(), not aggregateEntity()', async () => {
      const repository = makeAggregatingRepository(
        [{ id: '1' }],
        [{ count: 5 }],
      );

      const result = await paginate(repository, makeQuery({ pageSize: 1 }), {
        preQueryStages: [{ $set: { is_planned: { $literal: true } } }],
      });

      expect((repository as any).aggregate).toHaveBeenCalled();
      expect(result.pagination.totalItems).toBe(5);
      expect(result.pagination.totalPages).toBe(5);
    });
  });
});
