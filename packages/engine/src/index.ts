/* LogOut's log engine: reads typed log lines and works out what they add up to.
   Pure: no DOM, storage or clock, so it runs the same in a page, a worker and tests. */

/** Bumped whenever the same text could read differently, so devices on different versions can tell */
export const version = 2;

export { DEFAULT_UNITS, UNITS, unitOf, type Dim, type Unit, type UnitName, type Units } from './units';
export { readLine, readEntry, segments, valuesText, CHECKINS, MODE_KINDS, type Segment } from './read';
export { keyOf, resolveName } from './aliases';
export { build, settle, sum, readout, navy, byWhen, newDay } from './book';
export { preview } from './preview';
export { detect } from './detect';
export { suggest, cardMeta, cardInsert, foodMeta } from './suggest';
export { foodTable, foodOf, foodsLike, foodBase, foodWords, FOOD_SOURCES, SOURCE_LABEL, type FoodData, type FoodRow } from './foods';
export { nf, clock, amountText, distText } from './format';
export { iso, parseIso, nextDay, daysBetween } from './dates';
export type * from './types';
