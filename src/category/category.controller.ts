import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';
import { FindAllQueryDto } from '../common/pagination/find-all-query.dto';

@UseGuards(AuthGuard)
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  create(@User() user: any, @Body() createCategoryDto: CreateCategoryDto) {
    if (user && user.id) {
      (createCategoryDto as any).created_by = user.id;
      (createCategoryDto as any).updated_by = user.id;
    }
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  findAll(@Query() query: FindAllQueryDto) {
    return this.categoryService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.categoryService.findOne(id);
  }

  @Patch(':id')
  update(
    @User() user: any,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    if (user && user.id) {
      (updateCategoryDto as any).updated_by = user.id;
    }
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.categoryService.remove(id);
  }
}
