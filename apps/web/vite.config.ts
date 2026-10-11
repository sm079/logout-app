import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
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

  return {
    plugins: [
      sveltekit({
        adapter: adapter({ fallback: '404.html' }),
        // Registered by the app, so a new version waits until the user reloads into it
        serviceWorker: { register: false },
        version: { pollInterval: 0 }
      })
    ],
    resolve: { alias },
    worker: { format: 'es' },
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['test/setup.ts']
    }
  };
});
