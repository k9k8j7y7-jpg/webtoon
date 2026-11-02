/**
 * 제품 자산 2단계 보완 — Gate4 캡처 + 토글 off 검증
 * Usage: node frontend/scripts/product-check.mjs <JWT>
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node product-check.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/product-check');
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const PID = 12, EID = 71;

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // 인증
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), JWT);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));

  // 워크플로우 로드
  await page.goto(`${BASE}/projects/${PID}/episodes/${EID}/workflow`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);

  // 단계 이동 버튼 — onPointerDown이므로 pointerdown 이벤트 디스패치
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      b.textContent.includes('단계 이동'));
    if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(1500);

  // data-step-menu 안에서 STEP 4 클릭 (이것도 onPointerDown일 수 있으므로 양쪽 이벤트)
  const clicked = await page.evaluate(() => {
    const menu = document.querySelector('[data-step-menu]');
    if (!menu) return 'no_menu';
    const btns = menu.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.includes('STEP 4')) {
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        b.click();
        return 'STEP 4 clicked';
      }
    }
    return 'STEP 4 not found in: ' + [...btns].map(b => b.textContent.trim().substring(0, 40)).join(' | ');
  });
  console.log('  Menu:', clicked);
  await page.waitForTimeout(4000);

  // Gate4 캡처
  await page.screenshot({ path: path.join(OUT, '04-gate4-product-toggle.png'), fullPage: true });
  console.log('✅ 04 Gate4 전체');

  // 📦 배지 확인
  const badges = await page.evaluate(() => {
    return [...document.querySelectorAll('span')]
      .filter(s => s.textContent.includes('📦'))
      .map(s => s.textContent.trim());
  });
  console.log('  📦 badges:', badges.length, badges.slice(0, 5));

  // "N컷 중 M컷" 요약 확인
  const summary = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p, span')].find(e => e.textContent.includes('컷 중'));
    return el ? el.textContent.trim() : 'NOT FOUND';
  });
  console.log('  Summary:', summary);

  // Gate4 편집 모달 열기
  const pencilClicked = await page.evaluate(() => {
    const btn = document.querySelector('button[title="컷 편집"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!pencilClicked) console.log('  ⚠ 편집 버튼 없음');
  await page.waitForTimeout(1500);

  // 모달 스크롤 끝까지 + 캡처
  await page.evaluate(() => {
    const modal = document.querySelector('.fixed .overflow-y-auto');
    if (modal) modal.scrollTop = modal.scrollHeight;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '04b-gate4-edit-modal.png') });
  console.log('✅ 04b Gate4 편집 모달 (스크롤 하단)');

  // 토글 상태 확인
  const toggleState = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const t = btns.find(b => b.textContent.trim() === 'ON' || b.textContent.trim() === 'OFF');
    return t ? t.textContent.trim() : 'NOT_FOUND';
  });
  console.log('  Toggle:', toggleState);

  // 토글 OFF → 저장 → API 검증
  if (toggleState === 'ON') {
    // OFF로 변경
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      btns.find(b => b.textContent.trim() === 'ON')?.click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, '04c-gate4-toggle-off.png') });
    console.log('✅ 04c 토글 OFF');

    // 저장 (취소 아닌 저장)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.fixed button')];
      const saveBtn = btns.find(b => b.textContent.includes('저장') && !b.textContent.includes('취소'));
      if (saveBtn) saveBtn.click();
    });
    await page.waitForTimeout(2000);

    // API 확인
    const cuts = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const resp = await fetch('/WEBTOON/api/v1/projects/12/episodes/71/cuts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return (await resp.json()).slice(0, 3).map(c => ({ n: c.cut_number, hp: c.has_product }));
    });
    console.log('  저장 후 has_product:', JSON.stringify(cuts));
    // #1이 false → OK

    // 복원 (ON)
    await page.evaluate(() => {
      document.querySelector('button[title="컷 편집"]')?.click();
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const m = document.querySelector('.fixed .overflow-y-auto');
      if (m) m.scrollTop = m.scrollHeight;
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'OFF')?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.fixed button')];
      btns.find(b => b.textContent.includes('저장') && !b.textContent.includes('취소'))?.click();
    });
    await page.waitForTimeout(1500);
    console.log('  토글 ON 복원');
  }

  await browser.close();
  console.log(`\n✅ 완료: ${OUT}`);
}

run().catch(e => { console.error(e); process.exit(1); });
