import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WishItem } from './entities/wish-item.entity';
import { WishItemService } from './wish-item.service';
import { WishItemController } from './wish-item.controller';
import { SavingsGoalModule } from '../savings-goal/savings-goal.module';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WishItem]),
    SavingsGoalModule,
    WebhookModule,
  ],
  providers: [WishItemService],
  controllers: [WishItemController],
  exports: [WishItemService],
})
export class WishItemModule {}
