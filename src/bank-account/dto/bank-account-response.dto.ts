export class BankAccountResponseDto {
  id: number;
  description: string;
  balance: number;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}
