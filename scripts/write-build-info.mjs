import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function safeExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

const sha = safeExec('git rev-parse HEAD');
const shortSha = sha ? sha.slice(0, 7) : null;
const branch = safeExec('git rev-parse --abbrev-ref HEAD');
const ts = new Date().toISOString();

const out = `// Auto-generated at build time. Do not edit manually.
export const BUILD_INFO = {
  sha: ${sha ? JSON.stringify(sha) : 'null'},
  shortSha: ${shortSha ? JSON.stringify(shortSha) : 'null'},
  branch: ${branch ? JSON.stringify(branch) : 'null'},
  builtAtIso: ${JSON.stringify(ts)},
} as const;
`;

const target = path.join(process.cwd(), 'lib', 'build-info.ts');
fs.writeFileSync(target, out, 'utf8');

