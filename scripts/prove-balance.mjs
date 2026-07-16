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
const pending = [
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
];

function gold() {
  return page.locator('#gold').textContent().then((value) => Number(value ?? 0));
}

async function worldClick(x, y, options = {}) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  await page.mouse.click(box.x + box.width * (x / 1200), box.y + box.height * (y / 700), options);
  await page.waitForTimeout(80);
}

async function build(type, x, y) {
  if (await gold() < towerCosts[type]) return false;
  const before = await gold();
  await page.locator(`[data-tower="${type}"]`).click();
  await worldClick(x, y);
  const spent = before - await gold();
  if (spent !== towerCosts[type]) throw new Error(`Build ${type} at ${x},${y} failed; spent ${spent}`);
  return true;
}

async function upgrade(x, y) {
  await worldClick(x, y);
  const button = page.locator('#upgrade');
  if (!(await button.isVisible()) || !(await button.isEnabled())) return true;
  const label = await button.textContent();
  const cost = Number(label?.match(/(\d+)/)?.[1] ?? 0);
  if (await gold() < cost) return false;
  await button.click();
  return true;
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.locator('#begin').click();
await page.locator('#speed').click();
await build('archer', 160, 240);
await build('frost', 350, 245);
await build('archer', 445, 255);
await worldClick(430, 285, { button: 'right' });
await page.locator('#start-wave').click();

let lastWave = 0;
let nextSpellAt = Date.now();
const deadline = Date.now() + 7 * 60_000;
while (Date.now() < deadline) {
  if (await page.locator('#end-screen:not(.hidden)').isVisible()) break;
  const wave = Number(await page.locator('#wave').textContent());
  if (wave !== lastWave) {
    lastWave = wave;
    console.log(JSON.stringify({ event: 'wave', wave, gold: await gold(), lives: Number(await page.locator('#lives').textContent()) }));
  }
  const start = page.locator('#start-wave');
  if (await start.isEnabled()) {
    for (let index = 0; index < pending.length;) {
      const action = pending[index];
      if (action.after > wave) { index += 1; continue; }
      const done = action.kind === 'build'
        ? await build(action.type, action.x, action.y)
        : await upgrade(action.x, action.y);
      if (done) pending.splice(index, 1);
      else index += 1;
    }
    await start.click();
  }
  if (Date.now() >= nextSpellAt) {
    await worldClick(390, 190);
    await page.keyboard.press('KeyQ');
    await page.keyboard.press('KeyE');
    await page.keyboard.press('KeyR');
    nextSpellAt = Date.now() + 2_500;
  }
  await page.waitForTimeout(350);
}

const result = await page.locator('#end-title').textContent().catch(() => 'TIMEOUT');
const proof = {
  verdict: result === 'Разлом запечатан' ? 'PASS' : 'FAIL',
  result,
  wave: Number(await page.locator('#wave').textContent()),
  lives: Number(await page.locator('#lives').textContent()),
  gold: await gold(),
  runtimeErrors,
};
console.log(JSON.stringify(proof));
await page.screenshot({ path: 'test-results/runtime/balance-result.png', fullPage: true });
await browser.close();
if (proof.verdict !== 'PASS' || runtimeErrors.length) process.exit(1);
