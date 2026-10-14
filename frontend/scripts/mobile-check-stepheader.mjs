// 단계 헤더 mobile-check: 헤더·바텀시트 375/412
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check-stepheader.mjs <JWT>'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const EP_PATH = '/projects/5/episodes/36/workflow';
const WIDTHS = [375, 412];

(async () => {
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 900 },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`);
      await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
      await page.evaluate(t => localStorage.setItem('theme', t), theme);
      await page.goto(`${BASE}${EP_PATH}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      const tag = `${theme}-${w}`;

      // 헤더 캡처
      await page.screenshot({ path: `${OUT}/stepheader-${tag}.png` });
      console.log(`header ${tag} OK`);

      // 바텀시트 열기
      await page.locator('button:has-text("단계 이동")').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/stepheader-menu-${tag}.png` });
      console.log(`menu ${tag} OK`);

      // 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      await ctx.close();
    }
  }
  await browser.close();
  console.log('Done.');
})();
