import { fixPaymentDateTimezone } from './fix-payment-date-timezone.migration';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

describe('fixPaymentDateTimezone', () => {
  function makeClient(docs: { _id: string; payment_date: Date | null }[]) {
    const state = { docs: docs.map((d) => ({ ...d })) };

    const isBuggyMidnightUtc = (date: Date | null) => {
      if (!date) return false;
      return (
        date.getUTCHours() === 0 &&
        date.getUTCMinutes() === 0 &&
        date.getUTCSeconds() === 0 &&
        date.getUTCMilliseconds() === 0
      );
    };

    const collection = {
      updateMany: jest.fn(async () => {
        let modifiedCount = 0;
        for (const doc of state.docs) {
          if (isBuggyMidnightUtc(doc.payment_date)) {
            doc.payment_date = new Date(
              doc.payment_date!.getTime() + THREE_HOURS_MS,
            );
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      }),
    };

    return {
      db: () => ({ collection: () => collection }),
      state,
    } as any;
  }

  it('shifts a buggy UTC-midnight payment_date forward by 3 hours', async () => {
    const client = makeClient([
      { _id: 'a', payment_date: new Date('2026-08-01T00:00:00.000Z') },
    ]);

    const result = await fixPaymentDateTimezone(client);

    expect(result.modifiedCount).toBe(1);
    expect(client.state.docs[0].payment_date.toISOString()).toBe(
      '2026-08-01T03:00:00.000Z',
    );
  });

  it('is a no-op on a second run against already-shifted documents', async () => {
    const client = makeClient([
      { _id: 'a', payment_date: new Date('2026-08-01T03:00:00.000Z') },
    ]);

    const result = await fixPaymentDateTimezone(client);

    expect(result.modifiedCount).toBe(0);
    expect(client.state.docs[0].payment_date.toISOString()).toBe(
      '2026-08-01T03:00:00.000Z',
    );
  });

  it('leaves a document with no payment_date untouched', async () => {
    const client = makeClient([{ _id: 'a', payment_date: null }]);

    const result = await fixPaymentDateTimezone(client);

    expect(result.modifiedCount).toBe(0);
  });

  it('leaves a payment_date that already carries a real time-of-day untouched', async () => {
    const client = makeClient([
      { _id: 'a', payment_date: new Date('2026-08-01T14:32:00.000Z') },
    ]);

    const result = await fixPaymentDateTimezone(client);

    expect(result.modifiedCount).toBe(0);
  });
});
