/* Sample history: a simulated user's log since joining, written as the lines a person would type.
   Seeded, so it is the same on every visit. The page reads it through the engine like any other entry. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sample = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const hr = (i, salt) => { let t = (Math.imul(i + 11, 2654435761) ^ Math.imul(salt + 7, 0x9E3779B1)) >>> 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pickOf = (arr, i, salt) => arr[Math.floor(hr(i, salt) * arr.length)];
  const r1 = v => Math.round(v * 10) / 10;
  const to25 = v => Math.round(v / 2.5) * 2.5;
  const to10 = v => Math.round(v / 10) * 10;

  // What each food's label says. A food's first line in the history states it; later lines only say how much.
  const LABELS = {
    'greek yogurt': '/100g 59kcal 10p 3.6c 0.4f', berries: '/100g 50kcal 0.7p 12c 0.3f', granola: '/100g 450kcal 10p 64c 17f',
    honey: 'per tbsp 64kcal 0p 17c 0f', oats: '/100g 380kcal 13p 67c 7f', banana: 'per piece 105kcal 1.3p 27c 0.4f',
    'peanut butter': 'per tbsp 95kcal 3.5p 3.5c 8f', milk: '/100ml 64kcal 3.4p 4.8c 3.6f', eggs: 'per piece 72kcal 6.3p 0.4c 4.8f',
    sourdough: 'per slice 115kcal 4p 22c 1f', 'black coffee': 'per cup 2kcal 0.3p 0c 0f', whey: 'per scoop 120kcal 24p 3c 1.5f',
    bagel: 'per piece 250kcal 10p 48c 1.5f', avocado: '/100g 160kcal 2p 9c 15f', 'flat white': 'per piece 120kcal 7p 10c 6f',
    'chicken breast': '/100g 165kcal 31p 0c 3.6f', rice: '/100g 130kcal 2.7p 28c 0.3f', 'black beans': '/100g 132kcal 8.9p 24c 0.5f',
    salmon: '/100g 208kcal 20p 0c 13f', 'brown rice': '/100g 123kcal 2.7p 26c 1f', edamame: '/100g 121kcal 12p 9c 5f',
    wrap: 'per piece 210kcal 6p 35c 5f', turkey: '/100g 135kcal 30p 0c 1f', cheese: '/100g 400kcal 25p 1.3c 33f',
    'side salad': 'per serving 35kcal 2p 6c 0.5f', 'beef chilli': '/100g 110kcal 9p 8c 4.5f', 'chicken caesar salad': 'per serving 440kcal 35p 14c 27f',
    apple: 'per piece 95kcal 0.5p 25c 0.3f', skyr: '/100g 63kcal 11p 4c 0.2f', almonds: '/100g 580kcal 21p 22c 50f',
    latte: 'per piece 190kcal 10p 15c 7f', 'rice cakes': 'per piece 35kcal 0.7p 7.3c 0.3f', steak: '/100g 250kcal 26p 0c 15f',
    'sweet potato': '/100g 86kcal 1.6p 20c 0.1f', broccoli: '/100g 34kcal 2.8p 7c 0.4f', pasta: '/100g 371kcal 13p 75c 1.5f',
    'bolognese sauce': '/100g 90kcal 6p 6c 4.5f', parmesan: '/100g 431kcal 38p 4c 29f', quinoa: '/100g 120kcal 4.4p 21c 1.9f',
    asparagus: '/100g 20kcal 2.2p 3.9c 0.1f', 'jasmine rice': '/100g 130kcal 2.7p 28c 0.3f', 'stir fry veg': '/100g 45kcal 2p 7c 1f',
    'beef mince': '/100g 250kcal 26p 0c 17f', guacamole: '/100g 155kcal 2p 9c 14f'
  };
  // Meals: [name, amount] per line; a gram amount varies a little from day to day
  const MEALS = [
    { t: 7 * 60 + 5, options: [
      [['greek yogurt', 200], ['berries', 100], ['granola', 40], ['honey', '1 tbsp']],
      [['oats', 70], ['banana', '1'], ['peanut butter', '1 tbsp'], ['milk', '250ml']],
      [['eggs', '3', true], ['sourdough', '2 slices'], ['black coffee', '1 cup']],
      [['oats', 60], ['whey', '1 scoop'], ['banana', '1'], ['milk', '200ml']],
      [['bagel', '1'], ['eggs', '2', true], ['avocado', 60], ['flat white', '1']]
    ] },
    { t: 12 * 60 + 10, options: [
      [['chicken breast', 160], ['rice', 220], ['avocado', 50], ['black beans', 100]],
      [['salmon', 150], ['brown rice', 200], ['edamame', 80]],
      [['wrap', '1'], ['turkey', 100], ['cheese', 30], ['side salad', '1 serving']],
      [['beef chilli', 350], ['rice', 180]],
      [['chicken caesar salad', '1 serving'], ['sourdough', '1 slice']]
    ] },
    { t: 15 * 60 + 45, options: [
      [['whey', '1 scoop'], ['banana', '1']],
      [['apple', '1'], ['peanut butter', '2 tbsp']],
      [['skyr', 170], ['berries', 80]],
      [['almonds', 30], ['latte', '1']],
      [['rice cakes', '3'], ['peanut butter', '1 tbsp']]
    ] },
    { t: 18 * 60 + 50, options: [
      [['steak', 220], ['sweet potato', 250], ['broccoli', 150]],
      [['pasta', 120], ['bolognese sauce', 220], ['parmesan', 15]],
      [['salmon', 160], ['quinoa', 180], ['asparagus', 120]],
      [['chicken breast', 200], ['jasmine rice', 220], ['stir fry veg', 200]],
      [['beef mince', 160], ['rice', 180], ['guacamole', 50]]
    ] }
  ];

  // Lifts: [name, starting load, load after years of training, sets, reps]
  const SPLIT = [
    [['bench press', 60, 100, 4, 6], ['overhead press', 40, 62.5, 3, 8], ['incline dumbbell press', 22, 36, 3, 10], ['dips', 0, 0, 3, 12]],
    [['deadlift', 100, 170, 3, 5], ['barbell row', 55, 85, 4, 8], ['pull-ups', 0, 15, 4, 8], ['lat pulldown', 50, 72.5, 3, 12]],
    [['back squat', 80, 140, 5, 5], ['romanian deadlift', 70, 115, 3, 8], ['leg press', 140, 240, 3, 12], ['hip thrust', 80, 150, 4, 10]]
  ];

  function liftLine(ex, t, i, k) {
    const [name, a, b, sets, reps] = ex;
    const load = to25(a + (b - a) * Math.min(1, t * 1.6) * (.96 + hr(i, 300 + k) * .08));
    const effort = hr(i, 320 + k) < .55 ? ` @${pickOf([7, 7.5, 8, 8, 8.5, 9], i, 330 + k)}` : '';
    if (name === 'dips') return `${name} ${sets}x${reps}${effort}`;
    if (name === 'pull-ups') return load >= 2.5 ? `${name} ${sets}x${reps} +${load}kg${effort}` : `${name} ${sets}x${reps}${effort}`;
    // Now and then a lift is written set by set, climbing to the top set
    if (hr(i, 340 + k) < .18) return `${name} ${to25(load * .8)}x${reps + 2}, ${to25(load * .9)}x${reps}, ${load}x${Math.max(1, reps - 2)}`;
    return `${name} ${sets}x${reps} ${load}kg${effort}`;
  }

  function cardioLine(t, i) {
    const fit = 1 - .12 * Math.min(1, t * 1.3);
    const kind = Math.floor(hr(i, 400) * 7);
    if (kind === 0 || kind === 1) {
      const km = pickOf([5, 6, 8, 8, 10], i, 401), pace = 345 * fit * (.97 + hr(i, 402) * .06);
      const sec = Math.round(km * pace), mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
      return `easy run ${km}km ${mm}:${ss} ${Math.round(146 - 6 * t + hr(i, 403) * 6)}bpm ${Math.round(km * 68)}kcal`;
    }
    if (kind === 2) {
      const sec = Math.round(5 * 290 * fit), mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
      return `tempo run 5km ${mm}:${ss} ${Math.round(168 - 4 * t)}bpm 360kcal`;
    }
    if (kind === 3) return `track intervals ${pickOf([5, 6, 8], i, 404)}x800m`;
    if (kind === 4) {
      const km = pickOf([30, 42, 55], i, 405), sec = Math.round(km / (26 + 4 * t) * 3600);
      const h = Math.floor(sec / 3600), m = String(Math.floor(sec % 3600 / 60)).padStart(2, '0'), s = String(sec % 60).padStart(2, '0');
      return `cycling ${km}km ${h}:${m}:${s} ${Math.round(km * 22)}kcal`;
    }
    if (kind === 5) {
      const sec = Math.round(5000 / 1000 * 270 * fit), mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
      return `indoor rowing 5000m ${mm}:${ss} 320kcal`;
    }
    return pickOf(['incline walk 30min 220kcal', 'stair climber 20min 180kcal', 'incline walk 40min 290kcal'], i, 406);
  }

  const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // joined and today are local dates; nowMin is minutes after midnight, so today only has what has happened yet
  function generate(joined, today, nowMin) {
    const out = [], stated = new Set();
    const days = Math.round((today - joined) / 864e5);
    let sessions = 0;
    for (let i = 0; i <= days; i++) {
      const d = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate() + i), date = isoOf(d), t = i / Math.max(1, days);
      const isToday = i === days, back = days - i, dow = d.getDay();
      let k = 0;
      const push = (time, mode, text) => { if (!isToday || time <= nowMin) out.push({ id: `s${date}-${String(k++).padStart(2, '0')}`, date, time, mode, text }); };

      // Morning: weight, how the night went, and every second week a tape measure
      if (hr(i, 1) < .82) push(7 * 60, 'food', `weight ${r1(86.4 - 8.8 * t + .7 * Math.cos(2 * Math.PI * (i - 6) / 365) + .4 * Math.sin(i / 41) + (hr(i, 2) - .5) * .5)}kg`);
      if (i % 14 === 3) push(7 * 60 + 2, 'food', `waist ${r1(95.5 - 9 * t + (hr(i, 3) - .5))}cm, neck ${r1(39.5 - .8 * t)}cm`);
      if (hr(i, 4) < .85) push(7 * 60 + 4, 'food', `sleep ${1 + Math.min(4, Math.floor(hr(i, 5) * 3.2 + (dow === 0 || dow === 6 ? 1.6 : 1)))}/5, energy ${1 + Math.min(4, Math.floor(hr(i, 6) * 3.4 + .9))}/5`);

      // Meals
      MEALS.forEach((meal, m) => {
        const lines = pickOf(meal.options, i, 10 + m).map(([name, amount, lead], q) => {
          const amt = typeof amount === 'number' ? `${to10(amount * (.85 + hr(i, 20 + m * 4 + q) * .3))}g` : amount;
          const text = lead ? `${amt} ${name}` : `${name} ${amt}`;
          if (stated.has(name)) return text;
          stated.add(name);
          return `${text} ${LABELS[name]}`;
        });
        push(meal.t + Math.floor(hr(i, 30 + m) * 40), 'food', lines.join(', '));
      });

      // Water through the day
      [9 * 60, 11 * 60 + 30, 14 * 60, 17 * 60, 20 * 60 + 15].forEach((time, w) => {
        if (hr(i, 50 + w) < .78) push(time + Math.floor(hr(i, 55 + w) * 25), 'food', `water ${hr(i, 60 + w) < .7 ? 500 : 250}ml`);
      });

      // Training: more often as the habit sets in, every day of the last fortnight but one
      const p = Math.min(.72, .32 + t * 7.7 * .06) - (dow === 0 ? .12 : 0);
      let trained = hr(i, 70) < p;
      if (back >= 1 && back <= 12) trained = true;
      if (back === 13) trained = false;
      if (trained) {
        const n = hr(i, 71) < .12 ? 2 : 1;
        for (let s = 0; s < n; s++) {
          const time = s === 0 && hr(i, 72) < .4 ? 6 * 60 + 10 + Math.floor(hr(i, 73) * 40) : 17 * 60 + 30 + s * 70 + Math.floor(hr(i, 74 + s) * 50);
          if (hr(i, 80 + s) < .3) push(time, 'cardio', cardioLine(t, i * 3 + s));
          else {
            const day = SPLIT[sessions++ % SPLIT.length], count = hr(i, 90 + s) < .5 ? 3 : 4;
            push(time, 'strength', day.slice(0, count).map((ex, e) => liftLine(ex, t, i * 3 + s, e)).join(', '));
          }
        }
      }

      // Evening: the day's steps and mood
      const steps = Math.round(Math.min(21000, Math.max(1800, (7000 + 1600 * t) * (dow === 6 ? 1.2 : dow === 0 ? .8 : 1) * (.7 + hr(i, 100) * .6) + (trained ? 1700 : 0))) / 100) * 100;
      if (isToday) { if (nowMin > 9 * 60) push(nowMin - 1, 'cardio', `steps ${Math.round(steps * Math.min(1, (nowMin - 390) / 930) / 100) * 100}`); }
      else push(21 * 60 + 30, 'cardio', `steps ${steps}`);
      if (hr(i, 110) < .7) push(21 * 60 + 40, 'food', `mood ${1 + Math.min(4, Math.floor(hr(i, 111) * 3.3 + 1))}/5`);
    }
    return out;
  }

  return { generate };
});
