/* The app's shared state: settings, the selected period, the composer's mode and drafts, what's open */
import type { Mode, Preview, Units } from '@logout/engine';
import { EngineClient, inlineTransport, workerTransport, type Transport } from '../engine/client.svelte.ts';
import { SAMPLE_JOINED } from '../engine/sample-start.ts';
import { LogoutDB, useDB } from '../data/db.ts';
import { load, Repo } from '../data/repo.ts';
import { DEFAULT_DEVICE, defaultProfile, type Aliases, type Device, type Profile, type WidgetPicks } from '../data/types.ts';
import { addDays, clockNow, fromIso, isoOf, startOfDay } from '../logic/dates.ts';
import type { Selection } from '../logic/calendar.ts';

export type Sheet = { kind: 'profile' } | { kind: 'item'; itemKind: Mode; key: string; from: HTMLElement | null };

export type AppEvent =
  /** Something was logged; `before` is the day's session count before it */
  | { t: 'logged'; id: string; date: string; before: number }
  /** An entry changed or was removed */
  | { t: 'changed'; date: string }
  /** Item names changed, so rows read differently */
  | { t: 'renamed' }
  /** Open an entry for editing in the log */
  | { t: 'edit'; id: string };

const today0 = () => startOfDay(new Date());
const dayPick = (d: Date): Selection => ({ level: 'd', from: d, to: d, n: 1, anchor: d });

class App {
  engine!: EngineClient;
  repo!: Repo;
  ready = $state(false);
  profile = $state<Profile>(defaultProfile(isoOf(today0())));
  device = $state<Device>({ ...DEFAULT_DEVICE });
  widgets = $state<WidgetPicks>({});
  aliases = $state.raw<Aliases>({});
  /** Today; moves on at midnight */
  today = $state.raw<Date>(today0());
  /** The selected period */
  pick = $state.raw<Selection>(dayPick(today0()));
  /** Which way the last change moved, for rolling text */
  dir = $state(1);
  mode = $state<Mode>('strength');
  drafts = $state<Record<Mode, string>>({ strength: '', cardio: '', food: '' });
  /** The composer's text as read, or null while it's empty */
  draft = $state.raw<Preview | null>(null);
  logsOpen = $state(false);
  /** Two panes from 900px */
  wide = $state(false);
  sheet = $state.raw<Sheet | null>(null);
  /** First run: no profile yet */
  firstRun = $state(false);
  /** The demo: the sample history in a store of its own, never synced */
  demo = $state(false);
  toastMsg = $state.raw<{ title: string; sub: string; n: number } | null>(null);
  hintMsg = $state.raw<{ el: HTMLElement; text: string; n: number } | null>(null);
  /** Said to screen readers */
  announce = $state('');

  private listeners = new Set<(e: AppEvent) => void>();

  get book() {
    return this.engine?.book ?? null;
  }
  get units(): Units {
    return this.profile.units;
  }
  /** The day the user joined: the sample's first day while it's on */
  get joined(): Date {
    return this.device.sample ? SAMPLE_JOINED : fromIso(this.profile.since);
  }
  /** The calendar's first day: a year before joining (to fill in recent days), or the earliest entry */
  get start(): Date {
    const base = this.device.sample ? SAMPLE_JOINED : addDays(fromIso(this.profile.since), -365);
    const first = this.book?.first;
    return first && fromIso(first) < base ? fromIso(first) : base;
  }
  /** LOG, water and check-ins write to the selected day; with a range, to its last day that has come */
  get logDate(): Date {
    return this.pick.to > this.today ? this.today : this.pick.to;
  }
  get isToday(): boolean {
    return +this.logDate === +this.today;
  }

  /** Opens the store and starts the book */
  async boot({ transport, demo = false }: { transport?: Transport; demo?: boolean } = {}): Promise<void> {
    this.demo = demo;
    if (demo) useDB(new LogoutDB('logout-demo'));
    const data = await load();
    this.engine = new EngineClient(transport ?? (typeof Worker === 'function' ? workerTransport() : inlineTransport()));
    this.repo = new Repo(this.engine);
    if (demo && !data.device.setupDone) {
      // The demo starts set up, with the sample on and enough of a profile for every widget
      data.profile = { ...defaultProfile(isoOf(this.today)), sex: 'male', heightCm: 181 };
      data.device = { ...data.device, sample: true, setupDone: true };
      await this.repo.saveProfile(data.profile);
      await this.repo.saveDevice(data.device);
    }
    if (!demo && data.device.sample) {
      // The sample history is the demo's alone; a device that had it on from before goes back to its own log
      data.device = { ...data.device, sample: false };
      await this.repo.saveDevice(data.device);
    }
    this.firstRun = !data.profile || !data.device.setupDone;
    if (data.profile)
      this.profile = {
        ...defaultProfile(data.profile.since),
        ...data.profile,
        goals: { ...defaultProfile('').goals, ...data.profile.goals }
      };
    this.device = data.device;
    this.widgets = data.widgets;
    this.aliases = data.aliases;
    this.engine.change({
      t: 'init',
      state: {
        entries: data.entries.map(e => ({ id: e.id, date: e.date, time: e.time, mode: e.mode, text: e.text, units: e.units })),
        sampleEdits: data.sampleEdits,
        aliases: data.aliases,
        profile: { sex: this.profile.sex, heightCm: this.profile.heightCm },
        sample: this.device.sample,
        today: isoOf(this.today),
        nowMin: clockNow()
      }
    });
    await this.engine.settled();
    this.ready = true;
    this.watchClock();
  }

  /** The day moves on at midnight, and the sample's today grows through the day */
  private watchClock() {
    const tick = () => {
      const now = today0();
      if (+now !== +this.today) {
        const wasToday = this.pick.level === 'd' && +this.pick.from === +this.today;
        this.today = now;
        if (wasToday) this.pick = dayPick(now);
      }
      this.engine.change({ t: 'clock', today: isoOf(this.today), nowMin: clockNow() });
    };
    setInterval(tick, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick();
    });
  }

  emit(e: AppEvent): void {
    this.listeners.forEach(fn => fn(e));
  }
  on(fn: (e: AppEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Selects one day */
  selectDay(d: Date, dir = -1): void {
    this.dir = dir;
    this.pick = dayPick(d);
  }
  resetToToday(): void {
    this.selectDay(this.today);
  }

  toast(title: string, sub: string): void {
    this.toastMsg = { title, sub, n: (this.toastMsg?.n ?? 0) + 1 };
  }
  hint(el: HTMLElement, text: string): void {
    this.hintMsg = { el, text, n: (this.hintMsg?.n ?? 0) + 1 };
  }

  /** Sessions on a day, for calendar marks */
  sessions = (iso: string): number => this.book?.days.get(iso)?.sessions ?? 0;
}

export const app = new App();
