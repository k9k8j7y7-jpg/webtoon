/**
 * verify-quick-modals.mjs — 결과 화면 인스타 모달 + 말풍선 편집기 검증
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node verify-quick-modals.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'frontend/scripts/verify-quick';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // 로그인
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), JWT);

  // /quick → 생성
  console.log('Generating quick cut...');
  await page.goto(`${BASE}/quick`);
  await page.waitForTimeout(2000);

  // 여성 선택 (첫 번째 프리셋)
  const presetBtns = await page.locator('button:has(img)').all();
  if (presetBtns.length >= 1) await presetBtns[0].click();
  await page.waitForTimeout(300);

  // 장면 + 대사 입력
  const inputs = await page.locator('input[type="text"]').all();
  if (inputs.length >= 1) await inputs[0].fill('공원 벤치에서 아이스크림을 먹는다');
  if (inputs.length >= 2) await inputs[1].fill('으음~ 맛있다!');
  await page.waitForTimeout(500);

  // 만들기
  const ctaBtn = page.locator('button:has-text("만들기")');
  if (await ctaBtn.isVisible()) {
    await ctaBtn.click();
    await page.waitForSelector('img[alt="생성된 컷"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // ── 1. 인스타 공유 모달 ──
  console.log('Opening insta modal...');
  const instaBtn = page.locator('button:has-text("인스타 공유")');
  if (await instaBtn.isVisible()) {
    await instaBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, '07_insta_modal.png') });
    // 모달 닫기
    const closeBtn = page.locator('button:has-text("닫기")').or(page.locator('button:has(svg.lucide-x)'));
    if (await closeBtn.first().isVisible()) await closeBtn.first().click();
    await page.waitForTimeout(500);
  } else {
    console.log('  인스타 버튼 없음');
    await page.screenshot({ path: path.join(OUT, '07_insta_modal.png') });
  }

  // ── 2. 말풍선 고치기 ──
  console.log('Opening editor...');
  const editBtn = page.locator('button:has-text("말풍선 고치기")');
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, '08_cut_editor.png') });
  } else {
    console.log('  말풍선 고치기 버튼 없음 (대사 없을 수 있음)');
    await page.screenshot({ path: path.join(OUT, '08_cut_editor.png') });
  }

  console.log(`Screenshots saved to ${OUT}/`);
  await browser.close();
})();
