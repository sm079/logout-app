import type { Amount, Distance } from './types';

// One formatter per precision: building a formatter per call is what makes formatting slow
const NF = [0, 1, 2].map(d => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }));

/** A number with thousands separators and at most `d` decimals (0–2) */
export const nf = (v: number, d: 0 | 1 | 2 = 0): string => NF[d]!.format(+v);

/** Seconds as m:ss, or h:mm:ss from an hour */
export function clock(sec: number): string {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

const LABEL: Record<string, string> = { piece: 'piece', scoop: 'scoop', slice: 'slice', serving: 'serving', cup: 'cup' };

/** An amount as words: `1 piece` reads `piece`, `2 slices`, `100 g` */
export function amountText(a: Pick<Amount, 'value' | 'unit'>): string {
  const label = LABEL[a.unit];
  if (label) return a.value === 1 ? label : `${nf(a.value, 2)} ${label}s`;
  return `${nf(a.value, 2)} ${a.unit}`;
}

export const distText = (d: Distance): string =>
  d.unit === 'm' || d.unit === 'yd' ? `${nf(d.value)} ${d.unit}` : `${nf(d.value, 2)} ${d.unit}`;

export { LABEL };
