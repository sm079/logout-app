/* Settings read at build time. Each is optional: the app works offline without any, and a service it names is
   only switched on when its value is set. */
import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value?.trim() ?? '';

export const variables = defineEnvVars({
  SUPABASE_URL: {
    public: true,
    static: true,
    schema: optional,
    description: "The Supabase project's URL, for sign-in and sync"
  },
  SUPABASE_KEY: {
    public: true,
    static: true,
    schema: optional,
    description: "The Supabase project's publishable (anon) key"
  },
  SENTRY_DSN: {
    public: true,
    static: true,
    schema: optional,
    description: 'Where error reports go (a Sentry project DSN)'
  },
  POSTHOG_KEY: {
    public: true,
    static: true,
    schema: optional,
    description: 'The PostHog project key, for product analytics'
  },
  POSTHOG_HOST: {
    public: true,
    static: true,
    schema: value => optional(value) || 'https://us.i.posthog.com',
    description: 'The PostHog instance analytics go to'
  }
});
