import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Subcategory } from './entities/subcategory.entity';
import { Category } from '../category/entities/category.entity';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { toObjectId } from '../common/mongo.util';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';
import { paginate } from '../common/pagination/paginate.util';

@Injectable()
export class SubcategoryService {
  constructor(
    @InjectRepository(Subcategory)
    private subcategoryRepository: MongoRepository<Subcategory>,
    @InjectRepository(Category)
    private categoryRepository: MongoRepository<Category>,
  ) {}

  // The parent category must be visible to the user (their own or a system one).
  private async assertCategoryVisible(categoryId: string, userId: number) {
    const category = await this.categoryRepository.findOne({
      where: { _id: toObjectId(categoryId) } as any,
    });
    const owner = category?.user_id ?? null;
    if (!category || (owner !== null && owner !== userId)) {
      throw new NotFoundException('Category not found');
    }
  }

  async create(userId: number, createSubcategoryDto: CreateSubcategoryDto) {
    await this.assertCategoryVisible(createSubcategoryDto.categoryId, userId);
    return this.subcategoryRepository.save({
      name: createSubcategoryDto.name,
      description: createSubcategoryDto.description,
      categoryId: toObjectId(createSubcategoryDto.categoryId),
      user_id: userId,
      created_by: userId,
      updated_by: userId,
    });
  }

  // A user sees their own subcategories plus the shared system catalogue (user_id null).
  findAll(userId: number, query: FindAllQueryDto) {
    return paginate(this.subcategoryRepository, query, {
      searchableFields: ['name', 'description'],
      filterableFields: ['name', 'description', 'categoryId'],
      sortableFields: ['name', 'description', 'created_at', 'updated_at'],
      defaultSort: { key: 'created_at', direction: 'desc' },
      baseWhere: { $or: [{ user_id: userId }, { user_id: null }] },
    });
  }

  async findOne(id: ObjectId, userId: number): Promise<Subcategory | null> {
    const subcategory = await this.subcategoryRepository.findOne({
      where: { _id: id } as any,
    });
    const owner = subcategory?.user_id ?? null;
    return subcategory && (owner === null || owner === userId)
      ? subcategory
      : null;
  }

  // Only the owner can change a subcategory; system subcategories are read-only.
  async update(
    id: ObjectId,
    userId: number,
    updateSubcategoryDto: UpdateSubcategoryDto,
  ) {
    const subcategory = await this.subcategoryRepository.findOne({
      where: { _id: id } as any,
    });
    if (!subcategory || subcategory.user_id !== userId) {
      throw new NotFoundException('Subcategory not found');
    }
    if (updateSubcategoryDto.name !== undefined) {
      subcategory.name = updateSubcategoryDto.name;
    }
    if (updateSubcategoryDto.description !== undefined) {
      subcategory.description = updateSubcategoryDto.description;
    }
    if (updateSubcategoryDto.categoryId) {
      await this.assertCategoryVisible(updateSubcategoryDto.categoryId, userId);
      subcategory.categoryId = toObjectId(updateSubcategoryDto.categoryId);
    }
    subcategory.updated_by = userId;
    return this.subcategoryRepository.save(subcategory);
  }

  remove(id: ObjectId, userId: number) {
    return this.subcategoryRepository
      .findOne({ where: { _id: id, user_id: userId } as any })
      .then((result) => this.subcategoryRepository.remove(result))
      .catch(() => {
        return 'Não pode ser excluido ... pq eu nao sei mesmo...';
      });
  }
}
