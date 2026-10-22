// 랜딩 2단계 검증: 스크롤0 + 릴스 재생 + 회귀(갤러리·로그인)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/verify-landing.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./verify-landing/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();

  for (const w of [375, 412, 1280]) {
    const mobile = w < 640;
    const theme = mobile ? 'dark' : 'light';
    const ctx = await browser.newContext({
      viewport: { width: w, height: w === 412 ? 915 : 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.evaluate(({ t, th }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('theme', th);
    }, { t: TOKEN, th: theme });

    const prefix = `${theme}-${w}`;
    const shot = async (name) => {
      const file = `${OUT}${prefix}-${name}.png`;
      await page.screenshot({ path: file });
      console.log(`  ${prefix}-${name}.png`);
    };
    const shotFull = async (name) => {
      const file = `${OUT}${prefix}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ${prefix}-${name}.png (full)`);
    };

    // 랜딩 로드 + 결과물 이미지 대기
    console.log(`\n[${prefix}] 랜딩`);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 스크롤 0 캡처 (첫 화면)
    await shot('landing-scroll0');

    // 전체 캡처
    await shotFull('landing-full');

    // 릴스 video 재생 확인 (375만)
    if (mobile && w === 375) {
      const videoTime = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : -1;
      });
      await page.waitForTimeout(2000);
      const videoTime2 = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : -1;
      });
      console.log(`  video currentTime: ${videoTime.toFixed(1)}s → ${videoTime2.toFixed(1)}s (playing: ${videoTime2 > videoTime})`);
    }

    // 회귀: 갤러리 스크롤
    await page.evaluate(() => document.getElementById('gallery')?.scrollIntoView());
    await page.waitForTimeout(1500);
    await shot('gallery');

    // 회귀: 로그인 페이지 (비회원 시뮬 — 직접 /login으로)
    if (w === 375) {
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await shot('login');
    }

    await ctx.close();
  }

  console.log('\n✅ 완료');
  await browser.close();
})();
