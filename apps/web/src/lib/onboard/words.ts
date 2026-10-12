/* Setup values as the setup says them */

/** A height in centimetres or in feet and inches; null while there's none */
export function heightText(cm: number | null, imperial: boolean): string | null {
  if (cm == null) return null;
  if (!imperial) return `${Math.round(cm)} cm`;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

/** Litres, as few digits as it needs: 3 L, 2.5 L, 2.25 L */
export const litres = (l: number): string => `${+l.toFixed(2)} L`;
