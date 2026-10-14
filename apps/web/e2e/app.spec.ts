/* The app's main flows in a real browser: the first-run setup, logging, editing and deleting, values stated once,
   the log on a phone, every widget at once on a wide screen, the profile, the demo, the landing page's phone, the site's
   pages, and opening with no network. */
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

test('the switch follows what is typed, unless a mode is picked', async ({ page }) => {
  await start(page);
  const field = page.getByLabel("What you did, as you'd say it");
  const on = (name: string) => expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await on('Food');
  await field.fill('squat 5x5 100kg');
  await on('Strength');
  await field.fill('easy run 5km');
  await on('Cardio');
  // Water is food; a check-in leaves the switch where it rests
  await field.fill('water 500ml');
  await on('Food');
  await field.fill('easy run 5km');
  await on('Cardio');
  await field.fill('sleep 4/5');
  await on('Food');
  // A picked mode holds whatever is typed, until LOG
  await page.getByRole('button', { name: 'Strength', exact: true }).click();
  await field.fill('rowing 2000m');
  await on('Strength');
  await page.locator('.actions button.log').click();
  await expect(field).toHaveValue('', { timeout: 5000 });
  await on('Food');
  await showLog(page);
  await expect(rows(page).first()).toContainText('rowing');
  await field.fill('rowing 2000m');
  await on('Cardio');
});

test.describe('the first-run setup', () => {
  // Units are guessed from the time zone; London starts in kilograms and kilometres
  test.use({ timezoneId: 'Europe/London' });

  test('one question a screen, each with a control of its own, then the app', async ({ page }) => {
    await page.goto('/app');
    const setup = page.getByRole('dialog', { name: 'Set up LogOut' });
    const next = () => setup.locator('.ob-cta .log').click();
    await next();
    await expect(setup.getByRole('radiogroup', { name: 'Weight in' }).getByRole('radio', { name: 'kg' })).toBeChecked();
    await setup.getByRole('radiogroup', { name: 'Distance in' }).getByRole('radio', { name: 'mi' }).click();
    await next();
    // The ruler shows a height from the start; picking a sex glides it to that sex's average
    const ruler = setup.getByRole('slider', { name: 'Height' });
    await expect(ruler).toHaveAttribute('aria-valuetext', '170 centimetres');
    await setup.getByRole('radio', { name: 'Female', exact: true }).click();
    await expect(ruler).toHaveAttribute('aria-valuetext', '163 centimetres');
    await ruler.focus();
    await ruler.press('ArrowRight');
    await expect(setup.locator('.ob-cta .log')).toHaveAccessibleName(/Female · 164 cm/);
    await next();
    const dial = setup.getByRole('slider', { name: 'Calories a day' });
    await dial.focus();
    await dial.press('PageDown');
    await expect(dial).toHaveAttribute('aria-valuenow', '2350');
    // Targets are the last question
    await setup.getByRole('button', { name: 'Start' }).click();
    await expect(setup).toBeHidden();
    await page.getByRole('button', { name: 'Cardio', exact: true }).click();
    await expect(page.getByRole('button', { name: /^A number on its own is in/ })).toHaveAccessibleName(/in mi/);
    await page.getByRole('button', { name: 'Profile and settings' }).click();
    const profile = page.getByRole('dialog');
    await expect(profile.getByRole('switch', { name: /Sample history/ })).toHaveCount(0);
    await expect(profile.getByRole('radio', { name: 'Female', exact: true })).toBeChecked();
    await expect(profile.getByRole('slider', { name: 'Height' })).toHaveAttribute('aria-valuetext', '164 centimetres');
  });
});

test.describe('the profile', () => {
  test.use({ timezoneId: 'Europe/London' });

  test('the log so far, then settings that say what SAVE will take', async ({ page }) => {
    await start(page);
    await log(page, 'squat 5x5 100kg');
    await page.getByRole('button', { name: 'Profile and settings' }).click();
    const profile = page.getByRole('dialog');
    const hero = profile.getByRole('region', { name: 'Your log so far' });
    await expect(hero).toContainText('2.5 t');
    await expect(hero.locator('.pf-run')).toContainText('1');
    const ok = profile.locator('.su-actions .log');
    await expect(ok).toHaveAccessibleName('Done');
    // Which LogOut this is sits at the foot
    await expect(profile.locator('.pf-about')).toContainText(/LogOut\s*v\d+\.\d+\.\d+/);
    // A unit converts the log so far on the spot; nothing is kept until SAVE
    await profile.getByRole('radiogroup', { name: 'Weight in' }).getByRole('radio', { name: 'lb' }).click();
    await expect(hero).toContainText('5.5k lb');
    await profile.getByRole('button', { name: 'More protein' }).click();
    await expect(ok).toHaveAccessibleName('Save: lb · 185 g protein');
    await ok.click();
    await expect(profile).toBeHidden();
    await page.getByRole('button', { name: 'Profile and settings' }).click();
    await expect(profile.getByRole('radiogroup', { name: 'Weight in' }).getByRole('radio', { name: 'lb' })).toBeChecked();
    await expect(profile.getByRole('group', { name: 'Protein 185 g' })).toBeVisible();
    await expect(ok).toHaveAccessibleName('Done');
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

test('a food the tables know reads without values; a vague name suggests their entries', async ({ page }) => {
  await start(page);
  const field = page.getByLabel("What you did, as you'd say it");
  // A name that points to one entry reads from it, marked as the table's
  await field.fill('banana 120g');
  await expect(page.locator('.mirror .ro')).toHaveText('≈107 kcal');
  await field.fill('banana');
  await expect(page.locator('.mirror .ro')).toHaveText('add an amount, 100g');

  // One that many share lists them; taking one writes its short name, which reads as that entry
  await field.fill('chicken breast');
  const pop = page.getByRole('listbox', { name: 'Suggestions' });
  await expect(page.locator('.pop-head')).toContainText('Suggestions');
  await expect(pop.getByRole('option').first()).toContainText('kcal / 100 g');
  const name = (await pop.getByRole('option').first().locator('.opt-name').textContent())!.trim();
  await pop.getByRole('option').first().click();
  await expect(field).toHaveValue(name);
  await field.press('End');
  await field.pressSequentially(' 150g');
  await expect(page.locator('.mirror .ro')).toHaveText(/^≈\d+ kcal$/);
  await page.locator('.actions button.log').click();
  await expect(field).toHaveValue('', { timeout: 5000 });

  // Its sheet says which entry the values come from
  await showLog(page);
  await rows(page).first().locator('[data-item]').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('per 100 g');
  await expect(sheet).toContainText(/USDA: Chicken.*breast/i);
});

test('a wide screen shows the log on the left, then every widget at once under a one-row calendar', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'Wide screens only');
  await start(page);
  const widgets = page.locator('.widget');
  await expect(widgets).toHaveCount(7);
  for (const w of await widgets.all()) await expect(w).toBeInViewport({ ratio: 1 });
  const cal = (await page.locator('.cal').boundingBox())!;
  expect(cal.height).toBeLessThan(90);
  const dock = (await page.locator('.dock').boundingBox())!;
  expect(dock.x + dock.width).toBeLessThanOrEqual(cal.x);
  // Widgets with nothing to show are greyed out until something is logged for them
  await expect(page.locator('.widget.blank')).toHaveCount(7);
  await log(page, 'oats 100g 380kcal 13p 67c 7f');
  await expect(page.locator('.w-fuel')).not.toHaveClass(/blank/);
  await expect(page.locator('.widget.blank')).toHaveCount(6);
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
  await expect(phone.locator('.mirror .ro')).toHaveText('330 kcal', { timeout: 10000 });
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

test('the site: every footer link goes somewhere of its own, and the legal pages open', async ({ page }) => {
  await page.goto('/');
  const foot = page.getByRole('navigation', { name: 'Footer' });
  const hrefs = await foot.getByRole('link').evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  for (const id of ['how', 'install', 'faq']) await expect(page.locator(`#${id}`)).toBeVisible();
  await page.getByText('Does it use AI?').click();
  await expect(page.getByText('plain rules that run on your device')).toBeVisible();
  await foot.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Supabase');
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible();
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
