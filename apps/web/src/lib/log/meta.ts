/* A log row's numbers, as keyed parts so an edit can roll just the ones that change */
import { clock, type Sum, type Units } from '@logout/engine';
import { distIn, lengthIn, lengthUnit, massIn, nf, volFmt } from '../logic/format.ts';

export interface MetaPart {
  k: string;
  text: string;
  before?: string;
  after?: string;
  /** A macro's colour mark */
  mark?: string;
  needs?: boolean;
}

export function metaParts(s: Sum, units: Units): MetaPart[] {
  const P: MetaPart[] = [];
  if (s.food) {
    P.push({ k: 'kcal', text: nf(s.kcal), after: ' kcal' });
    P.push({ k: 'p', before: 'P ', text: nf(s.p), after: 'g', mark: '--m-p' });
    P.push({ k: 'c', before: 'C ', text: nf(s.c), after: 'g', mark: '--m-c' });
    P.push({ k: 'f', before: 'F ', text: nf(s.f), after: 'g', mark: '--m-f' });
  }
  if (s.sets) P.push({ k: 'sets', text: nf(s.sets), after: s.sets === 1 ? ' set' : ' sets' });
  if (s.volume) {
    const [v, u] = volFmt(s.volume, units.load);
    P.push({ k: `vol-${u}`, text: v, after: ` ${u}` });
  }
  if (s.distM) {
    const d = distIn(s.distM, units.dist);
    P.push({ k: 'dist', text: String(+d.toFixed(d < 10 ? 2 : 1)), after: ` ${units.dist}` });
  }
  if (s.cardioS) P.push({ k: 'time', text: clock(s.cardioS) });
  if (s.burned) P.push({ k: 'burn', text: nf(s.burned), after: ' kcal' });
  if (s.steps != null) P.push({ k: 'steps', text: nf(s.steps), after: ' steps' });
  if (s.water) P.push({ k: 'water', text: nf(s.water), after: ' ml' });
  for (const [k, v] of Object.entries(s.check)) P.push({ k: `ck-${k}`, before: `${k} `, text: String(v), after: '/5' });
  for (const [k, v] of Object.entries(s.meas)) {
    if (k === 'weight') P.push({ k: 'm-weight', text: massIn(v as number, units.load).toFixed(1), after: ` ${units.load}` });
    else P.push({ k: `m-${k}`, before: `${k} `, text: lengthIn(v as number, units.load).toFixed(1), after: ` ${lengthUnit(units.load)}` });
  }
  if (s.needs)
    P.push({ k: 'needs', text: String(s.needs), after: s.needs === 1 ? ' line needs values' : ' lines need values', needs: true });
  return P;
}
