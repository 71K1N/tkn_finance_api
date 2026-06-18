import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { MongoIdPipe } from '../common/mongo-id.pipe';
import { SubcategoryService } from './subcategory.service';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';

@UseGuards(AuthGuard)
@Controller('subcategory')
export class SubcategoryController {
  constructor(private readonly subcategoryService: SubcategoryService) {}

  @Post()
  create(@User() user: any, @Body() createSubcategoryDto: CreateSubcategoryDto) {
    if (user && user.id) {
      (createSubcategoryDto as any).created_by = user.id;
      (createSubcategoryDto as any).updated_by = user.id;
    }
    return this.subcategoryService.create(createSubcategoryDto);
  }

  @Get()
  findAll() {
    return this.subcategoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.subcategoryService.findOne(id);
  }

  @Patch(':id')
  update(
    @User() user: any,
    @Param('id', MongoIdPipe) id: ObjectId,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
  ) {
    if (user && user.id) {
      (updateSubcategoryDto as any).updated_by = user.id;
    }
    return this.subcategoryService.update(id, updateSubcategoryDto);
  }

  @Delete(':id')
  remove(@Param('id', MongoIdPipe) id: ObjectId) {
    return this.subcategoryService.remove(id);
  }
}
