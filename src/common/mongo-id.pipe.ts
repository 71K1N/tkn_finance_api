import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ObjectId } from 'mongodb';

@Injectable()
export class MongoIdPipe implements PipeTransform<string, ObjectId> {
  transform(value: string, metadata: ArgumentMetadata): ObjectId {
    if (!ObjectId.isValid(value)) {
      throw new BadRequestException(
        `${metadata.data} must be a valid MongoDB ObjectId`,
      );
    }
    return new ObjectId(value);
  }
}
