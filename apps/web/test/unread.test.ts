import { describe, expect, test } from 'vitest';
import { preview, type Mode } from '@logout/engine';
import { strip, unreadLines } from '#lib/sync/unread.ts';

const read = (text: string, mode: Mode) => unreadLines(preview(null, text, mode).res, mode);

describe('lines that fail to read', () => {
  test('names and notes never leave the device', () => {
    const [r] = preview(null, 'grandma lasagna 2 3 extra cheesy', 'food').res;
    expect(strip(r!)).toBe('‹name› 2 3 ‹note›');
  });

  test('what counts as unread', () => {
    // A second count is unreadable
    expect(read('eggs 2 3', 'food').map(x => [x.reason, x.line])).toEqual([['bad', '‹name› 2 3']]);
    // A lift with nothing to count
    expect(read('bench heavy today', 'strength').map(x => x.reason)).toEqual(['needs']);
    // A line of values with no name
    expect(read('3x8 60kg', 'strength').map(x => x.reason)).toEqual(['noname']);
  });

  test('a food without values yet, and lines that read, are not reported', () => {
    expect(read('chicken 200g', 'food')).toEqual([]);
    expect(read('bench 3x8 60kg, run 5km', 'strength').map(x => x.kind)).toEqual(['strength']);
    expect(read('steps 8000', 'cardio')).toEqual([]);
  });
});
