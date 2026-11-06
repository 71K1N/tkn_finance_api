import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import cookieParser = require('cookie-parser');
import { loadAuthConfig } from './config/auth.config';

async function bootstrap() {
  const { corsOrigins } = loadAuthConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind nginx: use X-Forwarded-For so rate limiting sees the real client IP.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 8081, '127.0.0.1');
}

bootstrap();
