export class CategoryResponseDto {
  id: number;
  name: string;
  description: string;
}

export class SubcategoryResponseDto {
  id: number;
  name: string;
  description: string;
  category: CategoryResponseDto;
}

export class TransactionResponseDto {
  id: number;
  name: string;
  description: string;
  amount: number;
  due_date: Date;
  payment_date: Date;
  subcategory_id: number;
  category_id?: number;
  user_id: number;
  account_id: number;
  paid_amount: number;
  type: string;
}

export type TransactionWithCategory = TransactionResponseDto;
