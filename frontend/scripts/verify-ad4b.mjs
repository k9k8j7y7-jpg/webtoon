/**
 * 광고 트랙 4차 검증 B — 기존 ep 활용
 * node frontend/scripts/verify-ad4b.mjs <JWT>
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node verify-ad4b.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/verify-ad4');
fs.mkdirSync(OUT, { recursive: true });

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

  // ── ④ ep121 Gate5 [다시 그리기] 시트 ──
  console.log('=== ④ ep121 Gate5 다시 그리기 시트 ===');
  await page.goto(`${BASE}/projects/14/episodes/121/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '04a-ep121-gate5.png'), fullPage: true });
  console.log('ep121 gate5 overview saved');

  // [다시 그리기] 버튼 클릭
  const regenBtn = page.locator('button:has-text("다시 그리기")').first();
  if (await regenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await regenBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '04b-regen-sheet.png'), fullPage: true });
    console.log('④ regen sheet screenshot saved');
    // 닫기
    const closeBtn = page.locator('button:has-text("닫기")').first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } else {
    console.log('④ WARN: 다시 그리기 button not found');
  }

  // ── ⑥ ep120 onecut_ad Gate5 [다시 그리기] 시트 ──
  console.log('\n=== ⑥ ep120 onecut Gate5 ===');
  await page.goto(`${BASE}/projects/12/episodes/120/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const regenBtn2 = page.locator('button:has-text("다시 그리기")').first();
  if (await regenBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await regenBtn2.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '06-onecut-regen-sheet.png'), fullPage: true });
    console.log('⑥ onecut regen sheet screenshot saved');
  } else {
    console.log('⑥ WARN: 다시 그리기 not found');
  }

  // ── ② ep121 Gate2 대본 카드 (훅/카피 라벨 + 장소 칩 + 카피 디자인) ──
  console.log('\n=== ② ep121 Gate2 대본 ===');
  await page.goto(`${BASE}/projects/14/episodes/121/workflow?gate=2`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '02-ep121-script.png'), fullPage: true });
  console.log('② ep121 script labels + location chip + copy design saved');

  // ── ⑤ 프로젝트 페이지 컷 수 모달 ──
  console.log('\n=== ⑤ 컷 수 모달 ===');
  await page.goto(`${BASE}/projects/14`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  // 광고 에피소드 만들기 버튼
  const adBtn = page.locator('button:has-text("광고 에피소드"), button:has-text("인스타"), button:has-text("새 에피소드")').first();
  if (await adBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await adBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '05-cut-count.png'), fullPage: true });
    console.log('⑤ cut count modal saved');
  } else {
    // 대시보드에서 인스타툰 만들기
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const instBtn = page.locator('button:has-text("인스타툰"), button:has-text("광고")').first();
    if (await instBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await instBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, '05-cut-count.png'), fullPage: true });
      console.log('⑤ cut count modal (from dashboard) saved');
    } else {
      console.log('⑤ WARN: new ad episode button not found');
    }
  }

  console.log('\n=== Done ===');
  console.log('Files:', fs.readdirSync(OUT).join(', '));

  await browser.close();
})();
