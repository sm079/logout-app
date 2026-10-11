/* The book's keeper: holds every entry (the user's own and, when it's on, the sample history) and reads them
   through the engine whenever something changes. It runs in a worker, so a full read never holds up the page. */
import {
  build,
  byWhen,
  type Aliases,
  type Book,
  type BookEntry,
  type Card,
  type Day,
  type Entry,
  type Profile as EngineProfile,
  type Resolved,
  type Sum
} from '@logout/engine';
import { generate } from '@logout/sample';
import { SAMPLE_JOINED } from './sample-start.ts';

/** A day's totals, plus the lifts done that day (to count distinct exercises with a draft's) */
export interface DayView extends Day {
  liftKeys: string[];
}

/** What the page needs of the book: everything but the entries themselves, which it asks for a few days at a time */
export interface BookView {
  /** The last change this read includes */
  rev: number;
  cards: Map<string, Card>;
  days: Map<string, DayView>;
  U: number;
  aliases: Aliases;
  recovery: Map<string, number>;
  bodyFat: Map<string, number>;
  /** The earliest day with an entry */
  first: string | null;
  /** How many entries are the user's own (not the sample's) */
  own: number;
}

/** An entry as read, for a log row */
export interface ViewEntry extends Entry {
  res: Resolved[];
  sum: Sum;
  /** From the sample history */
  sample: boolean;
}

export interface CoreState {
  entries: Entry[];
  sampleEdits: [string, string | null][];
  aliases: Aliases;
  profile: EngineProfile;
  sample: boolean;
  /** Today, local, YYYY-MM-DD */
  today: string;
  /** Minutes after midnight now, so the sample's today has only what has happened */
  nowMin: number;
}

export { SAMPLE_JOINED };
const parse = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

export class BookCore {
  private own = new Map<string, Entry>();
  private edits = new Map<string, string | null>();
  private aliases: Aliases = {};
  private profile: EngineProfile = {};
  private sampleOn = false;
  private today = '';
  private nowMin = 0;
  private sample: Entry[] = [];
  private sampleKey = '';
  book: Book | null = null;
  /** Days with entries, oldest first */
  private dates: string[] = [];

  init(s: CoreState): void {
    this.own = new Map(s.entries.map(e => [e.id, e]));
    this.edits = new Map(s.sampleEdits);
    this.aliases = s.aliases;
    this.profile = s.profile;
    this.sampleOn = s.sample;
    this.today = s.today;
    this.nowMin = s.nowMin;
  }

  upsert(e: Entry): void {
    this.own.set(e.id, e);
  }
  /** Own entries leave; a sample entry is marked removed */
  remove(id: string): void {
    if (!this.own.delete(id)) this.edits.set(id, null);
  }
  sampleEdit(id: string, text: string | null): void {
    this.edits.set(id, text);
  }
  setAliases(a: Aliases): void {
    this.aliases = a;
  }
  setProfile(p: EngineProfile): void {
    this.profile = p;
  }
  setSample(on: boolean): void {
    this.sampleOn = on;
  }
  setClock(today: string, nowMin: number): void {
    this.today = today;
    this.nowMin = nowMin;
  }
  private sampleEntries(): Entry[] {
    if (!this.sampleOn) return [];
    // The sample's today grows through the day; it's made again when the day or the hour changes
    const key = `${this.today}|${Math.floor(this.nowMin / 60)}`;
    if (key !== this.sampleKey) {
      this.sample = generate(SAMPLE_JOINED, parse(this.today), this.nowMin);
      this.sampleKey = key;
    }
    const out: Entry[] = [];
    for (const e of this.sample) {
      if (!this.edits.has(e.id)) out.push(e);
      else {
        const text = this.edits.get(e.id);
        if (text != null) out.push({ ...e, text });
      }
    }
    return out;
  }

  /** Reads everything again and returns what the page needs */
  rebuild(rev: number): BookView {
    const sample = this.sampleEntries();
    const book = build(sample.concat([...this.own.values()]), { today: this.today, profile: this.profile, aliases: this.aliases });
    this.book = book;
    this.dates = [...book.days.keys()].sort();
    const days = new Map<string, DayView>();
    const lifts = new Map<string, Set<string>>();
    for (const e of book.entries) {
      for (const r of e.res) {
        if (r.line.kind !== 'strength' || !r.line.key) continue;
        let set = lifts.get(e.date);
        if (!set) lifts.set(e.date, (set = new Set()));
        set.add(r.line.key);
      }
    }
    for (const [date, d] of book.days) days.set(date, { ...d, liftKeys: [...(lifts.get(date) ?? [])] });
    return {
      rev,
      cards: book.cards,
      days,
      U: book.U,
      aliases: book.aliases,
      recovery: book.recovery,
      bodyFat: book.bodyFat,
      first: book.entries.length ? book.entries[0]!.date : null,
      own: this.own.size
    };
  }

  private view(e: BookEntry): ViewEntry {
    return {
      id: e.id,
      date: e.date,
      time: e.time,
      mode: e.mode,
      text: e.text,
      units: e.units,
      res: e.res,
      sum: e.sum,
      sample: !this.own.has(e.id)
    };
  }

  /** Entries from one day to another (inclusive), in the order they happened */
  entries(from: string, to: string): ViewEntry[] {
    if (!this.book) return [];
    const list = this.book.entries;
    // Entries are sorted by day: find the first on or after `from`
    let lo = 0,
      hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]!.date < from) lo = mid + 1;
      else hi = mid;
    }
    const out: ViewEntry[] = [];
    for (let i = lo; i < list.length && list[i]!.date <= to; i++) out.push(this.view(list[i]!));
    return out;
  }

  entry(id: string): ViewEntry | null {
    const e = this.book?.byId.get(id);
    return e ? this.view(e) : null;
  }

  /** The days before `before` that have entries, newest first, at most `n` */
  daysBefore(before: string, n: number): string[] {
    if (!this.book) return [];
    const out: string[] = [];
    for (let i = this.dates.length - 1; i >= 0 && out.length < n; i--) if (this.dates[i]! < before) out.push(this.dates[i]!);
    return out;
  }
}

export { byWhen };
