/* The grammar, by example */
import { expect, test } from 'vitest';
import * as E from '../src/index';
import type { Book, Entry, Line, Mode, Units } from '../src/index';

const line = (text: string, mode: Mode = 'food', units?: Units): Line => E.readLine(text, mode, units);
const roles = (l: Line) => l.tokens.map(t => [l.text.slice(t.s, t.e), t.role]);
const near = (a: number | null | undefined, b: number, d = 0.01) => {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b), `${a} ≉ ${b}`).toBeLessThanOrEqual(d);
};
let seq = 0;
const entry = (date: string, text: string, mode: Mode = 'food', time = 720): Entry => ({
  id: `e${String(++seq).padStart(4, '0')}`,
  date,
  time,
  mode,
  text
});
const only = (book: Book) => book.entries.at(-1)!.res[0]!;
const food = (l: Line) => (l.kind === 'food' ? l.f : expect.unreachable(`${l.text} is ${l.kind}`));
const lift = (l: Line) => (l.kind === 'strength' ? l.f : expect.unreachable(`${l.text} is ${l.kind}`));
const cardio = (l: Line) => (l.kind === 'cardio' || l.kind === 'steps' ? l.f : expect.unreachable(`${l.text} is ${l.kind}`));

test('food: name, amount, macros and a note', () => {
  const l = line('chicken breast 200g 330kcal 62p 0c 7f grilled');
  expect(l.kind).toBe('food');
  expect(l.name).toBe('chicken breast');
  expect(roles(l)).toEqual([
    ['chicken breast', 'name'],
    ['200g', 'amount'],
    ['330kcal', 'macro'],
    ['62p', 'macro'],
    ['0c', 'macro'],
    ['7f', 'macro'],
    ['grilled', 'note']
  ]);
  expect(food(l).stated!.base).toBe(200);
  expect(food(l).stated!.kcal).toBe(330);
});

test('food: counts, portions, word macros and linking words', () => {
  const eggs = line('3 eggs');
  expect([eggs.name, food(eggs).amount!.value, food(eggs).amount!.unit]).toEqual(['eggs', 3, 'piece']);
  expect(line('2 slices of bread').name).toBe('bread');
  expect(food(line('2 slices of bread')).amount!.unit).toBe('slice');
  expect(food(line('rice 2x50g')).amount!.value).toBe(100);
  expect(food(line('shake 1 scoop 30g protein')).macros.p).toBe(30);
  expect(line('coke zero 330ml').name).toBe('coke zero');
  expect(line('7up 330ml').name).toBe('7up');
});

test('food: three macros fill in the fourth', () => {
  const st = food(line('yogurt 200g 146kcal 20p 4f')).stated!;
  expect(st.worked).toBe('c');
  near(st.c, (146 - 80 - 36) / 4);
});

test('food: values per a basis scale to the amount', () => {
  const book = E.build([entry('2026-01-01', 'oats 80g /100g 380kcal 13p 67c 7f')]);
  near(only(book).v.kcal, 304);
  expect(E.readout(only(book))).toBe('304 kcal');
});

test('two passes: the newest stated values resolve every entry of the item', () => {
  const a = entry('2026-01-01', 'chicken 100g 165kcal 31p 0c 4f');
  const b = entry('2026-01-02', 'chicken 200g');
  const c = entry('2026-01-03', 'chicken 100g 120kcal 25p 0c 2f');
  let book = E.build([a, b, c]);
  near(book.byId.get(a.id)!.res[0]!.v.kcal, 120);
  near(book.byId.get(b.id)!.res[0]!.v.kcal, 240);
  // Deleting the newest statement falls back to the one before it
  book = E.build([a, b]);
  near(book.byId.get(b.id)!.res[0]!.v.kcal, 330);
  // and with no statement left, the item needs values
  book = E.build([b]);
  expect(book.byId.get(b.id)!.res[0]!.st).toBe('needs');
  expect(E.readout(book.byId.get(b.id)!.res[0]!)).toBe('add kcal p c f');
});

test('two passes: an older entry never overrides a newer statement', () => {
  const late = entry('2026-02-01', 'bar 1 piece 200kcal');
  const back = entry('2026-01-01', 'bar 1 piece 250kcal');
  const book = E.build([late, back]);
  expect(book.byId.get(back.id)!.res[0]!.v.kcal).toBe(200);
});

test('food: a line without an amount takes the amount its values were stated for; another kind of amount needs its own', () => {
  const book = E.build([
    entry('2026-01-01', 'banana 1 piece 105kcal 1p 27c 0f'),
    entry('2026-01-02', 'banana'),
    entry('2026-01-03', 'banana 120g')
  ]);
  expect(book.entries[1]!.res[0]!.v.kcal).toBe(105);
  expect(book.entries[2]!.res[0]!.st).toBe('needs');
  expect(E.readout(book.entries[2]!.res[0]!)).toBe('add values for grams');
});

test('preview: the draft resolves against the cards, and its own values apply to it', () => {
  const book = E.build([entry('2026-01-01', 'chicken 100g 165kcal 31p 0c 4f')]);
  near(E.preview(book, 'chicken 150g', 'food').res[0]!.v.kcal, 247.5);
  near(E.preview(book, 'chicken 100g 100kcal', 'food').res[0]!.v.kcal, 100);
  expect(E.preview(book, 'chicken 100g 100kcal', 'food').res[0]!.v.p).toBe(null);
  // The book is untouched
  near(E.preview(book, 'chicken 100g', 'food').res[0]!.v.kcal, 165);
});

test('strength: sets, reps, load and effort', () => {
  const f = lift(line('bench press 3x8 60kg @8', 'strength'));
  expect([f.sets, f.reps, f.w, f.u, f.rpe, f.rir]).toEqual([3, 8, 60, 'kg', 8, 2]);
  expect(roles(line('bench press 3x8 60kg @8', 'strength')).map(r => r[1])).toEqual(['name', 'sets', 'load', 'effort']);
  const g = lift(line('squat 100kg x 5 x 3', 'strength'));
  expect([g.w, g.reps, g.sets]).toEqual([100, 5, 3]);
  const h = lift(line('row 3x8x60', 'strength'));
  expect([h.sets, h.reps, h.w]).toEqual([3, 8, 60]);
  const curl = lift(line('curl 3 sets of 10', 'strength'));
  expect([curl.sets, curl.reps]).toEqual([3, 10]);
  expect(lift(line('deadlift 140x5 2rir', 'strength')).rir).toBe(2);
});

test('strength: bare loads follow the unit toggle; a lone number is reps', () => {
  const kg = lift(line('bench 3x8 60', 'strength')),
    lb = lift(line('bench 3x8 135', 'strength', { load: 'lb', dist: 'mi' }));
  expect([kg.w, kg.u]).toEqual([60, 'kg']);
  expect([lb.w, lb.u]).toEqual([135, 'lb']);
  const b = lift(line('bench 100x5', 'strength'));
  expect([b.w, b.reps]).toEqual([100, 5]);
  const p = lift(line('pushups 20', 'strength'));
  expect([p.reps, p.sets]).toEqual([20, 1]);
});

test('strength: added load, holds, and lines that carry on the exercise before', () => {
  const p = lift(line('pullups 3x8 +10kg', 'strength'));
  expect([p.w, p.added]).toEqual([10, true]);
  const k = lift(line('plank 3x60s', 'strength'));
  expect([k.sets, k.hold]).toEqual([3, 60]);
  const lines = E.readEntry('bench 60x8, 70x6, 80x4', 'strength');
  expect(lines.map(l => [l.line.key, lift(l.line).w, lift(l.line).reps])).toEqual([
    ['bench', 60, 8],
    ['bench', 70, 6],
    ['bench', 80, 4]
  ]);
  expect(lines.map(l => l.s)).toEqual([0, 12, 18]);
});

test('strength: volume, hard sets and readout', () => {
  const r = only(E.build([entry('2026-01-01', 'bench 3x8 60kg @8', 'strength')]));
  expect([r.v.volume, r.v.hard, E.readout(r)]).toEqual([1440, 3, '1,440 kg']);
  expect(E.readout(only(E.build([entry('2026-01-01', 'bench', 'strength')])))).toBe('add sets × reps');
});

test('cardio: distance, time, pace, heart rate and energy', () => {
  const r = only(E.build([entry('2026-01-01', 'run 5km 28:30 152bpm 400kcal', 'cardio')]));
  expect([r.v.distM, r.v.sec, r.v.hr, r.v.kcal, E.readout(r)]).toEqual([5000, 1710, 152, 400, '5:42 /km']);
  expect(cardio(line('ride 1h20m', 'cardio')).sec).toBe(4800);
  expect(cardio(line('row 20m', 'cardio')).dist!.m).toBe(20);
  expect(cardio(line('walk 20min', 'cardio')).sec).toBe(1200);
  expect(cardio(line('run 5k', 'cardio')).dist!.m).toBe(5000);
  expect(cardio(line('run 3', 'cardio', { load: 'lb', dist: 'mi' })).dist!.unit).toBe('mi');
});

test('cardio: intervals and pace', () => {
  const r = only(E.build([entry('2026-01-01', 'track 6x800m', 'cardio')]));
  expect([r.v.distM, E.readout(r)]).toEqual([4800, '6 × 800 m']);
  expect(cardio(line('hill sprints 10x15s', 'cardio')).interval!.sec).toBe(15);
  expect(only(E.build([entry('2026-01-01', 'run 10km 5:00/km', 'cardio')])).v.sec).toBe(3000);
});

test('cardio: a step count on its own is the day total, and the newest one stands', () => {
  expect(line('steps 8,400', 'cardio').kind).toBe('steps');
  expect(cardio(line('8.4k steps', 'cardio')).steps).toBe(8400);
  expect(line('walk 3km 4200 steps', 'cardio').kind).toBe('cardio');
  const book = E.build([entry('2026-01-01', 'steps 8400', 'cardio', 600), entry('2026-01-01', 'steps 11200', 'cardio', 1200)]);
  expect(book.days.get('2026-01-01')!.steps).toBe(11200);
});

test('any mode: water, check-ins and measurements', () => {
  for (const mode of ['food', 'strength', 'cardio'] as const) {
    expect(line('water 500ml', mode).kind).toBe('water');
    expect(line('mood 4/5', mode).kind).toBe('checkin');
    expect(line('weight 78.4kg', mode).kind).toBe('measure');
  }
  const f = (l: Line) => l.f as { ml?: number; score?: number; si?: number };
  expect(f(line('water 2')).ml).toBe(500);
  expect(f(line('water 0.5l')).ml).toBe(500);
  expect(line('coconut water 330ml 60kcal').kind).toBe('food');
  expect([line('sleep 3').kind, f(line('sleep 3')).score]).toEqual(['checkin', 3]);
  expect(line('sore legs 2/5').key).toBe('sore legs');
  expect(f(line('weight 172', 'strength', { load: 'lb', dist: 'mi' })).si!.toFixed(1)).toBe('78.0');
  near(f(line('waist 32in')).si, 81.28);
  expect(f(line('waist 84')).si).toBe(84);
});

test('time of day: @time, and @8 stays effort in strength', () => {
  expect(line('oats 80g @7:30am').at).toBe(450);
  expect(line('dinner @7pm').at).toBe(1140);
  expect(line('oats @8').at).toBe(480);
  expect(line('bench 3x8 60kg @8', 'strength').at).toBe(null);
  expect(line('bench 3x8 60kg @6pm', 'strength').at).toBe(1080);
});

test('splitting: commas inside numbers stay', () => {
  expect(E.segments('steps 8,400, water 500ml; oats 1,5 cups\nrice 100g').map(s => s.text)).toEqual([
    'steps 8,400',
    'water 500ml',
    'oats 1,5 cups',
    'rice 100g'
  ]);
});

test('a second value of the same kind is unreadable', () => {
  expect(roles(line('eggs 2 3')).map(r => r[1])).toEqual(['name', 'count', 'bad']);
});

test("day totals add up an entry's lines", () => {
  const book = E.build([
    entry('2026-01-01', 'oats 100g 380kcal 13p 67c 7f, water 500ml', 'food', 480),
    entry('2026-01-01', 'bench 3x8 60kg, squat 3x5 100kg @8', 'strength', 1080),
    entry('2026-01-01', 'run 5km 25:00', 'cardio', 1140),
    entry('2026-01-01', 'sleep 4/5, weight 80kg', 'food', 420)
  ]);
  const d = book.days.get('2026-01-01')!;
  expect([d.kcal, d.water, d.sets, d.volume, d.distM, d.cardioS, d.check.sleep, d.meas.weight, d.sessions]).toEqual([
    380, 500, 6, 2940, 5000, 1500, 4, 80, 2
  ]);
  expect(d.minutes).toBe(25 + 6 * 3);
});

test('recovery drops after training, comes back with rest, and follows sleep', () => {
  const es: Entry[] = [];
  for (let i = 1; i <= 28; i++) es.push(entry(`2026-01-${String(i).padStart(2, '0')}`, 'squat 4x5 100kg @8', 'strength'));
  es.push(entry('2026-01-29', 'squat 8x5 100kg @9, deadlift 6x5 140kg @9', 'strength'));
  const book = E.build(es, { today: '2026-02-02' });
  const r = (d: string) => book.recovery.get(d)!;
  expect(r('2026-01-29')).toBeLessThan(r('2026-01-28'));
  expect(r('2026-01-31')).toBeGreaterThan(r('2026-01-29'));
  expect(r('2026-02-02')).toBeGreaterThan(r('2026-01-31'));
  const slept = E.build([...es, entry('2026-01-29', 'sleep 1/5', 'food', 400)], { today: '2026-01-29' });
  expect(slept.recovery.get('2026-01-29')!).toBeLessThan(r('2026-01-29'));
});

test('recovery uses volume when there is no effort', () => {
  const book = E.build([entry('2026-01-01', 'squat 3x5 100kg', 'strength'), entry('2026-01-02', 'squat 6x5 100kg', 'strength')]);
  expect(book.entries[0]!.res[0]!.v.load).toBe(3);
  expect(book.entries[1]!.res[0]!.v.load).toBe(6);
});

test('body fat: US Navy estimate from fresh measurements', () => {
  const book = E.build([entry('2026-01-01', 'neck 38cm'), entry('2026-01-10', 'waist 85cm')], { profile: { sex: 'male', heightCm: 180 } });
  near(book.bodyFat.get('2026-01-10'), E.navy('male', 180, 85, 38)!, 1e-9);
  const stale = E.build([entry('2026-01-01', 'neck 38cm'), entry('2026-03-10', 'waist 85cm')], { profile: { sex: 'male', heightCm: 180 } });
  expect(stale.bodyFat.size).toBe(0);
  expect(E.build([entry('2026-01-01', 'neck 34cm, waist 75cm')], { profile: { sex: 'female', heightCm: 165 } }).bodyFat.size).toBe(0);
  // The formula differs by sex, so without one there is no estimate
  expect(E.build([entry('2026-01-01', 'neck 38cm, waist 85cm')], { profile: { heightCm: 180 } }).bodyFat.size).toBe(0);
  expect(E.navy(null, 180, 85, 38)).toBe(null);
});

test('suggestions: recent items first, with what to type to repeat them', () => {
  const book = E.build([
    entry('2026-01-01', 'bench press 3x8 60kg', 'strength'),
    entry('2026-01-03', 'bench press 60x8, 70x6', 'strength'),
    entry('2026-01-02', 'back squat 5x5 100kg', 'strength'),
    entry('2026-01-02', 'chicken breast 200g 330kcal 62p 0c 7f', 'food')
  ]);
  const s = E.suggest(book, 'strength', 'b');
  expect(s.map(x => x.name)).toEqual(['bench press', 'back squat']);
  expect(s[0]!.insert).toBe('bench press 60x8, 70x6');
  const f = E.suggest(book, 'food', 'chi');
  expect(f[0]!.meta).toBe('330 kcal / 200 g');
  expect(f[0]!.insert).toBe('chicken breast 200g');
  expect(E.suggest(book, 'food', 'wat').map(x => x.name)).toEqual(['water']);
});

test('aliases: a renamed item keys to its new name, and its text stays as typed', () => {
  const entries = [entry('2026-01-01', 'bench 3x8 60kg', 'strength'), entry('2026-01-02', 'bench 60x8, 70x6', 'strength')];
  const book = E.build(entries, { aliases: { 'strength:bench': 'bench press' } });
  expect([...book.cards.keys()]).toEqual(['strength:bench press']);
  const c = book.cards.get('strength:bench press')!;
  expect(c.name).toBe('bench press');
  expect(c.uses).toBe(2);
  expect(book.entries[1]!.text).toBe('bench 60x8, 70x6');
  expect(book.entries[1]!.res[1]!.line.typed).toBe('bench');
  expect(E.suggest(book, 'strength', 'ben')[0]!.name).toBe('bench press');
});

test('aliases: a merged typo takes the values of the item it joins, newest statement first', () => {
  const entries = [
    entry('2026-01-01', 'chicken 100g 165kcal 31p 0c 4f'),
    entry('2026-01-02', 'chiken 200g'),
    entry('2026-01-03', 'chiken 100g 170kcal 30p 0c 5f')
  ];
  // Apart, each keeps its own values
  near(E.build(entries).entries[0]!.res[0]!.v.kcal, 165);
  const book = E.build(entries, { aliases: { 'food:chiken': 'chicken' } });
  expect([...book.cards.keys()]).toEqual(['food:chicken']);
  // The newest statement (the merged typo's) now resolves every chicken line
  near(book.entries[0]!.res[0]!.v.kcal, 170);
  near(book.entries[1]!.res[0]!.v.kcal, 340);
  // Which entry stated the values, so it can be opened and edited
  expect(book.cards.get('food:chicken')!.from.mass).toBe(entries[2]!.id);
  // A draft reads through the same names
  near(E.preview(book, 'chiken 50g', 'food').res[0]!.v.kcal, 85);
});

test('aliases: renames chain, and a cycle stops', () => {
  const entries = [entry('2026-01-01', 'bench 3x8 60kg', 'strength')];
  const chained = E.build(entries, { aliases: { 'strength:bench': 'bench press', 'strength:bench press': 'flat bench' } });
  expect([...chained.cards.keys()]).toEqual(['strength:flat bench']);
  const loop = E.build(entries, { aliases: { 'strength:bench': 'press', 'strength:press': 'bench' } });
  expect(loop.cards.size).toBe(1);
  // A rename that only changes how the name is written keeps the key
  const caps = E.build(entries, { aliases: { 'strength:bench': 'Bench' } });
  expect(caps.cards.get('strength:bench')!.name).toBe('Bench');
});
