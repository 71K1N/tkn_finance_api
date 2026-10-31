import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Category } from './entities/category.entity';
import { ObjectId } from 'mongodb';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: MongoRepository<Category>,
  ) {}

  create(userId: number, createCategoryDto: CreateCategoryDto) {
    return this.categoryRepository.save({
      name: createCategoryDto.name,
      description: createCategoryDto.description,
      user_id: userId,
      created_by: userId,
      updated_by: userId,
    });
  }

  // A user sees their own categories plus the shared system catalogue (user_id null).
  findAll(userId: number, query: FindAllQueryDto) {
    return paginate(this.categoryRepository, query, {
      searchableFields: ['name', 'description'],
      filterableFields: ['name', 'description'],
      sortableFields: ['name', 'description', 'created_at', 'updated_at'],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere: { $or: [{ user_id: userId }, { user_id: null }] },
    });
  }

  async findOne(id: ObjectId, userId: number): Promise<Category | null> {
    const category = await this.categoryRepository.findOne({
      where: { _id: id } as any,
    });
    const owner = category?.user_id ?? null;
    return category && (owner === null || owner === userId) ? category : null;
  }

  // Only the owner can change a category; system categories are read-only.
  async update(
    id: ObjectId,
    userId: number,
    updateCategoryDto: UpdateCategoryDto,
  ) {
    const category = await this.categoryRepository.findOne({
      where: { _id: id } as any,
    });
    if (!category || category.user_id !== userId) {
      throw new NotFoundException('Category not found');
    }
    if (updateCategoryDto.name !== undefined) {
      category.name = updateCategoryDto.name;
    }
    if (updateCategoryDto.description !== undefined) {
      category.description = updateCategoryDto.description;
    }
    category.updated_by = userId;
    return this.categoryRepository.save(category);
  }

  remove(id: ObjectId, userId: number) {
    return this.categoryRepository
      .findOne({ where: { _id: id, user_id: userId } as any })
      .then((result) => this.categoryRepository.remove(result))
      .catch(() => {
        return 'Não pode ser excluido ... pq eu nao sei mesmo...';
      });
  }
}
