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
  }
});
