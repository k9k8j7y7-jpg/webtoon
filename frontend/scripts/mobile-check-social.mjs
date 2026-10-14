// 구독·알림 4단계 mobile-check: 작가 페이지·알림센터(토글·설치 카드)·댓글·설정 알림 섹션
// Usage: node scripts/mobile-check-social.mjs <JWT> [BASE]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check-social.mjs <JWT>'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const AUTHOR = '도도툰';
const VIEWER_TOKEN = 'b99293ca-8dc1-4c61-b8ce-5421a53ef663'; // ep41
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
      const tag = `${theme}-${w}`;

      // 1) 작가 페이지
      await page.goto(`${BASE}/u/${encodeURIComponent(AUTHOR)}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/author-${tag}.png` });
      console.log(`author ${tag} OK`);

      // 2) 알림센터
      await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/notifications-${tag}.png`, fullPage: true });
      console.log(`notifications ${tag} OK`);

      // 3) 설정 → 알림 섹션
      await page.goto(`${BASE}/settings#notify`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      // 알림 섹션으로 스크롤
      await page.evaluate(() => document.getElementById('notify')?.scrollIntoView());
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/settings-notify-${tag}.png`, fullPage: true });
      console.log(`settings-notify ${tag} OK`);

      // 4) 댓글 (뷰어 하단)
      await page.goto(`${BASE}/view/${VIEWER_TOKEN}#comments`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      // 댓글 섹션으로 스크롤
      await page.evaluate(() => document.getElementById('comments')?.scrollIntoView());
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/comments-${tag}.png` });
      console.log(`comments ${tag} OK`);

      await ctx.close();
    }
  }

  await browser.close();
  console.log('Done. Screenshots in', OUT);
})();
