import { CategoryResponseDto } from '../../category/dto/category-response.dto';

export class SubcategoryResponseDto {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  category: CategoryResponseDto;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;

  constructor(partial: any) {
    Object.assign(this, partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
    if (partial?.categoryId?.toString) {
      this.categoryId = partial.categoryId.toString();
    }
  }
}
