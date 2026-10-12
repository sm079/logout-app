// Removes source maps from the built site once the build has uploaded them to Sentry: node scripts/strip-maps.js
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const maps = readdirSync('build', { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.map'));
for (const f of maps) rmSync(join('build', f));
if (maps.length) console.log(`Removed ${maps.length} source maps from build/`);
