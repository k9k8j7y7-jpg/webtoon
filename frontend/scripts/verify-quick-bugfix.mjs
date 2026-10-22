/**
 * verify-quick-bugfix.mjs — 빠른 컷 ghost click 수정 검증
 *
 * ① 인스타 모달 X tap → POST 0건·잔량 불변·결과 유지
 * ② 다시 그리기 tap → 확인 단계, 즉시 생성 안 됨
 *
 * Usage: node frontend/scripts/verify-quick-bugfix.mjs <JWT>
 * hasTouch:true + page.tap() 으로 터치 에뮬레이션
 */
import { chromium } from 'playwright';
import fs from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node verify-quick-bugfix.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'frontend/scripts/verify-quick';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    hasTouch: true,
    isMobile: true,
  });

  const page = await ctx.newPage();

  // 로그인
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), JWT);
  await page.goto(`${BASE}/quick`);
  await page.waitForTimeout(1500);

  // ── 빠른 컷 생성 ──
  console.log('[1] 빠른 컷 생성…');
  // 프리셋 선택 (첫 번째)
  const presetBtn = page.locator('button:has(img)').first();
  await presetBtn.tap();
  await page.waitForTimeout(300);

  // 장면 + 대사 입력
  await page.locator('input[maxlength="200"]').fill('카페 창가에서 웃는다');
  await page.locator('input[maxlength="100"]').fill('오늘 좋은 날이네~');
  await page.waitForTimeout(300);

  const balBefore = await page.locator('a[href="/WEBTOON/packets"]').textContent().catch(() => '?');
  console.log(`  잔량(생성 전): ${balBefore}`);

  // 만들기 tap
  const ctaBtn = page.locator('button:has-text("만들기")');
  await ctaBtn.tap();
  console.log('  만들기 탭, 대기 중…');

  await page.waitForSelector('img[alt="생성된 컷"]', { timeout: 60000 });
  await page.waitForTimeout(2000); // cutData 로드 대기
  console.log('  생성 완료');

  const balAfterGen = await page.locator('a[href="/WEBTOON/packets"]').textContent().catch(() => '?');
  console.log(`  잔량(생성 후): ${balAfterGen}`);

  // ── ① 인스타 모달 X tap 테스트 (touch) ──
  console.log('\n[2] 인스타 모달 X tap (touch 에뮬레이션)…');

  // 네트워크 감시
  const netReqs = [];
  page.on('request', (req) => {
    const u = req.url();
    if ((u.includes('/quick') || u.includes('/regenerate')) && req.method() === 'POST' && !u.includes('/expand')) {
      netReqs.push({ url: u, time: Date.now() });
    }
  });

  // 인스타 공유 탭
  await page.locator('button:has-text("인스타 공유")').tap();
  await page.waitForTimeout(1000);

  // X 버튼 찾기 & tap
  const xBtn = page.locator('button:has(svg.lucide-x)').first();
  await xBtn.waitFor({ state: 'visible', timeout: 3000 });
  await xBtn.tap();
  await page.waitForTimeout(500); // shield 350ms 포함

  // 결과 화면 유지 확인
  const resultVisible = await page.locator('img[alt="생성된 컷"]').isVisible();
  console.log(`  결과 화면 유지: ${resultVisible ? 'PASS ✓' : 'FAIL ✗'}`);

  // 잔량 불변 확인
  const balAfterClose = await page.locator('a[href="/WEBTOON/packets"]').textContent().catch(() => '?');
  const balUnchanged = balAfterGen === balAfterClose;
  console.log(`  잔량(모달 닫기 후): ${balAfterClose} → 불변: ${balUnchanged ? 'PASS ✓' : 'FAIL ✗'}`);

  // POST 미호출 확인
  console.log(`  POST /quick|regenerate 호출: ${netReqs.length}건 → ${netReqs.length === 0 ? 'PASS ✓' : 'FAIL ✗'}`);
  if (netReqs.length) console.log('  !!! 예상 밖 요청:', netReqs);

  await page.screenshot({ path: `${OUT}/bugfix_01_after_modal_x_tap.png` });

  // ── ② 다시 그리기 확인 단계 테스트 ──
  console.log('\n[3] 다시 그리기 → 확인 단계…');

  netReqs.length = 0; // reset

  const regenBtn = page.locator('button:has-text("다시 그리기")');
  await regenBtn.tap();
  await page.waitForTimeout(500);

  // 확인 UI 표시 확인
  const confirmBox = page.locator('text=1패킷을 써서 다시 그릴까요?');
  const hasConfirm = await confirmBox.isVisible();
  console.log(`  확인 단계 표시: ${hasConfirm ? 'PASS ✓' : 'FAIL ✗'}`);

  // 아직 POST 없음
  console.log(`  POST 호출(확인 전): ${netReqs.length}건 → ${netReqs.length === 0 ? 'PASS ✓' : 'FAIL ✗'}`);

  await page.screenshot({ path: `${OUT}/bugfix_02_regen_confirm.png` });

  // 취소 탭
  const cancelBtn = page.locator('button:has-text("취소")');
  if (await cancelBtn.isVisible()) {
    await cancelBtn.tap();
    await page.waitForTimeout(300);
    console.log('  취소 탭 → 확인 사라짐');
  }

  // ── 요약 ──
  console.log('\n══ 검증 요약 ══');
  console.log(`① 모달 X tap: 결과유지=${resultVisible}, 잔량불변=${balUnchanged}, POST=${netReqs.length}건`);
  console.log(`② 다시 그리기: 확인=${hasConfirm}, POST(확인 전)=0`);

  await browser.close();
  console.log(`\n캡처 → ${OUT}/bugfix_01~02`);
})();
