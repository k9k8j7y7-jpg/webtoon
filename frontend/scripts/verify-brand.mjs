/**
 * 브랜드 연재툰 2단계 검증 — Gate2 칩 + [새 화] 2화 프리필
 * node frontend/scripts/verify-brand.mjs <JWT>
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const API = `${BASE}/api/v1`;
const OUT = path.resolve('frontend/scripts/verify-brand');
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

  // test_series = project 13, brand_series
  // ep113 = 1화 (gate1), ep114 = 2화 (gate3), ep115 = 3화 (gate1)
  const PID = 13;

  // ── Gate2 칩 6/8/10 캡처 (ep114, gate3 → gate2 보기 모드) ──
  console.log('=== Gate2 칩 캡처 ===');
  await page.goto(`${BASE}/projects/${PID}/episodes/114/workflow?gate=2`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'gate2-chips.png'), fullPage: true });
  console.log('gate2 chips saved');

  // ── [새 화] → 새 에피소드 생성 ──
  console.log('\n=== [새 화] 테스트 ===');
  // 새 에피소드 생성 via API (episode_no=4)
  const newEpRes = await api(page, 'POST', `${API}/projects/${PID}/episodes`, {
    title: '4화', episode_no: 4, is_ad: true, purpose: 'brand_series',
  });
  console.log('new ep:', newEpRes.status, newEpRes.data?.id);

  if (newEpRes.status === 201) {
    const newEid = newEpRes.data.id;
    // 프리필 확인 — gate_status.idea_brief 조회
    const epRes = await api(page, 'GET', `${API}/projects/${PID}/episodes/${newEid}`, null);
    const ib = epRes.data?.gate_status?.idea_brief;
    console.log('prefilled_from:', ib?.prefilled_from);
    console.log('product_name:', ib?.product?.name || ib?.product_name);
    console.log('episode_topic:', ib?.episode_topic);

    // 브리프 화면 캡처
    await page.goto(`${BASE}/projects/${PID}/episodes/${newEid}/workflow?gate=1`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'new-ep-brief.png'), fullPage: true });
    console.log('new ep brief (prefill) saved');

    // URL 보고
    console.log(`\nEpisode URL: ${BASE}/projects/${PID}/episodes/${newEid}/workflow`);
  }

  // ── 프로젝트 페이지 에피소드 목록 ──
  console.log('\n=== 프로젝트 페이지 ===');
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'project-list.png'), fullPage: true });
  console.log('project list saved');

  console.log('\nFiles:', fs.readdirSync(OUT).join(', '));
  await browser.close();
})();
