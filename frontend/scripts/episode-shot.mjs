/**
 * episode-shot.mjs — 실제 에피소드 게이트5 컷별 스크린샷
 * 미리보기 모달(라이트박스) 기준으로 각 컷을 캡처한다.
 * Usage: node scripts/episode-shot.mjs
 * Requires: JWT token in .env.local (VITE_TEST_JWT=...)
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'test-shots');
const rootDir = resolve(__dirname, '..');

function loadToken() {
  const envPath = resolve(rootDir, '.env.local');
  if (!existsSync(envPath)) {
    console.error('.env.local not found. Create it with: VITE_TEST_JWT=your_token');
    process.exit(1);
  }
  const content = readFileSync(envPath, 'utf-8');
  const match = content.match(/^VITE_TEST_JWT=(.+)$/m);
  if (!match || !match[1] || match[1].startsWith('여기에')) {
    console.error('VITE_TEST_JWT not set in .env.local');
    process.exit(1);
  }
  return match[1].trim();
}

const token = loadToken();
const baseUrl = 'https://ssagda.com/WEBTOON';
const episodeUrl = `${baseUrl}/projects/5/episodes/13/workflow`;

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('Chromium launch failed:', e.message);
    process.exit(1);
  }

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // localStorage에 토큰 주입
  await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate((t) => localStorage.setItem('token', t), token);

  console.log('Navigating to episode workflow...');
  await page.goto(episodeUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Gate5 탭 클릭
  const gate5Btn = await page.$('button:has-text("이미지"), button:has-text("5단계"), [data-gate="5"]');
  if (gate5Btn) {
    await gate5Btn.click();
    await page.waitForTimeout(2000);
  }

  // 컷 이미지 로딩 대기
  console.log('Waiting for cut images...');
  try {
    await page.waitForSelector('.aspect-square img', { timeout: 15000 });
  } catch {
    console.error('Cut images not found.');
    await page.screenshot({ path: resolve(outDir, 'ep13-debug.png'), fullPage: true });
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(3000);

  // 썸네일 그리드 전체 1장 (참고용)
  await page.screenshot({ path: resolve(outDir, 'ep13-grid.png'), fullPage: true });
  console.log('Saved: ep13-grid.png');

  // 컷 카드 수집
  const cutCards = await page.$$('.grid .border-2.rounded-2xl');
  console.log(`Found ${cutCards.length} cut cards`);

  if (cutCards.length === 0) {
    console.error('No cut cards found');
    await browser.close();
    process.exit(1);
  }

  // 각 컷: 클릭 → 모달 캡처 → 닫기
  for (let i = 0; i < cutCards.length; i++) {
    const num = String(i + 1).padStart(2, '0');

    // 스크롤 + 줌 버튼 클릭으로 모달 열기
    await cutCards[i].scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // hover하여 줌 버튼 표시 → 클릭
    const zoomBtn = await cutCards[i].$('button[class*="cursor-zoom-in"]');
    if (zoomBtn) {
      await cutCards[i].hover();
      await page.waitForTimeout(200);
      await zoomBtn.click();
    } else {
      // 줌 버튼이 없으면 이미지 영역 클릭
      const imgArea = await cutCards[i].$('.aspect-square');
      if (imgArea) await imgArea.click();
    }

    // 모달 대기 — max-h-[90vh] 이미지가 나타날 때까지
    try {
      await page.waitForSelector('img[class*="max-h-"]', { timeout: 5000 });
      await page.waitForTimeout(1000); // SVG 오버레이 렌더 대기

      // 모달 내부의 이미지+말풍선 컨테이너 캡처
      const modalImg = await page.$('.relative.inline-block');
      if (modalImg) {
        await modalImg.screenshot({ path: resolve(outDir, `ep13-cut${num}.png`) });
        console.log(`Saved: ep13-cut${num}.png (modal)`);
      } else {
        // fallback: 전체 모달 영역
        await page.screenshot({ path: resolve(outDir, `ep13-cut${num}.png`) });
        console.log(`Saved: ep13-cut${num}.png (fullscreen fallback)`);
      }
    } catch {
      console.log(`Cut ${num}: modal not opened, skipping`);
    }

    // 모달 닫기 — ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  await browser.close();
  console.log(`Done. Screenshots saved to test-shots/`);
}

main();
