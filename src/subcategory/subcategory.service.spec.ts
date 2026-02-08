import { Test, TestingModule } from '@nestjs/testing';
import { SubcategoryService } from './subcategory.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Subcategory } from './entities/subcategory.entity';

describe('SubcategoryService', () => {
  let service: SubcategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubcategoryService,
        { provide: getRepositoryToken(Subcategory), useValue: {} },
      ],
    }).compile();

    service = module.get<SubcategoryService>(SubcategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
