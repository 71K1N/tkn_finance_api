import { Global, Module } from '@nestjs/common';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';

/** Loads and validates auth env once; throws at startup when required vars are missing. */
@Global()
@Module({
  providers: [{ provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() }],
  exports: [AUTH_CONFIG],
})
export class AuthConfigModule {}
