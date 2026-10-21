import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'frontend/scripts/verify-quick';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  if (JWT) { await page.goto(`${BASE}/login`); await page.evaluate((t) => localStorage.setItem('token', t), JWT); }
  // Landing with outline button
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '09_landing_outline_btn.png') });
  // Quick page with header
  await page.goto(`${BASE}/quick`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '10_quick_header_sections.png') });
  console.log('Done');
  await browser.close();
})();
