import { normalizeDueDate } from './normalize-due-date.migration';
import { dayKeyOf } from '../common/date/month-range.util';

describe('normalizeDueDate', () => {
  /**
   * Stands in for the server-side `updateMany` pipeline: matches only `$type: 'date'`
   * and rewrites the value the way `$dateToString` with APP_TIMEZONE would. The
   * conversion itself goes through dayKeyOf, the same APP_TIMEZONE formatting the
   * pipeline asks Mongo for, so the expectations below pin the calendar day rather
   * than re-implementing the zone arithmetic.
   */
  function makeClient(
    docs: { _id: string; due_date?: Date | string | null }[],
  ) {
    const state = { docs: docs.map((d) => ({ ...d })) };

    const collection = {
      updateMany: jest.fn(async () => {
        let modifiedCount = 0;
        for (const doc of state.docs) {
          if (!(doc.due_date instanceof Date)) continue;
          doc.due_date = dayKeyOf(doc.due_date);
          modifiedCount += 1;
        }
        return { modifiedCount };
      }),
    };

    return {
      db: () => ({ collection: () => collection }),
      state,
    } as any;
  }

  it('converts a Date-typed due_date to the calendar day it falls on in APP_TIMEZONE', async () => {
    // 03:00Z is midnight in America/Sao_Paulo (UTC-3), so this is the 5th there.
    const client = makeClient([
      { _id: 'a', due_date: new Date('2026-08-05T03:00:00.000Z') },
    ]);

    const result = await normalizeDueDate(client);

    expect(result.modifiedCount).toBe(1);
    expect(client.state.docs[0].due_date).toBe('2026-08-05');
  });

  it('names the local calendar day, not the UTC one, across a zone boundary', async () => {
    // 02:00Z on the 1st is still 23:00 on the previous day in APP_TIMEZONE.
    const client = makeClient([
      { _id: 'a', due_date: new Date('2026-08-01T02:00:00.000Z') },
    ]);

    await normalizeDueDate(client);

    expect(client.state.docs[0].due_date).toBe('2026-07-31');
  });

  it('leaves an already-string due_date untouched', async () => {
    const client = makeClient([{ _id: 'a', due_date: '2026-08-05' }]);

    const result = await normalizeDueDate(client);

    expect(result.modifiedCount).toBe(0);
    expect(client.state.docs[0].due_date).toBe('2026-08-05');
  });

  it('leaves a document with no due_date untouched and adds none', async () => {
    const client = makeClient([{ _id: 'a' }, { _id: 'b', due_date: null }]);

    const result = await normalizeDueDate(client);

    expect(result.modifiedCount).toBe(0);
    expect(client.state.docs[0].due_date).toBeUndefined();
    expect(client.state.docs[1].due_date).toBeNull();
  });

  it('modifies nothing on a second run', async () => {
    const client = makeClient([
      { _id: 'a', due_date: new Date('2026-08-05T03:00:00.000Z') },
    ]);

    const first = await normalizeDueDate(client);
    const second = await normalizeDueDate(client);

    expect(first.modifiedCount).toBe(1);
    expect(second.modifiedCount).toBe(0);
    expect(client.state.docs[0].due_date).toBe('2026-08-05');
  });

  it('asks Mongo for a BSON-type filter and a $dateToString pipeline', async () => {
    const client = makeClient([]);
    await normalizeDueDate(client);

    const collection = client.db().collection('transaction');
    const [filter, pipeline] = collection.updateMany.mock.calls[0];

    expect(filter).toEqual({ due_date: { $type: 'date' } });
    expect(pipeline[0].$set.due_date.$dateToString).toMatchObject({
      date: '$due_date',
      format: '%Y-%m-%d',
    });
  });
});
