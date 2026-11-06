import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { VERSION_INFO, VersionInfo } from './common/version';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('version')
  getVersion(): VersionInfo {
    return VERSION_INFO;
  }
}
