import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface VersionInfo {
  version: string;
  build: string;
}

// Docker images have no .git (see .dockerignore), so the build passes BUILD_NUMBER (commit count).
function resolveBuild(): string {
  if (process.env.BUILD_NUMBER) return process.env.BUILD_NUMBER.trim();
  try {
    return execSync('git rev-list --count HEAD', {
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

const BASE_VERSION = resolveVersion();
const BUILD = resolveBuild();

// e.g. "0.2.0.2345" (package.json version + commit count).
export const VERSION_INFO: VersionInfo = {
  version: BUILD === 'unknown' ? BASE_VERSION : `${BASE_VERSION}.${BUILD}`,
  build: BUILD,
};
