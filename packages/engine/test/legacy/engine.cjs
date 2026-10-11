/* Repflow log engine: reads typed log lines and works out what they add up to.
   Pure: no DOM, storage or clock. The page loads it as a classic script (window.Engine); Node loads it for tests.

   An entry is one LOG press: { id, date: 'YYYY-MM-DD', time: minutes after midnight, mode, text, units }.
   Only that is saved. Everything else is worked out from the text, in two passes over every entry, oldest first:
     1. the newest line that states an item's values sets that item's card (one set of values per kind of amount);
     2. every line is resolved against the cards, then added up per day.
   What the user typed never changes; only what it resolves to does. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Units ---------- */
  const UNITS = {};
  const SPELL = new Map();
  [
    ['mg', 'mass', .001], ['g', 'mass', 1, 'gm gms gr gram grams'], ['oz', 'mass', 28.3495, 'ounce ounces'],
    ['kg', 'mass', 1000, 'kgs kilo kilos kilogram kilograms'], ['lb', 'mass', 453.592, 'lbs pound pounds'],
    ['ml', 'volume', 1, 'mls milliliter milliliters millilitre millilitres'], ['l', 'volume', 1000, 'liter liters litre litres'],
    ['tsp', 'volume', 5, 'teaspoon teaspoons tsps'], ['tbsp', 'volume', 15, 'tablespoon tablespoons tbs tbsps'], ['cup', 'volume', 240, 'cups'],
    // Counted units are each their own kind of amount: a scoop is not a slice
    ['piece', 'piece', 1, 'pc pcs pieces'], ['scoop', 'scoop', 1, 'scoops'], ['slice', 'slice', 1, 'slices'], ['serving', 'serving', 1, 'servings srv'],
    ['mm', 'length', .001], ['cm', 'length', .01, 'cms centimeter centimeters centimetre centimetres'], ['in', 'length', .0254, 'inch inches'],
    ['ft', 'length', .3048, 'foot feet'], ['m', 'length', 1, 'meter meters metre metres'], ['yd', 'length', .9144, 'yard yards'],
    ['km', 'length', 1000, 'kms kilometer kilometers kilometre kilometres'], ['mi', 'length', 1609.344, 'mile miles'],
    ['s', 'time', 1, 'sec secs second seconds'], ['min', 'time', 60, 'mins minute minutes'], ['h', 'time', 3600, 'hr hrs hour hours']
  ].forEach(([name, dim, f, more = '']) => {
    UNITS[name] = { name, dim, f };
    [name, ...more.split(' ').filter(Boolean)].forEach(s => SPELL.set(s, name));
  });
  const unitOf = w => (w ? SPELL.get(w.toLowerCase()) : undefined);
  const DEFAULT_UNITS = Object.freeze({ load: 'kg', dist: 'km' });

  /* ---------- Regex essentials ---------- */
  const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const alt = words => [...words].sort((a, b) => b.length - a.length).map(esc).join('|');
  const spellings = names => alt([...SPELL].filter(([, n]) => names.includes(n)).map(([s]) => s));
  // `8,400` is eight thousand four hundred; `60,5` is sixty and a half
  const NUM = String.raw`(?:\d+(?:,\d{3})+(?![\d.,])|\d+(?:[.,]\d+)?)`;
  const L = String.raw`(?<![\p{L}\p{N}_.,])`;
  const R = String.raw`(?![\p{L}\p{N}_])`;
  const CLOCK = String.raw`(?:\d+:)?\d{1,2}:\d{2}`;
  const rx = src => new RegExp(src, 'giu');
  const num = s => (/^\d+(?:,\d{3})+$/.test(s) ? Number(s.replace(/,/g, '')) : Number(s.replace(',', '.')));
  const clockSec = s => s.split(':').reduce((a, p) => a * 60 + Number(p), 0);
  const MAX_SETS = 15;

  // A time of day, in every mode: `@7pm`, `@7:30am`, `@19:00`. In strength `@8` is effort, so there it needs a colon or am/pm.
  const TIME = {
    role: 'time', re: rx(String.raw`@\s*(?<h>\d{1,2})(?::(?<m>\d{2}))?\s*(?<ap>am|pm)?${R}`),
    read(g, ctx) {
      let h = +g.h;
      const m = g.m ? +g.m : 0;
      if (!g.m && !g.ap && ctx.kind === 'strength') return null;
      if (g.ap) { if (h < 1 || h > 12) return null; h = h % 12 + (g.ap.toLowerCase() === 'pm' ? 12 : 0); }
      return h > 23 || m > 59 ? null : { min: h * 60 + m };
    }
  };
  const BARE = { role: 'num', re: rx(String.raw`${L}(?<v>${NUM})${R}`), read: g => ({ v: num(g.v) }) };

  const FOOD_U = spellings(['mg', 'g', 'oz', 'kg', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'scoop', 'slice', 'serving']);
  const MACRO = { kcal: 'kcal', kcals: 'kcal', cal: 'kcal', cals: 'kcal', calorie: 'kcal', calories: 'kcal', p: 'p', protein: 'p', prot: 'p', c: 'c', carb: 'c', carbs: 'c', f: 'f', fat: 'f', fats: 'f' };
  const amountOf = (v, u, text) => ({ value: v, unit: u, text });
  const FOOD = [
    TIME,
    // `/100g`, `per serving`: the values on the line are for that much
    { role: 'basis', re: rx(String.raw`(?:\/|${L}per\s+)\s*(?<a>${NUM})?\s*(?<u>${FOOD_U})${R}`), read: g => ({ basis: amountOf(g.a ? num(g.a) : 1, unitOf(g.u)) }) },
    // `2x50g`: a count of a portion
    { role: 'amount', re: rx(String.raw`${L}(?<n>\d+)\s*x\s*(?<q>${NUM})\s*(?<u>${FOOD_U})${R}`), read: (g, c, m) => ({ amount: amountOf(+g.n * num(g.q), unitOf(g.u), m[0]) }) },
    // `30g protein` as well as `30p`
    { role: 'macro', re: rx(String.raw`${L}(?<v>${NUM})\s*(?:g\s*)?(?<k>protein|prot|carbs|carb|fats|fat)${R}`), read: g => ({ k: MACRO[g.k.toLowerCase()], v: num(g.v) }) },
    { role: 'macro', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<k>${alt(Object.keys(MACRO))})${R}`), read: g => ({ k: MACRO[g.k.toLowerCase()], v: num(g.v) }) },
    { role: 'amount', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${FOOD_U})${R}`), read: (g, c, m) => ({ amount: amountOf(num(g.v), unitOf(g.u), m[0]) }) },
    BARE
  ];

  const LOADS = spellings(['kg', 'lb']);
  const TIME_U = spellings(['s', 'min', 'h']);
  const rpe = v => (v >= 1 && v <= 10 ? { rpe: v, rir: 10 - v } : null);
  const STRENGTH = [
    TIME,
    // `+10kg`: added to bodyweight (a weighted pull-up)
    { role: 'load', re: rx(String.raw`\+\s*(?<w>${NUM})\s*(?<u>${LOADS})?${R}`), read: g => ({ w: num(g.w), u: unitOf(g.u), added: true }) },
    { role: 'effort', re: rx(String.raw`@\s*(?<v>\d{1,2}(?:[.,]5)?)(?![\d:])${R}`), read: g => rpe(num(g.v)) },
    { role: 'effort', re: rx(String.raw`${L}rpe\s*(?<v>\d{1,2}(?:[.,]5)?)${R}`), read: g => rpe(num(g.v)) },
    { role: 'effort', re: rx(String.raw`${L}(?<v>\d)\s*rir${R}`), read: g => ({ rir: +g.v }) },
    { role: 'effort', re: rx(String.raw`${L}rir\s*(?<v>\d)${R}`), read: g => ({ rir: +g.v }) },
    // `3x60s`, `3x1:00`: sets of a hold
    { role: 'sets', re: rx(String.raw`${L}(?<n>\d+)\s*x\s*(?:(?<c>${CLOCK})|(?<t>${NUM})\s*(?<u>${TIME_U}))${R}`), read: g => ({ sets: +g.n, hold: g.c ? clockSec(g.c) : num(g.t) * UNITS[unitOf(g.u)].f }) },
    // Three numbers: `100kg x 5 x 3` and `100x5x3` are load × reps × sets; `3x8x60` is sets × reps × load
    {
      role: 'sets', re: rx(String.raw`${L}(?<a>${NUM})\s*(?<au>${LOADS})?\s*x\s*(?<b>\d+)\s*x\s*(?<c>${NUM})\s*(?<cu>${LOADS})?${R}`),
      read(g) {
        const a = num(g.a), c = num(g.c);
        if (g.au || (!g.cu && a > MAX_SETS)) return Number.isInteger(c) ? { w: a, u: unitOf(g.au), reps: +g.b, sets: c } : null;
        return Number.isInteger(a) ? { sets: a, reps: +g.b, w: c, u: unitOf(g.cu) } : null;
      }
    },
    { role: 'sets', re: rx(String.raw`${L}(?<w>${NUM})\s*(?<u>${LOADS})\s*x\s*(?<r>\d+)${R}`), read: g => ({ w: num(g.w), u: unitOf(g.u), reps: +g.r, sets: 1 }) },
    // `3x8` is sets × reps; `100x5` is load × reps, since more than 15 sets is not a set count
    { role: 'sets', re: rx(String.raw`${L}(?<a>${NUM})\s*x\s*(?<b>\d+)${R}`), read(g) { const a = num(g.a); return a > MAX_SETS || !Number.isInteger(a) ? { w: a, reps: +g.b, sets: 1 } : { sets: a, reps: +g.b }; } },
    { role: 'sets', re: rx(String.raw`${L}(?<s>\d+)\s*sets?\s*(?:of|x)?\s*(?<r>\d+)(?:\s*reps?)?${R}`), read: g => ({ sets: +g.s, reps: +g.r }) },
    { role: 'sets', re: rx(String.raw`${L}(?<r>\d+)\s*reps?${R}`), read: g => ({ reps: +g.r }) },
    { role: 'sets', re: rx(String.raw`${L}(?<s>\d+)\s*sets?${R}`), read: g => ({ sets: +g.s }) },
    { role: 'load', re: rx(String.raw`${L}(?:bw|bodyweight)${R}`), read: () => ({ bw: true }) },
    { role: 'hold', re: rx(String.raw`${L}(?<c>${CLOCK})${R}`), read: g => ({ hold: clockSec(g.c) }) },
    { role: 'hold', re: rx(String.raw`${L}(?<t>${NUM})\s*(?<u>${TIME_U})${R}`), read: g => ({ hold: num(g.t) * UNITS[unitOf(g.u)].f }) },
    { role: 'load', re: rx(String.raw`${L}(?<w>${NUM})\s*(?<u>${LOADS})${R}`), read: g => ({ w: num(g.w), u: unitOf(g.u) }) },
    BARE
  ];

  // `m` is always metres; minutes are `min`. `5k` is five kilometres.
  const DIST_U = spellings(['m', 'yd', 'km', 'mi']) + '|k';
  const distOf = (v, w) => { const u = unitOf(w) || 'km'; return { value: v, unit: u, m: v * UNITS[u].f }; };
  const CARDIO = [
    TIME,
    { role: 'steps', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<k>k)?\s*steps?${R}`), read: g => ({ steps: Math.round(num(g.v) * (g.k ? 1000 : 1)) }) },
    { role: 'steps', re: rx(String.raw`${L}steps?\s*(?<v>${NUM})\s*(?<k>k)?${R}`), read: g => ({ steps: Math.round(num(g.v) * (g.k ? 1000 : 1)) }) },
    // `6x800m`, `10x30s`, `4x4:00`
    {
      role: 'interval', re: rx(String.raw`${L}(?<n>\d+)\s*x\s*(?:(?<c>${CLOCK})|(?<v>${NUM})\s*(?<u>${DIST_U}|${TIME_U}))${R}`),
      read(g) {
        const n = +g.n;
        if (g.c) return { n, sec: clockSec(g.c) };
        const u = g.u.toLowerCase() === 'k' ? 'km' : unitOf(g.u);
        return UNITS[u].dim === 'time' ? { n, sec: num(g.v) * UNITS[u].f } : { n, dist: distOf(num(g.v), u) };
      }
    },
    { role: 'pace', re: rx(String.raw`${L}(?<c>\d{1,2}:\d{2})\s*\/\s*(?<u>km|mi)${R}`), read: g => ({ pace: clockSec(g.c), per: g.u.toLowerCase() }) },
    { role: 'pace', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>km\/h|kph|mph)(?![\p{L}])`), read: g => ({ kmh: num(g.v) * (g.u.toLowerCase() === 'mph' ? 1.609344 : 1) }) },
    { role: 'duration', re: rx(String.raw`${L}(?<h>\d+)\s*h(?:rs?|ours?)?\s*(?<m>\d+)\s*m(?:in(?:s|utes?)?)?${R}`), read: g => ({ sec: +g.h * 3600 + +g.m * 60 }) },
    { role: 'duration', re: rx(String.raw`${L}(?<c>${CLOCK})${R}`), read: g => ({ sec: clockSec(g.c) }) },
    { role: 'hr', re: rx(String.raw`${L}(?<v>\d{2,3})\s*bpm${R}`), read: g => ({ hr: +g.v }) },
    { role: 'hr', re: rx(String.raw`${L}(?:avg\s+)?hr\s*(?<v>\d{2,3})${R}`), read: g => ({ hr: +g.v }) },
    { role: 'kcal', re: rx(String.raw`${L}(?<v>${NUM})\s*(?:kcals?|cals?|calories|calorie)${R}`), read: g => ({ kcal: num(g.v) }) },
    { role: 'duration', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${TIME_U})${R}`), read: g => ({ sec: num(g.v) * UNITS[unitOf(g.u)].f }) },
    { role: 'distance', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${DIST_U})${R}`), read: g => ({ dist: distOf(num(g.v), g.u.toLowerCase() === 'k' ? 'km' : g.u) }) },
    BARE
  ];

  // Lines that mean the same in every mode
  const WATER_U = { ml: 1, mls: 1, l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000, cup: 240, cups: 240, oz: 29.5735, glass: 250, glasses: 250 };
  const WATER = [TIME, { role: 'water', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${alt(Object.keys(WATER_U))})${R}`), read: g => ({ ml: num(g.v) * WATER_U[g.u.toLowerCase()] }) }, BARE];
  const MEASURES = { weight: 'weight', bw: 'weight', bodyweight: 'weight', 'body weight': 'weight', waist: 'waist', neck: 'neck', hips: 'hips', hip: 'hips', height: 'height' };
  const MEASURE = [TIME, { role: 'measure', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${spellings(['kg', 'lb', 'mm', 'cm', 'in', 'ft', 'm'])})${R}`), read: g => ({ v: num(g.v), u: unitOf(g.u) }) }, BARE];
  const SCORE = { role: 'score', re: rx(String.raw`(?<![\p{N}.\/])(?<v>[1-5])\s*\/\s*5(?![\p{N}.])`), read: g => ({ score: +g.v }) };
  const SCORE_RE = new RegExp(SCORE.re.source, 'iu');
  const CHECKIN = [TIME, SCORE, BARE];
  // Check-ins any name can make with `n/5`; these few are check-ins even without it
  const CHECKINS = new Set(['sleep', 'mood', 'energy', 'stress', 'soreness']);
  const RESERVED_RE = /(?:^|[^\p{L}])(?:water|weight|bw|bodyweight|body weight|waist|neck|hips?|height|sleep|mood|energy|stress|soreness)(?![\p{L}])/iu;
  const MODE_KINDS = new Set(['food', 'strength', 'cardio']);
  const PATTERNS = { food: FOOD, strength: STRENGTH, cardio: CARDIO };

  /* ---------- Reading a line ---------- */
  const MASK = '\u0001';
  // Each pattern claims what it matches, in order; claimed text is masked so later patterns can't reuse it
  function scan(text, patterns, ctx) {
    let work = text.replace(/[×*]/g, 'x');
    const tokens = [];
    for (const p of patterns) {
      for (const m of work.matchAll(p.re)) {
        const t = p.read(m.groups || {}, ctx, m);
        if (!t) continue;
        const s = m.index, e = s + m[0].length;
        tokens.push(Object.assign({ s, e, role: p.role }, t));
        work = work.slice(0, s) + MASK.repeat(e - s) + work.slice(e);
      }
    }
    tokens.sort((a, b) => a.s - b.s);
    // What's left is words, grouped into runs that no value interrupts
    const runs = [];
    let run = null;
    for (const m of work.matchAll(/[^\s\u0001]+/gu)) {
      const w = { s: m.index, e: m.index + m[0].length, w: m[0] };
      if (run && !work.slice(run.e, w.s).includes(MASK)) { run.words.push(w); run.e = w.e; } else runs.push(run = { e: w.e, words: [w] });
    }
    return { text, tokens, runs };
  }

  const CONNECT = new Set(['of', 'at', 'x', 'with', 'and', 'in', 'for', 'a', 'an', 'the', 'on', 'to', 'per']);
  const connector = w => CONNECT.has(w.toLowerCase()) || !/[\p{L}\p{N}]/u.test(w);
  // The name is the first run of words; later runs are a note. Linking words at a run's edges belong to neither.
  function nameOf(sc) {
    let name = null, key = null;
    for (const r of sc.runs) {
      let a = 0, b = r.words.length;
      while (a < b && connector(r.words[a].w)) a++;
      while (b > a && connector(r.words[b - 1].w)) b--;
      if (a === b) continue;
      const span = { s: r.words[a].s, e: r.words[b - 1].e };
      if (!name) {
        name = sc.text.slice(span.s, span.e).replace(/\s+/g, ' ');
        key = name.toLowerCase();
        sc.tokens.push({ ...span, role: 'name' });
      } else sc.tokens.push({ ...span, role: 'note' });
    }
    sc.tokens.sort((x, y) => x.s - y.s);
    return { name, key };
  }

  // A value a line already has makes a second one unreadable
  function taker(f) {
    return (t, field, v) => {
      if (f[field] != null) { t.role = 'bad'; return false; }
      f[field] = v;
      return true;
    };
  }

  // Any three of kcal, protein, carbs and fat fix the fourth (kcal = 4p + 4c + 9f)
  const PER_G = { p: 4, c: 4, f: 9 };
  function complete(m) {
    const missing = ['kcal', 'p', 'c', 'f'].filter(k => m[k] == null);
    if (missing.length !== 1) return { ...m, worked: null };
    const k = missing[0];
    let known = 0;
    for (const [q, e] of Object.entries(PER_G)) if (q !== k) known += e * m[q];
    const v = k === 'kcal' ? known : (m.kcal - known) / PER_G[k];
    return { ...m, [k]: Math.max(0, v), worked: k };
  }

  function readFood(sc) {
    const f = { amount: null, count: null, basis: null, macros: {}, stated: null };
    const take = taker(f);
    for (const t of sc.tokens) {
      if (t.role === 'macro') { if (f.macros[t.k] != null) t.role = 'bad'; else f.macros[t.k] = t.v; }
      else if (t.role === 'amount') take(t, 'amount', t.amount);
      else if (t.role === 'basis') take(t, 'basis', t.basis);
    }
    // A bare number is a count; once there's an amount with a unit, the unit wins
    for (const t of sc.tokens) {
      if (t.role !== 'num') continue;
      if (f.count == null) { f.count = t.v; t.role = 'count'; } else t.role = 'bad';
    }
    if (!f.amount && f.count != null) f.amount = amountOf(f.count, 'piece', String(f.count));
    if (Object.keys(f.macros).length) {
      const basis = f.basis || f.amount || amountOf(1, 'piece');
      const u = UNITS[basis.unit];
      f.stated = { ...complete(f.macros), unit: basis.unit, value: basis.value, base: basis.value * u.f, dim: u.dim };
    }
    return f;
  }

  function readStrength(sc, units) {
    const f = { sets: null, reps: null, w: null, u: null, added: false, bw: false, rpe: null, rir: null, hold: null };
    const take = taker(f);
    for (const t of sc.tokens) {
      if (t.role === 'sets') {
        if ((t.sets != null && f.sets != null) || (t.reps != null && f.reps != null) || (t.w != null && f.w != null)) { t.role = 'bad'; continue; }
        ['sets', 'reps', 'hold'].forEach(k => { if (t[k] != null) f[k] = t[k]; });
        if (t.w != null) { f.w = t.w; f.u = t.u || null; }
      } else if (t.role === 'load') {
        if (t.bw) f.bw = true;
        else if (take(t, 'w', t.w)) { f.u = t.u || null; f.added = !!t.added; }
      } else if (t.role === 'effort') { if (take(t, 'rir', t.rir)) f.rpe = t.rpe != null ? t.rpe : null; }
      else if (t.role === 'hold') take(t, 'hold', t.hold);
    }
    // A bare number after sets × reps is the load, in the unit the toggle is on; on its own it's reps (`pushups 20`)
    for (const t of sc.tokens) {
      if (t.role !== 'num') continue;
      if ((f.sets != null || f.reps != null) && f.w == null && !f.bw) { f.w = t.v; t.role = 'load'; }
      else if (f.reps == null && f.hold == null && Number.isInteger(t.v)) { f.reps = t.v; t.role = 'sets'; }
      else t.role = 'bad';
    }
    if (f.w != null && !f.u) f.u = units.load;
    if ((f.reps != null || f.hold != null) && f.sets == null) f.sets = 1;
    return f;
  }

  function readCardio(sc, units) {
    const f = { dist: null, sec: null, interval: null, pace: null, per: null, kmh: null, hr: null, kcal: null, steps: null };
    const take = taker(f);
    for (const t of sc.tokens) {
      if (t.role === 'duration') f.sec = (f.sec || 0) + t.sec;
      else if (t.role === 'distance') take(t, 'dist', t.dist);
      else if (t.role === 'interval') take(t, 'interval', { n: t.n, dist: t.dist || null, sec: t.sec || null });
      else if (t.role === 'pace') { if (t.kmh != null) take(t, 'kmh', t.kmh); else if (take(t, 'pace', t.pace)) f.per = t.per; }
      else if (t.role === 'hr') take(t, 'hr', t.hr);
      else if (t.role === 'kcal') take(t, 'kcal', t.kcal);
      else if (t.role === 'steps') take(t, 'steps', t.steps);
    }
    // A bare number is a distance, in the unit the toggle is on
    for (const t of sc.tokens) {
      if (t.role !== 'num') continue;
      if (f.dist == null) { f.dist = distOf(t.v, units.dist); t.role = 'distance'; } else t.role = 'bad';
    }
    return f;
  }

  function readCheckin(sc) {
    const f = { score: null };
    for (const t of sc.tokens) {
      if (t.role === 'score') { if (f.score == null) f.score = t.score; else t.role = 'bad'; }
    }
    for (const t of sc.tokens) {
      if (t.role !== 'num') continue;
      if (f.score == null && Number.isInteger(t.v) && t.v >= 1 && t.v <= 5) { f.score = t.v; t.role = 'score'; } else t.role = 'bad';
    }
    return f;
  }

  function readWater(sc) {
    const f = { ml: null };
    for (const t of sc.tokens) if (t.role === 'water') { if (f.ml == null) f.ml = t.ml; else t.role = 'bad'; }
    // `water 2` is two glasses; `water 500` is millilitres
    for (const t of sc.tokens) {
      if (t.role !== 'num') continue;
      if (f.ml == null) { f.ml = t.v <= 20 ? t.v * 250 : t.v; t.role = 'water'; } else t.role = 'bad';
    }
    return f;
  }

  function readMeasure(sc, key, units) {
    const weight = key === 'weight';
    const f = { what: key, v: null, u: null, si: null };
    for (const t of sc.tokens) {
      if (t.role === 'measure') {
        const ok = f.v == null && UNITS[t.u].dim === (weight ? 'mass' : 'length');
        if (ok) { f.v = t.v; f.u = t.u; } else t.role = 'bad';
      }
    }
    for (const t of sc.tokens) {
      if (t.role !== 'num') continue;
      if (f.v == null) { f.v = t.v; f.u = weight ? units.load : (units.load === 'lb' ? 'in' : 'cm'); t.role = 'measure'; } else t.role = 'bad';
    }
    // Weights in kg, lengths in cm
    if (f.v != null) f.si = weight ? f.v * UNITS[f.u].f / 1000 : f.v * UNITS[f.u].f * 100;
    return f;
  }

  function timeOfTokens(tokens) {
    const t = tokens.find(x => x.role === 'time');
    return t ? t.min : null;
  }

  function lineOf(kind, sc, nm, f) {
    return { kind, text: sc.text, tokens: sc.tokens, name: nm.name, key: nm.key, f, at: timeOfTokens(sc.tokens) };
  }

  function read(text, mode, units) {
    if (SCORE_RE.test(text)) { const sc = scan(text, CHECKIN, { kind: 'checkin' }); return lineOf('checkin', sc, nameOf(sc), readCheckin(sc)); }
    if (RESERVED_RE.test(text)) {
      let sc = scan(text, CHECKIN, { kind: 'checkin' }), nm = nameOf(sc);
      if (CHECKINS.has(nm.key)) return lineOf('checkin', sc, nm, readCheckin(sc));
      sc = scan(text, WATER, { kind: 'water' }); nm = nameOf(sc);
      if (nm.key === 'water') return lineOf('water', sc, nm, readWater(sc));
      sc = scan(text, MEASURE, { kind: 'measure' }); nm = nameOf(sc);
      if (nm.key && MEASURES[nm.key]) return lineOf('measure', sc, nm, readMeasure(sc, MEASURES[nm.key], units));
    }
    const sc = scan(text, PATTERNS[mode], { kind: mode }), nm = nameOf(sc);
    if (mode === 'food') return lineOf('food', sc, nm, readFood(sc));
    if (mode === 'strength') return lineOf('strength', sc, nm, readStrength(sc, units));
    const f = readCardio(sc, units);
    // A line that's only a step count is the day's total
    if (!nm.key && f.steps != null && f.dist == null && f.sec == null && f.interval == null) return lineOf('steps', sc, nm, f);
    return lineOf('cardio', sc, nm, f);
  }

  // Lines are read once per text: the same words always read the same way
  const CACHE = new Map();
  function readLine(text, mode, units = DEFAULT_UNITS) {
    const k = `${mode}|${units.load}|${units.dist}|${text}`;
    let line = CACHE.get(k);
    if (!line) {
      if (CACHE.size > 20000) CACHE.clear();
      line = Object.freeze(read(text, mode, units));
      CACHE.set(k, line);
    }
    return line;
  }

  // Lines end at a new line, `;`, or a comma that isn't inside a number
  const SPLIT = /\n|;|,(?!\d)|(?<!\d),/g;
  function segments(text) {
    const out = [];
    let at = 0;
    const push = (a, b) => {
      const raw = text.slice(a, b), t = raw.trim();
      if (t) out.push({ s: a + raw.length - raw.trimStart().length, text: t });
    };
    for (const m of text.matchAll(SPLIT)) { push(at, m.index); at = m.index + m[0].length; }
    push(at, text.length);
    return out;
  }

  // An entry's lines, each with where it starts in the text. A line with no name carries on the line before it
  // (`bench 60x8, 70x6, 80x4`).
  const ENTRY_CACHE = new Map();
  function readEntry(text, mode, units = DEFAULT_UNITS) {
    const k = `${mode}|${units.load}|${units.dist}|${text}`;
    let out = ENTRY_CACHE.get(k);
    if (out) return out;
    if (ENTRY_CACHE.size > 20000) ENTRY_CACHE.clear();
    ENTRY_CACHE.set(k, out = []);
    let prev = null;
    for (const seg of segments(text)) {
      let line = readLine(seg.text, mode, units);
      if (!line.key && prev && prev.key && prev.kind === line.kind && MODE_KINDS.has(line.kind)) line = { ...line, name: prev.name, key: prev.key, cont: true };
      out.push({ line, s: seg.s });
      prev = line;
    }
    return out;
  }

  // The words after the name: what to type again to repeat a line
  const valuesText = line => {
    const n = line.tokens.find(t => t.role === 'name');
    return (n ? line.text.slice(0, n.s) + line.text.slice(n.e) : line.text).replace(/\s+/g, ' ').trim();
  };

  /* ---------- Formatting ---------- */
  // One formatter per precision: building a formatter per call is what makes formatting slow
  const NF = [0, 1, 2].map(d => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }));
  const nf = (v, d = 0) => NF[d].format(+v);
  function clock(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60, two = n => String(n).padStart(2, '0');
    return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  }
  const LABEL = { piece: 'piece', scoop: 'scoop', slice: 'slice', serving: 'serving', cup: 'cup' };
  function amountText(a) {
    if (LABEL[a.unit]) return a.value === 1 ? LABEL[a.unit] : `${nf(a.value, 2)} ${LABEL[a.unit]}s`;
    return `${nf(a.value, 2)} ${a.unit}`;
  }
  const distText = d => (d.unit === 'm' || d.unit === 'yd' ? `${nf(d.value)} ${d.unit}` : `${nf(d.value, 2)} ${d.unit}`);

  /* ---------- Renamed and merged items ----------
     An alias gives an item's name a new one: `{ 'food:chiken': 'chicken' }`. Its lines key to the new name (following
     renames of renames), so they share a card, but their text stays as typed; `typed` keeps the key it had. */
  const keyOf = name => name.trim().replace(/\s+/g, ' ').toLowerCase();
  // What a name reads as: its key and name at the end of its renames (name null when it has none)
  function resolveName(kind, key, aliases) {
    let name = null;
    for (let hop = 0; aliases && hop < 8; hop++) {
      const to = aliases[`${kind}:${key}`];
      if (typeof to !== 'string' || !to.trim()) break;
      name = to.trim().replace(/\s+/g, ' ');
      if (keyOf(to) === key) break;
      key = keyOf(to);
    }
    return { key, name };
  }
  function aliased(line, aliases) {
    if (!aliases || !line.key || !MODE_KINDS.has(line.kind)) return line;
    const r = resolveName(line.kind, line.key, aliases);
    return r.name == null ? line : { ...line, key: r.key, name: r.name, typed: line.key };
  }
  const readAliased = (text, mode, units, aliases) => readEntry(text, mode, units).map(({ line, s }) => ({ line: aliased(line, aliases), s }));

  /* ---------- Pass 1: cards ---------- */
  function cardFor(cards, line) {
    const id = `${line.kind}:${line.key}`;
    let c = cards.get(id);
    if (!c) cards.set(id, c = { id, kind: line.kind, key: line.key, name: line.name, uses: 0, last: null, lastEntry: null, repeat: [], bases: {}, from: {}, newest: null, amount: null });
    return c;
  }
  function learn(cards, line, e) {
    if (!line.key || !MODE_KINDS.has(line.kind)) return;
    const c = cardFor(cards, line);
    c.name = line.name;
    if (c.lastEntry !== e.id) { c.uses++; c.lastEntry = e.id; c.repeat = []; }
    c.last = e.date;
    c.repeat.push(line);
    if (line.kind === 'food') {
      if (line.f.amount) c.amount = line.f.amount;
      const st = line.f.stated;
      // `from`: the entry that stated each kind of amount's values
      if (st) { c.bases = { ...c.bases, [st.dim]: st }; c.from = { ...c.from, [st.dim]: e.id }; c.newest = st.dim; }
    }
  }

  /* ---------- Pass 2: resolving ---------- */
  // A resolved line is { line, st: 'ok' | 'needs' | 'noname', v: its numbers, s: where it starts in the entry }
  function settle(line, card, U, s) {
    const f = line.f;
    if (!line.key && line.kind !== 'steps') return { line, st: 'noname', v: {}, s };
    switch (line.kind) {
      case 'food': {
        // No amount: as much as the newest values were stated for
        const newest = card && card.newest ? card.bases[card.newest] : null;
        const amt = f.amount || (newest ? amountOf(newest.value, newest.unit) : amountOf(1, 'piece'));
        const u = UNITS[amt.unit], b = card && card.bases[u.dim];
        if (!b) return { line, st: 'needs', v: { amount: amt, other: !!newest }, s };
        const k = amt.value * u.f / b.base;
        return { line, st: 'ok', v: { amount: amt, worked: b.worked, kcal: b.kcal != null ? b.kcal * k : null, p: b.p != null ? b.p * k : null, c: b.c != null ? b.c * k : null, f: b.f != null ? b.f * k : null }, s };
      }
      case 'strength': {
        if (f.reps == null && f.hold == null) return { line, st: 'needs', v: {}, s };
        const kg = f.w != null ? f.w * UNITS[f.u].f / 1000 : 0;
        const volume = f.reps ? f.sets * f.reps * kg : 0;
        const hard = f.rir == null || f.rir <= 4 ? f.sets : 0;
        // Fatigue in hard-set units: weighted by effort when it's given, otherwise by volume against a usual set
        const load = f.rir != null ? f.sets * Math.max(.3, Math.min(1, 1 - .1 * f.rir)) : volume > 0 && !f.added ? volume / U : f.sets * .7;
        return { line, st: 'ok', v: { sets: f.sets, reps: f.reps, kg, unit: f.u, volume, hard, load, hold: f.hold }, s };
      }
      case 'cardio': {
        const iv = f.interval;
        const distM = f.dist ? f.dist.m : iv && iv.dist ? iv.n * iv.dist.m : 0;
        let sec = f.sec || (iv && iv.sec ? iv.n * iv.sec : 0);
        if (!sec && distM && f.pace) sec = f.pace * distM / UNITS[f.per].f;
        if (!sec && distM && f.kmh) sec = distM / 1000 / f.kmh * 3600;
        if (!distM && !sec) return { line, st: 'needs', v: {}, s };
        return { line, st: 'ok', v: { distM, sec, hr: f.hr, kcal: f.kcal, steps: f.steps, load: sec ? sec / 600 : distM / 1000 * .6 }, s };
      }
      case 'steps': return { line, st: 'ok', v: { steps: f.steps }, s };
      case 'water': return f.ml == null ? { line, st: 'needs', v: {}, s } : { line, st: 'ok', v: { ml: f.ml }, s };
      case 'checkin': return f.score == null ? { line, st: 'needs', v: {}, s } : { line, st: 'ok', v: { score: f.score }, s };
      case 'measure': return f.v == null ? { line, st: 'needs', v: {}, s } : { line, st: 'ok', v: { what: f.what, si: f.si }, s };
    }
    return { line, st: 'needs', v: {}, s };
  }

  // What a resolved line comes to, in a few words: shown at the end of the line while typing
  const NEEDS = { food: 'add kcal p c f', strength: 'add sets × reps', cardio: 'add a distance or time', water: 'add an amount, 500ml', checkin: 'add a score, 4/5', measure: 'add a value' };
  const DIM_WORD = { mass: 'grams', volume: 'ml' };
  function readout(r) {
    const { line, v } = r, f = line.f;
    if (r.st === 'noname') return 'add a name';
    if (r.st === 'needs') {
      if (line.kind === 'food' && v.other) { const d = UNITS[v.amount.unit].dim; return `add values for ${DIM_WORD[d] || `${LABEL[d] || d}s`}`; }
      if (line.kind === 'cardio' && f.steps != null) return `${nf(f.steps)} steps`;
      return NEEDS[line.kind] || '';
    }
    switch (line.kind) {
      case 'food': return v.kcal != null ? `${nf(v.kcal)} kcal` : ['p', 'c', 'f'].filter(m => v[m] != null).map(m => `${nf(v[m])}${m}`).join(' ');
      case 'strength': return f.hold != null ? `${f.sets} × ${clock(f.hold)}` : v.kg ? `${nf(f.sets * f.reps * f.w)} ${f.u}` : `${nf(f.sets * f.reps)} reps`;
      case 'cardio': {
        const iv = f.interval;
        if (iv) return `${iv.n} × ${iv.dist ? distText(iv.dist) : clock(iv.sec)}`;
        if (v.distM && v.sec) { const per = f.dist && f.dist.unit === 'mi' ? 'mi' : 'km'; return `${clock(v.sec / (v.distM / UNITS[per].f))} /${per}`; }
        return v.distM ? distText(f.dist) : clock(v.sec);
      }
      case 'steps': return `${nf(v.steps)} steps`;
      case 'water': return `${nf(v.ml)} ml`;
      case 'checkin': return 'check-in';
      case 'measure': return v.what === 'weight' ? 'body weight' : v.what;
    }
    return '';
  }

  // What an entry adds up to
  function sum(res) {
    const s = { kcal: 0, p: 0, c: 0, f: 0, food: 0, needs: 0, water: 0, sets: 0, hard: 0, reps: 0, volume: 0, lifts: 0, cardioS: 0, distM: 0, burned: 0, cardio: 0, steps: null, check: {}, meas: {}, load: 0, kinds: {} };
    const lifts = new Set();
    for (const r of res) {
      const k = r.line.kind, v = r.v;
      s.kinds[k] = (s.kinds[k] || 0) + 1;
      if (r.st !== 'ok') { s.needs++; continue; }
      if (k === 'food') { s.food++; ['kcal', 'p', 'c', 'f'].forEach(m => { s[m] += v[m] || 0; }); }
      else if (k === 'strength') { s.sets += v.sets; s.hard += v.hard; s.reps += v.sets * (v.reps || 0); s.volume += v.volume; s.load += v.load; lifts.add(r.line.key); }
      else if (k === 'cardio') { s.cardio++; s.cardioS += v.sec; s.distM += v.distM; s.burned += v.kcal || 0; s.load += v.load; if (v.steps != null) s.activitySteps = (s.activitySteps || 0) + v.steps; }
      else if (k === 'steps') s.steps = v.steps;
      else if (k === 'water') s.water += v.ml;
      else if (k === 'checkin') s.check[r.line.key] = v.score;
      else if (k === 'measure') s.meas[v.what] = v.si;
    }
    s.lifts = lifts.size;
    return s;
  }

  const byWhen = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || 0) - (b.time || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // A usual set: the median of load × reps over every loaded set, so volume can stand in for effort
  function usualSet(list) {
    const xs = [];
    for (const e of list) for (const { line } of e.lines) {
      if (line.kind === 'strength' && line.f.w && line.f.reps && !line.f.added) xs.push(line.f.w * UNITS[line.f.u].f / 1000 * line.f.reps);
    }
    if (!xs.length) return 600;
    xs.sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)] || 600;
  }

  /* ---------- Dates ---------- */
  const iso = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const parseIso = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  const nextDay = s => { const d = parseIso(s); d.setUTCDate(d.getUTCDate() + 1); return iso(d); };
  const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);

  function newDay(date) {
    return { date, kcal: 0, p: 0, c: 0, f: 0, food: 0, needs: 0, water: 0, sets: 0, hard: 0, reps: 0, volume: 0, lifts: 0, cardioS: 0, distM: 0, burned: 0, cardio: 0, steps: null, check: {}, meas: {}, load: 0, sessions: 0, entries: 0, minutes: 0 };
  }

  /* ---------- Recovery and body fat ---------- */
  const HALF_LIFE = 1.5, DECAY = Math.pow(.5, 1 / HALF_LIFE), BASE_DAYS = 28;
  // Fatigue fades by half every day and a half; recovery compares today's fatigue with your usual
  function recoverySeries(days, from, to) {
    const out = new Map(), hist = [];
    let F = 0, run = 0;
    for (let d = from; d <= to; d = nextDay(d)) {
      const day = days.get(d);
      F = F * DECAY + (day ? day.load : 0);
      const base = Math.max(4, hist.length ? run / hist.length : 0);
      const sleep = day && day.check.sleep != null ? 1 + .075 * (day.check.sleep - 3) : 1;
      out.set(d, Math.max(5, Math.min(99, 100 * Math.exp(-.4 * F / base) * sleep)));
      hist.push(F); run += F;
      if (hist.length > BASE_DAYS) run -= hist.shift();
    }
    return out;
  }

  // US Navy method, from the newest waist, neck (and hips) within 30 days
  function navy(sex, height, waist, neck, hips) {
    if (!sex || !height || !waist || !neck) return null;
    if (sex === 'female') {
      if (!hips || waist + hips - neck <= 0) return null;
      return 495 / (1.29579 - .35004 * Math.log10(waist + hips - neck) + .221 * Math.log10(height)) - 450;
    }
    if (waist - neck <= 0) return null;
    return 495 / (1.0324 - .19077 * Math.log10(waist - neck) + .15456 * Math.log10(height)) - 450;
  }
  function bodyFatSeries(days, profile) {
    const out = new Map(), seen = {};
    for (const date of [...days.keys()].sort()) {
      const m = days.get(date).meas;
      for (const k of Object.keys(m)) seen[k] = { v: m[k], date };
      if (m.waist == null && m.neck == null && m.hips == null) continue;
      const fresh = k => (seen[k] && daysBetween(seen[k].date, date) <= 30 ? seen[k].v : null);
      const height = seen.height ? seen.height.v : profile.heightCm;
      const bf = navy(profile.sex, height, fresh('waist'), fresh('neck'), fresh('hips'));
      if (bf != null && bf > 2 && bf < 60) out.set(date, bf);
    }
    return out;
  }

  /* ---------- The book: everything worked out from the entries ---------- */
  function build(entries, opts = {}) {
    const profile = opts.profile || {}, aliases = opts.aliases || {};
    const list = entries.map(e => ({ id: e.id, date: e.date, time: e.time, mode: e.mode, text: e.text, units: e.units, lines: readAliased(e.text, e.mode, e.units || DEFAULT_UNITS, aliases), res: null, sum: null })).sort(byWhen);
    const cards = new Map();
    for (const e of list) for (const { line } of e.lines) learn(cards, line, e);
    const U = usualSet(list);
    const days = new Map();
    for (const e of list) {
      e.res = e.lines.map(({ line, s }) => settle(line, line.key ? cards.get(`${line.kind}:${line.key}`) : null, U, s));
      e.sum = sum(e.res);
      let day = days.get(e.date);
      if (!day) days.set(e.date, day = newDay(e.date));
      add(day, e.sum);
      day.entries++;
      if (e.sum.sets || e.sum.cardio) day.sessions++;
    }
    const dates = [...days.keys()].sort();
    const last = opts.today && (!dates.length || opts.today > dates[dates.length - 1]) ? opts.today : dates[dates.length - 1];
    const firstLoad = dates.find(d => days.get(d).load > 0);
    return {
      entries: list,
      byId: new Map(list.map(e => [e.id, e])),
      cards, days, U, profile, aliases,
      recovery: firstLoad ? recoverySeries(days, firstLoad, last) : new Map(),
      bodyFat: bodyFatSeries(days, profile)
    };
  }
  function add(day, s) {
    ['kcal', 'p', 'c', 'f', 'food', 'needs', 'water', 'sets', 'hard', 'reps', 'volume', 'lifts', 'cardioS', 'distM', 'burned', 'cardio', 'load'].forEach(k => { day[k] += s[k]; });
    // The newest step count, check-in and measurement of the day stand
    if (s.steps != null) day.steps = s.steps;
    Object.assign(day.check, s.check);
    Object.assign(day.meas, s.meas);
    day.minutes = day.cardioS / 60 + day.sets * 3;
  }

  // The draft, read as the newest entry: a value stated in it applies to it, over what the cards say
  function preview(book, text, mode, units = DEFAULT_UNITS) {
    const lines = readAliased(text, mode, units, book && book.aliases), own = new Map(), draft = { id: '￿', date: '9999-12-31' };
    for (const { line } of lines) {
      if (!line.key || !MODE_KINDS.has(line.kind)) continue;
      const id = `${line.kind}:${line.key}`;
      if (!own.has(id)) {
        const c = book && book.cards.get(id);
        own.set(id, c ? { ...c, bases: { ...c.bases }, repeat: [] } : null);
      }
      const tmp = new Map(own.get(id) ? [[id, own.get(id)]] : []);
      learn(tmp, line, draft);
      own.set(id, tmp.get(id));
    }
    const U = book ? book.U : 600;
    const res = lines.map(({ line, s }) => settle(line, line.key ? own.get(`${line.kind}:${line.key}`) : null, U, s));
    const at = res.map(r => r.line.at).find(t => t != null);
    return { res, sum: sum(res), at: at == null ? null : at };
  }

  /* ---------- Suggestions ---------- */
  const BUILT_IN = [
    ['water', 'Water · any mode', 'water '], ['weight', 'Body weight · any mode', 'weight '], ['waist', 'Measurement · any mode', 'waist '],
    ['neck', 'Measurement · any mode', 'neck '], ['hips', 'Measurement · any mode', 'hips '], ['sleep', 'Check-in · out of 5', 'sleep '],
    ['mood', 'Check-in · out of 5', 'mood '], ['energy', 'Check-in · out of 5', 'energy ']
  ];
  function cardMeta(book, c) {
    if (c.kind === 'food') {
      const b = c.newest && c.bases[c.newest];
      if (!b) return 'needs values';
      const head = b.kcal != null ? `${nf(b.kcal)} kcal` : ['p', 'c', 'f'].filter(m => b[m] != null).map(m => `${nf(b[m])}${m}`).join(' ');
      return `${head} / ${amountText(b)}`;
    }
    return c.repeat.map(valuesText).join(', ') || 'no values yet';
  }
  function cardInsert(c) {
    if (c.kind === 'food') return c.amount && c.amount.text ? `${c.name} ${c.amount.text}` : c.name;
    const repeat = c.repeat.map(valuesText).filter(Boolean).join(', ');
    return repeat ? `${c.name} ${repeat}` : c.name;
  }
  function suggest(book, mode, query, n = 6) {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' '), flat = s => s.replace(/[\s-]/g, '');
    const fits = key => !q || flat(key).startsWith(flat(q)) || key.split(/[\s-]/).some(w => w.startsWith(q));
    const out = [];
    if (book) {
      const cards = [...book.cards.values()].filter(c => c.kind === mode && fits(c.key));
      cards.sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || b.uses - a.uses);
      cards.slice(0, n).forEach(c => out.push({ name: c.name, meta: cardMeta(book, c), insert: cardInsert(c), last: c.last, kind: c.kind }));
    }
    if (q) BUILT_IN.forEach(([name, meta, insert]) => { if (out.length < n && name.startsWith(q) && !out.some(o => o.name.toLowerCase() === name)) out.push({ name, meta, insert, last: null, kind: 'any' }); });
    return out;
  }

  return {
    version: 1, DEFAULT_UNITS, UNITS,
    readLine, readEntry, segments, build, preview, suggest, sum, readout, keyOf, resolveName,
    clock, nf, amountText, iso, parseIso, nextDay, daysBetween, navy
  };
});
