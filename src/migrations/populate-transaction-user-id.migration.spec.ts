import { populateTransactionUserId } from './populate-transaction-user-id.migration';

describe('populateTransactionUserId', () => {
  function makeClient(docs: any[]) {
    const state = { docs: docs.map((d) => ({ ...d })) };

    const collection = {
      updateMany: jest.fn(async (filter: any, pipeline: any[]) => {
        const setStage = pipeline[0].$set;
        let modifiedCount = 0;
        for (const doc of state.docs) {
          const missingUserId =
            doc.user_id === undefined || doc.user_id === null;
          const hasCreatedBy =
            doc.created_by !== undefined && doc.created_by !== null;
          if (missingUserId && hasCreatedBy) {
            doc.user_id = doc[setStage.user_id.replace('$', '')];
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      }),
      find: jest.fn(() => ({
        toArray: async () =>
          state.docs
            .filter((doc) => {
              const missingUserId =
                doc.user_id === undefined || doc.user_id === null;
              const missingCreatedBy =
                doc.created_by === undefined || doc.created_by === null;
              return missingUserId && missingCreatedBy;
            })
            .map((doc) => ({ _id: { toString: () => doc._id } })),
      })),
    };

    return {
      db: () => ({ collection: () => collection }),
    } as any;
  }

  it('populates user_id from created_by on legacy documents missing it', async () => {
    const client = makeClient([
      { _id: 'a', created_by: 7 },
      { _id: 'b', user_id: 3, created_by: 3 },
    ]);

    const result = await populateTransactionUserId(client);

    expect(result.modifiedCount).toBe(1);
    expect(result.unresolvedIds).toEqual([]);
  });

  it('reports documents with neither user_id nor created_by instead of guessing', async () => {
    const client = makeClient([{ _id: 'orphan' }]);

    const result = await populateTransactionUserId(client);

    expect(result.modifiedCount).toBe(0);
    expect(result.unresolvedIds).toEqual(['orphan']);
  });

  it('leaves documents that already have user_id untouched', async () => {
    const client = makeClient([{ _id: 'a', user_id: 5 }]);

    const result = await populateTransactionUserId(client);

    expect(result.modifiedCount).toBe(0);
    expect(result.unresolvedIds).toEqual([]);
  });
});
