// Uploads the built site and the tunnel worker to Cloudflare: pnpm run deploy (which builds first). The worker gets
// the Sentry DSN from .env, so it forwards reports for this project only.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const args = ['node_modules/wrangler/bin/wrangler.js', 'deploy'];
if (process.env.SENTRY_DSN) args.push('--var', `SENTRY_DSN:${process.env.SENTRY_DSN}`);
execFileSync(process.execPath, args, { stdio: 'inherit' });
