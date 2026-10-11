/* Messages between the page and the book's worker */
import type { Aliases, Entry, Profile } from '@logout/engine';
import type { BookCore, BookView, CoreState } from './core.ts';

/** Changes, numbered so the page can tell when a read includes them */
export type Change =
  | { t: 'init'; state: CoreState }
  | { t: 'upsert'; entry: Entry }
  | { t: 'remove'; id: string }
  | { t: 'sampleEdit'; id: string; text: string | null }
  | { t: 'aliases'; aliases: Aliases }
  | { t: 'profile'; profile: Profile }
  | { t: 'sample'; on: boolean }
  | { t: 'clock'; today: string; nowMin: number };

/** Questions, answered from the newest read */
export type Query =
  { t: 'entries'; from: string; to: string } | { t: 'entry'; id: string } | { t: 'daysBefore'; before: string; n: number };

export type ToWorker = (Change & { seq: number }) | (Query & { q: number });

export type FromWorker =
  { t: 'book'; view: BookView } | { t: 'reply'; q: number; value: unknown } | { t: 'error'; message: string; q?: number };

export function applyChange(core: BookCore, c: Change): void {
  switch (c.t) {
    case 'init':
      core.init(c.state);
      break;
    case 'upsert':
      core.upsert(c.entry);
      break;
    case 'remove':
      core.remove(c.id);
      break;
    case 'sampleEdit':
      core.sampleEdit(c.id, c.text);
      break;
    case 'aliases':
      core.setAliases(c.aliases);
      break;
    case 'profile':
      core.setProfile(c.profile);
      break;
    case 'sample':
      core.setSample(c.on);
      break;
    case 'clock':
      core.setClock(c.today, c.nowMin);
      break;
  }
}

export function answer(core: BookCore, q: Query): unknown {
  switch (q.t) {
    case 'entries':
      return core.entries(q.from, q.to);
    case 'entry':
      return core.entry(q.id);
    case 'daysBefore':
      return core.daysBefore(q.before, q.n);
  }
}

/** Runs the book's keeper: applies changes, reads again once a burst of them is over, answers questions */
export function serve(post: (m: FromWorker) => void, defer: (fn: () => void) => void = fn => setTimeout(fn, 0)) {
  let core: BookCore | null = null;
  let seq = 0,
    built = -1,
    scheduled = false;
  const flush = () => {
    scheduled = false;
    if (!core || built === seq) return;
    built = seq;
    post({ t: 'book', view: core.rebuild(seq) });
  };
  return (m: ToWorker, make: () => BookCore) => {
    try {
      if ('seq' in m) {
        core ??= make();
        seq = m.seq;
        applyChange(core, m);
        if (!scheduled) {
          scheduled = true;
          defer(flush);
        }
      } else {
        // A question after a change sees the change
        if (core && built !== seq) flush();
        post({ t: 'reply', q: m.q, value: core ? answer(core, m) : null });
      }
    } catch (err) {
      post({ t: 'error', message: err instanceof Error ? (err.stack ?? err.message) : String(err), q: 'q' in m ? m.q : undefined });
    }
  };
}
