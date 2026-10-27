/**
 * 2단계-A 검증: 용도 모달 + 브리프 폼 + 기획안 + StepHeader 캡처
 */
import { chromium } from 'playwright';
import path from 'path';
import { mkdirSync } from 'fs';

const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/product-check');
mkdirSync(OUT, { recursive: true });
const PID = 12;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:375,height:812}, deviceScaleFactor:2, colorScheme:'dark' });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.evaluate(t=>localStorage.setItem('token',t), JWT);
await page.evaluate(()=>localStorage.setItem('theme','dark'));

// 1. 용도 선택 모달
await page.goto(`${BASE}/projects/${PID}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.locator('button', { hasText: '새 에피소드' }).click({ force: true });
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(OUT, '2a-01-purpose-modal.png') });
console.log('✅ 01 용도 선택 모달');

// 2. "한 컷 광고" 클릭 → 에피소드 생성 모달
await page.locator('button', { hasText: '한 컷 광고' }).first().click({ force: true });
await page.waitForTimeout(1000);

// 제목 입력 (React-compatible)
const titleInput = page.locator('input[type="text"]').first();
await titleInput.fill('2A 한컷광고');
await page.waitForTimeout(300);

// 생성하기 버튼 클릭
await page.locator('button', { hasText: '생성하기' }).click({ force: true });
await page.waitForTimeout(5000);

// 3. 워크플로우 → AdBriefForm (브리프 폼)
await page.screenshot({ path: path.join(OUT, '2a-03-brief-form.png'), fullPage: true });
console.log('✅ 03 브리프 폼 (워크플로우)');

// 4. 기획안 생성 — 전달 내용 입력
const textarea = page.locator('textarea').first();
if (await textarea.count() > 0) {
  await textarea.fill('두피 오일 산뜻하게');
  await page.waitForTimeout(500);

  // [광고 기획안 만들기] 클릭
  await page.locator('button', { hasText: '기획안' }).click({ force: true });
  await page.waitForTimeout(20000); // AI 생성 대기

  await page.screenshot({ path: path.join(OUT, '2a-04-brief-result.png'), fullPage: true });
  console.log('✅ 04 기획안 결과');
} else {
  console.log('⚠ textarea 없음 — 워크플로우 미이동');
  await page.screenshot({ path: path.join(OUT, '2a-04-brief-result.png'), fullPage: true });
}

// 5. StepHeader 확인 (ep80 — 기존 onecut_ad)
await page.goto(`${BASE}/projects/${PID}/episodes/80/workflow`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(OUT, '2a-05-stepheader.png') });
console.log('✅ 05 StepHeader (3단계)');

await browser.close();
console.log(`\n✅ 2A 캡처 완료: ${OUT}`);
