// 연출 강도 mobile-check
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check-drama.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const w of [375, 412]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));

  await page.goto(`${BASE}/projects/5/episodes/39/workflow`);
  await page.waitForTimeout(3000);

  // Gate3
  await page.locator('button:has-text("자산")').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  // 연출 강도 섹션으로 스크롤
  const drama = await page.locator('text=연출 강도').first();
  if (await drama.isVisible().catch(() => false)) {
    await drama.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${OUT}/drama-gate3-${w}.png` });
  console.log(`gate3 ${w} OK`);

  // Gate5
  await page.locator('button:has-text("이미지")').first().click().catch(() => {});
  await page.waitForTimeout(2500);

  // ▾ 클릭으로 바텀시트 열기 — 첫 번째 ChevronDown 버튼
  const chevBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') }).first();
  if (await chevBtn.isVisible().catch(() => false)) {
    await chevBtn.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/drama-bottomsheet-${w}.png` });
    console.log(`bottomsheet ${w} OK`);
    // 닫기
    await page.locator('button:has-text("닫기")').first().click().catch(() => {});
    await page.waitForTimeout(300);
  } else {
    console.log(`chevron not found ${w}`);
  }

  await page.screenshot({ path: `${OUT}/drama-gate5-${w}.png` });
  console.log(`gate5 ${w} OK`);

  await ctx.close();
}
await browser.close();
console.log('Done.');
