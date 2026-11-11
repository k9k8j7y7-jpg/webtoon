// 갤러리 레퍼런스 검증 스크립트 — 지시서 검증 ①~⑩
// 실행: TOKEN=<admin jwt> TOKEN2=<non-admin jwt> node frontend/scripts/verify-gallery-ref.mjs
import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/frontend/package.json');
const { chromium } = require('playwright');
const BASE = 'https://ssagda.com/WEBTOON';
const API = BASE + '/api/v1';
const OUT = 'scratch/captures/gallery-ref';
const adminToken = process.env.ADMIN_TOKEN; // admin (user_id=3)
const token = process.env.TOKEN;            // non-admin (user_id=1, has nickname)
if (!adminToken || !token) { console.error('ADMIN_TOKEN, TOKEN 환경변수 필요'); process.exit(1); }
import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

const TEST_EP_ID = 160;  // 이미지 있는 테스트 에피소드
const TEST_PROJECT_ID = 24; // 기본 프로젝트

const h = (t) => ({ Authorization: `Bearer ${t}` });

async function apiGet(url, tk = adminToken) {
  const res = await fetch(API + url, { headers: h(tk) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
async function apiPost(url, body = null, tk = adminToken) {
  const opts = { method: 'POST', headers: h(tk) };
  if (body !== null) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(API + url, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}
async function apiPut(url, tk = adminToken) {
  const res = await fetch(API + url, { method: 'PUT', headers: h(tk) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const results = [];
function log(id, pass, msg) {
  const mark = pass ? '✅' : '❌';
  console.log(`${mark} ${id}: ${msg}`);
  results.push({ id, pass, msg });
}

// ── API 테스트 ──

// ① 기존 공개 ep(brief_public=0) 뷰어 → brief 키 없음
const ep30Token = '65cb2832-881d-4863-8fb4-5c7044384858';
const { data: v1 } = await apiGet(`/showcase/view/${ep30Token}`);
log('①', !v1.brief, `ep30 brief_public=0 → brief key ${v1.brief ? 'EXISTS (BAD)' : 'absent (OK)'}`);

// ② 테스트 한 컷 공개 + brief_public=1 → 뷰어에 brief 확인 (user 1 소유)
const { data: pub } = await apiPost(`/episodes/${TEST_EP_ID}/publish?brief_public=true`, null, token);
log('②a', pub?.is_public === true && pub?.brief_public === true, `공개+brief_public=true token=${pub?.share_token}`);

if (pub?.share_token) {
  const { data: v2 } = await apiGet(`/showcase/view/${pub.share_token}`);
  const hasBrief = !!v2.brief;
  log('②b', hasBrief, `뷰어 brief key ${hasBrief ? 'present' : 'absent'}`);
  if (v2.brief) {
    const noInternal = !v2.brief.reference_ads_photos && !v2.brief.character_ids && !v2.brief.image_model;
    log('②c', noInternal, `화이트리스트 (내부 키 없음=${noInternal})`);
  }
  if (v2.how) {
    log('②d', !!v2.how.style || !!v2.how.characters, `how 덩어리 present: style=${!!v2.how.style} chars=${JSON.stringify(v2.how.characters)}`);
  }
}

// ③ admin 예시 토글
const { data: exOn } = await apiPost(`/admin/episodes/${TEST_EP_ID}/example`, { is_example: true });
log('③', exOn?.is_example === true && exOn?.brief_public === true, `admin 예시 ON → is_example=${exOn?.is_example} brief_public=${exOn?.brief_public}`);

// ④ 갤러리 예시 필터
const { data: exGallery } = await apiGet('/showcase/episodes?scope=all&example=1');
const exList = Object.values(exGallery || {}).flat();
const hasExample = exList.some(e => e.is_example);
log('④', hasExample, `갤러리 예시 필터 → ${exList.length}건, has_example=${hasExample}`);

// ⑤ from-example (한 컷)
if (exOn?.share_token) {
  const { data: fromEx } = await apiPost(`/my/works/from-example?token=${exOn.share_token}`, null, token);
  log('⑤', fromEx?.type === 'onecut_ad' && fromEx?.prefilled_from?.startsWith('example'), `from-example → type=${fromEx?.type} prefilled=${fromEx?.prefilled_from}`);
}

// ⑥ 일반 사용자 예시 토글 → 403
const { status: s403 } = await apiPost(`/admin/episodes/${TEST_EP_ID}/example`, { is_example: false }, token);
log('⑥', s403 === 403, `일반 사용자 예시 토글 → ${s403} (403이어야 함)`);

// ⑦ brief_public 토글 (PUT)
const { data: bpOff } = await apiPut(`/episodes/${TEST_EP_ID}/brief-public?brief_public=false`, token);
log('⑦a', bpOff?.brief_public === false, `brief_public OFF → ${bpOff?.brief_public}`);
const { data: bpOn } = await apiPut(`/episodes/${TEST_EP_ID}/brief-public?brief_public=true`, token);
log('⑦b', bpOn?.brief_public === true, `brief_public ON → ${bpOn?.brief_public}`);

// ⑧ onecut 1패킷 회귀 — purpose 확인
const { data: epStatus } = await apiGet(`/projects/${TEST_PROJECT_ID}/episodes/${TEST_EP_ID}/status`, token);
const purpose = epStatus?.gate_status?.purpose;
log('⑧', purpose === 'onecut_ad', `onecut 회귀: purpose=${purpose}`);

// ── Playwright 캡처 테스트 ──
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
await ctx.addInitScript(t => { localStorage.setItem('token', t); localStorage.setItem('theme', 'dark'); }, token);
const page = await ctx.newPage();

// ⑨ 뷰어 brief 카드 캡처
if (pub?.share_token) {
  await page.goto(`${BASE}/view/${pub.share_token}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/09_viewer_brief_card.png`, fullPage: true });
  const briefCard = await page.locator('text=이렇게 만들었어요').count();
  log('⑨', briefCard > 0, `뷰어 brief 카드 표시=${briefCard > 0}`);
}

// ⑩ 갤러리 예시 필터 캡처
await page.goto(`${BASE}/#gallery`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(2000);
const exTab = page.locator('button:has-text("예시 먼저 보기")');
if (await exTab.count() > 0) {
  await exTab.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: `${OUT}/10_gallery_example.png`, fullPage: false });
const exBadge = await page.locator('text=예시').count();
log('⑩a', exBadge > 0, `갤러리 예시 배지 count=${exBadge}`);

// 공개 모달 체크박스 (PublishBar in workflow)
await page.goto(`${BASE}/workflow/${TEST_PROJECT_ID}/${TEST_EP_ID}`, { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/10b_publish_bar.png`, fullPage: true });
const bpCheck = await page.locator('text=브리프').count();
log('⑩b', bpCheck > 0, `공개 바 브리프 체크 count=${bpCheck}`);

// 정리: 예시 OFF, 비공개로
await apiPost(`/admin/episodes/${TEST_EP_ID}/example`, { is_example: false });
await apiPost(`/episodes/${TEST_EP_ID}/unpublish`, null, token);

await browser.close();

// ── 결과 요약 ──
console.log('\n=== 결과 요약 ===');
const pass = results.filter(r => r.pass).length;
const fail = results.filter(r => !r.pass).length;
console.log(`통과: ${pass}, 실패: ${fail}`);
results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.id}: ${r.msg}`));
process.exit(fail > 0 ? 1 : 0);
