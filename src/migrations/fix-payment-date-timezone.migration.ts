import { MongoClient } from 'mongodb';

export interface FixPaymentDateTimezoneResult {
  modifiedCount: number;
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/**
 * Corrects `payment_date` values written before the encoding fix (see
 * ToZonedDate/parseZonedDateInput). The old path parsed a bare "YYYY-MM-DD" input with
 * the native `Date` constructor, which yields UTC midnight instead of midnight in
 * APP_TIMEZONE (America/Sao_Paulo, UTC-3, no DST since 2019) — every affected document
 * carries the exact signature `T00:00:00.000Z`. Shifting those forward by 3 hours
 * produces the instant the encoding fix now writes directly, and the shifted result no
 * longer matches the filter, so re-running this migration is a no-op.
 */
export async function fixPaymentDateTimezone(
  client: MongoClient,
): Promise<FixPaymentDateTimezoneResult> {
  const collection = client.db().collection('transaction');

  const buggyMidnightUtc = {
    payment_date: { $exists: true, $ne: null },
    $expr: {
      $and: [
        { $eq: [{ $hour: { date: '$payment_date', timezone: 'UTC' } }, 0] },
        { $eq: [{ $minute: { date: '$payment_date', timezone: 'UTC' } }, 0] },
        { $eq: [{ $second: { date: '$payment_date', timezone: 'UTC' } }, 0] },
        {
          $eq: [
            { $millisecond: { date: '$payment_date', timezone: 'UTC' } },
            0,
          ],
        },
      ],
    },
  };

  const updateResult = await collection.updateMany(buggyMidnightUtc, [
    { $set: { payment_date: { $add: ['$payment_date', THREE_HOURS_MS] } } },
  ] as any);

  return { modifiedCount: updateResult.modifiedCount };
}
