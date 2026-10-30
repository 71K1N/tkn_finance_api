import { Test, TestingModule } from '@nestjs/testing';
import { SubcategoryService } from './subcategory.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Subcategory } from './entities/subcategory.entity';
import { Category } from '../category/entities/category.entity';

describe('SubcategoryService', () => {
  let service: SubcategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubcategoryService,
        { provide: getRepositoryToken(Subcategory), useValue: {} },
        { provide: getRepositoryToken(Category), useValue: {} },
      ],
    }).compile();

    service = module.get<SubcategoryService>(SubcategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
