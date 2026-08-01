import { IsDate, IsNumber, IsOptional } from 'class-validator';
import { ToZonedDate } from '../../common/date/zoned-date.transform';

export class PaymentTransactionDto {
  @ToZonedDate()
  @IsDate()
  @IsOptional()
  payment_date?: Date;

  @IsNumber()
  paid_amount: number;
}
