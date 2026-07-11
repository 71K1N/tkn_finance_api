import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { AuthGuard } from '../common/auth.guard';
import { User } from '../common/user.decorator';

@UseGuards(AuthGuard)
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
