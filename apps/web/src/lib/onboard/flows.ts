/* The first-run setup comes in three flows. One is shown on a first run; `?onboard=<flow>` opens any of them, and
   on a device that's already set up it's a preview that saves nothing. */
import type { Units } from '@logout/engine';
import type { ProfileValues } from '../sheets/profile.ts';

export type FlowId = 'line' | 'tune' | 'script';

export const FLOWS: { id: FlowId; name: string }[] = [
  // Shows the reading first: the visitor types (or watches) a line, then picks units and where to start
  { id: 'line', name: 'First line' },
  // One question a screen, each answered with a control that moves: a plate, a ruler, a dial
  { id: 'tune', name: 'Tune' },
  // The setup is typed too: LogOut asks in lines and reads the answers as it reads a log
  { id: 'script', name: 'Script' }
];

export const DEFAULT_FLOW: FlowId = 'line';

/** The flow `?onboard=` asks for, if it names one */
export function flowAsked(search: string): FlowId | null {
  const v = new URLSearchParams(search).get('onboard');
  if (v === null) return null;
  return FLOWS.find(f => f.id === v)?.id ?? DEFAULT_FLOW;
}

// Where pounds and miles are what people say: the United States, Liberia and Myanmar
const IMPERIAL_ZONE =
  /^(?:America\/(?:New_York|Detroit|Chicago|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Menominee|Indiana\/\w+|Kentucky\/\w+|North_Dakota\/\w+)|Pacific\/Honolulu|US\/\w+|Africa\/Monrovia|Asia\/(?:Yangon|Rangoon))$/;
const IMPERIAL_REGION = new Set(['US', 'LR', 'MM']);
const METRIC: Units = { load: 'kg', dist: 'km' };
const IMPERIAL: Units = { load: 'lb', dist: 'mi' };

/** Units a first run starts with, guessed from where the device is. The time zone says that best (plenty of
    browsers outside the US say en-US); without a regional one, a language tag that names a region decides. */
export function guessUnits(timeZone: string | undefined, langs: readonly string[]): Units {
  if (timeZone && timeZone.includes('/') && !timeZone.startsWith('Etc/'))
    return IMPERIAL_ZONE.test(timeZone) ? { ...IMPERIAL } : { ...METRIC };
  for (const tag of langs) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(tag).region;
    } catch {
      continue;
    }
    if (region) return IMPERIAL_REGION.has(region) ? { ...IMPERIAL } : { ...METRIC };
  }
  return { ...METRIC };
}

/** The guess for this browser */
export const unitsHere = (): Units =>
  guessUnits(Intl.DateTimeFormat().resolvedOptions().timeZone, typeof navigator === 'object' ? navigator.languages : []);

/** What every flow is given */
export interface FlowProps {
  /** Where its answers start */
  values: ProfileValues;
  /** A set-up device is looking: nothing will be saved */
  preview: boolean;
  onfinish: (v: ProfileValues) => void;
  onskip: () => void;
  /** Opens sign-in, when there's an account to sign in to */
  onsignin: (() => void) | null;
}
