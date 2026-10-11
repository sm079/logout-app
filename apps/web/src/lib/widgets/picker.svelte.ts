/* Which widget's metric picker is open. The picker sits over the whole screen, so it lives apart from the widgets. */
import type { MetricId } from '../logic/metrics.ts';

export type ChartType = 'line' | 'bars' | 'heat' | 'stat';

export interface PickerTarget {
  /** The widget */
  id: string;
  type: ChartType;
  metric: MetricId;
  chip: HTMLElement;
}

export const picker = $state<{ target: PickerTarget | null }>({ target: null });

export function togglePicker(t: PickerTarget): void {
  picker.target = picker.target?.id === t.id ? null : t;
}
export function closePicker(): void {
  picker.target = null;
}
