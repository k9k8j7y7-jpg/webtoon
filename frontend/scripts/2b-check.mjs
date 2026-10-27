/**
 * 2단계-B 검증: Gate3 참고 광고·헤드카피 컷·편집기·빠른 컷 버튼 (375 다크)
 */
import { chromium } from 'playwright';
import path from 'path';
import { mkdirSync } from 'fs';

const JWT = process.argv[2];
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/product-check');
mkdirSync(OUT, { recursive: true });
const PID = 12;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:375,height:812}, deviceScaleFactor:2, colorScheme:'dark' });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.evaluate(t=>localStorage.setItem('token',t), JWT);
await page.evaluate(()=>localStorage.setItem('theme','dark'));

// 1. Gate3 — 참고 광고 섹션 (ep80 onecut_ad)
await page.goto(`${BASE}/projects/${PID}/episodes/80/workflow`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
// Gate3으로 이동 시도
const gate3Btn = page.locator('button', { hasText: '단계 이동' });
if (await gate3Btn.count() > 0) {
  await gate3Btn.click({ force: true });
  await page.waitForTimeout(500);
}
await page.screenshot({ path: path.join(OUT, '2b-01-gate3-refads.png'), fullPage: true });
console.log('✅ 01 Gate3 참고 광고 섹션');

// 2. Gate5 — headcopy 컷 카드 (ep80)
await page.goto(`${BASE}/projects/${PID}/episodes/80/workflow`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(OUT, '2b-02-headcopy-cut.png'), fullPage: true });
console.log('✅ 02 headcopy 컷 카드');

// 3. 편집기 — headcopy 스타일 (첫 번째 컷 편집기 열기 시도)
const editBtn = page.locator('button', { hasText: '편집' }).first();
if (await editBtn.count() > 0) {
  await editBtn.click({ force: true });
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: path.join(OUT, '2b-03-editor-headcopy.png'), fullPage: true });
console.log('✅ 03 편집기 headcopy');

// 4. 빠른 컷 결과 — 버튼 (빠른 컷 페이지)
await page.goto(`${BASE}/quick`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT, '2b-04-quick-buttons.png'), fullPage: true });
console.log('✅ 04 빠른 컷 버튼');

await browser.close();
console.log(`\n✅ 2B 캡처 완료: ${OUT}`);
