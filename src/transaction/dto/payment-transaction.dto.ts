import { IsDate, IsNumber, IsOptional } from 'class-validator';

export class PaymentTransactionDto {
  @IsDate()
  @IsOptional()
  payment_date?: Date;

  @IsNumber()
  paid_amount: number;
} 