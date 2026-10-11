/* Tints: a dark surface and a light ink for each family of things */
import { hashOf } from './format.ts';

export type Tint = [bg: string, fg: string];

export const TINTS = {
  plain: ['#2f3034', '#eeeef0'],
  lime: ['#363d12', '#e3fb5c'],
  blue: ['#1b2b44', '#90b9ff'],
  ember: ['#43230f', '#ffa25e'],
  teal: ['#103834', '#71e4d0'],
  rose: ['#441a20', '#ff8a8f']
} satisfies Record<string, Tint>;
export type TintName = keyof typeof TINTS;
export const TINT_CYCLE: TintName[] = ['lime', 'blue', 'ember', 'teal', 'rose'];

/** Colour follows a metric's domain */
export const MTINT = {
  body: ['#1b2b44', '#90b9ff'],
  activity: ['#103834', '#71e4d0'],
  training: ['#363d12', '#e3fb5c'],
  nutrition: ['#43230f', '#ffa25e'],
  hydration: ['#0f3142', '#7fd3ff'],
  sleep: ['#272046', '#b9a6ff'],
  heart: ['#441a20', '#ff8a8f'],
  good: ['#363d12', '#e3fb5c'],
  warn: ['#3d2e10', '#ffb35c'],
  bad: ['#441a20', '#ff8a8f'],
  none: ['#2f3034', '#8b8c93']
} satisfies Record<string, Tint>;
export type MTintName = keyof typeof MTINT;

/** An item's tint, the same every time for the same name */
export const itemTint = (name: string): Tint => TINTS[TINT_CYCLE[hashOf(name) % TINT_CYCLE.length]!];

/** CSS custom properties for a thumb in a tint */
export const thumbStyle = ([bg, fg]: Tint): string => `--tc:${bg};--ti:${fg}`;
