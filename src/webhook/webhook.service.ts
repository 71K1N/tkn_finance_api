import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WebhookSubscription,
  WebhookEventType,
} from './entities/webhook-subscription.entity';
import { ObjectId } from 'mongodb';

interface WebhookPayload {
  event_type: string;
  timestamp: Date;
  userId: number;
  data: Record<string, any>;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookSubscription)
    private subscriptionRepository: Repository<WebhookSubscription>,
    private httpService: HttpService,
  ) {}

  async subscribe(
    userId: number,
    eventType: WebhookEventType,
    endpoint: string,
  ): Promise<WebhookSubscription> {
    const subscription = this.subscriptionRepository.create({
      userId,
      eventType,
      endpoint,
      created_by: userId,
    });
    return this.subscriptionRepository.save(subscription);
  }

  async unsubscribe(userId: number, subscriptionId: ObjectId): Promise<void> {
    await this.subscriptionRepository.delete({
      id: subscriptionId,
      userId,
    });
  }

  async getSubscriptions(userId: number): Promise<WebhookSubscription[]> {
    return this.subscriptionRepository.find({
      where: { userId, isActive: true },
    });
  }

  async emitEvent(
    eventType: WebhookEventType,
    userId: number,
    payload: Record<string, any>,
  ): Promise<void> {
    const subscriptions = await this.subscriptionRepository.find({
      where: {
        userId,
        eventType,
        isActive: true,
      },
    });

    if (subscriptions.length === 0) {
      return;
    }

    const webhookPayload: WebhookPayload = {
      event_type: eventType,
      timestamp: new Date(),
      userId,
      data: payload,
    };

    for (const subscription of subscriptions) {
      this.emitToEndpoint(subscription.endpoint, webhookPayload).catch(
        (error) => {
          this.logger.error(
            `Failed to emit webhook to ${subscription.endpoint}: ${error.message}`,
          );
        },
      );
    }
  }

  private async emitToEndpoint(
    endpoint: string,
    payload: WebhookPayload,
  ): Promise<void> {
    try {
      await this.httpService
        .post(endpoint, payload, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': payload.event_type,
          },
        })
        .toPromise();
    } catch (error) {
      this.logger.error(
        `Webhook emission failed for ${endpoint}`,
        error.message,
      );
      throw error;
    }
  }
}
