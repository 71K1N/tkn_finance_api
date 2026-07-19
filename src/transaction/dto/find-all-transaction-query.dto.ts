import { IsDateString, IsMongoId, IsOptional } from 'class-validator';
import { FindAllQueryDto } from '../../common/pagination/find-all-query.dto';

export class FindAllTransactionQueryDto extends FindAllQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // Transactions only store subcategory_id, not category_id — filtering by category
  // alone requires resolving it to the set of matching subcategory_ids server-side
  // (see TransactionService.findAll/getSummary).
  @IsOptional()
  @IsMongoId()
  category_id?: string;
}
