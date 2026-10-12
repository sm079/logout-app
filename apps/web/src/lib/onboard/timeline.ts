/* Scripted motion for the setup: sequences that type, pause and move on by themselves, and stop the moment the
   person takes over or the flow goes away */
import { REDUCE } from '../ui/motion.ts';

export const STOP = Symbol('stop');

export interface Run {
  /** Resolves after `ms`; throws STOP if the run is stopped first */
  wait(ms: number): Promise<void>;
  stop(): void;
  readonly stopped: boolean;
}

export function run(): Run {
  let stopped = false;
  const pending = new Set<() => void>();
  return {
    get stopped() {
      return stopped;
    },
    wait(ms) {
      return new Promise((resolve, reject) => {
        if (stopped) return reject(STOP);
        const cancel = () => {
          clearTimeout(t);
          reject(STOP);
        };
        const t = setTimeout(() => {
          pending.delete(cancel);
          resolve();
        }, ms);
        pending.add(cancel);
      });
    },
    stop() {
      stopped = true;
      for (const cancel of pending) cancel();
      pending.clear();
    }
  };
}

/** Starts a script on a run; being stopped ends it quietly */
export function play(r: Run, script: (r: Run) => Promise<void>): Run {
  script(r).catch((e: unknown) => {
    if (e !== STOP) throw e;
  });
  return r;
}

/** Types `text` a character at a time, at a person's pace: quicker inside words, a beat at spaces.
    With reduced motion it's all there at once. */
export async function typeOut(r: Run, text: string, set: (s: string) => void, from = 0, pace = 1): Promise<void> {
  if (REDUCE) {
    set(text);
    return;
  }
  for (let i = from + 1; i <= text.length; i++) {
    set(text.slice(0, i));
    const ch = text[i - 1]!;
    await r.wait(pace * (ch === ' ' ? 70 + Math.random() * 90 : /[.,:]/.test(ch) ? 120 : 26 + Math.random() * 44));
  }
}
