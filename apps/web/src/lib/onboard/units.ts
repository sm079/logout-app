/* The units a first run starts with: a guess at what the person thinks in, from where the device is */
import type { Units } from '@logout/engine';

// Where pounds and miles are what people say: the United States, Liberia and Myanmar
const IMPERIAL_ZONE =
  /^(?:America\/(?:New_York|Detroit|Chicago|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak|Menominee|Indiana\/\w+|Kentucky\/\w+|North_Dakota\/\w+)|Pacific\/Honolulu|US\/\w+|Africa\/Monrovia|Asia\/(?:Yangon|Rangoon))$/;
const IMPERIAL_REGION = new Set(['US', 'LR', 'MM']);
const METRIC: Units = { load: 'kg', dist: 'km' };
const IMPERIAL: Units = { load: 'lb', dist: 'mi' };

/** The guess from a time zone and language tags. The time zone says it best (plenty of browsers outside the US
    say en-US); without a regional one, a language tag that names a region decides. */
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
