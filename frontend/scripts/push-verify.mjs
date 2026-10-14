/**
 * push-verify.mjs — Playwright 헤드리스로 알림 자동 갱신 + read 처리 검증
 *
 * Usage: node frontend/scripts/push-verify.mjs <JWT_USER3> <JWT_USER4>
 */
import { chromium } from 'playwright';

const JWT3 = process.argv[2]; // user_id=3 (도도)
const JWT4 = process.argv[3]; // user_id=4 (미미툰)
if (!JWT3 || !JWT4) { console.error('Usage: node push-verify.mjs <JWT_user3> <JWT_user4>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const API = `${BASE}/api/v1`;
const SHARE_TOKEN = 'b99293ca-8dc1-4c61-b8ce-5421a53ef663'; // ep41

async function apiCall(jwt, method, path, body = null) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // ── 테스트 1: /notifications 열어둔 채 댓글 생성 → 목록 자동 갱신 ──
  console.log('[1] /notifications 자동 갱신 테스트');
  const ctx1 = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/154.0.0.0 Mobile',
  });
  const page1 = await ctx1.newPage();

  // 로그인
  await page1.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page1.evaluate((t) => localStorage.setItem('token', t), JWT3);
  await page1.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(2000);

  const beforeCount = await page1.$$eval('ul li', els => els.length);
  const { data: beforeData } = await apiCall(JWT3, 'GET', '/notifications?limit=100');
  const beforeItemCount = beforeData?.items?.length || 0;
  console.log(`   알림 카드: ${beforeCount}, API items: ${beforeItemCount}`);

  // 네트워크 요청 감시
  const pollingReqs = [];
  page1.on('request', req => {
    const u = req.url();
    if (u.includes('/unread-count') || (u.includes('/notifications') && !u.includes('unread') && req.method() === 'GET')) {
      pollingReqs.push({ time: new Date().toISOString().slice(11, 19), url: u.split('/api/v1')[1] || u, method: req.method() });
    }
  });

  // user4로 댓글 작성 → user3에게 알림 발생
  console.log('   미미툰(user4)으로 댓글 작성...');
  const commentBody = `자동검증 ${Date.now()}`;
  const { status: commentStatus, data: commentData } = await apiCall(JWT4, 'POST', '/episodes/41/comments', { body: commentBody });
  console.log(`   댓글 결과: ${commentStatus}, id=${commentData?.id}`);

  // 35초 대기 (30초 폴링 주기 + 여유)
  console.log('   35초 대기 (폴링 주기 확인)...');
  await page1.waitForTimeout(35000);

  const afterCount = await page1.$$eval('ul li', els => els.length);
  console.log(`   알림 카드 (after): ${afterCount}`);
  console.log(`   폴링 요청: ${pollingReqs.length}건`);
  pollingReqs.forEach(r => console.log(`     ${r.time} ${r.method} ${r.url}`));

  // 목록 API로 새 알림 확인
  const { data: afterData } = await apiCall(JWT3, 'GET', '/notifications?limit=100');
  const afterItemCount = afterData?.items?.length || 0;
  const newNotif = (afterData?.items || []).find(n => n.body === commentBody);

  results.push({
    test: '알림 목록 자동 갱신 (30초 폴링)',
    before_items: beforeItemCount,
    after_items: afterItemCount,
    new_notif_found: Boolean(newNotif),
    new_notif_id: newNotif?.id || null,
    polling_reqs: pollingReqs.length,
    card_increased: afterCount > beforeCount,
    verdict: (pollingReqs.length > 0 && afterCount > beforeCount) ? 'PASS' : 'FAIL',
  });

  await ctx1.close();

  // ── 테스트 2: /view/{token}?n={id} → read 호출 확인 ──
  console.log('\n[2] /view?n={id} read 호출 테스트');
  const targetId = newNotif?.id;
  if (!targetId) {
    console.log('   새 알림 없음 — 기존 미읽음 사용');
  }

  // 미읽음 알림 찾기
  const { data: notifsForRead } = await apiCall(JWT3, 'GET', '/notifications?limit=100');
  const unreadNotif = targetId
    ? (notifsForRead?.items || []).find(n => n.id === targetId)
    : (notifsForRead?.items || []).find(n => !n.is_read);

  if (unreadNotif) {
    console.log(`   대상 알림: id=${unreadNotif.id}, is_read=${unreadNotif.is_read}`);

    const ctx2 = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/154.0.0.0 Mobile',
    });
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page2.evaluate((t) => localStorage.setItem('token', t), JWT3);

    // read API 호출 감시
    let readApiCalled = false;
    let readApiStatus = null;
    page2.on('response', res => {
      if (res.url().includes(`/notifications/${unreadNotif.id}/read`) && res.request().method() === 'POST') {
        readApiCalled = true;
        readApiStatus = res.status();
      }
    });

    const viewUrl = `${BASE}/view/${SHARE_TOKEN}?n=${unreadNotif.id}`;
    console.log(`   접근: ${viewUrl}`);
    await page2.goto(viewUrl, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(5000);

    // DB 상태 확인
    const { data: afterRead } = await apiCall(JWT3, 'GET', '/notifications?limit=100');
    const readNotif = (afterRead?.items || []).find(n => n.id === unreadNotif.id);

    results.push({
      test: '/view?n={id} read 호출',
      notification_id: unreadNotif.id,
      read_api_called: readApiCalled,
      read_api_status: readApiStatus,
      is_read_after: readNotif?.is_read ?? 'N/A',
      verdict: (readApiCalled && readNotif?.is_read) ? 'PASS' : 'FAIL',
    });

    await ctx2.close();
  } else {
    results.push({ test: '/view?n={id} read 호출', verdict: 'SKIP (미읽음 없음)' });
  }

  // ── 테스트 3: send_push 로거 출력 확인 (댓글 작성 시 발생한 로그) ──
  console.log('\n[3] send_push 로거 확인은 서버 로그에서 수동 확인 필요');
  results.push({
    test: 'send_push 로거 출력',
    verdict: '서버 로그 수동 확인',
  });

  // ── 결과 출력 ──
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
})();
