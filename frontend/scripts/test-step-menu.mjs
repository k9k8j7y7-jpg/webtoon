import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });
const EP = '/projects/5/episodes/36/workflow';

const browser = await chromium.launch({ headless: true });

for (const [label, w, mob] of [['375', 375, true], ['1280', 1280, false]]) {
  console.log(`\n[${label}]`);
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    ...(mob ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.evaluate(t => localStorage.setItem('token', t), JWT);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.goto(`${BASE}${EP}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // 1) [단계 이동] 버튼 클릭으로 메뉴 열기
  const btn = page.locator('button:has-text("단계 이동")');
  await btn.click();
  await page.waitForTimeout(800);

  // 메뉴 항목이 보이는지 확인
  const items = page.locator('[data-step-menu] button[role="menuitem"]');
  const itemCount = await items.count();
  console.log(`   메뉴 항목 수: ${itemCount}`);

  await page.screenshot({ path: `${OUT}/step-menu-open-${label}.png`, fullPage: false });
  console.log(`   메뉴 열림 캡처 완료`);

  if (itemCount > 0) {
    // 2) STEP 1 클릭 → 이동 확인
    const step1 = items.filter({ hasText: 'STEP 1' }).first();
    if (await step1.count() > 0 && !(await step1.isDisabled())) {
      await step1.click();
      await page.waitForTimeout(1000);

      // STEP 1 / 5 헤더 확인
      const headerText = await page.locator('text=STEP 1 / 5').count();
      console.log(`   STEP 1 이동 성공: ${headerText > 0}`);
      await page.screenshot({ path: `${OUT}/step-menu-moved-${label}.png` });
    }
  } else {
    console.log(`   ⚠ 메뉴가 열리지 않음!`);
  }

  await ctx.close();
}

await browser.close();
console.log('\nDone.');
