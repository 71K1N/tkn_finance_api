import { Matches } from 'class-validator';

const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

// Format only: calendar validity (Feb 30) and the interval rules live in
// TransactionService.getDailySummary, next to dayToRange, which already owns them.
export class DailySummaryQueryDto {
  @Matches(DAY_FORMAT, { message: 'from must be formatted as YYYY-MM-DD' })
  from: string;

  @Matches(DAY_FORMAT, { message: 'to must be formatted as YYYY-MM-DD' })
  to: string;
}
