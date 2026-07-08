import { Injectable } from '@nestjs/common';
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
  create(createCategoryDto: CreateCategoryDto) {
    return this.categoryRepository.save(createCategoryDto);
  }

  findAll(query: FindAllQueryDto) {
    return paginate(this.categoryRepository, query, {
      searchableFields: ['name', 'description'],
      filterableFields: ['name', 'description'],
      sortableFields: ['name', 'description', 'created_at', 'updated_at'],
      defaultSort: { key: 'created_at', direction: 'desc' },
    });
  }

  findOne(id: ObjectId) {
    return this.categoryRepository.findOne({ where: { _id: id } as any });
  }

  async update(id: ObjectId, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.categoryRepository.findOne({
      where: { _id: id } as any,
    });
    if (!category) {
      throw new Error('Category not found');
    }
    Object.assign(category, updateCategoryDto);
    return this.categoryRepository.save(category);
  }

  remove(id: ObjectId) {
    return this.categoryRepository
      .findOne({ where: { _id: id } as any })
      .then((result) => this.categoryRepository.remove(result))
      .catch(() => {
        return 'Não pode ser excluido ... pq eu nao sei mesmo...';
      });
  }
}
