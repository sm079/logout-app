/* The food tables: names read as one entry or none, short names read back, and the log's own values win */
import { describe, expect, test } from 'vitest';
import data from '../data/foods.json';
import * as E from '../src/index';
import { WORDS } from '../src/detect';
import type { Entry, FoodData, Mode } from '../src/index';

const foods = E.foodTable(data as unknown as FoodData);
let seq = 0;
const entry = (text: string, date = '2026-10-01', mode: Mode = 'food'): Entry => ({ id: `f${++seq}`, date, time: 720, mode, text });
const book = (...texts: string[]) =>
  E.build(
    texts.map(t => entry(t)),
    { foods }
  );
const last = (b: E.Book) => b.entries.at(-1)!.res[0]!;
const draft = (text: string, b: E.PreviewBook | null = { cards: new Map(), U: 600, aliases: {}, foods }) =>
  E.preview(b, text, 'food').res[0]!;

describe('the data file', () => {
  test('has all three tables, every value a number', () => {
    for (const src of E.FOOD_SOURCES) expect((data as unknown as FoodData)[src].length).toBeGreaterThan(400);
    for (const f of foods.list) {
      for (const v of [f.kcal, f.p, f.c, f.f, f.gml]) expect(Number.isFinite(v) && v >= 0, `${f.desc}`).toBe(true);
      expect(f.kcal).toBeLessThan(950);
    }
  });

  test('every short name is unique, reads back to its entry, and reads as a food name', () => {
    const seen = new Set<string>();
    for (const f of foods.list) {
      expect(seen.has(f.name), f.name).toBe(false);
      seen.add(f.name);
      expect(E.foodOf(foods, f.name), f.name).toBe(f);
      const l = E.readLine(f.name, 'food');
      expect([l.kind, l.key], f.name).toEqual(['food', f.name]);
      // With an amount, as a suggestion's name is used
      expect(E.readLine(`${f.name} 100g`, 'food').key, f.name).toBe(f.name);
    }
  });
});

describe('a name reads as one entry or none', () => {
  test.each([
    ['banana', 'Bananas, raw'],
    ['bananas', 'Bananas, raw'],
    ['Banana raw', 'Bananas, raw'],
    ['egg', 'Egg, whole, raw, fresh'],
    ['whole milk', 'Milk, whole, 3.25% milkfat, with added vitamin D'],
    ['almonds', 'Nuts, almonds'],
    ['roti', 'Chapati/Roti'],
    ['chapati', 'Chapati/Roti'],
    ['idli', 'Idli'],
    ['poha', 'Poha'],
    ['paneer', 'Paneer'],
    ['ghee', 'Ghee'],
    ['atta', 'Wheat flour, atta']
  ])('%s is %s', (name, desc) => {
    expect(E.foodOf(foods, name)?.desc).toBe(desc);
  });

  test('a name many entries share reads as none: no default pick', () => {
    for (const name of ['chicken', 'chicken breast', 'rice', 'apple', 'yogurt', 'bread', 'dal'])
      expect(E.foodOf(foods, name), name).toBeNull();
  });

  test('names nothing has read as none', () => {
    for (const name of ['flapjack deluxe', 'mum’s lasagne', 'protein bar xyz']) expect(E.foodOf(foods, name), name).toBeNull();
  });

  test('a name with words only one entry has reads as it', () => {
    const f = E.foodOf(foods, 'chicken breast meat only roasted');
    expect(f?.desc).toBe('Chicken, broilers or fryers, breast, meat only, cooked, roasted');
  });
});

describe('reading lines', () => {
  test('a matched food reads with an amount in grams, marked ≈', () => {
    const r = last(book('banana 120g'));
    expect(r.st).toBe('ok');
    expect(r.v.food).toBe('banana');
    expect(r.v.kcal).toBeCloseTo(89 * 1.2, 5);
    expect(r.v.p).toBeCloseTo(1.09 * 1.2, 5);
    expect(E.readout(r)).toBe('≈107 kcal');
  });

  test('millilitres read when the entry says what a millilitre weighs', () => {
    const milk = E.foodOf(foods, 'milk')!;
    expect(milk.gml).toBeGreaterThan(1);
    const r = last(book('milk 250ml'));
    expect(r.st).toBe('ok');
    expect(r.v.kcal).toBeCloseTo(milk.kcal * 2.5 * milk.gml, 5);
  });

  test('without an amount, or with a count, it needs one in grams', () => {
    let r = last(book('banana'));
    expect([r.st, r.v.food]).toEqual(['needs', 'banana']);
    expect(E.readout(r)).toBe('add an amount, 100g');
    r = last(book('2 eggs'));
    expect(r.st).toBe('needs');
    expect(E.readout(r)).toBe('add grams');
    expect(E.readout(last(book('milk 2')))).toBe('add grams or ml');
  });

  test('the log’s own values win; the table fills in only what they don’t cover', () => {
    let b = book('banana 100g 100kcal 1p 25c 0f', 'banana 50g');
    expect(last(b).v.kcal).toBe(50);
    expect(last(b).v.food).toBeUndefined();
    expect(E.readout(last(b))).toBe('50 kcal');
    // Stated for one, the table still reads grams
    b = book('banana 1 120kcal', 'banana 100g');
    expect(last(b).v.kcal).toBe(89);
    expect(last(b).v.food).toBe('banana');
    expect(E.readout(last(b))).toBe('≈89 kcal');
  });

  test('a renamed item reads as the entry its new name reads as', () => {
    const b = E.build([entry('banan 120g')], { foods, aliases: { 'food:banan': 'banana' } });
    expect(last(b).v.food).toBe('banana');
  });

  test('a draft reads the same way, and without the tables nothing changes', () => {
    expect(draft('idli 100g').v.kcal).toBeCloseTo(E.foodOf(foods, 'idli')!.kcal, 5);
    expect(draft('idli 100g', null).st).toBe('needs');
    expect(E.build([entry('banana 120g')]).entries[0]!.res[0]!.st).toBe('needs');
  });
});

describe('suggestions', () => {
  const empty = { cards: new Map(), foods };

  test('an ambiguous name lists its entries; taking one writes a name that reads as it', () => {
    const list = E.suggest(empty, 'food', 'chicken breast', 6);
    expect(list.length).toBe(6);
    for (const s of list) {
      expect(s.src).toBeDefined();
      expect(s.meta).toMatch(/^≈\d+ kcal \/ 100 g · (USDA|INDB|IFCT)$/);
      expect(s.insert).toBe(s.name);
      expect(E.foodOf(foods, s.insert)?.name).toBe(s.name);
      expect(E.foodOf(foods, s.insert)!.desc.toLowerCase()).toContain('chicken');
    }
  });

  test('more words narrow the list', () => {
    const wide = E.suggest(empty, 'food', 'rice', 50).length;
    const narrow = E.suggest(empty, 'food', 'rice white cooked', 50).length;
    expect(narrow).toBeLessThan(wide);
  });

  test('a half-typed word suggests the words it starts', () => {
    expect(E.suggest(empty, 'food', 'banan', 6).map(s => s.name)).toContain('banana');
  });

  describe('ranking', () => {
    const top = (q: string, n = 6) => E.foodsLike(foods, q, n);
    const descs = (q: string, n = 6) => top(q, n).map(f => f.desc);

    test('a whole word beats one it only starts', () => {
      for (const [q, not] of [
        ['rice', /^Ricebean/],
        ['egg', /^Egg(nog|plant)/],
        ['bread', /^Breadfruit/],
        ['apple', /APPLEBEE/]
      ] as const)
        for (const d of [...descs(q), ...descs(`${q} `)]) expect(d, q).not.toMatch(not);
    });

    test('the food itself comes before dishes made with it', () => {
      expect(descs('rice', 4)).toEqual(['Boiled rice (Uble chawal)', 'Rice, raw, brown', 'Rice, raw, milled', 'Rice, parboiled, milled']);
      expect(descs('milk', 4).every(d => /^Milk,/.test(d))).toBe(true);
      expect(descs('coffee', 4).every(d => /^Beverages, coffee,/.test(d))).toBe(true);
      expect(descs('cheese', 6).every(d => /^Cheese, \w+$/.test(d))).toBe(true);
    });

    test('plain forms come before products and brands, unless the product is typed', () => {
      const greek = descs('greek yogurt', 3);
      expect(greek.every(d => /plain/.test(d) && !/CHOBANI|OIKOS/.test(d))).toBe(true);
      for (const d of descs('chicken breast')) expect(d).not.toMatch(/deli|roll|flour|batter|breaded/);
      expect(descs('chicken breast deli', 1)[0]).toMatch(/deli/);
    });

    test('a half-typed word is the word most entries have, unless it’s a word itself', () => {
      expect(top('chick').every(f => f.name.startsWith('chicken'))).toBe(true);
      expect(top('chicken bre').every(f => f.name.includes('breast'))).toBe(true);
      expect(top('pea', 3).every(f => f.name.split(' ').includes('pea'))).toBe(true);
      expect(top('roti', 1)[0]!.name).toBe('chapati');
    });
  });

  test('logged foods come first, an entry already logged isn’t suggested again, other modes get none', () => {
    const b = book('banana 120g');
    const list = E.suggest(b, 'food', 'banana', 6);
    expect(list[0]).toMatchObject({ name: 'banana', last: '2026-10-01' });
    expect(list[0]!.src).toBeUndefined();
    expect(list.filter(s => s.name === 'banana').length).toBe(1);
    expect(E.suggest(empty, 'strength', 'banana', 6)).toEqual([]);
    expect(E.suggest(empty, 'food', 'banana', 6, false)).toEqual([]);
  });

  test('a logged food that needs values shows the table’s', () => {
    const b = book('banana');
    expect(E.cardMeta(b.cards.get('food:banana')!, foods)).toBe('≈89 kcal / 100 g · USDA');
    expect(E.cardMeta(b.cards.get('food:banana')!)).toBe('needs values');
  });
});

describe('the mode a draft reads as', () => {
  const b = { cards: new Map(), aliases: {}, foods };
  test('a name the tables read is food', () => {
    for (const t of ['idli', 'poha', 'quinoa', 'paneer']) expect(E.detect(b, t), t).toBe('food');
  });
  test('no lift or activity word reads as a food entry, so they keep their mode', () => {
    for (const w of [...WORDS.strength, ...WORDS.cardio]) {
      const f = E.foodOf(foods, w);
      if (f) expect(E.detect(b, w), `${w} reads as ${f.desc}`).not.toBe('food');
    }
    expect(E.detect(b, 'bench 3x5 100kg')).toBe('strength');
    expect(E.detect(b, 'run 5k')).toBe('cardio');
  });
});
