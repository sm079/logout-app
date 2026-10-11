/* The page's side of the book: sends changes to the worker, keeps its newest read, asks it for entries */
import type { BookCore, BookView, ViewEntry } from './core.ts';
import { report } from '../observe/errors.ts';
import { serve, type Change, type FromWorker, type Query, type ToWorker } from './protocol.ts';

export interface Transport {
  post(m: ToWorker): void;
  listen(fn: (m: FromWorker) => void): void;
  close(): void;
}

/** The book in a module worker */
export function workerTransport(): Transport {
  const w = new Worker(new URL('./book.worker.ts', import.meta.url), { type: 'module', name: 'book' });
  return {
    post: m => w.postMessage(m),
    listen: fn => w.addEventListener('message', (ev: MessageEvent<FromWorker>) => fn(ev.data)),
    close: () => w.terminate()
  };
}

/** The book on the page's own thread, for tests and where module workers aren't available. The engine's keeper is
    loaded only when this is used, so the page doesn't carry the sample generator otherwise. */
export function inlineTransport(): Transport {
  let listener: ((m: FromWorker) => void) | null = null;
  const handle = serve(
    m => listener?.(structuredClone(m)),
    fn => setTimeout(fn, 0)
  );
  const loading = import('./core.ts');
  let core: BookCore | null = null;
  let chain = Promise.resolve();
  return {
    // Messages are handled in order, once the keeper has loaded
    post: m => {
      const copy = structuredClone(m);
      chain = chain.then(async () => {
        const { BookCore } = await loading;
        handle(copy, () => (core ??= new BookCore()));
      });
    },
    listen: fn => {
      listener = fn;
    },
    close: () => {
      listener = null;
    }
  };
}

export class EngineClient {
  /** The newest read; null until the first one arrives */
  book = $state.raw<BookView | null>(null);
  /** The last error from the worker, if any */
  error = $state<string | null>(null);
  private seq = 0;
  private q = 0;
  private asks = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private waits: { seq: number; resolve: (b: BookView) => void }[] = [];

  constructor(private transport: Transport) {
    transport.listen(m => this.receive(m));
  }

  private receive(m: FromWorker) {
    if (m.t === 'book') {
      this.book = m.view;
      this.waits = this.waits.filter(w => {
        if (w.seq > m.view.rev) return true;
        w.resolve(m.view);
        return false;
      });
    } else if (m.t === 'reply') {
      this.asks.get(m.q)?.resolve(m.value);
      this.asks.delete(m.q);
    } else {
      this.error = m.message;
      report(new Error(`Book worker: ${m.message.split(/\r?\n/)[0]}`), { stack: m.message });
      if (m.q != null) {
        this.asks.get(m.q)?.reject(new Error(m.message));
        this.asks.delete(m.q);
      } else console.error(m.message);
    }
  }

  /** Sends a change; the book is read again once a burst of changes is over */
  change(c: Change): number {
    const seq = ++this.seq;
    this.transport.post({ ...c, seq } as ToWorker);
    return seq;
  }

  /** The first read that includes every change sent so far */
  settled(): Promise<BookView> {
    const seq = this.seq;
    if (this.book && this.book.rev >= seq) return Promise.resolve(this.book);
    return new Promise(resolve => this.waits.push({ seq, resolve }));
  }

  private ask<T>(query: Query): Promise<T> {
    const q = ++this.q;
    return new Promise<T>((resolve, reject) => {
      this.asks.set(q, { resolve: resolve as (v: unknown) => void, reject });
      this.transport.post({ ...query, q } as ToWorker);
    });
  }

  entries(from: string, to: string): Promise<ViewEntry[]> {
    return this.ask({ t: 'entries', from, to });
  }
  entry(id: string): Promise<ViewEntry | null> {
    return this.ask({ t: 'entry', id });
  }
  daysBefore(before: string, n: number): Promise<string[]> {
    return this.ask({ t: 'daysBefore', before, n });
  }

  close(): void {
    this.transport.close();
  }
}
