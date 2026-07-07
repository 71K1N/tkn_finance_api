import { FindOptionsOrder, MongoRepository, ObjectLiteral } from 'typeorm';
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
  const pageSize = Math.min(query.pageSize > 0 ? query.pageSize : 10, maxPageSize);

  const conditions: Record<string, any>[] = [];

  if (query.search && options.searchableFields?.length) {
    const regex = { $regex: escapeRegExp(query.search), $options: 'i' };
    conditions.push({
      $or: options.searchableFields.map((field) => ({ [field]: regex })),
    });
  }

  if (query.filters) {
    for (const [key, value] of Object.entries(query.filters)) {
      if (typeof value !== 'string' || !value || !options.filterableFields?.includes(key)) {
        continue;
      }
      conditions.push({ [key]: { $regex: escapeRegExp(value), $options: 'i' } });
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
    order = { [sort.key]: sort.direction === 'asc' ? 'ASC' : 'DESC' } as FindOptionsOrder<T>;
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
