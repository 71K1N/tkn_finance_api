import { FindOptionsOrder, MongoRepository, ObjectLiteral } from 'typeorm';
import { ObjectId } from 'mongodb';
import { FindAllQueryDto } from './find-all-query.dto';

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface PaginateOptions {
  searchableFields?: string[];
  filterableFields?: string[];
  sortableFields?: string[];
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  maxPageSize?: number;
  /**
   * Mandatory scope (e.g. { userId }) applied regardless of query input.
   * Always AND-ed with search/filter conditions — never derive this from user-controlled input.
   */
  baseWhere?: Record<string, any>;
  /**
   * Optional aggregation pipeline stages to compute virtual fields before filtering/sorting.
   * Applied before the main $match stage.
   */
  preQueryStages?: Record<string, any>[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function paginate<T extends ObjectLiteral>(
  repository: MongoRepository<T>,
  query: FindAllQueryDto,
  options: PaginateOptions = {},
): Promise<PaginatedResult<T>> {
  const maxPageSize = options.maxPageSize ?? 100;
  const page = query.page > 0 ? query.page : 1;
  const pageSize = Math.min(
    query.pageSize > 0 ? query.pageSize : 10,
    maxPageSize,
  );

  const conditions: Record<string, any>[] = [];

  if (options.baseWhere && Object.keys(options.baseWhere).length) {
    conditions.push(options.baseWhere);
  }

  if (query.search && options.searchableFields?.length) {
    const regex = { $regex: escapeRegExp(query.search), $options: 'i' };
    conditions.push({
      $or: options.searchableFields.map((field) => ({ [field]: regex })),
    });
  }

  if (query.filters) {
    for (const [key, value] of Object.entries(query.filters)) {
      if (
        typeof value !== 'string' ||
        !value ||
        !options.filterableFields?.includes(key)
      ) {
        continue;
      }
      // Relation/id columns are stored as real ObjectId (BSON) values, which $regex cannot
      // match against — a 24-char hex filter value is treated as an exact-match ObjectId lookup.
      if (/^[a-fA-F0-9]{24}$/.test(value)) {
        conditions.push({ [key]: ObjectId.createFromHexString(value) });
        continue;
      }
      conditions.push({
        [key]: { $regex: escapeRegExp(value), $options: 'i' },
      });
    }
  }

  const where =
    conditions.length === 0
      ? {}
      : conditions.length === 1
        ? conditions[0]
        : { $and: conditions };

  let order: FindOptionsOrder<T> | undefined;
  const sort = query.sort ?? options.defaultSort;
  if (sort && options.sortableFields?.includes(sort.key)) {
    order = {
      [sort.key]: sort.direction === 'asc' ? 'ASC' : 'DESC',
    } as FindOptionsOrder<T>;
  }

  // If preQueryStages are provided, use aggregation instead of findAndCount for backward compatibility
  if (options.preQueryStages && options.preQueryStages.length > 0) {
    const pipeline: Record<string, any>[] = [
      ...options.preQueryStages,
      { $match: where as any },
    ];

    // Count total items
    const countPipeline = [...pipeline, { $count: 'count' }];
    const countResult = await repository.aggregate(countPipeline).toArray();
    const totalItems = countResult.length > 0 ? countResult[0].count : 0;

    // Add sort, skip, and take
    if (sort && options.sortableFields?.includes(sort.key)) {
      const sortDir = sort.direction === 'asc' ? 1 : -1;
      pipeline.push({ $sort: { [sort.key]: sortDir } });
    }
    pipeline.push({ $skip: (page - 1) * pageSize });
    pipeline.push({ $limit: pageSize });

    const data = await repository.aggregate(pipeline).toArray();

    return {
      data: data as T[],
      pagination: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    };
  }

  const [data, totalItems] = await repository.findAndCount({
    where: where as any,
    order,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    data,
    pagination: {
      currentPage: page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    },
  };
}
