// Tests against a real Supabase project: SUPABASE_URL, SUPABASE_KEY and SUPABASE_SECRET_KEY must be set.
// They create throwaway users and delete them afterwards.
import { defineConfig } from 'vitest/config';
import base from './vite.config.ts';

export default defineConfig(async env => {
  const cfg = typeof base === 'function' ? await base(env) : base;
  return { ...cfg, test: { ...cfg.test, include: ['test-live/**/*.test.ts'], testTimeout: 60000, hookTimeout: 60000 } };
});
