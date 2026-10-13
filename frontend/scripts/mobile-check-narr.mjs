// 내레이션 박스 mobile-check: 뷰어에서 bar narration 확인 + 편집기 375/412
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check-narr.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

// 공개 뷰어 토큰 (ep20, narration 있음)
const VIEWER_SHARE = '65cb2832-881d-4863-8fb4-5c7044384858';

const browser = await chromium.launch();

for (const w of [375, 412]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.evaluate(t => localStorage.setItem('token', t), TOKEN);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));

  // 1. 뷰어 (공개): bar narration 표시 확인
  await page.goto(`${BASE}/view/${VIEWER_SHARE}`);
  await page.waitForTimeout(3000);
  // 스크롤 아래로 — narration이 있는 컷으로
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/narr-viewer-${w}.png` });
  console.log(`viewer ${w} OK`);

  // 2. 워크플로우 — user_id=1 소유 에피소드
  await page.goto(`${BASE}/my`);
  await page.waitForTimeout(2000);
  // 첫 프로젝트 클릭
  const projCards = await page.locator('.glass-card a, .glass-card').all();
  if (projCards.length > 0) {
    await projCards[0].click();
    await page.waitForTimeout(2000);
    // 에피소드 카드 클릭
    const epCards = await page.locator('.glass-card').all();
    if (epCards.length > 0) {
      await epCards[0].click();
      await page.waitForTimeout(2000);

      // Gate5 탭 찾기
      const navBtns = await page.locator('nav button, [role="tablist"] button').all();
      for (const btn of navBtns) {
        const t = await btn.textContent().catch(() => '');
        if (t.includes('이미지') || t.includes('5')) { await btn.click(); break; }
      }
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/narr-gate5-${w}.png` });
      console.log(`gate5 ${w} OK`);
    }
  }

  await ctx.close();
}
await browser.close();
console.log('Done.');
