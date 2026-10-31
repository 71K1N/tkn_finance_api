import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AUTH_CONFIG, AuthConfig } from '../config/auth.config';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

@Injectable()
export class GoogleVerifier {
  private readonly client = new OAuth2Client();

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  /** Verifies signature, issuer, audience and expiry; requires a verified e-mail. */
  async verify(idToken: string): Promise<GoogleProfile> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.config.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException();
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException();
    }

    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  }
}
