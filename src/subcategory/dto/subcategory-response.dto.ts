import { CategoryResponseDto } from '../../category/dto/category-response.dto';

export class SubcategoryResponseDto {
  id: number;
  name: string;
  description: string;
  categoryId: number;
  category: CategoryResponseDto;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}
