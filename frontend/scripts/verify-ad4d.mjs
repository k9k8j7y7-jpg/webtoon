import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/verify-ad4');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, deviceScaleFactor: 2,
    colorScheme: 'dark', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate((jwt) => { localStorage.setItem('token', jwt); localStorage.setItem('theme', 'dark'); }, JWT);

  // ② ep119 Gate2 대본 (project=12, instatoon_ad, gate5 완성)
  console.log('=== ② ep119 Gate2 대본 ===');
  await page.goto(`${BASE}/projects/12/episodes/119/workflow?gate=2`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '02-script-labels.png'), fullPage: true });
  console.log('② saved');

  // ④ ep119 Gate5 [다시 그리기]
  console.log('\n=== ④ ep119 Gate5 다시 그리기 ===');
  await page.goto(`${BASE}/projects/12/episodes/119/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '04a-gate5-overview.png'), fullPage: true });
  const regenBtn = page.locator('button:has-text("다시 그리기")').first();
  if (await regenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await regenBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '04b-regen-sheet.png'), fullPage: true });
    console.log('④ regen sheet saved');
    const closeBtn = page.locator('button:has-text("닫기")');
    if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.first().click();
      await page.waitForTimeout(500);
    }
  } else { console.log('④ WARN: not found'); }

  // ⑤ 컷 수 모달 — 대시보드에서 "인스타툰 광고" 선택
  console.log('\n=== ⑤ 컷 수 모달 ===');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  // "새 프로젝트" or "+" 버튼
  const plusBtn = page.locator('button:has-text("새 프로젝트"), button:has-text("만들기"), a:has-text("새 프로젝트")').first();
  if (await plusBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await plusBtn.click();
    await page.waitForTimeout(1000);
  }
  // purpose 선택에서 인스타툰 클릭
  const instaCard = page.locator('text=인스타툰 광고').first();
  if (await instaCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await instaCard.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '05-cut-count-chips.png'), fullPage: true });
    console.log('⑤ cut count chips saved');
  } else {
    console.log('⑤ WARN: 인스타툰 광고 not found, taking current screen');
    await page.screenshot({ path: path.join(OUT, '05-cut-count-chips.png'), fullPage: true });
  }

  console.log('\nFiles:', fs.readdirSync(OUT).join(', '));
  await browser.close();
})();
