import { AccountType, accountTypeOf } from '../account-type';

export class BankAccountResponseDto {
  id: string;
  description: string;
  balance: number;
  type: AccountType;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;

  constructor(partial: any) {
    Object.assign(this, partial);
    this.type = accountTypeOf(partial);
    if (partial?.id?.toString) {
      this.id = partial.id.toString();
    }
  }
}
