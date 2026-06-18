import { ObjectId } from 'mongodb';

export function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new Error('Invalid MongoDB ObjectId');
  }
  return new ObjectId(id);
}
