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
import { SubcategoryService } from './subcategory.service';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { User } from '../common/user.decorator';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';

@Controller('subcategory')
export class SubcategoryController {
  constructor(private readonly subcategoryService: SubcategoryService) {}

  @Post()
  create(
    @User() userId: number,
    @Body() createSubcategoryDto: CreateSubcategoryDto,
  ) {
    return this.subcategoryService.create(userId, createSubcategoryDto);
  }

  @Get()
  findAll(@User() userId: number, @Query() query: FindAllQueryDto) {
    return this.subcategoryService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.subcategoryService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @User() userId: number,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
  ) {
    return this.subcategoryService.update(id, userId, updateSubcategoryDto);
  }

  @Delete(':id')
  remove(@User() userId: number, @Param('id', MongoIdPipe) id: ObjectId) {
    return this.subcategoryService.remove(id, userId);
  }
}
