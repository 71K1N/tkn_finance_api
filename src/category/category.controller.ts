import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { User } from '../common/user.decorator';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  create(@User() userId: number, @Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(userId, createCategoryDto);
  }

  @Get()
  findAll(@User() userId: number, @Query() query: FindAllQueryDto) {
    return this.categoryService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.categoryService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, userId, updateCategoryDto);
  }

  @Delete(':id')
  remove(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.categoryService.remove(id, userId);
  }
}
