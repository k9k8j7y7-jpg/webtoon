/**
 * 광고 트랙 4차 검증 C — 올바른 project_id
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/verify-ad4');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate((jwt) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('theme', 'dark');
  }, JWT);

  // ② ep121 Gate2 대본 (project_id=5)
  console.log('=== ② ep121 Gate2 ===');
  await page.goto(`${BASE}/projects/5/episodes/121/workflow?gate=2`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '02-script-labels.png'), fullPage: true });
  console.log('② script labels saved');

  // ④ ep121 Gate5 다시 그리기 (project_id=5)
  console.log('\n=== ④ ep121 Gate5 ===');
  await page.goto(`${BASE}/projects/5/episodes/121/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '04a-gate5-overview.png'), fullPage: true });

  const regenBtn = page.locator('button:has-text("다시 그리기")').first();
  if (await regenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await regenBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '04b-regen-sheet.png'), fullPage: true });
    console.log('④ regen sheet saved');
    const closeBtn = page.locator('button:has-text("닫기")').first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) await closeBtn.click();
    await page.waitForTimeout(500);
  } else {
    console.log('④ WARN: button not found');
  }

  // ⑤ 인스타툰 컷 수 모달
  console.log('\n=== ⑤ 컷 수 모달 ===');
  await page.goto(`${BASE}/projects/5`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  // "새 에피소드" 버튼 클릭 → purpose 선택 모달
  const newBtn = page.locator('button:has-text("새 에피소드")').first();
  if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(1000);
    // "인스타툰 광고" 클릭
    const instaBtn = page.locator('button:has-text("인스타툰"), div:has-text("인스타툰 광고")').first();
    if (await instaBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await instaBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, '05-cut-count-chips.png'), fullPage: true });
      console.log('⑤ cut count chips saved');
    }
  }

  // ① generate_all 로그 확인 (ep123 — 새 인스타툰)
  console.log('\n=== ① gate5 no spinner (ep123 from first run) ===');
  await page.goto(`${BASE}/projects/16/episodes/123/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '01-gate5-no-spinner.png'), fullPage: true });
  console.log('① no spinner saved');

  console.log('\nFiles:', fs.readdirSync(OUT).join(', '));
  await browser.close();
})();
