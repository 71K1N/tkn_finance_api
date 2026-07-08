import { Injectable } from '@nestjs/common';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Subcategory } from './entities/subcategory.entity';
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
  ) {}
  create(createSubcategoryDto: CreateSubcategoryDto) {
    return this.subcategoryRepository.save({
      ...createSubcategoryDto,
      categoryId: toObjectId(createSubcategoryDto.categoryId),
    });
  }

  findAll(query: FindAllQueryDto) {
    return paginate(this.subcategoryRepository, query, {
      searchableFields: ['name', 'description'],
      filterableFields: ['name', 'description', 'categoryId'],
      sortableFields: ['name', 'description', 'created_at', 'updated_at'],
      defaultSort: { key: 'created_at', direction: 'desc' },
    });
  }

  findOne(id: ObjectId) {
    return this.subcategoryRepository.findOne({ where: { _id: id } as any });
  }

  async update(id: ObjectId, updateSubcategoryDto: UpdateSubcategoryDto) {
    const subcategory = await this.subcategoryRepository.findOne({
      where: { _id: id } as any,
    });
    if (!subcategory) {
      throw new Error('Subcategory not found');
    }
    Object.assign(subcategory, updateSubcategoryDto);
    if (updateSubcategoryDto.categoryId) {
      subcategory.categoryId = toObjectId(updateSubcategoryDto.categoryId);
    }
    return this.subcategoryRepository.save(subcategory);
  }

  remove(id: ObjectId) {
    return this.subcategoryRepository
      .findOne({ where: { _id: id } as any })
      .then((result) => this.subcategoryRepository.remove(result))
      .catch(() => {
        return 'Não pode ser excluido ... pq eu nao sei mesmo...';
      });
  }
}
