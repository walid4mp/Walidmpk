import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto('http://127.0.0.1:4300/', { waitUntil: 'networkidle' });
console.log('TITLE', await page.title());
console.log('URL', page.url());
console.log('BODY', await page.locator('body').innerText());
console.log('H1 COUNT', await page.locator('h1').count());
if (await page.locator('h1').count()) console.log('H1 TEXT', await page.locator('h1').first().innerText());
console.log('ERRORS', JSON.stringify(errors, null, 2));
await browser.close();