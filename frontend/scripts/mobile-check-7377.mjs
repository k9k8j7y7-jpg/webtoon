// 73~77 + 한 컷 장치 mobile-check: 375 다크 @2x → scratch/captures/
// 실행(저장소 루트): TOKEN 환경변수에 JWT → node frontend/scripts/mobile-check-7377.mjs (명령줄에 토큰 쓰지 말 것)
import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/frontend/package.json');
const { chromium } = require('playwright');
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'scratch/captures';
const token = process.env.TOKEN;
if (!token) { console.error('TOKEN 환경변수 필요'); process.exit(1); }
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
await ctx.addInitScript(t => { localStorage.setItem('token', t); localStorage.setItem('theme', 'dark'); }, token);
const page = await ctx.newPage();
const shot = async (name, url, fn) => {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  let note = '';
  if (fn) note = (await fn()) || '';
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  console.log(p, note);
};
const txt = async s => (await page.locator(`text=${s}`).count());
// 73 brand_series 2화(ep148) — 형식·비율 숨김
await shot('73_brand_series_ep148', '/projects/23/episodes/148/workflow', async () => `형식=${await txt('페이지 형식')} 비율=${await txt('화면 비율')} step=${page.url()}`);
// 74·76 MySeriesPage
await shot('74_76_my_series_23', '/my/series/23', async () => `3화만들기=${await txt('3화 만들기')} 완성단계=${await txt('완성 단계')}`);
// 76 내 작품 시리즈 카드
await shot('76_my_works', '/my', async () => `완성단계=${await txt('완성 단계')} 완료=${await txt('화 완료')}`);
// 77 Dashboard
await shot('77_dashboard', '/projects', async () => `기본=${await txt('기본 프로젝트')} 빠른한컷=${await txt('빠른 한 컷')}`);
// 75 다시 쓰기 진행 — ep157 브리프 (0패킷 텍스트)
await page.goto(BASE + '/projects/12/episodes/157/workflow', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const chip = page.locator('text=✨ 다시 쓰기:').locator('..').locator('button').first();
if (await chip.count()) {
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await page.waitForTimeout(400);
  const dis = await page.locator('text=✨ 다시 쓰기:').locator('..').locator('button[disabled]').count();
  const spin = await page.locator('text=✨ 다시 쓰기:').locator('..').locator('svg.animate-spin').count();
  await page.locator('text=✨ 다시 쓰기:').locator('..').screenshot({ path: `${OUT}/75_rewrite_spinner.png` });
  await page.screenshot({ path: `${OUT}/75_rewrite_spinner_full.png`, fullPage: false });
  console.log(`${OUT}/75_rewrite_spinner.png disabled=${dis} spinner=${spin}`);
  await page.waitForFunction(() => !document.querySelector('svg.animate-spin'), null, { timeout: 60000 }).catch(() => {});
  await page.locator('text=✨ 다시 쓰기:').locator('..').screenshot({ path: `${OUT}/75_rewrite_done.png` });
  console.log(`${OUT}/75_rewrite_done.png`);
} else console.log('75: 다시 쓰기 칩 없음', page.url());
await browser.close();
