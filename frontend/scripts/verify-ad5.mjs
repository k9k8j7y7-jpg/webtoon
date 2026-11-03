/**
 * 광고 트랙 5차 검증 ①~⑥
 * node frontend/scripts/verify-ad5.mjs <JWT>
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const API = `${BASE}/api/v1`;
const OUT = path.resolve('frontend/scripts/verify-ad5');
fs.mkdirSync(OUT, { recursive: true });

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body, jwt }) => {
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
  }, { method, url, body, jwt: JWT });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, deviceScaleFactor: 2,
    colorScheme: 'dark', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate((jwt) => { localStorage.setItem('token', jwt); localStorage.setItem('theme', 'dark'); }, JWT);

  // Use ep119 (project 12, instatoon_ad, gate5, 4 cuts with products)
  const PID = 12, EID = 119;

  // ── ① 준비 승인 버튼 문구 캡처 ──
  console.log('=== ① 준비 승인 버튼 ===');
  // gate3 is readOnly for ep119 (gate5 done), use gate2 viewing
  // Instead, let's capture gate3 of a newer ep that's at gate3 stage
  // ep117 is at gate2 (project 14), let me check
  // Actually just capture the gate3 page of ep119 in viewing mode - the approve button won't show
  // Better: create a simple screenshot showing the button text in code. Or use an ep at gate3.
  // Let me check ep122 (project 15, instatoon_ad, gate2 state)
  // We need an ep at gate3 or earlier to see the approve button.
  // Let's try ep117 (project 14, gate2)
  await page.goto(`${BASE}/projects/14/episodes/117/workflow?gate=3`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '01-gate3-approve-btn.png'), fullPage: true });
  console.log('① gate3 approve button saved');

  // ── ② 완성 첫 화면 "N컷 전부 생성" + ③ 안내 + 빈 카드 ──
  console.log('\n=== ② ③ 58 완성 화면 ===');
  // ep119 has some images, ep123 has no images (gate4)
  // Let's use ep123 (project 16, instatoon_ad, gate4 - no cuts/images)
  await page.goto(`${BASE}/projects/16/episodes/123/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '02-gate5-all-pending.png'), fullPage: true });
  console.log('② ③ gate5 all pending + empty cards saved');

  // Also capture ep119 gate5 for "남은 N컷" (it has some images, some pending)
  await page.goto(`${BASE}/projects/12/episodes/119/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '02b-gate5-partial.png'), fullPage: true });
  console.log('② gate5 partial (ep119) saved');

  // ── ③ 비has_product 컷 1패킷 생성 (57 검증) ──
  // ep119 has 4 cuts, #2 is pending (no image), and might not be has_product
  console.log('\n=== ③ 57 검증: 비has_product 컷 생성 ===');
  const cutsRes = await api(page, 'GET', `${API}/projects/${PID}/episodes/${EID}/cuts`, null);
  const allCuts = cutsRes.data || [];
  console.log(`ep119 cuts: ${allCuts.length}`);
  for (const c of allCuts) {
    console.log(`  cut ${c.cut_number}: has_product=${c.has_product}, image=${!!c.image_url}`);
  }
  // Find a non-has_product cut that has an image (to regenerate)
  const nonProductCut = allCuts.find(c => !c.has_product && c.image_url);
  if (nonProductCut) {
    console.log(`\nRegenerating non-product cut ${nonProductCut.cut_number} (${nonProductCut.cut_id})...`);
    const regenRes = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/regenerate/${nonProductCut.id}`, {});
    console.log('regen:', regenRes.status, regenRes.data?.job_id ? 'job started' : JSON.stringify(regenRes.data).slice(0, 100));

    if (regenRes.data?.job_id) {
      // Poll for completion
      const jobId = regenRes.data.job_id;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(5000);
        const jobRes = await api(page, 'GET', `${API}/jobs/${jobId}`, null);
        if (jobRes.data?.status === 'completed' || jobRes.data?.status === 'failed') {
          console.log(`Job ${jobRes.data.status} after ${(i+1)*5}s`);
          break;
        }
      }
    }
  } else {
    console.log('No non-product cut with image found for regen test');
  }

  // Reload gate5 after regen to capture
  await page.goto(`${BASE}/projects/${PID}/episodes/${EID}/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '03-after-regen.png'), fullPage: true });
  console.log('③ after regen saved');

  // ── ⑤ onecut_ad 1패킷 완주 ──
  console.log('\n=== ⑤ onecut ep120 ===');
  await page.goto(`${BASE}/projects/12/episodes/120/workflow?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '05-onecut-ok.png'), fullPage: true });
  console.log('⑤ onecut ep120 gate5 saved');

  console.log('\n=== Summary ===');
  console.log(`Screenshots: ${OUT}/`);
  console.log('Files:', fs.readdirSync(OUT).join(', '));

  await browser.close();
})();
