/* Ending the first-run setup: what it chose is saved, or, skipped, the defaults are (with units guessed from where
   the device is). Signed in, the account's profile arrives by sync, so nothing here overwrites it. */
import { GOALS } from '../data/types.ts';
import { track } from '../observe/analytics.ts';
import type { ProfileValues } from '../sheets/profile.ts';
import { app } from '../state/app.svelte.ts';
import { account } from '../sync/account.svelte.ts';
import { unitsHere } from './units.ts';

/** What the setup asks about: the profile's form, all of it */
export type SetupValues = ProfileValues;

/** Where the setup starts: the profile as it is, with guessed units on a first run */
export function startValues(): SetupValues {
  return {
    sex: app.profile.sex,
    heightCm: app.profile.heightCm,
    units: app.firstRun ? unitsHere() : { ...app.profile.units },
    goals: { ...GOALS, ...app.profile.goals }
  };
}

export async function finishSetup(v: SetupValues): Promise<void> {
  app.profile = { ...app.profile, sex: v.sex, heightCm: v.heightCm, goals: { ...v.goals }, units: { ...v.units } };
  await app.repo.saveProfile($state.snapshot(app.profile));
  app.device = { ...app.device, setupDone: true };
  await app.repo.saveDevice($state.snapshot(app.device));
  app.firstRun = false;
  track('setup finished', { sex: !!v.sex, height: !!v.heightCm, lb: v.units.load === 'lb', mi: v.units.dist === 'mi' });
}

export async function skipSetup(): Promise<void> {
  if (!account.user) {
    app.profile = { ...app.profile, units: unitsHere() };
    await app.repo.saveProfile($state.snapshot(app.profile));
  }
  app.device = { ...app.device, setupDone: true };
  await app.repo.saveDevice($state.snapshot(app.device));
  app.firstRun = false;
  track('setup skipped', { signedIn: !!account.user });
}
