import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ParseTransactionTextDto {
  // Trimmed first so whitespace-only text fails IsNotEmpty and padding doesn't eat the limit.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  text: string;
}
