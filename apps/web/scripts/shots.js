/* Takes the landing page's screenshots, as WebP in static/shots, its link preview, static/og.png, and the README's
   phone screenshot, docs/phone.webp at the repository root. Run against a production build:

     pnpm build && pnpm preview --port 4173
     node scripts/shots.js [base URL]

   Uses Playwright's Chromium, or a Chrome of your own with CHROME_PATH set to its executable. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, devices } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const OUT = resolve(import.meta.dirname, '../static/shots');
const DOCS = resolve(import.meta.dirname, '../../../docs');
const PHONE = { ...devices['Pixel 7'], reducedMotion: 'reduce' };
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' };
const FIELD = "What you did, as you'd say it";

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
mkdirSync(OUT, { recursive: true });
mkdirSync(DOCS, { recursive: true });

/** The demo, settled, with its bar hidden */
async function demo(opts) {
  const page = await (await browser.newContext(opts)).newPage();
  await page.goto(`${BASE}/demo`);
  await page.getByRole('button', { name: 'Hide' }).click();
  await page.waitForTimeout(800);
  return page;
}
/** A screenshot of the part of an element that's on screen */
async function visible(page, selector) {
  const b = await page.locator(selector).first().boundingBox();
  const vp = page.viewportSize();
  const y = Math.max(0, b.y),
    h = Math.min(vp.height, b.y + b.height) - y;
  return page.screenshot({ clip: { x: b.x, y, width: b.width, height: h } });
}
/** The app as a new visitor finds it, setup skipped, once the food tables have loaded */
async function fresh(opts) {
  const page = await (await browser.newContext(opts)).newPage();
  await page.goto(`${BASE}/app`);
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(3000);
  return page;
}
async function type(page, mode, text) {
  await page.getByRole('button', { name: mode, exact: true }).click();
  await page.getByLabel(FIELD).fill(text);
  await page.waitForTimeout(800);
}
/** Saves a PNG screenshot as WebP, encoded by the browser itself */
async function save(page, png, name, dir = OUT) {
  const url = await page.evaluate(
    async src => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.9);
    },
    `data:image/png;base64,${png.toString('base64')}`
  );
  writeFileSync(`${dir}/${name}.webp`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${name}.webp`);
}

const shots = [
  async () => {
    // Foods the app knows without a history, and the suggestions for a name it has several of
    const page = await fresh(PHONE);
    const field = page.getByLabel(FIELD);
    await field.fill('oats 70g, banana 120g, ');
    await field.pressSequentially('paneer', { delay: 30 });
    await page.waitForTimeout(900);
    const top = (await page.locator('.mpop').boundingBox()).y - 12;
    const vp = page.viewportSize();
    await save(page, await page.screenshot({ clip: { x: 0, y: top, width: vp.width, height: vp.height - top } }), 'food');
  },
  async () => {
    const page = await demo(PHONE);
    await page.getByRole('button', { name: 'Show your logs' }).click();
    await page.waitForTimeout(800);
    await save(page, await page.locator('.lday:not(.earlier)').last().screenshot(), 'day');
  },
  async () => {
    const page = await demo(PHONE);
    for (const line of ['squat 5x5 100kg @8', 'bench press 4x8 70kg @8', 'pull-ups 4x8 +10kg']) {
      await type(page, 'Strength', line);
      await page.locator('.actions button.log').click();
      await page.waitForTimeout(600);
    }
    // The "logged" toast stays up until it's dismissed
    await page.addStyleTag({ content: '.toast { display: none !important; }' });
    await page.waitForTimeout(800);
    await save(page, await visible(page, '.wscroll'), 'training');
  },
  async () => {
    // The README's: the whole phone screen, two lifts logged and a third being typed
    const page = await demo(PHONE);
    for (const line of ['squat 5x5 100kg @8', 'bench press 4x8 70kg @8']) {
      await type(page, 'Strength', line);
      await page.locator('.actions button.log').click();
      await page.waitForTimeout(600);
    }
    await page.addStyleTag({ content: '.toast { display: none !important; }' });
    await type(page, 'Strength', 'pull-ups 4x8 +10kg @8');
    await page.waitForTimeout(400);
    await save(page, await page.screenshot(), 'phone', DOCS);
  },
  async () => {
    const page = await demo(DESK);
    await save(page, await page.screenshot(), 'board');
  },
  async () => {
    // The card a shared link shows: the top of the landing page, as PNG since not every site reads WebP
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' })).newPage();
    await page.goto(BASE);
    // A card, not a page: no links or buttons, and the phone moved up into view
    await page.addStyleTag({
      content: '.s-nav, .s-ctas, .s-quiet { display: none !important; } .s-stage { margin-top: -6px !important; }'
    });
    await page.waitForTimeout(2500);
    writeFileSync(resolve(OUT, '../og.png'), await page.screenshot());
    console.log('og.png');
  }
];
for (const [i, shot] of shots.entries()) {
  process.stdout.write(`${i + 1}/${shots.length} `);
  await shot();
}
await browser.close();
