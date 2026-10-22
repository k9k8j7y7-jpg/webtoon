// 내레이션 박스 모바일 확인: 편집기에서 box 드래그·리사이즈 375/412 캡처
// Usage: node scripts/mobile-check-narration.mjs <JWT> [BASE]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check-narration.mjs <JWT>'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

// ep36(장소 테스트2)에 나레이션이 있을 가능성 높음. 없으면 box 보이지 않지만 편집기 자체는 보임
const EP_PATH = '/projects/5/episodes/36/workflow';
const WIDTHS = [375, 412];

(async () => {
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();

    // 로그인
    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));

    // Gate5로 이동
    await page.goto(`${BASE}${EP_PATH}`);
    await page.waitForTimeout(2500);

    // Gate5 탭 클릭 (5번째)
    const tabs = await page.$$('[class*="step"]');
    if (tabs.length >= 5) await tabs[4].click();
    await page.waitForTimeout(2000);

    // 스크린샷 1: Gate5 미리보기
    await page.screenshot({ path: `${OUT}/narr-box-gate5-${w}.png` });
    console.log(`gate5 ${w} OK`);

    // 첫 번째 컷 카드의 편집 버튼 찾기
    const editBtn = await page.$('button:has-text("편집")');
    if (editBtn) {
      await editBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/narr-box-editor-${w}.png` });
      console.log(`editor ${w} OK`);

      // 편집 모드 진입
      const editModeBtn = await page.$('button:has-text("편집")');
      if (editModeBtn) {
        await editModeBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${OUT}/narr-box-editmode-${w}.png` });
        console.log(`editmode ${w} OK`);
      }
    }

    await ctx.close();
  }
  await browser.close();
  console.log('Done. Screenshots in', OUT);
})();
