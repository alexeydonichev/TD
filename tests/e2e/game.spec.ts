import { expect, test } from '@playwright/test';

test('оптимизированная сборка быстро запускает холодный матч', async ({ page }) => {
  const startedAt = Date.now();
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await expect.poll(async () => Boolean(await page.evaluate(() => window.__TD_TEST__))).toBe(true);
  expect(Date.now() - startedAt).toBeLessThan(8_000);
  const loadedImages = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => /assets\/(rift-valley|towers-atlas|units-motion-atlas|hero-v2)\.(png|webp)/.test(url)));
  expect(loadedImages.some((url) => url.endsWith('.webp'))).toBe(true);
  expect(loadedImages.some((url) => url.endsWith('.png'))).toBe(false);
});

test('ошибка ассета не оставляет игру навсегда в загрузке', async ({ page }) => {
  await page.route('**/assets/rift-valley-map-v3.webp', (route) => route.abort());
  await page.goto('/?test=1');
  const begin = page.locator('#begin');
  await begin.click();
  await expect(begin).toHaveText('ПОВТОРИТЬ ЗАГРУЗКУ', { timeout: 15_000 });
  await expect(begin).toBeEnabled();
  await expect(page.locator('#load-status')).toHaveClass(/error/);
  await expect(page.locator('#load-status')).toContainText('Загрузка прервалась');
});

test('загрузчик сам восстанавливается после краткого сетевого сбоя', async ({ page }) => {
  let failedRequests = 0;
  await page.route('**/assets/rift-valley-map-v3.webp', (route) => {
    if (failedRequests < 2) {
      failedRequests += 1;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__TD_TEST__))).toBe(true);
  expect(failedRequests).toBe(2);
  await expect(page.locator('#start-screen')).toBeHidden();
});

test('кампания показывает пять карт и загружает только выбранную', async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('[data-map]')).toHaveCount(5);
  await expect(page.locator('[data-map="valley"]')).toContainText('Долина Разлома');
  await expect(page.locator('[data-map="frozen"]')).toContainText('Ледяной перевал');
  await expect(page.locator('[data-map="bastion"]')).toContainText('Пепельный бастион');
  await expect(page.locator('[data-map="stormspire"]')).toContainText('Грозовой шпиль');
  await expect(page.locator('[data-map="abyss"]')).toContainText('Сердце Бездны');
  await page.locator('[data-map="frozen"]').click();
  await expect(page.locator('[data-map="frozen"]')).toHaveClass(/active/);
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().mapId)).toBe('frozen');
  await expect(page.locator('#brand-map-name')).toHaveText('ЛЕДЯНОЙ ПЕРЕВАЛ');
  const loadedMaps = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => /-map\.(png|webp)/.test(url)));
  expect(loadedMaps.some((url) => url.endsWith('/assets/frozen-pass-map.webp'))).toBe(true);
  expect(loadedMaps.some((url) => url.endsWith('/assets/rift-valley-map-v3.webp'))).toBe(false);
  expect(loadedMaps.some((url) => url.endsWith('/assets/ashen-bastion-map.webp'))).toBe(false);
  await page.evaluate(() => window.__TD_TEST__?.spawnStress(1));
  const frozenStart = await page.evaluate(() => window.__TD_TEST__?.enemies()[0]);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.enemies()[0]?.x ?? 0)).toBeGreaterThan((frozenStart?.x ?? 0) + 20);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.metrics().maxGroundRoadDeviation ?? 999)).toBeLessThanOrEqual(6);
  await page.screenshot({ path: 'test-results/frozen-pass.png', fullPage: true });

  await page.goto('/?test=1');
  await page.locator('[data-map="bastion"]').click();
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().mapId)).toBe('bastion');
  await expect(page.locator('#brand-map-name')).toHaveText('ПЕПЕЛЬНЫЙ БАСТИОН');
  const bastionMaps = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => /-map\.(png|webp)/.test(url)));
  expect(bastionMaps.some((url) => url.endsWith('/assets/ashen-bastion-map.webp'))).toBe(true);
  expect(bastionMaps.some((url) => url.endsWith('/assets/frozen-pass-map.webp'))).toBe(false);
  await page.evaluate(() => window.__TD_TEST__?.spawnStress(1));
  const bastionStart = await page.evaluate(() => window.__TD_TEST__?.enemies()[0]);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.enemies()[0]?.x ?? 0)).toBeGreaterThan((bastionStart?.x ?? 0) + 20);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.metrics().maxGroundRoadDeviation ?? 999)).toBeLessThanOrEqual(6);
  await page.screenshot({ path: 'test-results/ashen-bastion.png', fullPage: true });

  for (const [mapId, asset, brand, screenshot] of [
    ['stormspire', 'stormspire-map.webp', 'ГРОЗОВОЙ ШПИЛЬ', 'stormspire-map.png'],
    ['abyss', 'abyss-heart-map.webp', 'СЕРДЦЕ БЕЗДНЫ', 'abyss-heart-map.png'],
  ] as const) {
    await page.goto('/?test=1');
    await page.locator(`[data-map="${mapId}"]`).click();
    await page.locator('#begin').click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
    await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().mapId)).toBe(mapId);
    await expect(page.locator('#brand-map-name')).toHaveText(brand);
    const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((url) => /-map\.(png|webp)/.test(url)));
    expect(loaded.some((url) => url.endsWith(`/assets/${asset}`))).toBe(true);
    expect(new Set(loaded).size).toBe(1);
    await page.evaluate(() => window.__TD_TEST__?.spawnStress(1));
    await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.metrics().maxGroundRoadDeviation ?? 999)).toBeLessThanOrEqual(6);
    await page.screenshot({ path: `test-results/${screenshot}`, fullPage: true });
  }
});

test('полный ускоренный матч: башня, способность, улучшение, следующая волна и победа', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/?test=1');
  await expect(page.getByRole('button', { name: /НАЧАТЬ · КАРТА I/ })).toBeVisible();
  await page.getByRole('button', { name: /НАЧАТЬ · КАРТА I/ }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__TD_TEST__))).toBe(true);
  const waveCard = page.locator('#wave-card');
  const cardBox = await waveCard.boundingBox();
  const viewport = page.viewportSize();
  expect(cardBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(cardBox!.x + cardBox!.width).toBeGreaterThan(viewport!.width * 0.9);
  expect(cardBox!.y).toBeGreaterThan(viewport!.height * 0.45);
  await expect(waveCard).toHaveClass(/collapsed/);
  await expect(page.locator('#wave-details')).toBeHidden();
  await expect(page.locator('#start-wave')).toBeVisible();
  await expect(page.locator('#wave-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#wave-toggle').click();
  await expect(page.locator('#wave-details')).toBeVisible();
  await page.locator('#wave-toggle').click();
  await expect(page.locator('#wave-details')).toBeHidden();
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
  await page.locator('#zoom-out').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().cameraZoom ?? 2)).toBeLessThanOrEqual(1.01);
  await page.screenshot({ path: 'test-results/landscape-v3.png', fullPage: true });
  await page.locator('[data-tower="archer"]').click();
  await expect(page.locator('#placement-message')).toContainText('ячейки 50×50');
  await page.screenshot({ path: 'test-results/build-grid.png', fullPage: true });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');
  const clickWorld = async (x: number, y: number) => page.mouse.click(box.x + box.width * (x / 1200), box.y + box.height * (y / 700));
  await clickWorld(360, 250);
  await expect(page.locator('#tower-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const tower = window.__TD_TEST__?.state().selectedTower;
    return tower ? { x: tower.x, y: tower.y } : null;
  })).toEqual({ x: 350, y: 250 });
  await expect(page.getByRole('button', { name: /Начать досрочно/ })).toBeInViewport();

  for (const [type, x, y, name] of [
    ['frost', 600, 250, 'Ледяная башня'],
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
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().e ?? 0)).toBe(1);

  await page.getByRole('button', { name: /Улучшить/ }).click();
  await expect(page.locator('#tower-level')).toHaveText('2');

  // The smoke campaign validates transitions and victory, not the deliberately losing
  // low-investment build. Max the four representative towers before jumping to bosses.
  for (const [x, y] of [[650, 450], [350, 250], [600, 250], [930, 420]] as const) {
    await clickWorld(x, y);
    for (let level = 1; level < 6; level += 1) {
      const upgrade = page.locator('#upgrade');
      if (!(await upgrade.isEnabled())) break;
      await upgrade.click();
    }
  }

  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().wave ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  for (const [tier, name] of [[1, 'СТРАЖ БЕЗДНЫ'], [2, 'ТИТАН ОСКОЛКОВ'], [3, 'ВЛАДЫКА РАЗЛОМА']] as const) {
    await page.evaluate((bossTier) => window.__TD_TEST__?.skipToBoss(bossTier), tier);
    await expect(page.locator('#boss-bar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#boss-name')).toHaveText(name, { timeout: 10_000 });
  }

  await expect(page.locator('#end-screen')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#end-title')).toHaveText('Разлом запечатан');
  await expect(page.locator('#restart')).toContainText('СЛЕДУЮЩАЯ КАРТА · ЛЕДЯНОЙ ПЕРЕВАЛ');
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
  await expect(page.locator('[data-difficulty="rift"]')).toContainText('полный доход только за три боевые доктрины');
  await expect(page.locator('[data-difficulty="rift"]')).toContainText('Контр-типы усилены');
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

test('Повелитель бури создаёт дефицитную экономику и ускоряет подготовку', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-difficulty="rift"]').click();
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#gold')).toHaveText('320');
  await expect(page.locator('#lives')).toHaveText('8');
  await expect(page.locator('#difficulty-badge')).toHaveText('ПОВЕЛИТЕЛЬ БУРИ');
  await expect(page.locator('#countdown')).toHaveText(/00:0[5-7]/);
  await expect(page.locator('#start-wave')).toContainText(/\+◈ [4-5]/);
  await page.locator('#wave-toggle').click();
  await expect(page.locator('#doctrine-warning')).toBeVisible();
  await expect(page.locator('#doctrine-value')).toHaveText('ДОКТРИНЫ 0/3');
  await expect(page.locator('#doctrine-copy')).toContainText('Боевой доход 50%');
  await expect(page.locator('#wave-reward')).toHaveText('Зачистка +◈ 8');
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
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.phase ?? 0)).toBeGreaterThan(0.7);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().w ?? 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().attack ?? 0), { timeout: 8_000 }).toBeGreaterThan(0);

  await page.keyboard.press('KeyX');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.stance)).toBe('guard');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.command)).toBe('hold');
  await expect(page.locator('#hero-stance')).toContainText('ОХРАНА');

  const moveStart = await page.evaluate(() => window.__TD_TEST__!.state().hero.x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(250);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__!.state().hero.x)).toBeGreaterThan(moveStart + 40);
  await page.keyboard.up('KeyD');

  await page.keyboard.press('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().q ?? 0)).toBe(1);

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
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().r ?? 0)).toBe(1);
  await page.screenshot({ path: 'test-results/hero-tactics.png', fullPage: true });
});

test('справочник подробно объясняет телепорт, защиту и урон ультимейта', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#skill-guide').click();
  await expect(page.locator('#skill-guide-panel')).toBeVisible();
  await expect(page.locator('#skill-guide')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-skill-card="q"]')).toContainText('Проводимость 5с');
  await expect(page.locator('[data-skill-card="q"]')).toContainText('Q → R');
  await expect(page.locator('[data-skill-card="w"]')).toContainText('Мгновенно переносит героя');
  await expect(page.locator('[data-skill-card="w"]')).toContainText('Неуязвимость 1.2с');
  await expect(page.locator('[data-skill-card="e"]')).toContainText('Башни +35% урона');
  await expect(page.locator('[data-skill-card="r"]')).toContainText('56 магического урона за удар');
  await expect(page.locator('[data-skill-card="r"]')).toContainText('12 ударов · до 668');
  await expect(page.locator('[data-ability="r"]')).toHaveAttribute('title', /56 каждые 0.5с · до 668 за цель/);
  await page.screenshot({ path: 'test-results/hero-skill-guide.png', fullPage: true });
  await page.locator('#close-skill-guide').click();
  await expect(page.locator('#skill-guide-panel')).toBeHidden();
});

test('Q помечает выживших врагов Проводимостью для связки с R', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  for (let index = 0; index < 3; index += 1) await page.evaluate(() => window.__TD_TEST__?.spawnElite('bulwark'));
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.enemies().length ?? 0)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('KeyQ');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.enemies().some((enemy) => enemy.conductive) ?? false)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().q ?? 0)).toBe(1);
  await page.screenshot({ path: 'test-results/hero-conductive-combo.png', fullPage: true });
});

test('герой развивается до 10 уровня и усиливает каждое умение', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.level)).toBe(3);
  const levelThree = await page.evaluate(() => window.__TD_TEST__!.state().hero);

  await page.evaluate(() => window.__TD_TEST__?.grantHeroXp(240));
  await expect(page.locator('#hero-level')).toHaveText('5');
  await expect(page.locator('#hero-perk')).toContainText('РАЗВЕТВЛЁННАЯ МОЛНИЯ');
  await expect(page.locator('[data-ability="q"]')).toHaveAttribute('title', /7 целей/);

  await page.evaluate(() => window.__TD_TEST__?.grantHeroXp(1300));
  await expect(page.locator('#hero-level')).toHaveText('10');
  await expect(page.locator('#xp-value')).toHaveText('MAX · УР. 10');
  const levelTen = await page.evaluate(() => window.__TD_TEST__!.state().hero);
  expect(levelTen.maxHp).toBe(618);
  expect(levelTen.maxMana).toBe(330);
  expect(levelTen.maxHp).toBeGreaterThan(levelThree.maxHp);
  expect(levelTen.abilities.q.detail).toContain('10 целей');
  expect(levelTen.abilities.w.detail).toContain('скачок 342');
  expect(levelTen.abilities.e.detail).toContain('9с');
  expect(levelTen.abilities.r.detail).toContain('до 1486 за цель');
  expect(levelTen.abilities.r.stats).toContain('Радиус 200');
  await expect(page.locator('[data-ability="r"]')).toHaveAttribute('title', /83 каждые 0.5с · до 1486 за цель/);
  await expect(page.locator('.hero-panel')).toHaveAttribute('title', /Уровень 10\/10/);
  await page.screenshot({ path: 'test-results/hero-level-10.png', fullPage: true });
});

test('элитные мутации читаются в бою, а герой входит в грозовую перегрузку', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#zoom-out').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().cameraZoom ?? 2)).toBeLessThanOrEqual(1.01);

  for (const elite of ['swift', 'bulwark', 'regenerator', 'nullifier'] as const) {
    await page.evaluate((kind) => window.__TD_TEST__?.spawnElite(kind), elite);
  }
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.metrics().eliteEnemies ?? 0)).toBe(4);
  const elites = await page.evaluate(() => window.__TD_TEST__?.enemies().filter((enemy) => enemy.elite));
  expect(elites?.map((enemy) => enemy.elite).sort()).toEqual(['bulwark', 'nullifier', 'regenerator', 'swift']);
  expect(elites?.find((enemy) => enemy.elite === 'bulwark')?.shield).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.manaDrain ?? 0)).toBeGreaterThanOrEqual(12);
  await expect(page.locator('.hero-panel')).toHaveClass(/suppressed/);

  await page.evaluate(() => window.__TD_TEST__?.chargeHero());
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().hero.overcharge ?? 0)).toBeGreaterThan(7);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().overcharge ?? 0)).toBe(1);
  await expect(page.locator('.hero-panel')).toHaveClass(/overcharged/);
  await expect(page.locator('#storm-orb')).toHaveClass(/overcharged/);
  await expect(page.locator('#hero-status')).toContainText('подавление');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/elite-overcharge.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('босс предупреждает о позиционном ударе и наказывает неподвижного героя', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('[data-difficulty="rift"]').click();
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__TD_TEST__))).toBe(true);
  await page.evaluate(() => window.__TD_TEST__?.skipToBoss(3));
  await expect(page.locator('#boss-bar')).toBeVisible({ timeout: 8_000 });
  const hpBefore = await page.evaluate(() => window.__TD_TEST__!.state().hero.hp);
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.visuals().bossStrike ?? 0), { timeout: 8_000 }).toBeGreaterThan(0);
  await expect(page.locator('#boss-strike')).toContainText('УДАР');
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__!.state().hero.hp), { timeout: 8_000 }).toBeLessThan(hpBefore);
});

test('тактический брифинг показывает состав, награду и статус волны', async ({ page }) => {
  await page.goto('/?test=1');
  await page.locator('#begin').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await page.locator('#wave-toggle').click();

  await expect(page.locator('#wave-kicker')).toHaveText('СЛЕДУЮЩАЯ УГРОЗА · ВОЛНА 1');
  await expect(page.locator('#wave-roster .enemy-chip')).toHaveCount(1);
  await expect(page.locator('#wave-roster .enemy-chip')).toContainText('Налётчик');
  await expect(page.locator('#wave-roster .enemy-chip')).toContainText('×8');
  await expect(page.locator('#wave-size')).toHaveText('8 врагов');
  await expect(page.locator('#wave-xp')).toHaveText('Герой +30 XP');
  await expect(page.locator('#wave-reward')).toHaveText('Зачистка +◈ 35');
  await expect(page.locator('#start-wave')).toContainText(/\+◈ \d+/);

  await page.locator('[data-tower="archer"]').click();
  const canvasBox = await page.locator('canvas').boundingBox();
  if (!canvasBox) throw new Error('Canvas has no bounding box');
  await page.mouse.click(canvasBox.x + canvasBox.width * (360 / 1200), canvasBox.y + canvasBox.height * (250 / 700));
  await expect(page.locator('#tower-panel')).toBeVisible();
  const waveBox = await page.locator('.wave-card').boundingBox();
  const towerBox = await page.locator('#tower-panel').boundingBox();
  expect(waveBox && towerBox && waveBox.x >= towerBox.x + towerBox.width, 'брифинг перекрывает панель башни').toBe(true);

  await page.locator('#start-wave').click();
  await expect(page.locator('#wave-kicker')).toHaveText('ВОЛНА 1 В БОЮ');
  await expect(page.locator('#start-wave')).toHaveText('Волна в бою');

  await page.evaluate(() => window.__TD_TEST__?.skipToBoss(3));
  await expect(page.locator('#wave-title')).toHaveText('Владыка Разлома');
  await expect(page.locator('#wave-roster .enemy-chip')).toHaveCount(4);
  await expect(page.locator('#wave-roster [data-enemy="boss"]')).toContainText('Владыка Разлома');
  await expect(page.locator('#wave-roster [data-enemy="boss"]')).toContainText('×1');
  await expect(page.locator('#wave-size')).toHaveText('45 врагов');
  await expect(page.locator('#wave-xp')).toHaveText('Герой +198 XP');
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

test('каждый уровень меняет боеприпас и залп башни', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/?test=1');
  await page.locator('#begin').click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.locator('#zoom-out').click();
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().cameraZoom ?? 2)).toBeLessThanOrEqual(1.01);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounding box');
  const clickWorld = async (x: number, y: number) => page.mouse.click(box.x + box.width * (x / 1200), box.y + box.height * (y / 700));

  for (const [type, x, y, levelOne, levelSix] of [
    ['archer', 350, 250, 'залп: 1 стрела', 'залп: 6 стрел'],
    ['frost', 600, 250, 'залп: 1 осколок', 'залп: 6 осколков'],
    ['siege', 650, 450, 'Чугунное ядро', 'Сердце вулкана'],
  ] as const) {
    await page.locator(`[data-tower="${type}"]`).click();
    await clickWorld(x, y);
    await expect(page.locator('#tower-description')).toContainText(levelOne);
    await expect(page.locator('#upgrade')).toContainText('U');
    for (let level = 2; level <= 6; level += 1) await page.keyboard.press('KeyU');
    await expect(page.locator('#tower-level')).toHaveText('6');
    await expect(page.locator('#tower-description')).toContainText(levelSix);
    await expect(page.locator('#upgrade')).toContainText('Макс. уровень VI');
  }

  await page.locator('[data-tower="boost"]').click();
  await clickWorld(950, 400);
  for (let level = 2; level <= 6; level += 1) await page.keyboard.press('KeyU');
  await expect(page.locator('#tower-level')).toHaveText('6');
  await expect(page.locator('#tower-power')).toHaveText('+48%');
  await expect(page.locator('#tower-rate')).toHaveText('+22%');

  await clickWorld(350, 250);
  await expect(page.locator('#tower-name')).toHaveText('Стрелковая башня');
  await page.locator('#start-wave').click();
  await page.evaluate(() => window.__TD_TEST__?.spawnStress(12));
  await expect.poll(() => page.evaluate(() => window.__TD_TEST__?.state().selectedTower?.damageDealt ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(750);
  await page.screenshot({ path: 'test-results/combat-visual-upgrade.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
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
  expect(metrics!.maxGroundRoadDeviation).toBeLessThanOrEqual(6);
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
