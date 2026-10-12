# Logout

A fitness log you type into. Pick Strength, Cardio or Food, write what you did the way you'd say it
(`bench press 3x8 60kg @8`, `easy run 8km 46:30`, `chicken breast 200g 330kcal 62p 0c 7f`), and Logout reads it.

- **Text is the record.** Only what was typed is kept, and it is never rewritten. Everything shown is worked out
  from the text, so one change can move other entries' numbers.
- **No questions.** Fixed rules read each line, and colour shows how it was read.
- **All parsing on the device.** The server only stores and sends entries.

## Repository

| Path              | What it is                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| `apps/web`        | `@logout/web`: the SvelteKit site and the app at `/app`, a client-only PWA.      |
| `packages/engine` | `@logout/engine`: the log engine. Pure TypeScript with no DOM, storage or clock. |
| `packages/sample` | `@logout/sample`: a seeded sample history for demos. It is never synced.         |

## Getting started

Requires Node 22.17+ (see `.nvmrc`) and pnpm 11.

```sh
pnpm install
pnpm dev      # the web app at http://localhost:5173/app
pnpm test     # every package's tests
pnpm --filter @logout/web test:e2e   # browser tests on the production build (see below)
pnpm check    # type checks
pnpm lint     # eslint + prettier
```

## The engine

An entry is one LOG press: `{ id, date, time, mode, text, units }`. `build(entries, { today, profile, aliases })`
reads every entry in two passes, oldest first:

1. the newest line that states an item's values sets its card (one set of values per kind of amount);
2. every line resolves against the cards, and the results add up per day.

`packages/engine/test/engine.test.ts` is the grammar, by example. `parity.test.ts` checks the engine against the
original reference implementation (`test/legacy/`) over the full sample history, day by day.

## The app

`apps/web` is SvelteKit with the static adapter. Marketing pages are prerendered; `/app` runs only in the browser.

- **Store:** IndexedDB through Dexie (`src/lib/data`). Only typed entries, item aliases and a few settings are kept.
  Changes carry an `updatedAt` and a `dirty` flag, and removals stay as marks until they've synced.
- **Book:** the engine runs in a Web Worker (`src/lib/engine`). The page sends changes and keeps the newest read
  (cards, day totals, recovery, body fat); log rows ask the worker for their days' entries.
- **Screens:** `calendar`, `widgets`, `dock` (composer, day so far, LOG), `log` and `sheets`, sharing state through
  `src/lib/state/app.svelte.ts`. Pure logic lives in `src/lib/logic` and is unit-tested in `apps/web/test`.
- **Offline:** a service worker caches the build, so the app opens without a network. A new version waits until
  the user reloads into it.

## Sync

Sign-in and sync use a Supabase project; without one configured the app keeps everything on the device.
`supabase/` holds the schema (`migrations/`) and auth settings (`config.toml`).

- Every write goes through `sync_push()`, which stamps changed rows with the user's next version under a row lock,
  so a device pulling "everything after version N" never misses a row. The newer `updatedAt` wins.
- Row-level security lets each user read only their own rows; tables take no direct writes.
- `delete_account()` removes a user and everything synced for them.

Setting up a project:

```sh
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push        # the migrations
RESEND_API_KEY=... pnpm exec supabase config push    # auth settings and the email sender
```

Then put the project's URL and publishable key in `apps/web/.env` (see `.env.example`).

Sign-in is by an emailed code, which works inside the installed app. Emails go out through Resend (custom SMTP in
`config.toml`, its API key passed as `RESEND_API_KEY` when pushing config). Until a sending domain is verified in
Resend, its shared sender only reaches the Resend account's own address; verify a domain and set `admin_email` on it
before inviting beta users. A sign-in link, if an email carries one, is accepted too.

Tests: `pnpm --filter @logout/web test` runs sync against the real migrations in Postgres compiled to WASM.
`pnpm --filter @logout/web test:live` runs it against a project (`SUPABASE_URL`, `SUPABASE_KEY` and
`SUPABASE_SECRET_KEY` set), with throwaway users it deletes afterwards.

## Browser tests

`apps/web/e2e` drives the production build in a browser, at desktop and phone sizes: first run, logging, editing
and deleting, a food's stated values, the demo, the landing page's composer, and opening offline. They run in
Playwright's Chromium (`npx playwright install chromium` once) or in any Chromium-based browser given as
`CHROME_PATH`.

## Error reports and analytics

Both are off unless the build has their keys (`SENTRY_DSN`, `POSTHOG_KEY` in `apps/web/.env`), and neither runs on
the dev server. Without a key the SDK isn't even bundled. Nothing sent includes entry text: Sentry keeps no click,
console or request-body breadcrumbs, and PostHog sends a dozen named events with kinds and counts only (no
autocapture, recordings, heatmaps or remotely enabled extras).

Content blockers often block PostHog's and Sentry's own domains. In production, send both through your own domain
with a reverse proxy: for PostHog, for example `/ingest/*` to `https://us.i.posthog.com/*` with `POSTHOG_HOST` set to
it; for Sentry, a tunnel endpoint (Sentry's `tunnel` option) that forwards envelopes to the DSN's host.
