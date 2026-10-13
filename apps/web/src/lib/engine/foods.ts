/* The food tables' data, loaded the first time it's asked for. It's a chunk of its own, so pages that never read a log
   (the landing page) never load it. The page loads it and hands it to the book's worker. */
import type { FoodData } from '@logout/engine';

let loading: Promise<FoodData> | null = null;
export const loadFoodData = (): Promise<FoodData> =>
  (loading ??= import('@logout/engine/foods.json').then(m => m.default as unknown as FoodData));
