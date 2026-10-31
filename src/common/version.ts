import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface VersionInfo {
  version: string;
  commit: string;
}

// Docker images have no .git (see .dockerignore), so the build passes GIT_SHA.
function resolveCommit(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function resolveVersion(): string {
  try {
    // dist/common/version.js -> project root (src/common/version.ts when run via ts-node).
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    );
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export const VERSION_INFO: VersionInfo = {
  version: resolveVersion(),
  commit: resolveCommit(),
};
