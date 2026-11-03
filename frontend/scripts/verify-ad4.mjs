/**
 * 광고 트랙 4차 검증 스크립트
 * node frontend/scripts/verify-ad4.mjs <JWT>
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node verify-ad4.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const API = `${BASE}/api/v1`;
const OUT = path.resolve('frontend/scripts/verify-ad4');
fs.mkdirSync(OUT, { recursive: true });

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body, jwt }) => {
    const res = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try { return { status: res.status, data: JSON.parse(text) }; }
    catch { return { status: res.status, data: text }; }
  }, { method, url, body, jwt: JWT });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Mobile',
  });

  const page = await ctx.newPage();
  // Set JWT cookie/localStorage
  await page.goto(`${BASE}/login`);
  await page.evaluate((jwt) => {
    localStorage.setItem('token', jwt);
    localStorage.setItem('theme', 'dark');
  }, JWT);

  // ── 1) 에피소드 생성 ──
  console.log('=== Creating project + episode ===');
  const projRes = await api(page, 'POST', `${API}/projects`, { title: '검증4차-auto' });
  const PID = projRes.data.id;
  console.log(`Project: ${PID}`);

  const epRes = await api(page, 'POST', `${API}/projects/${PID}/episodes`, {
    title: '검증 인스타 4컷', episode_no: 1, is_ad: true, purpose: 'instatoon_ad',
    idea: '두피 쿨링 오일 전후', product_name: '두피 쿨링 오일', product_features: '시원한 쿨링감',
  });
  const EID = epRes.data.id;
  console.log(`Episode: ${EID}`);
  const WF = `${BASE}/projects/${PID}/episodes/${EID}/workflow`;
  console.log(`URL: ${WF}`);

  // ── 2) ad-brief 생성 ──
  console.log('\n=== Gate1: ad-brief ===');
  const abRes = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/ad-brief`, {
    ad_purpose: 'info_delivery', key_message: '두피 쿨링으로 시원하게',
  });
  console.log('ad-brief:', abRes.status);

  // ── 3) 기획 생성 ──
  console.log('=== Gate1: planning ===');
  const plRes = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/planning`, {});
  console.log('planning:', plRes.status, plRes.data?.title?.slice(0, 40));

  // ── 4) 기획 승인 ──
  const apRes = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/planning/approve`, { auto_advance: true });
  console.log('gate1 approve:', apRes.status);

  // ── 5) 대본 생성 ──
  console.log('\n=== Gate2: script ===');
  const scRes = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/script`, {});
  console.log('script:', scRes.status);

  // ⑤ 대본 화면 캡처 (훅/카피 라벨 + 장소 칩)
  await page.goto(`${WF}?gate=2`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '02-script-labels.png'), fullPage: true });
  console.log('② ③ script labels + location chip screenshot saved');

  // ── 6) 카피 디자인 변경 (굵은 고딕 · 상단) ──
  console.log('\n=== ② copy_design: bold_gothic + top ===');
  // 카피 디자인 저장 via API
  const gsRes = await api(page, 'GET', `${API}/projects/${PID}/episodes/${EID}`, null);
  const curBrief = gsRes.data?.gate_status?.idea_brief || {};
  await api(page, 'PUT', `${API}/projects/${PID}/episodes/${EID}/idea-brief/selection`, {
    ...curBrief, copy_design: { font: 'bold_gothic', position: 'top', emphasis: null },
  });
  // 대본 카드 새로고침해서 카피 디자인 캡처
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '02b-copy-design.png'), fullPage: true });
  console.log('② copy design screenshot saved');

  // ── 7) 대본 승인 ──
  const scApRes = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/script/approve`, { auto_advance: false });
  console.log('gate2 approve:', scApRes.status);

  // ── 8) 자산 승인 (auto advance: gate3→4→5) ──
  console.log('\n=== Gate3: approve_assets ===');
  // 패킷 확인 전
  const pkBefore = await api(page, 'GET', `${API}/packets`, null);
  console.log('packets before:', pkBefore.data?.balance);

  const assRes = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/assets/approve`, {});
  console.log('approve_assets:', assRes.status);
  await page.waitForTimeout(1000);

  // 패킷 확인 후
  const pkAfter = await api(page, 'GET', `${API}/packets`, null);
  console.log('packets after:', pkAfter.data?.balance);
  console.log(`① 패킷 변화: ${pkAfter.data?.balance - pkBefore.data?.balance}`);

  // ① 완성 화면 캡처 (스피너 없어야 함)
  await page.goto(`${WF}?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '01-gate5-no-spinner.png'), fullPage: true });
  console.log('① gate5 no-spinner screenshot saved');

  // ① generate_all 로그 확인은 서버에서 별도

  // ── 9) 컷별 생성: 1컷 + 4컷 (② 검증) ──
  console.log('\n=== ② 컷별 생성 ===');
  // pending cuts 조회
  const pendRes = await api(page, 'GET', `${API}/projects/${PID}/episodes/${EID}/pending-cuts`, null);
  console.log('pending cuts:', pendRes.data);

  // 1컷 생성
  const cutsRes = await api(page, 'GET', `${API}/projects/${PID}/episodes/${EID}/cuts`, null);
  const cuts = cutsRes.data;
  console.log(`total cuts: ${cuts.length}`);

  if (cuts.length >= 1) {
    const c1 = cuts[0];
    console.log(`generating cut 1: ${c1.cut_id}`);
    const g1 = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/generate-single/${c1.id}`, {});
    console.log('cut 1 gen:', g1.status, g1.data?.job_id ? 'job started' : g1.data?.detail?.slice(0,80));
  }
  if (cuts.length >= 4) {
    const c4 = cuts[3];
    console.log(`generating cut 4: ${c4.cut_id}`);
    const g4 = await api(page, 'POST', `${API}/projects/${PID}/episodes/${EID}/generate-single/${c4.id}`, {});
    console.log('cut 4 gen:', g4.status, g4.data?.job_id ? 'job started' : g4.data?.detail?.slice(0,80));
  }

  // 생성 완료 대기 (최대 3분)
  console.log('waiting for generation...');
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(5000);
    const check = await api(page, 'GET', `${API}/projects/${PID}/episodes/${EID}/cuts`, null);
    const done = check.data.filter(c => c.image_url);
    if (done.length >= 2) {
      console.log(`${done.length} cuts done after ${(i+1)*5}s`);
      break;
    }
  }

  // 패킷 확인
  const pkGen = await api(page, 'GET', `${API}/packets`, null);
  console.log('packets after gen:', pkGen.data?.balance);

  // Gate5 새로고침해서 캡처
  await page.goto(`${WF}?gate=5`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, '02c-gate5-cuts.png'), fullPage: true });
  console.log('② gate5 generated cuts screenshot saved');

  // ── 10) ④ [다시 그리기] 시트 ──
  console.log('\n=== ④ 다시 그리기 시트 ===');
  // 첫 번째 [다시 그리기] 버튼 클릭
  const regenBtn = page.locator('button:has-text("다시 그리기")').first();
  if (await regenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await regenBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '04-regen-sheet.png'), fullPage: true });
    console.log('④ regen sheet screenshot saved');
    // 닫기
    const closeBtn = page.locator('button:has-text("닫기")').first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } else {
    console.log('④ WARN: 다시 그리기 button not found');
  }

  // ── 11) ⑤ 컷 수 모달 ──
  console.log('\n=== ⑤ 컷 수 모달 ===');
  // 프로젝트 페이지로 이동해서 새 에피소드 모달 캡처
  await page.goto(`${BASE}/projects/${PID}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  // "새 에피소드" 또는 "+" 버튼 찾기
  const newEpBtn = page.locator('button:has-text("새 에피소드"), button:has-text("인스타"), button:has-text("광고")').first();
  if (await newEpBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newEpBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '05-cut-count-modal.png'), fullPage: true });
    console.log('⑤ cut count modal screenshot saved');
    // 모달 닫기
    const cancelBtn = page.locator('button:has-text("취소")').first();
    if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) await cancelBtn.click();
  } else {
    console.log('⑤ WARN: new episode button not visible');
  }

  // ── 12) ⑥ onecut_ad ep120 ──
  console.log('\n=== ⑥ onecut_ad ep120 ===');
  // ep120의 project_id 조회
  const ep120Res = await api(page, 'GET', `${API}/projects/12/episodes/120`, null);
  if (ep120Res.status === 200) {
    const ep120Url = `${BASE}/projects/12/episodes/120/workflow?gate=5`;
    await page.goto(ep120Url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    // [다시 그리기] 시트 캡처
    const regenBtn2 = page.locator('button:has-text("다시 그리기")').first();
    if (await regenBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await regenBtn2.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, '06-onecut-regen-sheet.png'), fullPage: true });
      console.log('⑥ onecut regen sheet screenshot saved');
    } else {
      console.log('⑥ onecut 다시 그리기 not visible');
    }
  } else {
    // ep120의 올바른 project_id 찾기
    console.log('⑥ ep120 not in project 12, trying other projects...');
  }

  console.log('\n=== Summary ===');
  console.log(`Project: ${PID}, Episode: ${EID}`);
  console.log(`URL: ${WF}`);
  console.log(`Screenshots: ${OUT}/`);
  console.log('Files:', fs.readdirSync(OUT).join(', '));

  await browser.close();
})();
