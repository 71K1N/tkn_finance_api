import { populateAccountType } from './populate-account-type.migration';

describe('populateAccountType', () => {
  function makeClient(docs: any[]) {
    const state = { docs: docs.map((d) => ({ ...d })) };
    const collection = {
      updateMany: jest.fn(async (_filter: any, update: any) => {
        let modifiedCount = 0;
        for (const doc of state.docs) {
          if (doc.type === undefined || doc.type === null) {
            Object.assign(doc, update.$set);
            modifiedCount += 1;
          }
        }
        return { modifiedCount };
      }),
    };
    const client = { db: () => ({ collection: () => collection }) } as any;
    return { client, state, collection };
  }

  it('sets CHECKING on accounts without a type and keeps the others', async () => {
    const { client, state } = makeClient([
      { _id: 'a' },
      { _id: 'b', type: null },
      { _id: 'c', type: 'INVESTMENT' },
    ]);

    const result = await populateAccountType(client);

    expect(result.modifiedCount).toBe(2);
    expect(state.docs.map((d) => d.type)).toEqual([
      'CHECKING',
      'CHECKING',
      'INVESTMENT',
    ]);
  });

  it('only targets documents missing the type', async () => {
    const { client, collection } = makeClient([]);
    await populateAccountType(client);
    expect(collection.updateMany).toHaveBeenCalledWith(
      { $or: [{ type: { $exists: false } }, { type: null }] },
      { $set: { type: 'CHECKING' } },
    );
  });
});
