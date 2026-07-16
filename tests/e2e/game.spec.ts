import { expect, test } from '@playwright/test';

test('полный ускоренный матч: башня, способность, улучшение, следующая волна и победа', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/?test=1');
  await expect(page.getByRole('button', { name: 'НАЧАТЬ ИГРУ' })).toBeVisible();
  await page.getByRole('button', { name: 'НАЧАТЬ ИГРУ' }).click();

  await page.locator('[data-tower="archer"]').click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');
  const clickWorld = async (x: number, y: number) => page.mouse.click(box.x + box.width * (x / 1200), box.y + box.height * (y / 700));
  await clickWorld(360, 250);
  await expect(page.locator('#tower-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: /Начать досрочно/ })).toBeInViewport();

  for (const [type, x, y, name] of [
    ['frost', 570, 240, 'Ледяная башня'],
    ['siege', 650, 450, 'Осадная башня'],
    ['boost', 930, 420, 'Башня усиления'],
  ] as const) {
    await page.locator(`[data-tower="${type}"]`).click();
    await clickWorld(x, y);
    await expect(page.locator('#tower-name')).toHaveText(name);
  }

  await page.locator('#pause').click();
  await expect(page.locator('#pause-label')).toBeVisible();
  await page.locator('#speed').click();
  await expect(page.locator('#speed')).toHaveText('×2');
  await page.locator('#pause').click();
  await expect(page.locator('#pause-label')).toBeHidden();

  await page.getByRole('button', { name: /Начать досрочно/ }).click();
  await page.locator('[data-ability="e"]').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.abilities.e.cooldown ?? 0)).toBeGreaterThan(0);

  await page.getByRole('button', { name: /Улучшить/ }).click();
  await expect(page.locator('#tower-level')).toHaveText('2');

  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().wave ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.__TD_TEST__?.skipToBoss());

  await expect(page.locator('#boss-bar')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#end-screen')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#end-title')).toHaveText('Разлом запечатан');
  await expect(page.locator('#wave')).toHaveText('10');
  expect(consoleErrors).toEqual([]);
});

test('Кристалл можно потерять и начать заново', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await page.evaluate(() => window.__TD_TEST__?.defeat());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-title')).toHaveText('Долина пала');
  await expect(page.locator('#restart')).toBeVisible();
});
