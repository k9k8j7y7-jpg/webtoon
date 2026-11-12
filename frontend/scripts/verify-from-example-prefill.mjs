// from-example 프리필 6필드 검증 — KOOKO 예시 → [이 설정으로 만들기] → 브리프 필드 값 확인
// 실행: TOKEN_FILE=<jwt 파일 경로> node scripts/verify-from-example-prefill.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = '../scratch/captures/from-example-prefill';
mkdirSync(OUT, { recursive: true });
const TOKEN = readFileSync(process.env.TOKEN_FILE, 'utf8').trim();

// KOOKO 예시 작품
const SHARE = '4da8f9d0-19e9-4667-a5f4-4777ee92c8d3';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// 로그인
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);

// 뷰어 → [이 설정으로 만들기]
await page.goto(`${BASE}/view/${SHARE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const btn = page.getByRole('button', { name: /이 설정으로 만들기/ }).first();
await btn.scrollIntoViewIfNeeded({ timeout: 8000 });
await btn.click();
await page.waitForURL('**/projects/*/episodes/*/workflow**', { timeout: 15000 });
console.log('✅ workflow 도달:', page.url());

// Gate1 로드 대기
await page.waitForTimeout(3000);

// idea_brief 값을 API에서 직접 확인
const match = page.url().match(/projects\/(\d+)\/episodes\/(\d+)/);
const [, projId, epId] = match;
const apiRes = await page.evaluate(async ({ base, projId, epId, token }) => {
  const r = await fetch(`${base}/api/v1/projects/${projId}/episodes/${epId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.json();
}, { base: BASE, projId, epId, token: TOKEN });

const ib = apiRes.gate_status?.idea_brief || {};
console.log('\n── idea_brief 프리필 검증 ──');

const checks = [
  { label: '전달 내용 (key_message)', value: ib.key_message },
  { label: '제품명 (product_name)', value: ib.product_name },
  { label: '제품 정보 (product_info)', value: ib.product_info },
  { label: '카피 디자인 (copy_design)', value: ib.copy_design },
  { label: '설명 장치 (onecut_device)', value: ib.onecut_device },
  { label: '보여줄 특징 (visual_points_selected)', value: ib.visual_points_selected },
];

let fail = 0;
for (const c of checks) {
  const ok = c.value !== undefined && c.value !== null && c.value !== '';
  const display = typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value ?? '');
  console.log(`${ok ? '✅' : '❌'} ${c.label}: ${display.slice(0, 80)}`);
  if (!ok) fail++;
}

// 스크린샷 — 브리프 폼 영역
await page.screenshot({ path: `${OUT}/01_gate1.png`, fullPage: true });

// prefilled_from 확인
console.log(`\nprefilled_from: ${ib.prefilled_from || '(없음)'}`);
console.log(`ad_purpose: ${ib.ad_purpose || '(없음)'}`);
console.log(`mood: ${ib.mood || '(없음)'}`);

await browser.close();
console.log(`\n${fail === 0 ? '✅ 전체 PASS' : `❌ ${fail}개 실패`} — captures in ${OUT}`);
process.exit(fail ? 1 : 0);
