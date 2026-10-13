import { sentryVitePlugin } from '@sentry/vite-plugin';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Services switched off at build time leave their SDKs out of the bundle (and out of the offline cache)
  const off = fileURLToPath(new URL('./src/lib/observe/off.ts', import.meta.url));
  const alias: Record<string, string> = {};
  if (!env.SENTRY_DSN) alias['@sentry/browser'] = off;
  if (!env.POSTHOG_KEY) alias['posthog-js'] = off;
  // With a Sentry auth token the build uploads its source maps, matched to reports by debug IDs, so stack traces
  // show the original code. The maps are left out of the site (scripts/strip-maps.js)
  const maps = !!(env.SENTRY_DSN && env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT);
  // The version the profile shows: the package's, and the commit it was built from (when git is there to say)
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let commit = '';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // Built outside a checkout: the version alone
  }

  return {
    plugins: [
      sveltekit({
        adapter: adapter({ fallback: '404.html' }),
        // Registered by the app, so a new version waits until the user reloads into it
        serviceWorker: { register: false },
        version: { pollInterval: 0 }
      }),
      // Only the browser's code: not the prerendering server or the service worker
      ...(maps
        ? sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            telemetry: false,
            // Reports carry the app's own version; debug IDs need no release
            release: { create: false, inject: false }
          }).map(p => ({ ...p, applyToEnvironment: (e: { name: string }) => e.name === 'client' }))
        : [])
    ],
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_COMMIT__: JSON.stringify(commit) },
    build: { sourcemap: maps ? 'hidden' : false },
    resolve: { alias },
    worker: { format: 'es' },
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['test/setup.ts']
    }
  };
});
