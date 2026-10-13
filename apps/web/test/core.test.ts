import { describe, expect, test } from 'vitest';
import { BookCore } from '#lib/engine/core.ts';
import { foodTable } from '@logout/engine';
import { loadFoodData } from '#lib/engine/foods.ts';
import { serve, type FromWorker } from '#lib/engine/protocol.ts';

const state = (over = {}) => ({
  entries: [
    { id: 'a', date: '2026-10-01', time: 480, mode: 'food' as const, text: 'oats 100g 380kcal 13p 67c 7f' },
    { id: 'b', date: '2026-10-03', time: 1080, mode: 'strength' as const, text: 'bench 3x8 60kg, squat 3x5 100kg' }
  ],
  sampleEdits: [] as [string, string | null][],
  aliases: {},
  profile: {},
  sample: false,
  today: '2026-10-11',
  nowMin: 720,
  ...over
});

describe('the book keeper', () => {
  test('reads own entries and answers by day', () => {
    const core = new BookCore();
    core.init(state());
    const view = core.rebuild(1);
    expect(view.own).toBe(2);
    expect(view.first).toBe('2026-10-01');
    expect(view.days.get('2026-10-03')!.liftKeys.sort()).toEqual(['bench', 'squat']);
    expect(core.entries('2026-10-02', '2026-10-11').map(e => e.id)).toEqual(['b']);
    expect(core.daysBefore('2026-10-03', 5)).toEqual(['2026-10-01']);
  });

  test('changes and removals', () => {
    const core = new BookCore();
    core.init(state());
    core.upsert({ id: 'c', date: '2026-10-11', time: 600, mode: 'food', text: 'oats 50g' });
    core.remove('a');
    core.rebuild(2);
    // With its stating line gone, the oats need values again
    expect(core.entry('c')!.res[0]!.st).toBe('needs');
  });

  test('with the food tables, a food without stated values reads from the entry its name reads as', async () => {
    const core = new BookCore();
    core.init(state({ entries: [{ id: 'c', date: '2026-10-11', time: 600, mode: 'food', text: 'banana 120g, oats 50g' }] }));
    core.rebuild(1);
    expect(core.entry('c')!.res.map(r => r.st)).toEqual(['needs', 'needs']);
    core.setFoods(foodTable(await loadFoodData()));
    core.rebuild(2);
    const [banana, oats] = core.entry('c')!.res;
    expect(banana!.v).toMatchObject({ food: 'banana' });
    expect(banana!.v.kcal).toBeCloseTo(106.8, 5);
    expect(oats!.v.food).toBe('oat');
  });

  test('the sample history, and edits to it kept apart', () => {
    const core = new BookCore();
    core.init(state({ entries: [], sample: true }));
    const view = core.rebuild(1);
    expect(view.own).toBe(0);
    expect(view.first).toBe('2019-01-14');
    const first = core.entries('2019-01-14', '2019-01-14');
    expect(first.every(e => e.sample)).toBe(true);
    core.sampleEdit(first[0]!.id, null);
    core.rebuild(2);
    expect(core.entries('2019-01-14', '2019-01-14')).toHaveLength(first.length - 1);
  });
});

describe('the worker protocol', () => {
  test('a burst of changes is read once, and a question sees every change before it', async () => {
    const out: FromWorker[] = [];
    const queue: (() => void)[] = [];
    const handle = serve(
      m => out.push(m),
      fn => queue.push(fn)
    );
    const make = () => new BookCore();
    handle({ t: 'init', seq: 1, state: state() }, make);
    handle({ t: 'upsert', seq: 2, entry: { id: 'c', date: '2026-10-11', time: 600, mode: 'food', text: 'oats 50g' } }, make);
    handle({ t: 'entries', q: 1, from: '2026-10-11', to: '2026-10-11' }, make);
    // The question flushed the read itself
    expect(out[0]).toMatchObject({ t: 'book', view: { rev: 2 } });
    expect(out[1]).toMatchObject({ t: 'reply', q: 1 });
    expect((out[1] as { value: { id: string }[] }).value.map(e => e.id)).toEqual(['c']);
    // The deferred read finds nothing new to do
    queue.forEach(fn => fn());
    expect(out.filter(m => m.t === 'book')).toHaveLength(1);
  });

  test('the food tables come as a change, and everything is read again with them', async () => {
    const out: FromWorker[] = [];
    const handle = serve(
      m => out.push(m),
      fn => fn()
    );
    const core = new BookCore();
    handle({ t: 'foods', seq: 1, data: await loadFoodData() }, () => core);
    handle(
      { t: 'init', seq: 2, state: state({ entries: [{ id: 'c', date: '2026-10-11', time: 600, mode: 'food', text: 'idli 100g' }] }) },
      () => core
    );
    expect(out.at(-1)).toMatchObject({ t: 'book', view: { rev: 2 } });
    expect(core.entry('c')!.res[0]!.v.food).toBe('idli');
  });

  test('errors come back instead of stopping the worker', () => {
    const out: FromWorker[] = [];
    const handle = serve(
      m => out.push(m),
      () => {}
    );
    handle({ t: 'entry', q: 7, id: 'x' }, () => new BookCore());
    expect(out[0]).toEqual({ t: 'reply', q: 7, value: null });
  });
});
