export class CategoryResponseDto {
  id: string;
  name: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

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
}

export class BankAccountResponseDto {
  id: string;
  description: string;
  balance: number;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

export class TransactionResponseDto {
  id: string;
  name: string;
  description: string;
  amount: number;
  due_date: Date;
  payment_date: Date;
  subcategory_id?: string | null;
  category_id?: string | null;
  user_id: number;
  account_id: string;
  target_account_id?: string | null;
  paid_amount: number;
  type: string;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

export type TransactionWithCategory = TransactionResponseDto;
