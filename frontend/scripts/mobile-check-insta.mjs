// 인스타 공유 mobile-check: 캡션 모달 (토글·크레딧·피드 안내) 375/412
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check-insta.mjs <JWT>'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

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
    await page.addInitScript(() => {
      navigator.canShare = (d) => !!(d?.files);
      navigator.share = async () => {};
    });
    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(`${BASE}${EP_PATH}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const tabs = await page.$$('[class*="step"]');
    if (tabs.length >= 5) await tabs[4].click();
    await page.waitForTimeout(2000);

    const shareBtn = await page.$('button:has-text("인스타 공유")');
    if (shareBtn) {
      await shareBtn.click();
      // 렌더 완료 대기
      await page.waitForFunction(
        () => {
          const btns = [...document.querySelectorAll('button')];
          return btns.some(b => b.textContent.includes('공유하기') && !b.textContent.includes('준비 중'));
        },
        { timeout: 90000 },
      ).catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/insta-modal-dark-${w}.png`, fullPage: true });
      console.log(`modal dark-${w} OK`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log('Done.');
})();
