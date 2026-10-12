/* Ending the first-run setup: what a flow chose is saved, or, skipped, the defaults are (with units guessed from
   where the device is). Signed in, the account's profile arrives by sync, so nothing here overwrites it. */
import { GOALS } from '../data/types.ts';
import { track } from '../observe/analytics.ts';
import type { ProfileValues } from '../sheets/profile.ts';
import { app } from '../state/app.svelte.ts';
import { account } from '../sync/account.svelte.ts';
import { unitsHere, type FlowId } from './flows.ts';

/** What a flow starts from: the profile as it is, with guessed units on a first run */
export function startValues(): ProfileValues {
  return {
    sex: app.profile.sex,
    heightCm: app.profile.heightCm,
    units: app.firstRun ? unitsHere() : { ...app.profile.units },
    goals: { ...GOALS, ...app.profile.goals },
    sample: app.device.sample
  };
}

export async function finishSetup(v: ProfileValues, flow: FlowId): Promise<void> {
  app.profile = { ...app.profile, sex: v.sex, heightCm: v.heightCm, goals: { ...v.goals }, units: { ...v.units } };
  await app.repo.saveProfile($state.snapshot(app.profile));
  const device = { ...app.device, setupDone: true };
  if (v.sample !== app.device.sample) await app.repo.setSample(v.sample, device);
  else await app.repo.saveDevice(device);
  app.device = { ...device, sample: v.sample };
  app.firstRun = false;
  track('setup finished', {
    flow,
    sample: v.sample,
    sex: !!v.sex,
    height: !!v.heightCm,
    lb: v.units.load === 'lb',
    mi: v.units.dist === 'mi'
  });
}

export async function skipSetup(flow: FlowId): Promise<void> {
  if (!account.user) {
    app.profile = { ...app.profile, units: unitsHere() };
    await app.repo.saveProfile($state.snapshot(app.profile));
  }
  app.device = { ...app.device, setupDone: true };
  await app.repo.saveDevice($state.snapshot(app.device));
  app.firstRun = false;
  track('setup skipped', { flow, signedIn: !!account.user });
}
