import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AUTH_CONFIG, AuthConfig } from '../config/auth.config';
import { AuthConfigModule } from '../config/auth-config.module';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { GoogleVerifier } from './google.verifier';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    AuthConfigModule,
    UserModule,
    TypeOrmModule.forFeature([RefreshToken]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    JwtModule.registerAsync({
      imports: [AuthConfigModule],
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: config.jwtAccessTtl, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    GoogleVerifier,
    // Order matters: throttle first, then authenticate.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
