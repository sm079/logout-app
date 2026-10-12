/* Error reports. Sent only when the app is built with a Sentry DSN, and never with what was typed: no clicks or
   console lines are kept as breadcrumbs (their labels can hold entry text), and no personal details are attached. */
import { SENTRY_DSN } from '$app/env/public';
import { version } from '$app/env';

type Sentry = typeof import('@sentry/browser');
let sentry: Sentry | null = null;
const early: [unknown, Record<string, unknown> | undefined][] = [];

export async function initErrors(): Promise<void> {
  // Errors on the dev server show in its console instead
  if (!SENTRY_DSN || sentry || import.meta.env.DEV) return;
  const s = await import('@sentry/browser');
  s.init({
    dsn: SENTRY_DSN,
    release: version,
    environment: import.meta.env.MODE,
    // No user details, and no request bodies: a sync request's body holds the log itself
    dataCollection: { userInfo: false, httpBodies: [] },
    tracesSampleRate: 0,
    // Clicks, inputs and console lines can carry entry text; navigations and requests are kept
    beforeBreadcrumb: b => (b.category?.startsWith('ui.') || b.category === 'console' ? null : b)
  });
  sentry = s;
  for (const [err, ctx] of early.splice(0)) s.captureException(err, ctx ? { extra: ctx } : undefined);
}

/** An uncaught error or rejection: Sentry catches these itself once it's loaded, so only earlier ones are kept */
export function reportUncaught(err: unknown): void {
  if (!sentry) report(err);
}

/** Reports an error (kept until reporting is ready, if it isn't yet). Context must not hold entry text. */
export function report(err: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN || import.meta.env.DEV) return;
  if (sentry) sentry.captureException(err, context ? { extra: context } : undefined);
  else if (early.length < 20) early.push([err, context]);
}
