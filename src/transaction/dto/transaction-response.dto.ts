export class CategoryResponseDto {
  id: number;
  name: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

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

export class BankAccountResponseDto {
  id: number;
  description: string;
  balance: number;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
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
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

export type TransactionWithCategory = TransactionResponseDto;
