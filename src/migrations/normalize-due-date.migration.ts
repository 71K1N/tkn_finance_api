import { MongoClient } from 'mongodb';
import { APP_TIMEZONE } from '../common/date/month-range.util';

export interface NormalizeDueDateResult {
  modifiedCount: number;
}

/**
 * Converts every `due_date` still stored as a BSON `Date` into the canonical
 * "YYYY-MM-DD" string, naming the calendar day that instant falls on in APP_TIMEZONE.
 *
 * A due date is a calendar date, not an instant: the API has always written it as a
 * plain string straight from the create DTO, but `seed.ts` wrote `new Date(y, m, 5)`,
 * leaving the collection with two storage types that no reader could match uniformly.
 *
 * Idempotent by construction, the same way fix-payment-date-timezone is: once
 * converted, the value is a string and no longer matches `$type: 'date'`, so a second
 * run modifies nothing. Documents with no `due_date` never match the filter and are
 * left untouched — no `due_date` is added to them.
 */
export async function normalizeDueDate(
  client: MongoClient,
): Promise<NormalizeDueDateResult> {
  const collection = client.db().collection('transaction');

  const updateResult = await collection.updateMany(
    { due_date: { $type: 'date' } },
    [
      {
        $set: {
          due_date: {
            $dateToString: {
              date: '$due_date',
              format: '%Y-%m-%d',
              timezone: APP_TIMEZONE,
            },
          },
        },
      },
    ] as any,
  );

  return { modifiedCount: updateResult.modifiedCount };
}
