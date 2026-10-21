/**
 * verify-quick.mjs — 빠른 컷 2단계 검증
 *
 * Usage: node frontend/scripts/verify-quick.mjs <JWT>
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node verify-quick.mjs <JWT>'); process.exit(1); }

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

  // ── 1. 랜딩 입구 확인 ──
  console.log('1. Landing entry...');
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '01_landing_entry.png') });

  // ── 2. /quick 페이지 — 프리셋 카드 ──
  console.log('2. Quick page — presets...');
  await page.goto(`${BASE}/quick`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '02_preset_cards.png') });

  // ── 3. 폼 작성 — 강아지 선택 + 장면 입력 ──
  console.log('3. Filling form...');
  // 강아지 카드 클릭 (3번째 프리셋)
  const presetBtns = await page.locator('button:has(img)').all();
  if (presetBtns.length >= 3) await presetBtns[2].click();
  await page.waitForTimeout(300);

  // 장면 입력
  const promptInput = page.locator('input[maxlength="200"]');
  await promptInput.fill('비 오는 골목을 걸어간다');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '03_form_filled.png') });

  // ── 4. 만들기 클릭 (실생성 1회) ──
  console.log('4. Generating...');
  const ctaBtn = page.locator('button:has-text("만들기")');
  if (await ctaBtn.isVisible()) {
    await ctaBtn.click();
    // 생성 완료 대기 (최대 60초)
    await page.waitForSelector('img[alt="생성된 컷"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(OUT, '04_result.png') });

  // ── 5. "이 컷으로 이야기 만들기" → STEP 1 확인 ──
  console.log('5. Expand to story...');
  const expandBtn = page.locator('button:has-text("이야기 만들기")');
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(OUT, '05_step1_inherit.png') });

  console.log(`Screenshots saved to ${OUT}/`);
  await browser.close();
})();
