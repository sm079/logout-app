/* Local calendar days. Dates here are local midnights; entries store them as YYYY-MM-DD. */

export const DAYMS = 864e5;

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Whole days from a to b (rounded, so a daylight-saving change doesn't shift it) */
export const dayDiff = (a: Date, b: Date): number => Math.round((+b - +a) / DAYMS);
export const sameDay = (a: Date, b: Date): boolean => +startOfDay(a) === +startOfDay(b);

export const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = (s: string): Date => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const fmt = (d: Date, o: Intl.DateTimeFormatOptions): string => d.toLocaleDateString('en-US', o);
export const MON = (d: Date): string => fmt(d, { month: 'short' }).toUpperCase();

/** A year mark for dates outside the current one: ` ’24` */
export const yr = (d: Date, today: Date): string =>
  d.getFullYear() !== today.getFullYear() ? ` ’${String(d.getFullYear()).slice(2)}` : '';
/** `Oct 8`, or `Oct 8 ’24` in another year */
export const monthDay = (d: Date, today: Date): string => fmt(d, { month: 'short', day: 'numeric' }) + yr(d, today);

/** Minutes after midnight, now */
export const clockNow = (): number => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
/** Minutes after midnight as 24-hour time, `07:05` */
export const hhmm = (t: number): string => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

/** How long ago a day was, in words: today, yesterday, 3 days ago, Oct 8 */
export function ago(date: string, today: Date): string {
  const d = fromIso(date),
    n = dayDiff(d, today);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? `${n} days ago` : monthDay(d, today);
}
