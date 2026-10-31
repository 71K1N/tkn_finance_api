import { Controller, Get, Post } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { User } from '../common/user.decorator';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  getOrCreate(@User() userId: number) {
    return this.insightsService.getOrCreate(userId);
  }

  @Post('refresh')
  refresh(@User() userId: number) {
    return this.insightsService.refresh(userId);
  }
}
