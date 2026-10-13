/* Which mode a draft is written in, so the composer can follow what's typed. Each line counts for the modes whose
   own values it has (`3x8` for a lift, `8km` for a run, `30p` for a meal), the name it was logged under before, and a
   word that names a lift, an activity or a food. Water counts for food; check-ins and measurements count for none. */
import { resolveName } from './aliases';
import { claims, readLine, segments } from './read';
import type { Book, Mode, Token } from './types';
import { DEFAULT_UNITS, type Units } from './units';

// A tie goes to the earlier mode
const ORDER: Mode[] = ['food', 'strength', 'cardio'];
const KNOWN = 4,
  NAMED = 3,
  WATER = 1;

/** What a value says about its line. A load or a duration says less, since two modes read one */
function weight(t: Token): number {
  switch (t.role) {
    case 'macro':
      return t.k === 'kcal' ? 2 : 3;
    case 'amount':
      return t.amount!.unit === 'kg' || t.amount!.unit === 'lb' ? 1 : 3;
    case 'load':
      return t.added || t.bw ? 3 : 2;
    // Seconds are a hold; minutes are a session
    case 'hold':
      return t.hold! <= 300 ? 2 : 1;
    case 'duration':
      return t.sec! >= 300 ? 2 : 1;
    case 'kcal':
      return 1;
    case 'basis':
    case 'sets':
    case 'effort':
    case 'steps':
    case 'interval':
    case 'pace':
    case 'hr':
    case 'distance':
      return 3;
    default:
      return 0;
  }
}

// Words that name what a line is, before it has any values
export const WORDS: Record<Mode, ReadonlySet<string>> = {
  food: new Set(
    (
      'egg oat oatmeal porridge rice chicken beef steak pork lamb turkey ham bacon sausage mince fish salmon tuna cod ' +
      'shrimp prawn tofu paneer tempeh bread toast sourdough bagel croissant pasta spaghetti noodle pizza burger ' +
      'sandwich wrap salad soup curry chilli chili sushi ramen taco burrito kebab yogurt yoghurt skyr kefir quark milk ' +
      'cheese parmesan butter cream icecream banana apple orange berry blueberry strawberry grape mango kiwi pear ' +
      'peach avocado guacamole potato fries chips crisps bean lentil chickpea dal hummus edamame quinoa couscous nut ' +
      'almond peanut cashew walnut granola cereal muesli shake smoothie whey protein coffee latte cappuccino espresso ' +
      'americano flatwhite tea juice beer wine soda cola coke chocolate cookie biscuit cake muffin donut pancake ' +
      'waffle omelette omelet honey jam sugar popcorn cracker tortilla roti naan chapati dosa idli paratha biryani ' +
      'broccoli carrot spinach asparagus veg vegetable veggie fruit breakfast brunch lunch dinner snack meal'
    ).split(' ')
  ),
  strength: new Set(
    (
      'bench squat deadlift press ohp curl pullup chinup pushup situp muscleup lunge plank raise fly flye extension ' +
      'pulldown pushdown pullover shrug thrust rdl clean snatch jerk crunch rollout kettlebell dumbbell barbell cable ' +
      'skullcrusher hyperextension bridge swing farmer carry deadhang tricep bicep calf glute hamstring quad lat pec delt'
    ).split(' ')
  ),
  cardio: new Set(
    (
      'run running jog jogging walk walking hike hiking cycle cycling bike biking ride spin spinning peloton swim ' +
      'swimming rowing erg elliptical treadmill stairmaster stair climber climb climbing bouldering sprint interval ' +
      'tempo fartlek cardio hiit skipping jumprope ski skiing skate skating soccer football basketball tennis padel ' +
      'badminton volleyball golf yoga pilates dance dancing zumba boxing kickboxing marathon parkrun trail track'
    ).split(' ')
  )
};

// A word as written and as it would be listed: `squats`, `berries`, `pull-ups` (with the word before it)
function forms(w: string): string[] {
  const out = [w];
  if (w.endsWith('ies')) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.endsWith('s')) out.push(w.slice(0, -1));
  return out;
}
function named(key: string, words: ReadonlySet<string>): boolean {
  const ws = key.split(/[^\p{L}]+/u).filter(Boolean);
  return ws.some((w, i) => forms(w).some(f => words.has(f)) || (i > 0 && forms(ws[i - 1] + w).some(f => words.has(f))));
}

/** How strongly one line reads as a mode */
function lineScore(book: Pick<Book, 'cards' | 'aliases'> | null, text: string, mode: Mode, units: Units): number {
  let n = 0;
  for (const t of claims(text, mode)) n += weight(t);
  const key = readLine(text, mode, units).key;
  if (key) {
    const known = book && book.cards.has(`${mode}:${resolveName(mode, key, book.aliases).key}`);
    n += known ? KNOWN : named(key, WORDS[mode]) ? NAMED : 0;
  }
  return n;
}

/** The mode a draft reads as, or null when nothing in it says */
export function detect(book: Pick<Book, 'cards' | 'aliases'> | null, text: string, units: Units = DEFAULT_UNITS): Mode | null {
  const score: Record<Mode, number> = { food: 0, strength: 0, cardio: 0 };
  for (const seg of segments(text)) {
    // Water, check-ins and measurements read the same in every mode
    const kind = readLine(seg.text, 'food', units).kind;
    if (kind === 'water') score.food += WATER;
    if (kind !== 'food') continue;
    for (const m of ORDER) score[m] += lineScore(book, seg.text, m, units);
  }
  let best: Mode | null = null;
  for (const m of ORDER) if (score[m] > (best ? score[best] : 0)) best = m;
  return best;
}
