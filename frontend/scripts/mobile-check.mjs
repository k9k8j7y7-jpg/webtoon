// 모바일 레이아웃 자체 확인: 375·412·1280px에서 뷰어·게이트4·게이트5 스크린샷 + 가로 넘침 검사
// Usage: node scripts/mobile-check.mjs <JWT> [BASE]
//   BASE 기본값 http://localhost:5199/WEBTOON (vite dev, API는 운영 프록시)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check.mjs <JWT> [BASE]'); process.exit(1); }
const BASE = process.argv[3] || 'http://localhost:5199/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const VIEWER_TOKEN = '65cb2832-881d-4863-8fb4-5c7044384858'; // ep30 자연바람 아로마 헤어팩 광고
const EP_9x16 = '/projects/5/episodes/36/workflow'; // 장소 테스트2
const EP_1x1 = '/projects/5/episodes/5/workflow';   // 쿨링 헤어팩 다이어리 (1:1)
const WIDTHS = [375, 412, 1280];

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    const mobile = w < 640;
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);

    const shot = async (name, full = false) => {
      const file = `${OUT}${w}-${name}.png`;
      await page.screenshot({ path: file, fullPage: full });
      console.log(`${w}px ${name}: overflowX=${await overflowX(page)} → ${file}`);
    };

    // 공개 뷰어
    await page.goto(`${BASE}/view/${VIEWER_TOKEN}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(300);
    await shot('viewer');

    // 게이트5 (9:16)
    await page.goto(`${BASE}${EP_9x16}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot('gate5-top');
    await shot('gate5-full', true);
    const a4 = page.locator('button:has-text("A4")').first();
    if (await a4.count()) {
      await a4.click();
      await page.waitForTimeout(300);
      const box = await page.locator('text=A4 인쇄용 내보내기').locator('..').boundingBox();
      console.log(`${w}px A4 dropdown box:`, box && { x: Math.round(box.x), right: Math.round(box.x + box.width), vw: w });
      await shot('gate5-a4');
      await a4.click();
    }

    // 게이트4 (읽기 전용 보기)
    const g4 = page.locator('button:has-text("콘티&장소")').first();
    if (await g4.count()) {
      await g4.click();
      await page.waitForTimeout(1500);
      await shot('gate4-full', true);
    }

    // 게이트5 (1:1 기존 에피소드)
    await page.goto(`${BASE}${EP_1x1}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot('gate5-1x1');

    await ctx.close();
  }
  await browser.close();
})();
