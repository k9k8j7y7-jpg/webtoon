// 모바일 레이아웃 자체 확인: 다크/라이트 × 375/412/1280px에서 목록·게이트4·게이트5 스크린샷 + 가로 넘침 검사
// Usage: node scripts/mobile-check.mjs <JWT> [BASE]
//   BASE 기본값 https://ssagda.com/WEBTOON (운영 서버)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/mobile-check.mjs <JWT> [BASE]'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const VIEWER_TOKEN = '65cb2832-881d-4863-8fb4-5c7044384858'; // ep30 자연바람 아로마 헤어팩 광고
const EP_9x16 = '/projects/5/episodes/36/workflow'; // 장소 테스트2
const EP_1x1 = '/projects/5/episodes/5/workflow';   // 쿨링 헤어팩 다이어리 (1:1)
const WIDTHS = [375, 412, 1280];
const THEMES = ['dark', 'light'];

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const browser = await chromium.launch();
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      const mobile = w < 640;
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`);
      await page.evaluate(({ t, th }) => { localStorage.setItem('token', t); localStorage.setItem('theme', th); }, { t: TOKEN, th: theme });

      const prefix = `${theme}-${w}`;
      const shot = async (name, full = false) => {
        const file = `${OUT}${prefix}-${name}.png`;
        await page.screenshot({ path: file, fullPage: full });
        console.log(`${prefix} ${name}: overflowX=${await overflowX(page)} → ${file}`);
      };

      // 프로젝트 목록 (대시보드)
      await page.goto(`${BASE}/projects/5`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await shot('list');

      // 게이트5 (9:16)
      await page.goto(`${BASE}${EP_9x16}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await shot('gate5-top');

      // 게이트4 (읽기 전용 보기)
      const clicked = await page.evaluate(() => {
        const sh = document.querySelector('.scrollbar-hide');
        if (!sh) return false;
        const btns = [...sh.querySelectorAll('button')];
        const g4 = btns.find(b => b.textContent.trim() === '콘티&장소');
        if (g4 && !g4.disabled) { g4.click(); return true; }
        return false;
      });
      if (clicked) {
        await page.waitForTimeout(2500);
        await shot('gate4', true);
      }

      // 공개 뷰어 (항상 다크 — 변화 없음 확인)
      if (theme === 'dark' && w === 375) {
        await page.goto(`${BASE}/view/${VIEWER_TOKEN}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        await page.evaluate(() => window.scrollTo(0, 700));
        await page.waitForTimeout(300);
        await shot('viewer');
      }

      await ctx.close();
    }
  }
  await browser.close();
  console.log('Done — screenshots in', OUT);
})();
