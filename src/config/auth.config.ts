export type SignupMode = 'allowlist' | 'open';

export interface AuthConfig {
  jwtSecret: string;
  jwtAccessTtl: string;
  refreshTtlMs: number;
  refreshAbsoluteTtlMs: number;
  googleClientId: string;
  allowedEmails: string[];
  signupMode: SignupMode;
  heirEmail: string;
  corsOrigins: string[];
  cookiePath: string;
  cookieSecure: boolean;
}

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses durations such as `30s`, `15m`, `7d`; a bare number is seconds. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: "${value}"`);
  }
  return Number(match[1]) * UNIT_MS[match[2] ?? 's'];
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const missing = ['JWT_SECRET', 'GOOGLE_CLIENT_ID'].filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  const signupMode = (env.SIGNUP_MODE ?? 'allowlist').toLowerCase();
  if (signupMode !== 'allowlist' && signupMode !== 'open') {
    throw new Error('SIGNUP_MODE must be "allowlist" or "open"');
  }

  return {
    jwtSecret: env.JWT_SECRET as string,
    jwtAccessTtl: env.JWT_ACCESS_TTL ?? '15m',
    refreshTtlMs: parseDurationMs(env.REFRESH_TTL ?? '7d'),
    refreshAbsoluteTtlMs: parseDurationMs(env.REFRESH_ABSOLUTE_TTL ?? '30d'),
    googleClientId: env.GOOGLE_CLIENT_ID as string,
    allowedEmails: list(env.ALLOWED_EMAILS),
    signupMode,
    heirEmail: (env.HEIR_EMAIL ?? 'd71k1n@gmail.com').trim().toLowerCase(),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    cookiePath: env.COOKIE_PATH ?? '/api/auth',
    cookieSecure:
      env.COOKIE_SECURE !== undefined
        ? env.COOKIE_SECURE === 'true'
        : env.NODE_ENV === 'production',
  };
}

/** Injection token so services receive the config instead of reading env. */
export const AUTH_CONFIG = 'AUTH_CONFIG';
