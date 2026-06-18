import { Injectable } from '@nestjs/common';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Subcategory } from './entities/subcategory.entity';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';

@Injectable()
export class SubcategoryService {
  constructor(
    @InjectRepository(Subcategory)
    private subcategoryRepository: Repository<Subcategory>,
  ) {}
  create(createSubcategoryDto: CreateSubcategoryDto) {
    return this.subcategoryRepository.save(createSubcategoryDto);
  }

  findAll() {
    return this.subcategoryRepository.find();
  }

  findOne(id: ObjectId) {
    return this.subcategoryRepository.findOne({ where: { id } });
  }

  update(id: ObjectId, updateSubcategoryDto: UpdateSubcategoryDto) {
    return this.subcategoryRepository.update(id, updateSubcategoryDto);
  }

  remove(id: ObjectId) {
    return this.subcategoryRepository.delete(id);
  }
}
