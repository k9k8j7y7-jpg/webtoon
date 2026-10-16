// 모션 웹툰 모바일 확인: 모달·피커 375/412 다크 캡처
// Usage: node scripts/mobile-check-motion.mjs <JWT> [BASE]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check-motion.mjs <JWT>'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const EP_PATH = '/projects/5/episodes/39/workflow';
const WIDTHS = [375, 412, 1280];

(async () => {
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    const isMobile = w < 640;
    const ctx = await browser.newContext({
      viewport: { width: w, height: isMobile ? 900 : 800 },
      deviceScaleFactor: isMobile ? 2 : 1, isMobile, hasTouch: isMobile,
    });
    const page = await ctx.newPage();

    // 로그인
    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));

    // Gate5
    await page.goto(`${BASE}${EP_PATH}?gate=5`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // 1. 카드 — [움직이게] 버튼 보이는 상태
    await page.screenshot({ path: `${OUT}/motion_card_${w}.png`, fullPage: false });
    console.log(`${w}px: card saved`);

    // 2. 모달 — [움직이게] 클릭
    const motionBtn = await page.$('button:has-text("움직이게")');
    if (motionBtn) {
      await motionBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/motion_modal_${w}.png`, fullPage: false });
      console.log(`${w}px: modal saved`);
      const cancelBtn = await page.$('button:has-text("취소")');
      if (cancelBtn) await cancelBtn.click();
      await page.waitForTimeout(300);
    } else {
      console.log(`${w}px: no [움직이게] button`);
    }

    // 3. 피커 — [▶ 후보 고르기] 또는 [▶ 영상] 클릭
    const pickerBtn = await page.$('button:has-text("후보 고르기"), button:has-text("▶ 영상")');
    if (pickerBtn) {
      await pickerBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/motion_picker_${w}.png`, fullPage: false });
      console.log(`${w}px: picker saved`);
      // 닫기
      const xBtn = await page.$('.fixed [class*="z-[70]"] button:has(svg)');
      if (xBtn) await xBtn.click();
      await page.waitForTimeout(300);
    } else {
      console.log(`${w}px: no picker button`);
    }

    await ctx.close();
  }
  await browser.close();
  console.log('Done. Files in', OUT);
})();
