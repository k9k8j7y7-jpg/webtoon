/**
 * verify-quick-expand.mjs — B안 expand 검증
 * 1. quick-cut 생성 → 결과
 * 2. [이 컷으로 이야기 만들기] → 새 프로젝트·에피소드, STEP 1 도착
 * 3. 원본 빠른 컷 에피소드 status 불변 확인 (API)
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node verify-quick-expand.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const API = `${BASE}/api/v1`;
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

  // ── 1. 빠른 컷 생성 ──
  console.log('1. Generating quick cut...');
  await page.goto(`${BASE}/quick`);
  await page.waitForTimeout(2000);

  // 고양이 선택 (4번째)
  const presets = await page.locator('button:has(img)').all();
  if (presets.length >= 4) await presets[3].click();
  await page.waitForTimeout(300);

  // 장면 + 대사
  const inputs = await page.locator('input[type="text"]').all();
  if (inputs.length >= 1) await inputs[0].fill('지붕 위에서 별을 본다');
  if (inputs.length >= 2) await inputs[1].fill('야옹~');
  await page.waitForTimeout(500);

  // 만들기
  const ctaBtn = page.locator('button:has-text("만들기")');
  if (await ctaBtn.isVisible()) {
    await ctaBtn.click();
    await page.waitForSelector('img[alt="생성된 컷"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  // 결과 캡처 — 말풍선 확인
  await page.screenshot({ path: path.join(OUT, '11_expand_result.png') });

  // ── 2. [이 컷으로 이야기 만들기] ──
  console.log('2. Expanding to story...');
  const expandBtn = page.locator('button:has-text("이야기 만들기")');
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
    // 토스트 + 1초 대기 + navigate
    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: path.join(OUT, '12_expand_step1.png') });

  // ── 3. 원본 에피소드 status 확인 (API) ──
  console.log('3. Checking original episode...');
  const origStatus = await page.evaluate(async (jwt) => {
    // 빠른 컷 프로젝트의 에피소드 목록에서 가장 최근 조회
    const resp = await fetch(`${location.origin}/WEBTOON/api/v1/projects/8/episodes`, {
      headers: { 'Authorization': `Bearer ${jwt}` }
    });
    if (!resp.ok) return { error: resp.status };
    const episodes = await resp.json();
    const last = episodes[episodes.length - 1];
    return {
      episode_id: last?.id,
      current_gate: last?.gate_status?.current_gate,
      is_quick: last?.gate_status?.is_quick,
      gate5_status: last?.gate_status?.gates?.['5_review']?.status,
    };
  }, JWT);
  console.log('Original episode status:', JSON.stringify(origStatus));

  console.log(`Screenshots saved to ${OUT}/`);
  await browser.close();
})();
