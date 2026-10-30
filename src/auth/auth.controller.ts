import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AUTH_CONFIG, AuthConfig } from '../config/auth.config';
import { User } from '../common/user.decorator';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { Public } from './public.decorator';
import { IssuedRefreshToken } from './refresh-token.service';

export const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Public()
  @Post('google')
  @HttpCode(200)
  async google(
    @Body() dto: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user, refresh } = await this.auth.loginWithGoogle(
      dto.credential,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, refresh);
    return { accessToken, user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user, refresh } = await this.auth.refresh(
      req.cookies?.[REFRESH_COOKIE],
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, refresh);
    return { accessToken, user };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { success: true };
  }

  @Get('me')
  me(@User() userId: number) {
    return this.auth.me(userId);
  }

  private setRefreshCookie(res: Response, refresh: IssuedRefreshToken) {
    res.cookie(REFRESH_COOKIE, refresh.token, {
      ...this.cookieOptions(),
      expires: refresh.expiresAt,
    });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      path: this.config.cookiePath,
    };
  }
}
