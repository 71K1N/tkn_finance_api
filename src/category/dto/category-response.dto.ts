export class CategoryResponseDto {
  id: number;
  name: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}
