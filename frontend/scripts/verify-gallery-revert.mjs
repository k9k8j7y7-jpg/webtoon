// 갤러리 되돌리기 + 광고 3종 필터 검증
// TOKEN_FILE=<jwt> node scripts/verify-gallery-revert.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = '../scratch/captures/gallery-revert';
mkdirSync(OUT, { recursive: true });
const TOKEN = readFileSync(process.env.TOKEN_FILE, 'utf8').trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);

// 랜딩 → 갤러리 스크롤
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const gallery = page.locator('#gallery');
if (await gallery.count()) {
  await gallery.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01_gallery_all.png`, fullPage: false });
  console.log('01 갤러리 전체 탭');
}

// 예시 먼저 보기 탭
const exChip = page.getByRole('button', { name: '예시 먼저 보기' }).first();
if (await exChip.count()) {
  await exChip.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/02_gallery_example.png`, fullPage: false });
  const cards = page.locator('#gallery h3');
  const count = await cards.count();
  console.log(`02 예시 먼저 보기: ${count}개 카드`);
}

// 각 필터 탭
for (const tab of ['한 컷', '인스타툰', '연재툰']) {
  const chip = page.getByRole('button', { name: tab }).first();
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(1500);
  }
}
await page.screenshot({ path: `${OUT}/03_gallery_tabs.png`, fullPage: false });
console.log('03 필터 탭 확인');

// 공개 바 체크: 예시 작품(ep162 KOOKO)의 brief_public 체크
const SHARE = '4da8f9d0-19e9-4667-a5f4-4777ee92c8d3';
await page.goto(`${BASE}/view/${SHARE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/04_viewer_kooko.png`, fullPage: false });
console.log('04 KOOKO 뷰어');

await browser.close();
console.log(`DONE — ${OUT}`);
