import { Test, TestingModule } from '@nestjs/testing';
import { SubcategoryController } from './subcategory.controller';
import { SubcategoryService } from './subcategory.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Subcategory } from './entities/subcategory.entity';

describe('SubcategoryController', () => {
  let controller: SubcategoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubcategoryController],
      providers: [
        SubcategoryService,
        { provide: getRepositoryToken(Subcategory), useValue: {} },
      ],
    }).compile();

    controller = module.get<SubcategoryController>(SubcategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
