/* Lines that failed to read, for users who share them to help improve reading. Item names and notes are replaced
   before a line leaves the device, so what's sent is its shape: `‹name› 3x heavy` reads as `‹name› 3x ‹note›`. */
import { version as ENGINE_VERSION, type Kind, type Mode, type Resolved } from '@logout/engine';

export interface UnreadLine {
  mode: Mode;
  kind: Kind;
  reason: 'noname' | 'needs' | 'bad';
  line: string;
  engine: number;
}

/** Whether a resolved line failed to read. A food without values yet is expected, not a failure. */
function reasonOf(r: Resolved): UnreadLine['reason'] | null {
  if (r.line.tokens.some(t => t.role === 'bad')) return 'bad';
  if (r.st === 'noname') return 'noname';
  if (r.st !== 'needs') return null;
  if (r.line.kind === 'food') return null;
  if (r.line.kind === 'cardio' && r.line.f.steps != null) return null;
  return 'needs';
}

/** A line with its name and notes replaced */
export function strip(r: Resolved): string {
  const { text, tokens } = r.line;
  let out = '',
    at = 0;
  for (const t of tokens) {
    if (t.role !== 'name' && t.role !== 'note') continue;
    out += text.slice(at, t.s) + (t.role === 'name' ? '‹name›' : '‹note›');
    at = t.e;
  }
  return (out + text.slice(at)).slice(0, 300);
}

export function unreadLines(res: Resolved[], mode: Mode): UnreadLine[] {
  const out: UnreadLine[] = [];
  for (const r of res) {
    const reason = reasonOf(r);
    if (reason) out.push({ mode, kind: r.line.kind, reason, line: strip(r), engine: ENGINE_VERSION });
  }
  return out;
}
