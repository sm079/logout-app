/* The book's worker: reads every entry off the page's thread */
import { BookCore } from './core.ts';
import { serve, type FromWorker, type ToWorker } from './protocol.ts';

// The worker's global, typed as much as it's used (the page's DOM types don't describe a worker)
const scope = self as unknown as {
  postMessage(m: FromWorker): void;
  addEventListener(type: 'message', fn: (ev: MessageEvent<ToWorker>) => void): void;
};
const handle = serve(m => scope.postMessage(m));
scope.addEventListener('message', ev => handle(ev.data, () => new BookCore()));
