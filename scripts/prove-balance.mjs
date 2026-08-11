import { chromium } from '@playwright/test';

const url = process.env.TD_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const runtimeErrors = [];
page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
page.on('pageerror', (error) => runtimeErrors.push(error.message));
page.setDefaultTimeout(8_000);

const canvas = page.locator('canvas');
const towerCosts = { archer: 110, frost: 145, siege: 185, boost: 160 };
const towerNames = { archer: 'Стрелковая башня', frost: 'Ледяная башня', siege: 'Осадная башня', boost: 'Башня усиления' };
const balancedPending = [
  { after: 1, kind: 'upgrade', x: 445, y: 255 },
  { after: 1, kind: 'upgrade', x: 350, y: 245 },
  { after: 2, kind: 'build', type: 'siege', x: 400, y: 60 },
  { after: 3, kind: 'upgrade', x: 400, y: 60 },
  { after: 3, kind: 'upgrade', x: 445, y: 255 },
  { after: 4, kind: 'build', type: 'siege', x: 620, y: 420 },
  { after: 4, kind: 'upgrade', x: 350, y: 245 },
  { after: 5, kind: 'upgrade', x: 400, y: 60 },
  { after: 6, kind: 'build', type: 'frost', x: 620, y: 620 },
  { after: 6, kind: 'build', type: 'archer', x: 730, y: 620 },
  { after: 6, kind: 'upgrade', x: 620, y: 420 },
  { after: 7, kind: 'build', type: 'archer', x: 300, y: 60 },
  { after: 7, kind: 'upgrade', x: 300, y: 60 },
  { after: 8, kind: 'build', type: 'frost', x: 860, y: 400 },
  { after: 8, kind: 'build', type: 'archer', x: 930, y: 360 },
  { after: 8, kind: 'upgrade', x: 860, y: 400 },
  { after: 8, kind: 'upgrade', x: 930, y: 360 },
  { after: 9, kind: 'upgrade', x: 620, y: 420 },
  { after: 9, kind: 'upgrade', x: 620, y: 620 },
  { after: 9, kind: 'upgrade', x: 730, y: 620 },
  { after: 9, kind: 'upgrade', x: 860, y: 400 },
  { after: 9, kind: 'upgrade', x: 930, y: 360 },
  { after: 10, kind: 'build', type: 'siege', x: 600, y: 250 },
  { after: 10, kind: 'upgrade', x: 600, y: 250 },
  { after: 10, kind: 'upgrade', x: 600, y: 250 },
  { after: 11, kind: 'build', type: 'frost', x: 520, y: 620 },
  { after: 11, kind: 'upgrade', x: 520, y: 620 },
  { after: 11, kind: 'upgrade', x: 520, y: 620 },
  { after: 12, kind: 'build', type: 'siege', x: 690, y: 430 },
  { after: 12, kind: 'upgrade', x: 690, y: 430 },
  { after: 12, kind: 'upgrade', x: 690, y: 430 },
  { after: 13, kind: 'build', type: 'boost', x: 800, y: 640 },
  { after: 13, kind: 'upgrade', x: 800, y: 640 },
  { after: 14, kind: 'build', type: 'archer', x: 850, y: 170 },
  { after: 14, kind: 'upgrade', x: 850, y: 170 },
  { after: 14, kind: 'upgrade', x: 850, y: 170 },
  { after: 15, kind: 'build', type: 'archer', x: 960, y: 170 },
  { after: 15, kind: 'upgrade', x: 960, y: 170 },
  { after: 15, kind: 'upgrade', x: 960, y: 170 },
  { after: 16, kind: 'build', type: 'frost', x: 1030, y: 420 },
  { after: 16, kind: 'upgrade', x: 1030, y: 420 },
  { after: 16, kind: 'upgrade', x: 1030, y: 420 },
  { after: 17, kind: 'build', type: 'archer', x: 1130, y: 500 },
  { after: 17, kind: 'upgrade', x: 1130, y: 500 },
  { after: 18, kind: 'build', type: 'siege', x: 880, y: 600 },
  { after: 18, kind: 'upgrade', x: 880, y: 600 },
  { after: 18, kind: 'upgrade', x: 880, y: 600 },
  { after: 19, kind: 'build', type: 'archer', x: 1070, y: 100 },
  { after: 19, kind: 'upgrade', x: 1070, y: 100 },
  { after: 19, kind: 'upgrade', x: 1070, y: 100 },
];
const controlPending = [
  { after: 1, kind: 'upgrade', x: 350, y: 245 },
  { after: 1, kind: 'upgrade', x: 445, y: 255 },
  { after: 2, kind: 'build', type: 'archer', x: 400, y: 60 },
  { after: 2, kind: 'upgrade', x: 400, y: 60 },
  { after: 3, kind: 'upgrade', x: 350, y: 245 },
  { after: 3, kind: 'upgrade', x: 445, y: 255 },
  { after: 4, kind: 'build', type: 'frost', x: 620, y: 420 },
  { after: 4, kind: 'upgrade', x: 620, y: 420 },
  { after: 5, kind: 'upgrade', x: 400, y: 60 },
  { after: 6, kind: 'build', type: 'archer', x: 620, y: 620 },
  { after: 6, kind: 'build', type: 'archer', x: 730, y: 620 },
  { after: 6, kind: 'upgrade', x: 620, y: 620 },
  { after: 7, kind: 'build', type: 'archer', x: 300, y: 60 },
  { after: 7, kind: 'upgrade', x: 300, y: 60 },
  { after: 8, kind: 'build', type: 'frost', x: 860, y: 400 },
  { after: 8, kind: 'build', type: 'archer', x: 930, y: 360 },
  { after: 8, kind: 'upgrade', x: 860, y: 400 },
  { after: 8, kind: 'upgrade', x: 930, y: 360 },
  { after: 9, kind: 'upgrade', x: 620, y: 420 },
  { after: 9, kind: 'upgrade', x: 620, y: 620 },
  { after: 9, kind: 'upgrade', x: 730, y: 620 },
  { after: 9, kind: 'upgrade', x: 860, y: 400 },
  { after: 9, kind: 'upgrade', x: 930, y: 360 },
  { after: 10, kind: 'build', type: 'frost', x: 600, y: 250 },
  { after: 10, kind: 'upgrade', x: 600, y: 250 },
  { after: 10, kind: 'upgrade', x: 600, y: 250 },
  { after: 11, kind: 'build', type: 'archer', x: 520, y: 620 },
  { after: 11, kind: 'upgrade', x: 520, y: 620 },
  { after: 11, kind: 'upgrade', x: 520, y: 620 },
  { after: 12, kind: 'build', type: 'frost', x: 690, y: 430 },
  { after: 12, kind: 'upgrade', x: 690, y: 430 },
  { after: 12, kind: 'upgrade', x: 690, y: 430 },
  { after: 13, kind: 'build', type: 'boost', x: 800, y: 640 },
  { after: 13, kind: 'upgrade', x: 800, y: 640 },
  { after: 14, kind: 'build', type: 'archer', x: 850, y: 170 },
  { after: 14, kind: 'upgrade', x: 850, y: 170 },
  { after: 14, kind: 'upgrade', x: 850, y: 170 },
  { after: 15, kind: 'build', type: 'frost', x: 960, y: 170 },
  { after: 15, kind: 'upgrade', x: 960, y: 170 },
  { after: 15, kind: 'upgrade', x: 960, y: 170 },
  { after: 16, kind: 'build', type: 'archer', x: 1030, y: 420 },
  { after: 16, kind: 'upgrade', x: 1030, y: 420 },
  { after: 16, kind: 'upgrade', x: 1030, y: 420 },
  { after: 17, kind: 'build', type: 'frost', x: 1130, y: 500 },
  { after: 17, kind: 'upgrade', x: 1130, y: 500 },
  { after: 18, kind: 'build', type: 'archer', x: 880, y: 600 },
  { after: 18, kind: 'upgrade', x: 880, y: 600 },
  { after: 18, kind: 'upgrade', x: 880, y: 600 },
  { after: 19, kind: 'build', type: 'frost', x: 1070, y: 100 },
  { after: 19, kind: 'upgrade', x: 1070, y: 100 },
  { after: 19, kind: 'upgrade', x: 1070, y: 100 },
];
const strategy = process.env.TD_STRATEGY ?? 'balanced';
const difficulty = process.env.TD_DIFFICULTY ?? 'standard';
const plans = {
  balanced: { initial: [['archer', 160, 240], ['frost', 350, 245], ['archer', 445, 255]], pending: balancedPending },
  control: { initial: [['archer', 160, 240], ['frost', 350, 245], ['frost', 445, 255]], pending: controlPending },
};
const plan = plans[strategy];
if (!plan) throw new Error(`Unknown TD_STRATEGY: ${strategy}`);
if (!['story', 'standard', 'rift'].includes(difficulty)) throw new Error(`Unknown TD_DIFFICULTY: ${difficulty}`);
const riftReinforcements = [
  { after: 16, kind: 'upgrade', x: 1050, y: 350 },
  { after: 17, kind: 'build', type: 'siege', x: 650, y: 220 },
  { after: 17, kind: 'target', x: 650, y: 220 },
  { after: 17, kind: 'upgrade', x: 650, y: 220 },
  { after: 17, kind: 'upgrade', x: 650, y: 220 },
  { after: 18, kind: 'build', type: 'frost', x: 1130, y: 390 },
  { after: 18, kind: 'target', x: 1130, y: 390 },
  { after: 18, kind: 'upgrade', x: 1130, y: 390 },
  { after: 18, kind: 'upgrade', x: 1130, y: 390 },
  { after: 19, kind: 'build', type: 'archer', x: 1140, y: 150 },
  { after: 19, kind: 'target', x: 1140, y: 150 },
  { after: 19, kind: 'upgrade', x: 1140, y: 150 },
  { after: 19, kind: 'upgrade', x: 1140, y: 150 },
  { after: 19, kind: 'build', type: 'archer', x: 1050, y: 200 },
  { after: 19, kind: 'target', x: 1050, y: 200 },
  { after: 19, kind: 'upgrade', x: 1050, y: 200 },
  { after: 19, kind: 'upgrade', x: 1050, y: 200 },
  { after: 19, kind: 'build', type: 'frost', x: 950, y: 200 },
  { after: 19, kind: 'target', x: 950, y: 200 },
  { after: 19, kind: 'upgrade', x: 950, y: 200 },
  { after: 19, kind: 'upgrade', x: 950, y: 200 },
  { after: 19, kind: 'build', type: 'boost', x: 900, y: 100 },
  { after: 19, kind: 'target', x: 400, y: 60 },
  { after: 19, kind: 'target', x: 620, y: 420 },
  { after: 19, kind: 'target', x: 600, y: 250 },
  { after: 19, kind: 'target', x: 690, y: 430 },
  { after: 19, kind: 'target', x: 900, y: 350 },
  { after: 19, kind: 'target', x: 930, y: 360 },
  { after: 19, kind: 'target', x: 850, y: 170 },
  { after: 19, kind: 'target', x: 960, y: 170 },
  { after: 19, kind: 'target', x: 1030, y: 420 },
  { after: 19, kind: 'target', x: 1100, y: 350 },
  { after: 19, kind: 'target', x: 1070, y: 100 },
];
const basePending = difficulty === 'rift'
  ? plan.pending.map((action) => {
    if (action.x === 800 && action.y === 640) return { ...action, x: 1050, y: 350 };
    if (action.x === 880 && action.y === 600) return { ...action, x: 900, y: 350 };
    if (action.x === 1130 && action.y === 500) return { ...action, x: 1100, y: 350 };
    return action;
  })
  : plan.pending;
const pending = [...basePending, ...(difficulty === 'rift' ? riftReinforcements : [])];
let spentGold = 0;

function gold() {
  return page.locator('#gold').textContent().then((value) => Number(value ?? 0));
}

function combatPosition(wave) {
  if (wave <= 7) return { hero: [430, 285], spell: [430, 145] };
  if (wave <= 14) return { hero: [665, 430], spell: [650, 520] };
  return { hero: [920, 350], spell: [930, 260] };
}

async function worldClick(x, y, options = {}) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  await page.mouse.click(box.x + box.width * (x / 1200), box.y + box.height * (y / 700), options);
  await page.waitForTimeout(80);
}

async function build(type, x, y) {
  if (await gold() < towerCosts[type]) return false;
  await page.locator(`[data-tower="${type}"]`).click();
  await worldClick(x, y);
  if (!(await page.locator('#tower-panel').isVisible()) || await page.locator('#tower-name').textContent() !== towerNames[type]) {
    throw new Error(`Build ${type} at ${x},${y} failed`);
  }
  spentGold += towerCosts[type];
  return true;
}

async function upgrade(x, y) {
  await worldClick(x, y);
  const button = page.locator('#upgrade');
  if (!(await button.isVisible())) return false;
  if (!(await button.isEnabled())) return true;
  const label = await button.textContent();
  const cost = Number(label?.match(/(\d+)/)?.[1] ?? 0);
  if (await gold() < cost) return false;
  const beforeLevel = Number(await page.locator('#tower-level').textContent());
  await button.click();
  if (Number(await page.locator('#tower-level').textContent()) !== beforeLevel + 1) throw new Error(`Upgrade at ${x},${y} failed`);
  spentGold += cost;
  return true;
}

async function targetStrongest(x, y) {
  await worldClick(x, y);
  const button = page.locator('#target-mode');
  if (!(await button.isVisible())) return false;
  if (!(await button.isEnabled())) return true;
  if ((await button.textContent())?.includes('Самая сильная')) return true;
  await button.click();
  return true;
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.locator(`[data-difficulty="${difficulty}"]`).click();
await page.locator('#begin').click();
await page.locator('canvas').waitFor({ state: 'visible', timeoutMs: 15_000 });
await page.locator('#start-screen').waitFor({ state: 'hidden', timeoutMs: 15_000 });
if (await page.locator('#tutorial-skip').isVisible()) await page.locator('#tutorial-skip').click();
await page.locator('#zoom-out').click();
await page.waitForTimeout(450);
await page.locator('#speed').click();
for (const [type, x, y] of plan.initial) {
  if (!(await build(type, x, y))) pending.unshift({ after: 1, kind: 'build', type, x, y });
}
await page.locator('#hero-stance').click();
await worldClick(430, 285, { button: 'right' });
await page.locator('#start-wave').click();

let lastWave = 0;
let nextSpellAt = Date.now();
let bossStormCasts = 0;
const deadline = Date.now() + 7 * 60_000;
while (Date.now() < deadline) {
  if (await page.locator('#end-screen:not(.hidden)').isVisible()) break;
  const wave = Number(await page.locator('#wave').textContent());
  if (wave !== lastWave) {
    lastWave = wave;
    bossStormCasts = 0;
    console.log(JSON.stringify({ event: 'wave', wave, gold: await gold(), lives: Number(await page.locator('#lives').textContent()) }));
    const { hero } = combatPosition(wave);
    await worldClick(hero[0], hero[1], { button: 'right' });
  }
  for (let index = 0; index < pending.length;) {
    const action = pending[index];
    if (action.after > wave) { index += 1; continue; }
    const done = action.kind === 'build'
      ? await build(action.type, action.x, action.y)
      : action.kind === 'target'
        ? await targetStrongest(action.x, action.y)
        : await upgrade(action.x, action.y);
    if (done) pending.splice(index, 1);
    else index += 1;
  }
  const start = page.locator('#start-wave');
  if (await start.isEnabled()) {
    await start.evaluate((button) => { if (!button.disabled) button.click(); });
  }
  if (Date.now() >= nextSpellAt) {
    const { spell } = combatPosition(wave);
    const bossWave = wave === 7 || wave === 14 || wave === 20;
    const bossVisible = await page.locator('#boss-bar').isVisible();
    if (bossVisible && bossStormCasts >= 2) await worldClick(950, 260, { button: 'right' });
    const storm = page.locator('[data-ability="r"]');
    if ((!bossWave || bossVisible) && await storm.isEnabled()) {
      const bossStormPoints = [[130, 330], [510, 390], [950, 260]];
      const stormPoint = bossVisible ? bossStormPoints[Math.min(bossStormCasts, bossStormPoints.length - 1)] : spell;
      await page.keyboard.press('KeyR');
      await worldClick(stormPoint[0], stormPoint[1]);
      if (bossVisible) bossStormCasts += 1;
    }
    await page.keyboard.press('KeyQ');
    if (bossVisible) await page.keyboard.press('KeyE');
    nextSpellAt = Date.now() + 2_500;
  }
  await page.waitForTimeout(350);
}

const result = await page.locator('#end-title').textContent().catch(() => 'TIMEOUT');
const proof = {
  strategy,
  difficulty,
  verdict: result === 'Разлом запечатан' ? 'PASS' : 'FAIL',
  result,
  wave: Number(await page.locator('#wave').textContent()),
  lives: Number(await page.locator('#lives').textContent()),
  gold: await gold(),
  bossValue: await page.locator('#boss-value').textContent().catch(() => ''),
  spentGold,
  pendingActions: pending.length,
  runtimeErrors,
};
console.log(JSON.stringify(proof));
await page.screenshot({ path: 'test-results/runtime/balance-result.png', fullPage: true });
await browser.close();
if (proof.verdict !== 'PASS' || runtimeErrors.length) process.exit(1);
