/* The app's main flows in a real browser: the first-run setup in each of its flows, logging, editing and deleting,
   values stated once, the log on a phone, the demo, the landing page's phone, and opening with no network. */
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
  await expect(page.getByRole('dialog', { name: 'Set up LogOut' })).toBeVisible();
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

test.describe('the first-run setup', () => {
  // Units are guessed from the time zone; London starts in kilograms and kilometres
  test.use({ timezoneId: 'Europe/London' });
  const unitButton = (page: Page) => page.getByRole('button', { name: /^A number on its own is in/ });

  test('First line: LogOut types a line and reads it, then the person picks units and the sample', async ({ page }) => {
    await page.goto('/app');
    const setup = page.getByRole('dialog', { name: 'Set up LogOut' });
    // Its own line, read piece by piece
    await expect(setup.locator('.fl-chip').filter({ hasText: 'Sets × reps' })).toBeVisible({ timeout: 10000 });
    // Theirs, read the same way; LOG here keeps nothing
    const field = setup.getByLabel("What you did, as you'd say it");
    await field.fill('squat 5x5 100kg');
    await expect(setup.locator('.mirror .ro')).toHaveText('2,500 kg');
    await setup.getByRole('button', { name: /^Log it/ }).click();
    await expect(setup.getByText('Today so far')).toBeVisible();
    await setup.getByRole('radiogroup', { name: 'Weight in' }).getByRole('radio', { name: 'lb' }).click();
    await expect(setup.locator('.fl-unit-line').first()).toContainText('2,500 lb');
    await setup.getByRole('radio', { name: /Sample history/ }).click();
    await setup.getByRole('button', { name: 'Start' }).click();
    await expect(setup).toBeHidden();
    await expect(unitButton(page)).toHaveAccessibleName(/in lb/);
    await page.getByRole('button', { name: 'Profile and settings' }).click();
    await expect(page.getByRole('dialog')).toContainText('sample history on');
  });

  test('Tune: each answer has a control of its own', async ({ page }) => {
    await page.goto('/app?onboard=tune');
    const setup = page.getByRole('dialog', { name: 'Set up LogOut' });
    const next = () => setup.locator('.ob-cta .log').click();
    await next();
    await setup.getByRole('radiogroup', { name: 'Distance in' }).getByRole('radio', { name: 'mi' }).click();
    await next();
    await setup.getByRole('radio', { name: 'Female', exact: true }).click();
    const ruler = setup.getByRole('slider', { name: 'Height' });
    await ruler.focus();
    await ruler.press('ArrowRight');
    await expect(ruler).toHaveAttribute('aria-valuetext', /centimetres/);
    await next();
    const dial = setup.getByRole('slider', { name: 'Calories a day' });
    await dial.focus();
    await dial.press('PageDown');
    await expect(dial).toHaveAttribute('aria-valuenow', '2350');
    await next();
    await setup.getByRole('button', { name: 'Start' }).click();
    await expect(setup).toBeHidden();
    await page.getByRole('button', { name: 'Cardio', exact: true }).click();
    await expect(unitButton(page)).toHaveAccessibleName(/in mi/);
  });

  test('Script: answers are typed, and read as they are typed', async ({ page }) => {
    await page.goto('/app?onboard=script');
    const setup = page.getByRole('dialog', { name: 'Set up LogOut' });
    const field = setup.getByLabel('Your answer');
    const say = async (text: string) => {
      await field.fill(text);
      await field.press('Enter');
    };
    await say('lb and miles');
    await expect(setup.locator('.sc-me').last()).toContainText('lb · mi');
    await say('banana');
    await expect(setup.locator('.sc-me').last()).toContainText('not read');
    await say('male 5ft 11in');
    await say('keep defaults');
    await say('empty');
    await setup.getByRole('button', { name: 'Start' }).click();
    await expect(setup).toBeHidden();
    await expect(unitButton(page)).toHaveAccessibleName(/in lb/);
  });
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

test("the landing page's phone types on its own, then reads what a visitor types", async ({ page }) => {
  await page.goto('/');
  const phone = page.locator('.s-phone');
  // Its own first line, read as it's typed
  await expect(phone.locator('.mirror .ro')).toHaveText('2,500 kg', { timeout: 10000 });
  const field = page.getByLabel('Type a line to see how LogOut reads it');
  await field.click();
  await expect(field).toHaveValue('');
  await field.fill('bench press 3x8 60kg');
  await expect(phone.locator('.mirror .ro')).toHaveText('1,440 kg');
  await expect(phone.locator('.log-sum')).toHaveText('3 sets · 1.4 t');
  // LOG keeps nothing: the field just clears
  await phone.getByRole('button', { name: /^Log it/ }).click();
  await expect(field).toHaveValue('');
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
