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

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__TD_TEST__))).toBe(true);
  const heroBefore = await page.evaluate(() => window.__TD_TEST__?.state().hero);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(250);
  await page.keyboard.up('KeyA');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.x ?? 9999)).toBeLessThan(heroBefore!.x);
  const zoomBefore = await page.evaluate(() => window.__TD_TEST__?.state().cameraZoom ?? 1);
  await page.locator('#zoom-in').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().cameraZoom ?? 1)).toBeGreaterThan(zoomBefore);
  await page.locator('#zoom-reset').click();
  await expect(page.locator('#zoom-reset')).toContainText('%');
  await page.screenshot({ path: 'test-results/landscape-v3.png', fullPage: true });
  await page.locator('[data-tower="archer"]').click();
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
  for (const [tier, name] of [[1, 'СТРАЖ БЕЗДНЫ'], [2, 'ТИТАН ОСКОЛКОВ'], [3, 'ВЛАДЫКА РАЗЛОМА']] as const) {
    await page.evaluate((bossTier) => window.__TD_TEST__?.skipToBoss(bossTier), tier);
    await expect(page.locator('#boss-bar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#boss-name')).toHaveText(name, { timeout: 10_000 });
  }

  await expect(page.locator('#end-screen')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#end-title')).toHaveText('Разлом запечатан');
  await expect(page.locator('#boss-name')).toHaveText('ВЛАДЫКА РАЗЛОМА');
  await expect(page.locator('#wave')).toHaveText('20');
  expect(consoleErrors).toEqual([]);
});

test('Кристалл можно потерять и начать заново', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__TD_TEST__))).toBe(true);
  await page.evaluate(() => window.__TD_TEST__?.defeat());
  await expect(page.locator('#end-screen')).toBeVisible();
  await expect(page.locator('#end-title')).toHaveText('Долина пала');
  await expect(page.locator('#restart')).toBeVisible();
});

test('режим Хранителя меняет стартовую экономику', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-difficulty="story"] .difficulty-rule')).toHaveCount(3);
  await expect(page.locator('[data-difficulty="story"]')).toContainText('Герой: +15% урона');
  await expect(page.locator('[data-difficulty="standard"]')).toContainText('12 секунд между волнами');
  await expect(page.locator('[data-difficulty="rift"]')).toContainText('Щиты боссов: +25% времени');
  await page.screenshot({ path: 'test-results/difficulty-rules.png', fullPage: true });
  await page.locator('[data-difficulty="story"]').click();
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#gold')).toHaveText('520');
  await expect(page.locator('#lives')).toHaveText('26');
  await expect(page.locator('#difficulty-badge')).toHaveText('ХРАНИТЕЛЬ');
  await expect(page.locator('#tutorial')).toBeVisible();
  await page.locator('#tutorial-skip').click();
  await page.locator('#settings').click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.locator('#high-contrast').check();
  await expect(page.locator('body')).toHaveClass(/high-contrast/);
  await page.locator('#close-settings').click();
  await expect(page.locator('#settings-dialog')).toBeHidden();
});

test('Повелитель бури ускоряет подготовку и снижает цену раннего старта', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-difficulty="rift"]').click();
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#gold')).toHaveText('360');
  await expect(page.locator('#lives')).toHaveText('14');
  await expect(page.locator('#difficulty-badge')).toHaveText('ПОВЕЛИТЕЛЬ БУРИ');
  await expect(page.locator('#countdown')).toHaveText(/00:0[7-9]/);
  await expect(page.locator('#start-wave')).toContainText(/\+◈ 1[0-4]/);
});

test('герой держит фокус, преследует цель и направляет рывок с WASD', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.locator('#zoom-out').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().cameraZoom ?? 2)).toBeLessThanOrEqual(1.01);

  await expect(page.locator('#hero-stance')).toContainText('ОХРАНА');
  await page.locator('#hero-stance').click();
  await expect(page.locator('#hero-stance')).toContainText('ПОГОНЯ');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.stance)).toBe('pursuit');

  await page.evaluate(() => window.__TD_TEST__?.spawnStress(1));
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.enemies()[0])).toBeTruthy();
  const enemy = await page.evaluate(() => window.__TD_TEST__!.enemies()[0]);
  const box = await canvas.boundingBox();
  if (!box || !enemy) throw new Error('Не удалось получить цель на карте');
  await page.mouse.click(box.x + box.width * (enemy.x / 1200), box.y + box.height * (enemy.y / 700), { button: 'right' });
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.focusTarget)).toBe('Налётчик');
  await expect(page.locator('#hero-focus')).toContainText('НАЛЁТЧИК');

  const pursuitStart = await page.evaluate(() => window.__TD_TEST__!.state().hero.x);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__!.state().hero.x), { timeout: 4_000 }).toBeLessThan(pursuitStart - 40);

  const dashStart = await page.evaluate(() => window.__TD_TEST__!.state().hero.x);
  await page.keyboard.down('KeyA');
  await page.keyboard.press('Shift');
  await page.keyboard.up('KeyA');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__!.state().hero.x)).toBeLessThan(dashStart - 150);

  const moveStart = await page.evaluate(() => window.__TD_TEST__!.state().hero.x);
  await page.mouse.click(box.x + box.width * (1050 / 1200), box.y + box.height * (600 / 700), { button: 'right' });
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.focusTarget)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__!.state().hero.x), { timeout: 3_000 }).toBeGreaterThan(moveStart + 40);

  await page.keyboard.press('KeyX');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.stance)).toBe('guard');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.command)).toBe('hold');
  await expect(page.locator('#hero-stance')).toContainText('ОХРАНА');

  const manaBeforeAim = await page.evaluate(() => window.__TD_TEST__!.state().hero.mana);
  await page.locator('[data-ability="r"]').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.aimAbility)).toBe('r');
  await expect(page.locator('[data-ability="r"]')).toHaveClass(/aiming/);
  await expect(page.locator('#hero-status')).toHaveText('выбор зоны');
  await page.screenshot({ path: 'test-results/hero-aim-preview.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.aimAbility)).toBeNull();
  expect(await page.evaluate(() => window.__TD_TEST__!.state().hero.mana)).toBeGreaterThanOrEqual(manaBeforeAim);
  expect(await page.evaluate(() => window.__TD_TEST__!.state().hero.abilities.r.cooldown)).toBe(0);

  await page.locator('[data-ability="r"]').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.aimAbility)).toBe('r');
  await page.mouse.click(box.x + box.width * (600 / 1200), box.y + box.height * (350 / 700));
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.aimAbility)).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.abilities.r.cooldown ?? 0)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/hero-tactics.png', fullPage: true });
});

test('тактический брифинг показывает состав, награду и статус волны', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('#wave-kicker')).toHaveText('СЛЕДУЮЩАЯ УГРОЗА');
  await expect(page.locator('#wave-roster .enemy-chip')).toHaveCount(1);
  await expect(page.locator('#wave-roster .enemy-chip')).toContainText('Налётчик');
  await expect(page.locator('#wave-roster .enemy-chip')).toContainText('×8');
  await expect(page.locator('#wave-size')).toHaveText('8 врагов');
  await expect(page.locator('#wave-reward')).toHaveText('Зачистка +◈ 35');
  await expect(page.locator('#start-wave')).toContainText(/\+◈ \d+/);

  await page.locator('[data-tower="archer"]').click();
  const canvasBox = await page.locator('canvas').boundingBox();
  if (!canvasBox) throw new Error('Canvas has no bounding box');
  await page.mouse.click(canvasBox.x + canvasBox.width * (360 / 1200), canvasBox.y + canvasBox.height * (250 / 700));
  await expect(page.locator('#tower-panel')).toBeVisible();
  const waveBox = await page.locator('.wave-card').boundingBox();
  const towerBox = await page.locator('#tower-panel').boundingBox();
  expect(waveBox && towerBox && waveBox.y + waveBox.height <= towerBox.y, 'брифинг перекрывает панель башни').toBe(true);

  await page.locator('#start-wave').click();
  await expect(page.locator('#wave-kicker')).toHaveText('ВОЛНА В БОЮ');
  await expect(page.locator('#start-wave')).toHaveText('Волна в бою');

  await page.evaluate(() => window.__TD_TEST__?.skipToBoss(3));
  await expect(page.locator('#wave-title')).toHaveText('Владыка Разлома');
  await expect(page.locator('#wave-roster .enemy-chip')).toHaveCount(4);
  await expect(page.locator('#wave-roster')).toContainText('Владыка Разлома×1');
  await expect(page.locator('#wave-size')).toHaveText('45 врагов');
  await expect(page.locator('#wave-reward')).toHaveText('Зачистка +◈ 320');
  await page.screenshot({ path: 'test-results/tactical-briefing.png', fullPage: true });
});

test('инспектор башни показывает характеристики и боевой вклад', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.locator('#zoom-out').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().cameraZoom ?? 2)).toBeLessThanOrEqual(1.01);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');
  const clickWorld = async (x: number, y: number) => page.mouse.click(box.x + box.width * (x / 1200), box.y + box.height * (y / 700));

  await page.locator('[data-tower="archer"]').click();
  await clickWorld(360, 250);
  await expect(page.locator('#tower-name')).toHaveText('Стрелковая башня');
  await expect(page.locator('#tower-power')).toHaveText('24');
  await expect(page.locator('#tower-rate')).toContainText('/с');
  await expect(page.locator('#tower-range')).toHaveText('150');

  await page.locator('#start-wave').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().selectedTower?.damageDealt ?? 0), { timeout: 12_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.locator('#tower-performance').getAttribute('data-value')), { timeout: 5_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.locator('#tower-kills').textContent()), { timeout: 5_000 }).toBeGreaterThan(0);

  await page.locator('[data-tower="boost"]').click();
  await clickWorld(440, 300);
  await expect(page.locator('#tower-name')).toHaveText('Башня усиления');
  await expect(page.locator('#tower-power')).toHaveText('+25%');
  await expect(page.locator('#tower-rate')).toHaveText('+12%');
  await expect(page.locator('#target-mode')).toHaveText('Пассивная аура');
  await expect(page.locator('#target-mode')).toBeDisabled();
  await expect(page.locator('#tower-performance-label')).toHaveText('В АУРЕ');
  await expect(page.locator('#tower-performance')).toHaveText('1');
  await page.screenshot({ path: 'test-results/tower-inspector.png', fullPage: true });

  await clickWorld(360, 250);
  await expect(page.locator('#tower-name')).toHaveText('Стрелковая башня');
  await expect(page.locator('#tower-power')).toHaveText('30');
  await expect(page.locator('#tower-boosted')).toBeVisible();
});

test('профиль держит 100 активных противников без утечки объектов', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__TD_TEST__))).toBe(true);
  await page.evaluate(() => window.__TD_TEST__?.spawnStress(100));
  await page.waitForTimeout(2_500);
  const metrics = await page.evaluate(() => window.__TD_TEST__?.metrics());
  expect(metrics).toBeTruthy();
  expect(metrics!.activeEnemies).toBeGreaterThanOrEqual(100);
  expect(metrics!.gameObjects).toBeLessThan(500);
  expect(metrics!.fps).toBeGreaterThanOrEqual(30);
});

test('компактный HUD остаётся доступным в узком и квадратном окне', async ({ page }) => {
  const assertHudFits = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => {
      const topbar = document.querySelector<HTMLElement>('.topbar');
      return {
        documentFits: document.documentElement.scrollWidth <= window.innerWidth,
        topbarFits: Boolean(topbar && topbar.scrollWidth <= topbar.clientWidth),
      };
    })).toEqual({ documentFits: true, topbarFits: true });

    const panels = await Promise.all(['.build-panel', '.hero-panel', '.wave-card', '.camera-controls'].map(async (selector) => {
      const box = await page.locator(selector).boundingBox();
      if (!box) throw new Error(`${selector} has no bounding box`);
      return { selector, ...box };
    }));
    for (const panel of panels) {
      expect(panel.x, `${panel.selector} выходит слева`).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width, `${panel.selector} выходит справа`).toBeLessThanOrEqual(width);
      expect(panel.y, `${panel.selector} выходит сверху`).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height, `${panel.selector} выходит снизу`).toBeLessThanOrEqual(height);
    }
    const build = panels[0];
    const hero = panels[1];
    expect(build.x + build.width, 'нижние панели перекрываются').toBeLessThanOrEqual(hero.x);
  };

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await assertHudFits(1024, 768);
  await assertHudFits(900, 900);
  await expect(page.getByRole('button', { name: /Начать досрочно/ })).toBeInViewport();
  await expect(page.locator('[data-ability="q"]')).toBeInViewport();
  await expect(page.locator('[data-tower="archer"]')).toBeInViewport();
  await page.screenshot({ path: 'test-results/compact-hud-900x900.png', fullPage: true });
});
