import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { CreateWebhookSubscriptionDto, WebhookSubscriptionResponseDto } from './dto/create-webhook-subscription.dto';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';

@Controller('webhook')
@UseGuards(AuthGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('subscribe')
  async subscribe(
    @User() userId: number,
    @Body() createSubscriptionDto: CreateWebhookSubscriptionDto,
  ): Promise<WebhookSubscriptionResponseDto> {
    const subscription = await this.webhookService.subscribe(
      userId,
      createSubscriptionDto.eventType,
      createSubscriptionDto.endpoint,
    );
    return new WebhookSubscriptionResponseDto(subscription);
  }

  @Get('subscriptions')
  async getSubscriptions(
    @User() userId: number,
  ): Promise<WebhookSubscriptionResponseDto[]> {
    const subscriptions = await this.webhookService.getSubscriptions(userId);
    return subscriptions.map((s) => new WebhookSubscriptionResponseDto(s));
  }

  @Delete('unsubscribe/:subscriptionId')
  async unsubscribe(
    @User() userId: number,
    @Param('subscriptionId') subscriptionId: string,
  ): Promise<{ message: string }> {
    const id = parseInt(subscriptionId, 10);
    if (isNaN(id)) {
      throw new BadRequestException('subscriptionId must be a valid number');
    }
    try {
      await this.webhookService.unsubscribe(userId, id);
      return { message: 'Webhook subscription deleted successfully' };
    } catch (error) {
      throw new NotFoundException('Webhook subscription not found');
    }
  }
}
