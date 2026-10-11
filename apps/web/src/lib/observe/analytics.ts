/* Product analytics: a handful of named events, sent only when the app is built with a PostHog key.
   Events say what kind of thing happened, never what was typed: no autocapture, no session recording. */
import { POSTHOG_HOST, POSTHOG_KEY } from '$app/env/public';
import type { PostHog } from 'posthog-js';

let ph: PostHog | null = null;
const queued: [string, Record<string, unknown>][] = [];

export async function initAnalytics(): Promise<void> {
  if (!POSTHOG_KEY || ph) return;
  const { default: posthog } = await import('posthog-js');
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: 'history_change',
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    persistence: 'localStorage',
    person_profiles: 'identified_only'
  });
  ph = posthog;
  for (const [e, p] of queued.splice(0)) posthog.capture(e, p);
}

export type Event =
  | 'entry logged'
  | 'entry edited'
  | 'entry deleted'
  | 'quick logged'
  | 'mode switched'
  | 'widget changed'
  | 'item renamed'
  | 'setup finished'
  | 'setup skipped'
  | 'data exported'
  | 'data imported'
  | 'entries cleared'
  | 'demo opened'
  | 'try typed'
  | 'app updated';

/** Records an event. Properties are counts and kinds only, never text. */
export function track(event: Event, props: Record<string, string | number | boolean | null> = {}): void {
  if (!POSTHOG_KEY) return;
  if (ph) ph.capture(event, props);
  else if (queued.length < 50) queued.push([event, props]);
}

/** Ties events to an account id (not an email), once signed in; and forgets it on signing out */
export function identify(userId: string | null): void {
  if (!ph) return;
  if (userId) ph.identify(userId);
  else ph.reset();
}
