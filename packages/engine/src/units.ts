/* Units: every spelling a line can use, the kind of amount each measures, and its size in the base unit
   (grams, millilitres, one counted thing, metres, seconds). */

export type Dim = 'mass' | 'volume' | 'piece' | 'scoop' | 'slice' | 'serving' | 'length' | 'time';

export type UnitName =
  | 'mg'
  | 'g'
  | 'oz'
  | 'kg'
  | 'lb'
  | 'ml'
  | 'l'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'piece'
  | 'scoop'
  | 'slice'
  | 'serving'
  | 'mm'
  | 'cm'
  | 'in'
  | 'ft'
  | 'm'
  | 'yd'
  | 'km'
  | 'mi'
  | 's'
  | 'min'
  | 'h';

export interface Unit {
  name: UnitName;
  dim: Dim;
  /** Size in the dimension's base unit */
  f: number;
}

/** Which unit a bare load or distance is read in, as the composer's toggles say */
export interface Units {
  load: 'kg' | 'lb';
  dist: 'km' | 'mi';
}

export const DEFAULT_UNITS: Readonly<Units> = Object.freeze({ load: 'kg', dist: 'km' });

const TABLE: [UnitName, Dim, number, string?][] = [
  ['mg', 'mass', 0.001],
  ['g', 'mass', 1, 'gm gms gr gram grams'],
  ['oz', 'mass', 28.3495, 'ounce ounces'],
  ['kg', 'mass', 1000, 'kgs kilo kilos kilogram kilograms'],
  ['lb', 'mass', 453.592, 'lbs pound pounds'],
  ['ml', 'volume', 1, 'mls milliliter milliliters millilitre millilitres'],
  ['l', 'volume', 1000, 'liter liters litre litres'],
  ['tsp', 'volume', 5, 'teaspoon teaspoons tsps'],
  ['tbsp', 'volume', 15, 'tablespoon tablespoons tbs tbsps'],
  ['cup', 'volume', 240, 'cups'],
  // Counted units are each their own kind of amount: a scoop is not a slice
  ['piece', 'piece', 1, 'pc pcs pieces'],
  ['scoop', 'scoop', 1, 'scoops'],
  ['slice', 'slice', 1, 'slices'],
  ['serving', 'serving', 1, 'servings srv'],
  ['mm', 'length', 0.001],
  ['cm', 'length', 0.01, 'cms centimeter centimeters centimetre centimetres'],
  ['in', 'length', 0.0254, 'inch inches'],
  ['ft', 'length', 0.3048, 'foot feet'],
  ['m', 'length', 1, 'meter meters metre metres'],
  ['yd', 'length', 0.9144, 'yard yards'],
  ['km', 'length', 1000, 'kms kilometer kilometers kilometre kilometres'],
  ['mi', 'length', 1609.344, 'mile miles'],
  ['s', 'time', 1, 'sec secs second seconds'],
  ['min', 'time', 60, 'mins minute minutes'],
  ['h', 'time', 3600, 'hr hrs hour hours']
];

export const UNITS = {} as Record<UnitName, Unit>;
/** Every spelling, lower-case, to the unit it names */
export const SPELL = new Map<string, UnitName>();
for (const [name, dim, f, more = ''] of TABLE) {
  UNITS[name] = { name, dim, f };
  for (const s of [name, ...more.split(' ').filter(Boolean)]) SPELL.set(s, name);
}

export const unitOf = (w: string | undefined): UnitName | undefined => (w ? SPELL.get(w.toLowerCase()) : undefined);
