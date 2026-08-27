import { chromium } from 'playwright';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node p6-screenshot.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // Set JWT
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);

  // Series page (project 6, series 11)
  await page.goto(`${BASE}/projects/6/series/11`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'p6-series-badges.png', fullPage: true });
  console.log('OK: p6-series-badges.png');

  // Hover lock tooltip on a script episode
  const lockIcon = page.locator('[title*="분할할 수 없습니다"]').first();
  if (await lockIcon.count()) {
    await lockIcon.hover();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'p6-lock-tooltip.png' });
    console.log('OK: p6-lock-tooltip.png');
  }

  // Click revise button to show edit mode
  const reviseBtn = page.locator('button:has-text("수정 후 재생성")').first();
  if (await reviseBtn.count()) {
    await reviseBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'p6-revise-edit.png', fullPage: true });
    console.log('OK: p6-revise-edit.png');
  }

  // Project page — series card
  await page.goto(`${BASE}/projects/6`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'p6-project-card.png' });
  console.log('OK: p6-project-card.png');

  await browser.close();
})();
