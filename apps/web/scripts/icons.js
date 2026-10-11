// Renders the app icons from their SVG sources: node scripts/icons.js
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const out = [
  ['static/icon.svg', 'static/icon-192.png', 192],
  ['static/icon.svg', 'static/icon-512.png', 512],
  ['static/icon.svg', 'static/apple-touch-icon.png', 180],
  ['static/icon-maskable.svg', 'static/icon-maskable-512.png', 512]
];
for (const [src, dest, size] of out) {
  const png = new Resvg(readFileSync(src), { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(dest, png);
  console.log(`${dest} ${size}px`);
}
