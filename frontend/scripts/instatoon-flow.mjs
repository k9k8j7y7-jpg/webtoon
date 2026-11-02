/**
 * 인스타툰 광고 흐름도 캡처 — Playwright 375x812 다크
 * Usage: node scripts/instatoon-flow.mjs <JWT> [BASE]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/instatoon-flow.mjs <JWT>'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('../scratch/flow/instatoon/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  colorScheme: 'dark',
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

// Auth
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(t => { localStorage.setItem('token', t); localStorage.setItem('theme', 'dark'); }, TOKEN);

const shot = async (name) => {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}${name}`, fullPage: true });
  console.log(`  >> ${name}`);
};

try {
  // ── 01. 대시보드 → product_test_project → 용도 모달 ──
  console.log('01 용도 모달...');
  await page.goto(`${BASE}/my`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  // Click the test project card (product_test_project = project 12)
  await page.locator('text=product_test_project').first().click();
  await page.waitForTimeout(2000);
  // Click 새 에피소드
  await page.locator('button:has-text("새 에피소드")').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('button:has-text("새 에피소드")').first().click();
  await page.waitForTimeout(800);
  await shot('01-purpose-modal.png');

  // ── 02. 인스타툰 광고 → 제목 모달 ──
  console.log('02 제목 모달...');
  await page.locator('button:has-text("인스타툰 광고")').first().click();
  await page.waitForTimeout(800);
  const titleInput = page.locator('input[type="text"]').first();
  await titleInput.waitFor({ state: 'visible', timeout: 5000 });
  await titleInput.fill('흐름도 인스타툰');
  await page.waitForTimeout(300);
  await shot('02-title-modal.png');

  // 시작하기
  await page.locator('button:has-text("시작하기")').first().click();
  await page.waitForURL(/workflow/, { timeout: 15000 });
  await page.waitForTimeout(3000);
  const epMatch = page.url().match(/episodes\/(\d+)/);
  console.log(`  episode_id: ${epMatch?.[1]}`);

  // ── 03. 브리프 입력 ──
  console.log('03 브리프 입력...');
  await page.waitForTimeout(2000);
  const textarea = page.locator('textarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 10000 });
  await textarea.fill('두피 오일로 건강한 두피 되찾기');
  await page.waitForTimeout(500);
  await shot('03-brief-input.png');

  // ── 04. 기획안 생성 ──
  console.log('04 기획안 생성 (10~15초)...');
  await page.locator('button:has-text("광고 기획안 만들기")').first().click();
  await page.locator('text=카피 후보').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await shot('04-brief-result.png');

  // 이대로 진행
  console.log('  이대로 진행...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await page.locator('button:has-text("이대로 진행")').first().click();
  await page.waitForTimeout(8000);

  // ── 05. STEP 2 대본 ──
  console.log('05 대본...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const scriptBtn = page.locator('button:has-text("대본 생성")').first();
  if (await scriptBtn.isVisible().catch(() => false)) {
    console.log('  대본 생성 클릭...');
    await scriptBtn.click();
    await page.waitForTimeout(20000);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('05-script.png');

  // 대본 승인
  console.log('  대본 승인...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const g2 = page.locator('button:has-text("승인")').first();
  if (await g2.isVisible().catch(() => false)) { await g2.click(); await page.waitForTimeout(3000); }

  // ── 06. STEP 3 준비 ──
  console.log('06 준비...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('06-assets.png');

  // 시트 생성
  console.log('  시트 생성 (약 30~40초)...');
  const sheetBtn = page.locator('button:has-text("시트 일괄 생성"), button:has-text("시트 생성")').first();
  if (await sheetBtn.isVisible().catch(() => false)) {
    await sheetBtn.click();
    await page.waitForTimeout(45000);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  // 준비 승인
  console.log('  준비 승인...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const g3 = page.locator('button:has-text("승인")').first();
  if (await g3.isVisible().catch(() => false)) { await g3.click(); await page.waitForTimeout(5000); }

  // ── 07. STEP 4 콘티·장소 ──
  console.log('07 콘티·장소...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('07-storyboard.png');

  // 콘티 승인
  console.log('  콘티 승인...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const g4 = page.locator('button:has-text("승인"), button:has-text("이미지 생성")').first();
  if (await g4.isVisible().catch(() => false)) { await g4.click(); await page.waitForTimeout(5000); }

  // ── 08. STEP 5 생성 전 ──
  console.log('08 생성 전...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('08-before-gen.png');

  // ── 09. 이미지 생성 ──
  console.log('09 이미지 생성 (4컷, 약 3분)...');
  const genBtn = page.locator('button:has-text("컷 생성")').first();
  if (await genBtn.isVisible().catch(() => false)) {
    await genBtn.click();
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(10000);
      process.stdout.write(`\r  ${(i+1)*10}s...`);
      const still = await page.locator('text=이미지 생성').first().isVisible().catch(() => false);
      if (!still && i > 5) break;
    }
    console.log(' done');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('09-after-gen.png');

  // ── 10. 페이지 미리보기 ──
  console.log('10 페이지 미리보기...');
  const prevBtn = page.locator('button:has-text("페이지 미리보기")').first();
  if (await prevBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await prevBtn.click();
    await page.waitForTimeout(2500);
    await shot('10-page-preview.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    await shot('10-page-preview.png');
  }

  // ── 11. 인스타 공유 모달 ──
  console.log('11 인스타 공유...');
  const instaBtn = page.locator('button:has-text("인스타 공유")').first();
  if (await instaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await instaBtn.click();
    await page.waitForTimeout(3000);
    await shot('11-insta-share.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    await shot('11-insta-share.png');
  }

  // ── 12. 에피소드 목록 ──
  console.log('12 에피소드 목록...');
  await page.goto(`${BASE}/my`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('text=product_test_project').first().click();
  await page.waitForTimeout(2000);
  await shot('12-episode-list.png');

  console.log(`\nAll 12 screenshots → ${OUT}`);

} catch (err) {
  console.error('ERROR:', err.message);
  await shot('error-state.png').catch(() => {});
} finally {
  await browser.close();
}
