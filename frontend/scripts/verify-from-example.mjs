// [이 설정으로 만들기] 경로 검증 — 로그인 → 예시 작품 뷰어 → 버튼 클릭 → workflow 페이지 도달
// 실행: TOKEN_FILE=<jwt 파일 경로> node scripts/verify-from-example.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = '../scratch/captures/from-example';
mkdirSync(OUT, { recursive: true });
const TOKEN = readFileSync(process.env.TOKEN_FILE, 'utf8').trim();

// KOOKO 예시 작품 (is_example=1, 공개)
const SHARE = '4da8f9d0-19e9-4667-a5f4-4777ee92c8d3';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// 로그인
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);

// 뷰어 진입
await page.goto(`${BASE}/view/${SHARE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// [이 설정으로 만들기] 버튼 찾기
const btn = page.getByRole('button', { name: /이 설정으로 만들기/ }).first();
await btn.scrollIntoViewIfNeeded({ timeout: 8000 });
await page.screenshot({ path: `${OUT}/01_viewer_btn.png`, fullPage: false });
console.log('✅ 뷰어에서 [이 설정으로 만들기] 버튼 발견');

// 클릭
await btn.click();
// workflow 페이지 도달 대기 — /projects/.../episodes/.../workflow
try {
  await page.waitForURL('**/projects/*/episodes/*/workflow**', { timeout: 15000 });
  console.log('✅ workflow 페이지 도달:', page.url());
} catch {
  console.log('❌ workflow 도달 실패, 현재 URL:', page.url());
  await page.screenshot({ path: `${OUT}/02_fail.png`, fullPage: true });
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/02_workflow.png`, fullPage: false });

// 브리프(기획) 내용이 프리필됐는지 — Gate1 영역 존재 확인
const body = await page.locator('body').innerText();
const hasBrief = body.includes('기획') || body.includes('광고 목적') || body.includes('아이디어');
console.log(hasBrief ? '✅ 브리프/기획 영역 확인' : '⚠️ 브리프 영역 미확인 (수동 확인 필요)');

await page.screenshot({ path: `${OUT}/03_brief.png`, fullPage: true });
await browser.close();
console.log('DONE — captures in', OUT);
process.exit(0);
