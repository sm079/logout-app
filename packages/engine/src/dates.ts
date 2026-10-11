/* ISO dates (YYYY-MM-DD) as calendar days, worked out in UTC so no time zone shifts them */

export const iso = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

export const parseIso = (s: string): Date => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));

export const nextDay = (s: string): string => {
  const d = parseIso(s);
  d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
};

export const daysBetween = (a: string, b: string): number => Math.round((+parseIso(b) - +parseIso(a)) / 864e5);
