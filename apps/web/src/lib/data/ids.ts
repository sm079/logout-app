/* Ids for new rows: UUID v7, so ids made later sort later (as entries logged at the same minute should) */

let lastMs = 0;
let counter = 0;

const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

export function uuidv7(now: number = Date.now()): string {
  // Within one millisecond a counter keeps ids in the order they were made
  if (now <= lastMs) {
    now = lastMs;
    counter++;
  } else {
    lastMs = now;
    counter = 0;
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  // 12 bits after the version: the counter, so ids within a millisecond still sort
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  b[8] = 0x80 | (b[8]! & 0x3f);
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
