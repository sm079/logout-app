/* Everything the log records over time, by day: the widgets' metrics and how a period sums them up */
import type { Units } from '@logout/engine';
import type { BookView } from '../engine/core.ts';
import type { Goals } from '../data/types.ts';
import type { IconName } from '../ui/icons.ts';
import type { MTintName } from './palette.ts';
import { addDays, DAYMS, fmt, isoOf, monthDay, yr } from './dates.ts';
import { distIn, massIn, nf, volFmt } from './format.ts';
import type { Level, Selection } from './calendar.ts';

export type MetricId =
  | 'weight'
  | 'bodyfat'
  | 'steps'
  | 'distance'
  | 'active'
  | 'exercise'
  | 'volume'
  | 'calories'
  | 'protein'
  | 'water'
  | 'recovery'
  | 'sleep'
  | 'mood'
  | 'energy';

export interface Metric {
  id: MetricId;
  name: string;
  unit: string;
  dec: number;
  tint: MTintName;
  icon: IconName;
  /** Higher is better (null: neither) */
  up: boolean | null;
  /** A reading of how things are (weight), rather than an amount done */
  state?: boolean;
  /** An amount done in a day; a zero is a rest day, not a reading */
  amount?: boolean;
  /** Today's number is still growing */
  partial?: boolean;
  /** A period can be summed up as a total */
  total?: boolean;
  /** Zero means rest */
  rest?: boolean;
  /** What one reading covers, when not a day */
  per?: 'night';
  goal?: number;
  /** Activity grid shades: thresholds for levels 2–4 */
  heat: number[];
  src: (i: number) => number | null;
}

/** A selection in day indexes */
export interface DaySpan {
  /** First day, clamped to the start */
  a: number;
  /** First day as selected (may be before the start) */
  aRaw: number;
  /** Last day, clamped to today */
  b: number;
  /** Last day for averages: today's unfinished numbers are left out unless today is the whole selection */
  bc: number;
  n: number;
  /** Last day as selected (may be after today) */
  end: number;
  single: boolean;
  isToday: boolean;
  /** Ends today */
  live: boolean;
}

export interface Series {
  kcal: (number | null)[];
  p: (number | null)[];
  c: (number | null)[];
  f: (number | null)[];
  water: (number | null)[];
  steps: (number | null)[];
  dist: (number | null)[];
  active: (number | null)[];
  minutes: (number | null)[];
  volume: (number | null)[];
  hard: number[];
  sessions: number[];
  weight: (number | null)[];
  bf: (number | null)[];
  rec: (number | null)[];
  sleep: (number | null)[];
  mood: (number | null)[];
  energy: (number | null)[];
}

export const CHOICES: Record<'line' | 'bars' | 'heat' | 'stat', MetricId[]> = {
  line: [
    'weight',
    'bodyfat',
    'recovery',
    'sleep',
    'mood',
    'energy',
    'steps',
    'distance',
    'active',
    'exercise',
    'volume',
    'calories',
    'protein',
    'water'
  ],
  bars: ['steps', 'distance', 'active', 'exercise', 'volume', 'calories', 'protein', 'water'],
  heat: ['exercise', 'volume', 'steps', 'distance', 'active', 'recovery', 'sleep', 'mood', 'energy', 'calories', 'protein', 'water'],
  stat: [
    'volume',
    'exercise',
    'sleep',
    'mood',
    'energy',
    'steps',
    'distance',
    'active',
    'weight',
    'bodyfat',
    'recovery',
    'calories',
    'protein',
    'water'
  ]
};

/** A line that starts each metric, and the mode it's typed in (none: any mode) */
export const FIRST: Record<MetricId, [string, ('strength' | 'cardio' | 'food')?]> = {
  weight: ['weight 80kg'],
  bodyfat: ['waist 84cm, neck 38cm'],
  steps: ['steps 8000', 'cardio'],
  distance: ['run 5km 28:00', 'cardio'],
  active: ['run 5km 28:00 320kcal', 'cardio'],
  exercise: ['bench press 3x8 60kg', 'strength'],
  volume: ['squat 3x5 100kg', 'strength'],
  calories: ['oats 80g 300kcal', 'food'],
  protein: ['chicken 200g 330kcal 62p', 'food'],
  water: ['water 500ml'],
  recovery: ['bench press 3x8 60kg @8', 'strength'],
  sleep: ['sleep 4/5'],
  mood: ['mood 4/5'],
  energy: ['energy 4/5']
};

/** The days from the calendar's start to today, and every metric along them */
export class Timeline {
  readonly last: number;
  readonly ser: Series;
  readonly met: Record<MetricId, Metric>;
  private everSeen = new Map<MetricId, boolean>();

  constructor(
    book: BookView,
    readonly start: Date,
    readonly today: Date,
    goals: Goals,
    readonly units: Units
  ) {
    this.last = this.dayIdx(today);
    this.ser = this.series(book);
    this.met = this.metrics(goals);
  }

  dayIdx = (d: Date): number => Math.round((+d - +this.start) / DAYMS);
  dateOf = (i: number): Date => addDays(this.start, i);
  dowOf = (i: number): number => (((this.start.getDay() + i) % 7) + 7) % 7;
  shortDate = (i: number): string => monthDay(this.dateOf(i), this.today);

  private series(book: BookView): Series {
    const s: Series = {
      kcal: [],
      p: [],
      c: [],
      f: [],
      water: [],
      steps: [],
      dist: [],
      active: [],
      minutes: [],
      volume: [],
      hard: [],
      sessions: [],
      weight: [],
      bf: [],
      rec: [],
      sleep: [],
      mood: [],
      energy: []
    };
    const { load, dist } = this.units;
    for (let i = 0; i <= this.last; i++) {
      const date = isoOf(this.dateOf(i)),
        d = book.days.get(date) ?? null,
        food = d && d.food;
      // A day with nothing eaten logged has no calories, rather than zero
      s.kcal.push(food ? d.kcal : null);
      s.p.push(food ? d.p : null);
      s.c.push(food ? d.c : null);
      s.f.push(food ? d.f : null);
      s.water.push(d && d.water ? d.water / 1000 : null);
      s.steps.push(d && d.steps != null ? d.steps : null);
      s.dist.push(d ? distIn(d.distM, dist) : null);
      s.active.push(d ? d.burned : null);
      s.minutes.push(d ? d.minutes : null);
      s.volume.push(d ? d.volume : null);
      s.hard.push(d ? d.hard : 0);
      s.sessions.push(d ? d.sessions : 0);
      s.weight.push(d && d.meas.weight != null ? massIn(d.meas.weight, load) : null);
      s.bf.push(book.bodyFat.get(date) ?? null);
      s.rec.push(book.recovery.get(date) ?? null);
      s.sleep.push(d && d.check.sleep != null ? d.check.sleep : null);
      s.mood.push(d && d.check.mood != null ? d.check.mood : null);
      s.energy.push(d && d.check.energy != null ? d.check.energy : null);
    }
    return s;
  }

  private metrics(goals: Goals): Record<MetricId, Metric> {
    const s = this.ser,
      mi = this.units.dist === 'mi',
      km = (v: number) => (mi ? v * 0.621371 : v);
    const goaled = (goal: number, f: number[]) => ({ goal, heat: f.map(x => x * goal) });
    const list: Metric[] = [
      {
        id: 'weight',
        name: 'Weight',
        unit: this.units.load,
        dec: 1,
        tint: 'body',
        icon: 'weight',
        up: false,
        state: true,
        heat: [],
        src: i => s.weight[i] ?? null
      },
      {
        id: 'bodyfat',
        name: 'Body fat',
        unit: '%',
        dec: 1,
        tint: 'body',
        icon: 'percent',
        up: false,
        state: true,
        heat: [],
        src: i => s.bf[i] ?? null
      },
      {
        id: 'steps',
        name: 'Steps',
        unit: 'steps',
        dec: 0,
        tint: 'activity',
        icon: 'foot',
        up: true,
        amount: true,
        partial: true,
        ...goaled(goals.steps, [0.6, 0.9, 1.2]),
        src: i => s.steps[i] ?? null
      },
      {
        id: 'distance',
        name: 'Distance',
        unit: this.units.dist,
        dec: 1,
        tint: 'activity',
        icon: 'route',
        up: true,
        amount: true,
        partial: true,
        total: true,
        rest: true,
        goal: km(5),
        heat: [3, 6, 10].map(km),
        src: i => s.dist[i] ?? null
      },
      {
        id: 'active',
        name: 'Active energy',
        unit: 'kcal',
        dec: 0,
        tint: 'activity',
        icon: 'bolt',
        up: true,
        amount: true,
        partial: true,
        total: true,
        rest: true,
        goal: 400,
        heat: [200, 400, 600],
        src: i => s.active[i] ?? null
      },
      {
        id: 'exercise',
        name: 'Exercise',
        unit: 'min',
        dec: 0,
        tint: 'training',
        icon: 'timer',
        up: true,
        amount: true,
        partial: true,
        total: true,
        rest: true,
        goal: 45,
        heat: [40, 55, 70],
        src: i => s.minutes[i] ?? null
      },
      {
        id: 'volume',
        name: 'Volume',
        unit: this.units.load,
        dec: 0,
        tint: 'training',
        icon: 'dumbbell',
        up: true,
        amount: true,
        partial: true,
        total: true,
        rest: true,
        heat: [5000, 8000, 10500],
        src: i => s.volume[i] ?? null
      },
      {
        id: 'calories',
        name: 'Calories',
        unit: 'kcal',
        dec: 0,
        tint: 'nutrition',
        icon: 'flame',
        up: null,
        amount: true,
        partial: true,
        ...goaled(goals.kcal, [0.77, 0.92, 1.04]),
        src: i => s.kcal[i] ?? null
      },
      {
        id: 'protein',
        name: 'Protein',
        unit: 'g',
        dec: 0,
        tint: 'nutrition',
        icon: 'egg',
        up: true,
        amount: true,
        partial: true,
        ...goaled(goals.p, [0.78, 0.92, 1]),
        src: i => s.p[i] ?? null
      },
      {
        id: 'water',
        name: 'Water',
        unit: 'L',
        dec: 1,
        tint: 'hydration',
        icon: 'drop',
        up: true,
        amount: true,
        partial: true,
        ...goaled(goals.water, [0.67, 0.87, 1.03]),
        src: i => s.water[i] ?? null
      },
      {
        id: 'recovery',
        name: 'Recovery',
        unit: '%',
        dec: 0,
        tint: 'heart',
        icon: 'battery',
        up: true,
        heat: [34, 67, 85],
        src: i => s.rec[i] ?? null
      },
      // Check-ins, out of 5
      {
        id: 'sleep',
        name: 'Sleep',
        unit: '/5',
        dec: 1,
        tint: 'sleep',
        icon: 'moon',
        up: true,
        per: 'night',
        heat: [2.5, 3.5, 4.5],
        src: i => s.sleep[i] ?? null
      },
      {
        id: 'mood',
        name: 'Mood',
        unit: '/5',
        dec: 1,
        tint: 'heart',
        icon: 'heartS',
        up: true,
        heat: [2.5, 3.5, 4.5],
        src: i => s.mood[i] ?? null
      },
      {
        id: 'energy',
        name: 'Energy',
        unit: '/5',
        dec: 1,
        tint: 'warn',
        icon: 'bolt',
        up: true,
        heat: [2.5, 3.5, 4.5],
        src: i => s.energy[i] ?? null
      }
    ];
    return Object.fromEntries(list.map(m => [m.id, m])) as Record<MetricId, Metric>;
  }

  /** The selection in day indexes */
  span(p: Selection): DaySpan {
    const a = this.dayIdx(p.from),
      b = Math.min(this.dayIdx(p.to), this.last);
    const ac = Math.max(0, a),
      n = b - ac + 1;
    const bc = n > 1 && b === this.last ? b - 1 : b;
    return {
      a: ac,
      aRaw: a,
      b,
      bc,
      n,
      end: this.dayIdx(p.to),
      single: n === 1,
      isToday: n === 1 && b === this.last,
      live: b === this.last
    };
  }

  mv = (m: Metric, i: number): number | null => (i < 0 || i > this.last ? null : m.src(i));
  avg(m: Metric, a: number, b: number): number | null {
    let s = 0,
      n = 0;
    for (let i = Math.max(0, a); i <= Math.min(b, this.last); i++) {
      const v = m.src(i);
      if (v != null) {
        s += v;
        n++;
      }
    }
    return n ? s / n : null;
  }
  sum(m: Metric, a: number, b: number): number {
    let s = 0;
    for (let i = Math.max(0, a); i <= Math.min(b, this.last); i++) s += m.src(i) ?? 0;
    return s;
  }
  latest(m: Metric, b: number, a = 0): { i: number; v: number } | null {
    for (let i = Math.min(b, this.last); i >= Math.max(0, a); i--) {
      const v = m.src(i);
      if (v != null) return { i, v };
    }
    return null;
  }
  earliest(m: Metric, a: number, b: number): { i: number; v: number } | null {
    for (let i = Math.max(0, a); i <= Math.min(b, this.last); i++) {
      const v = m.src(i);
      if (v != null) return { i, v };
    }
    return null;
  }
  /** The average of a plain series (recovery's ring, sleep) */
  avgOf(arr: (number | null)[], a: number, b: number): number | null {
    let s = 0,
      n = 0;
    for (let i = Math.max(0, a); i <= Math.min(b, this.last); i++) {
      const v = arr[i];
      if (v != null) {
        s += v;
        n++;
      }
    }
    return n ? s / n : null;
  }

  /** Whether a metric has ever been logged; a zero amount (a rest day) doesn't count */
  ever(m: Metric): boolean {
    let yes = this.everSeen.get(m.id);
    if (yes === undefined) {
      yes = false;
      for (let i = this.last; i >= 0 && !yes; i--) {
        const v = m.src(i);
        yes = v != null && (!m.amount || v > 0);
      }
      this.everSeen.set(m.id, yes);
    }
    return yes;
  }

  /** A value as [number, unit] */
  fmt(m: Metric, v: number | null): [string, string] {
    if (v == null) return ['—', ''];
    if (m.id === 'volume') return volFmt(v, this.units.load);
    return [m.dec ? v.toFixed(m.dec) : nf(v), m.unit];
  }

  /** The headline number for a metric over the selection, and what it means */
  spanValue(m: Metric, S: DaySpan, wantTotal: boolean): { v: number | null; q: string } {
    if (m.state) {
      const l = this.latest(m, S.b);
      return { v: l ? l.v : null, q: 'Latest' };
    }
    if (S.single) {
      const v = this.mv(m, S.b);
      if (S.isToday) return { v, q: m.partial ? 'So far' : m.per === 'night' ? 'Last night' : 'Today' };
      return { v, q: m.amount ? (m.per === 'night' ? 'That night' : 'Day total') : 'Reading' };
    }
    if (wantTotal && m.total) return { v: this.sum(m, S.a, S.b), q: 'Total' };
    return { v: this.avg(m, S.a, S.bc), q: m.amount ? `Avg/${m.per || 'day'}` : 'Average' };
  }

  /** How the headline compares: with the week before, the period before, or the goal */
  spanDelta(m: Metric, S: DaySpan, wantTotal: boolean, p: Selection): { d: number; text: string } {
    if (m.state) {
      const l = this.latest(m, S.b),
        ref = S.n >= 2 ? this.earliest(m, S.a, S.b) : this.latest(m, S.b - 7);
      if (!l || !ref) return { d: 0, text: '' };
      const d = l.v - ref.v,
        tail = S.n >= 2 ? `· ${spanWords(S.n)}` : 'vs last wk';
      if (Math.abs(d) < Math.pow(10, -m.dec) / 2) return { d: 0, text: `No change ${tail}` };
      return { d, text: `${Math.abs(d).toFixed(m.dec)} ${m.unit} ${tail}`.replace(/\s+/g, ' ') };
    }
    const cur = this.spanValue(m, S, wantTotal).v;
    if (S.single && m.rest && !cur) return { d: 0, text: S.isToday ? 'Nothing logged yet' : 'Rest day' };
    if (S.isToday && m.partial) return { d: 0, text: m.goal ? `${Math.round(((cur ?? 0) / m.goal) * 100)}% of goal` : 'In progress' };
    let prev: number | null, word: string;
    if (S.single) {
      prev = this.avg(m, S.b - 7, S.b - 1);
      word = '7-day avg';
    } else {
      const pa = S.a - S.n,
        pb = S.a - 1;
      if (pb < 0) return { d: 0, text: 'No earlier data' };
      prev = wantTotal && m.total ? this.sum(m, pa, pb) : this.avg(m, pa, pb);
      word = `prev. ${p.n === 1 ? UNIT_WORD[p.level] : 'period'}`;
    }
    if (cur == null || !prev) return { d: 0, text: '' };
    const d = (cur - prev) / prev,
      pct = Math.round(Math.abs(d) * 100);
    return pct ? { d, text: `${pct}% vs ${word}` } : { d: 0, text: `Same as ${word}` };
  }

  /** Days grouped by day, week, month or year */
  buckets(a: number, b: number, gran: Gran): Bucket[] {
    const out: Bucket[] = [];
    for (let i = a; i <= b;) {
      const d = this.dateOf(i);
      let e =
        gran === 'd'
          ? i
          : gran === 'w'
            ? i + (6 - d.getDay())
            : gran === 'm'
              ? this.dayIdx(new Date(d.getFullYear(), d.getMonth() + 1, 0))
              : this.dayIdx(new Date(d.getFullYear(), 11, 31));
      e = Math.min(e, b);
      out.push({ a: i, b: e, d });
      i = e + 1;
    }
    return out;
  }
  /** Start of the bucket just before the one starting at day i */
  prevBucketStart(i: number, gran: Gran): number {
    const d = this.dateOf(i);
    if (gran === 'd') return i - 1;
    if (gran === 'w') return i - 1 - this.dowOf(i - 1);
    if (gran === 'm') return this.dayIdx(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    return this.dayIdx(new Date(d.getFullYear() - 1, 0, 1));
  }
  bucketLabel(bk: Bucket, gran: Gran): string {
    if (gran === 'd') return fmt(bk.d, { weekday: 'short', month: 'short', day: 'numeric' }) + yr(bk.d, this.today);
    if (gran === 'w') return `Week of ${this.shortDate(bk.a - bk.d.getDay())}`;
    if (gran === 'm')
      return fmt(bk.d, { month: 'long' }) + (bk.d.getFullYear() !== this.today.getFullYear() ? ` ${bk.d.getFullYear()}` : '');
    return String(bk.d.getFullYear());
  }

  /** A metric's value today, for the picker */
  todayText(m: Metric): string {
    const v = m.state ? (this.latest(m, this.last)?.v ?? null) : this.mv(m, this.last);
    const [num, unit] = this.fmt(m, v);
    return `${num}${unitSuffix(unit)}${m.partial ? ' so far' : m.state ? ' latest' : ' today'}`;
  }
}

export type Gran = 'd' | 'w' | 'm' | 'y';
export interface Bucket {
  a: number;
  b: number;
  d: Date;
}

const UNIT_WORD: Record<Level, string> = { d: 'day', w: 'week', m: 'month', y: 'year' };
export const spanWords = (n: number): string =>
  n <= 13 ? `${n} days` : n <= 62 ? `${Math.round(n / 7)} wks` : n <= 730 ? `${Math.round(n / 30.44)} mo` : `${Math.round(n / 365.25)} yrs`;
/** The space before a unit: none before `/5` or `%` */
export const unitSuffix = (unit: string): string => (!unit ? '' : /^[/%]/.test(unit) ? unit : ` ${unit}`);
