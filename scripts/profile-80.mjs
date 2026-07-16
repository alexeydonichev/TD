import { chromium } from '@playwright/test';

const url = process.env.TD_URL ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(`${url}?test=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#begin').click();
await page.locator('canvas').waitFor({ state: 'visible', timeout: 15_000 });
await page.waitForFunction(() => Boolean(window.__TD_TEST__), null, { timeout: 15_000 });
await page.evaluate(() => window.__TD_TEST__?.spawnStress(100));
await page.waitForTimeout(5_000);
const metrics = await page.evaluate(() => window.__TD_TEST__?.metrics());
const proof = { verdict: metrics && metrics.activeEnemies >= 80 && metrics.gameObjects < 500 && metrics.fps >= 30 && !errors.length ? 'PASS' : 'FAIL', metrics, errors };
console.log(JSON.stringify(proof));
await browser.close();
if (proof.verdict !== 'PASS') process.exit(1);
