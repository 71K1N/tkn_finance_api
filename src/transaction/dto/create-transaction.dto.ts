export class CreateTransactionDto {
  name: string;
  description: string;
  amount: number;
  due_date: Date;
  payment_date: Date;
  subcategory_id: number;
  user_id: number;
  account_id: number;
  paid_amount: number;
}
