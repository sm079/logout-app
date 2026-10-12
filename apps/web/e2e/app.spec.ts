/* The app's main flows in a real browser: first run, logging, editing and deleting, values stated once, the log on a
   phone, the demo, the landing page's composer, and opening with no network. */
import { expect, test, type Page } from '@playwright/test';

/** Opens the app fresh and skips the first-run setup */
async function start(page: Page) {
  await page.goto('/app');
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}
async function log(page: Page, text: string) {
  const field = page.getByLabel("What you did, as you'd say it");
  await field.fill(text);
  await page.locator('.actions button.log').click();
  await expect(field).toHaveValue('', { timeout: 5000 });
}
/** On a phone the log opens over the widgets; on a wide screen it's always there */
async function showLog(page: Page) {
  const toggle = page.getByRole('button', { name: 'Show your logs' });
  if (await toggle.isVisible()) await toggle.click();
}
const rows = (page: Page) => page.locator('.lentry[data-id]');

test('first run, then a lift logged, edited and deleted', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Set up Logout' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('In Strength, type').first()).toBeVisible();

  // Read as it's typed: the result sits at the line's end and LOG shows the total
  await page.getByLabel("What you did, as you'd say it").fill('bench press 3x8 60kg @8');
  await expect(page.locator('.mirror .ro')).toHaveText('1,440 kg');
  await expect(page.locator('.actions button.log')).toHaveAccessibleName(/3 sets · 1\.4 t/);
  await page.locator('.actions button.log').click();

  await showLog(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('.lmeta')).toContainText('3 sets');

  // Edit: the numbers follow the new text
  await rows(page)
    .first()
    .getByRole('button', { name: /Edit this/ })
    .click();
  const edit = rows(page).first().locator('textarea');
  await edit.fill('bench press 5x5 80kg');
  await edit.press('Enter');
  await expect(rows(page).first().locator('.lmeta')).toContainText('5 sets');

  // Delete takes two taps
  await rows(page)
    .first()
    .getByRole('button', { name: /Edit this/ })
    .click();
  await rows(page)
    .first()
    .getByRole('button', { name: /Delete this/ })
    .click();
  await rows(page).first().getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(page.locator('.lnone')).toContainText('Nothing logged yet');
});

test("a food's values, stated once, read every later line of it", async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Food', exact: true }).click();
  await log(page, 'oats 100g 380kcal 13p 67c 7f');
  await log(page, 'oats 50g');
  await showLog(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(1).locator('.lmeta')).toContainText('190 kcal');
  // The day so far counts both
  await expect(page.getByRole('group', { name: 'Today so far' })).toContainText('2,030 left');
});

test('the demo opens on years of sample history', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.getByRole('note')).toContainText("You're in the demo");
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('radio', { name: 'Years' }).click();
  await expect(page.getByRole('button', { name: /^2019, \d+ sessions$/ })).toBeVisible();
});

test("the landing page's composer reads what a visitor types", async ({ page }) => {
  await page.goto('/');
  const field = page.getByLabel('Type a line to see how Logout reads it');
  await field.fill('squat 5x5 100kg');
  await expect(page.locator('.s-try .mirror .ro')).toHaveText('2,500 kg');
  await expect(page.locator('.s-total')).toContainText('5 sets');
});

test('the app opens with no network once it has been loaded', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service worker check runs in Chrome');
  await start(page);
  await log(page, 'squat 3x5 100kg');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('.cal')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.cal')).toBeVisible();
  await showLog(page);
  await expect(rows(page).first()).toContainText('squat');
  await context.setOffline(false);
});
