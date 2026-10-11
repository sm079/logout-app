/* Numbers as the app shows them, in the units the user picked */
import { clock, type Kind, type Sum, type Units } from '@logout/engine';

const LB = 2.20462262;
const MI = 1609.344;
const IN = 2.54;

/** A whole number with thousands separators */
export const nf = (n: number): string => Math.round(n).toLocaleString('en-US');
/** Short form for axis labels: 12.5K */
export const compact = (v: number): string => (v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : String(+(+v).toFixed(1)));

/** Mass in the load unit: kilograms, or pounds */
export const massIn = (kg: number, u: Units['load']): number => (u === 'lb' ? kg * LB : kg);
/** Length in the matching unit: centimetres, or inches alongside pounds */
export const lengthIn = (cm: number, u: Units['load']): number => (u === 'lb' ? cm / IN : cm);
export const lengthUnit = (u: Units['load']): string => (u === 'lb' ? 'in' : 'cm');
/** Distance in the distance unit, from metres */
export const distIn = (m: number, u: Units['dist']): number => (u === 'mi' ? m / MI : m / 1000);

/** Training volume: `850 kg`, `12.3 t`, or in pounds `1,870 lb`, `27.1k lb` */
export function volFmt(kg: number, u: Units['load'] = 'kg'): [string, string] {
  if (u === 'lb') {
    const lb = kg * LB;
    return lb < 1000 ? [nf(lb), 'lb'] : lb < 1e6 ? [`${(lb / 1000).toFixed(1)}k`, 'lb'] : [`${nf(lb / 1000)}k`, 'lb'];
  }
  return kg < 1000 ? [nf(kg), 'kg'] : kg < 100000 ? [(kg / 1000).toFixed(1), 't'] : [nf(kg / 1000), 't'];
}
/** A distance from metres: `5.2 km`, `12.4 km`, `3.1 mi` */
export const distFmt = (m: number, u: Units['dist'] = 'km'): string => {
  const v = distIn(m, u);
  return `${+v.toFixed(v < 10 ? 2 : 1)} ${u}`;
};
export const waterFmt = (ml: number): string => (ml >= 1000 ? `${+(ml / 1000).toFixed(2)} L` : `${nf(ml)} ml`);

/** A measurement as stored (weights in kg, lengths in cm), in the user's units */
export function measureFmt(what: string, si: number, u: Units['load']): string {
  if (what === 'weight') return `${massIn(si, u).toFixed(1)} ${u}`;
  return `${what} ${lengthIn(si, u).toFixed(1)} ${lengthUnit(u)}`;
}

/** What an entry or a draft adds up to, as [key, text] parts */
export function sumParts(s: Sum, units: Units): [string, string][] {
  const out: [string, string][] = [];
  if (s.food) out.push(['kcal', `${nf(s.kcal)} kcal`]);
  if (s.sets) out.push(['sets', `${nf(s.sets)} ${s.sets === 1 ? 'set' : 'sets'}`]);
  if (s.volume) out.push(['vol', volFmt(s.volume, units.load).join(' ')]);
  if (s.distM) out.push(['dist', distFmt(s.distM, units.dist)]);
  if (s.cardioS) out.push(['time', clock(s.cardioS)]);
  if (s.steps != null) out.push(['steps', `${nf(s.steps)} steps`]);
  if (s.water) out.push(['water', waterFmt(s.water)]);
  for (const [k, v] of Object.entries(s.check)) out.push([`ck-${k}`, `${k} ${v}/5`]);
  for (const [k, v] of Object.entries(s.meas)) out.push([`m-${k}`, measureFmt(k, v as number, units.load)]);
  return out;
}

/** What an entry is shown as: its mode, or what its lines are when none of them is of that mode */
export function kindOf(e: { mode: Kind; sum: Sum }): Kind {
  const k = e.sum.kinds;
  if (k[e.mode]) return e.mode;
  return (['food', 'strength', 'cardio', 'steps', 'water', 'checkin', 'measure'] as const).find(x => k[x]) || e.mode;
}

/** Initials for an item's thumb: `bench press` → BP */
export const initials = (name: string): string =>
  name
    .split(/[\s-]/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** A stable number for a string, to pick a tint */
export const hashOf = (s: string): number => {
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
};
