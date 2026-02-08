import { IsString, IsEnum, IsUrl } from 'class-validator';
import { WebhookEventType } from '../entities/webhook-subscription.entity';

export class CreateWebhookSubscriptionDto {
  @IsEnum(WebhookEventType)
  eventType: WebhookEventType;

  @IsUrl()
  endpoint: string;
}

export class WebhookSubscriptionResponseDto {
  id: number;
  userId: number;
  eventType: WebhookEventType;
  endpoint: string;
  isActive: boolean;
  created_at: Date;
  updated_at: Date;

  constructor(subscription: any) {
    Object.assign(this, subscription);
  }
}
