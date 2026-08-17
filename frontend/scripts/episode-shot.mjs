/**
 * episode-shot.mjs — 실제 에피소드 게이트5 컷별 스크린샷
 * 미리보기 모달(라이트박스) 기준으로 각 컷을 캡처한다.
 * Usage: node scripts/episode-shot.mjs
 * Requires: JWT token in .env.local (VITE_TEST_JWT=...)
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'test-shots');
const rootDir = resolve(__dirname, '..');

function loadToken() {
  const envPath = resolve(rootDir, '.env.local');
  if (!existsSync(envPath)) {
    console.error('.env.local not found. Create it with: VITE_TEST_JWT=your_token');
    process.exit(1);
  }
  const content = readFileSync(envPath, 'utf-8');
  const match = content.match(/^VITE_TEST_JWT=(.+)$/m);
  if (!match || !match[1] || match[1].startsWith('여기에')) {
    console.error('VITE_TEST_JWT not set in .env.local');
    process.exit(1);
  }
  return match[1].trim();
}

const token = loadToken();
const baseUrl = 'https://ssagda.com/WEBTOON';
const episodeUrl = `${baseUrl}/projects/5/episodes/13/workflow`;

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('Chromium launch failed:', e.message);
    process.exit(1);
  }

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // localStorage에 토큰 주입
  await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate((t) => localStorage.setItem('token', t), token);

  console.log('Navigating to episode workflow...');
  await page.goto(episodeUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Gate5 탭 클릭
  const gate5Btn = await page.$('button:has-text("이미지"), button:has-text("5단계"), [data-gate="5"]');
  if (gate5Btn) {
    await gate5Btn.click();
    await page.waitForTimeout(2000);
  }

  // 컷 이미지 로딩 대기
  console.log('Waiting for cut images...');
  try {
    await page.waitForSelector('.aspect-square img', { timeout: 15000 });
  } catch {
    console.error('Cut images not found.');
    await page.screenshot({ path: resolve(outDir, 'ep13-debug.png'), fullPage: true });
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(3000);

  // 썸네일 그리드 전체 1장 (참고용)
  await page.screenshot({ path: resolve(outDir, 'ep13-grid.png'), fullPage: true });
  console.log('Saved: ep13-grid.png');

  // 컷 카드 수집
  const cutCards = await page.$$('.grid .border-2.rounded-2xl');
  console.log(`Found ${cutCards.length} cut cards`);

  if (cutCards.length === 0) {
    console.error('No cut cards found');
    await browser.close();
    process.exit(1);
  }

  // 각 컷: 클릭 → 모달 캡처 → 닫기
  for (let i = 0; i < cutCards.length; i++) {
    const num = String(i + 1).padStart(2, '0');

    // 스크롤 + 줌 버튼 클릭으로 모달 열기
    await cutCards[i].scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // hover하여 줌 버튼 표시 → 클릭
    const zoomBtn = await cutCards[i].$('button[class*="cursor-zoom-in"]');
    if (zoomBtn) {
      await cutCards[i].hover();
      await page.waitForTimeout(200);
      await zoomBtn.click();
    } else {
      // 줌 버튼이 없으면 이미지 영역 클릭
      const imgArea = await cutCards[i].$('.aspect-square');
      if (imgArea) await imgArea.click();
    }

    // 모달 대기 — max-h-[90vh] 이미지가 나타날 때까지
    try {
      await page.waitForSelector('img[class*="max-h-"]', { timeout: 5000 });
      await page.waitForTimeout(1000); // SVG 오버레이 렌더 대기

      // 모달 내부의 이미지+말풍선 컨테이너 캡처
      const modalImg = await page.$('.relative.inline-block');
      if (modalImg) {
        await modalImg.screenshot({ path: resolve(outDir, `ep13-cut${num}.png`) });
        console.log(`Saved: ep13-cut${num}.png (modal)`);
      } else {
        // fallback: 전체 모달 영역
        await page.screenshot({ path: resolve(outDir, `ep13-cut${num}.png`) });
        console.log(`Saved: ep13-cut${num}.png (fullscreen fallback)`);
      }
    } catch {
      console.log(`Cut ${num}: modal not opened, skipping`);
    }

    // 모달 닫기 — ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ── 수치 검증 + 스크린샷 (복수 해상도) ──
  const resolutions = [
    { w: 1920, h: 950, label: '1920x950' },
    { w: 1366, h: 650, label: '1366x650' },
  ];

  const results = [];

  // 닫기 헬퍼
  async function closeCutEditor() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    try {
      const xBtn = await page.$('.fixed.inset-0.z-50.bg-black .shrink-0 button:has(svg.lucide-x)');
      if (xBtn) await xBtn.click({ force: true, timeout: 2000 });
    } catch {}
    await page.waitForTimeout(300);
    const still = await page.$('.fixed.inset-0.z-50.bg-black');
    if (still) {
      await page.goto(episodeUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      const g5 = await page.$('button:has-text("이미지"), button:has-text("5단계"), [data-gate="5"]');
      if (g5) { await g5.click(); await page.waitForTimeout(2000); }
      try { await page.waitForSelector('.aspect-square img', { timeout: 10000 }); } catch {}
      await page.waitForTimeout(2000);
    }
  }

  for (const res of resolutions) {
    console.log(`\n=== ${res.label} ===`);
    await page.setViewportSize({ width: res.w, height: res.h });
    await page.waitForTimeout(500);

    const cards = await page.$$('.grid .border-2.rounded-2xl');
    const target = cards[9];
    if (!target) { console.log('Cut #10 not found'); continue; }
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const eBtn = await target.$('button:has-text("편집")');
    if (!eBtn) { console.log('Edit button not found'); continue; }
    await eBtn.click();
    await page.waitForTimeout(2000);

    // ── 보기 모드 수치 ──
    const topBar = await page.locator('.fixed.inset-0.z-50.bg-black > .shrink-0').first().boundingBox();
    const img = await page.locator('.fixed.inset-0.z-50.bg-black .flex-1 img').boundingBox();
    const vpH = res.h;

    const viewResult = {
      res: res.label, mode: 'view',
      topBar: topBar ? `y=${topBar.y} h=${topBar.height} bottom=${Math.round(topBar.y + topBar.height)}` : 'N/A',
      img: img ? `y=${Math.round(img.y)} h=${Math.round(img.height)} bottom=${Math.round(img.y + img.height)}` : 'N/A',
      vpH,
      pass_top: img && topBar ? img.y >= topBar.y + topBar.height - 1 : false,
      pass_bottom: img ? Math.round(img.y + img.height) <= vpH + 1 : false,
    };
    console.log(`VIEW: topBar bottom=${Math.round(topBar?.y + topBar?.height)}, img y=${Math.round(img?.y)} bottom=${Math.round(img?.y + img?.height)}, vpH=${vpH}`);
    console.log(`  top ok: ${viewResult.pass_top}, bottom ok: ${viewResult.pass_bottom}`);
    results.push(viewResult);

    await page.screenshot({ path: resolve(outDir, `ep13-cuteditor-${res.label}-view.png`) });

    // ── 편집 모드 전환 ──
    try {
      const emBtn = await page.$('.bg-purple-600:has-text("편집")');
      if (emBtn) {
        await emBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1500);

        const topBar2 = await page.locator('.fixed.inset-0.z-50.bg-black > .shrink-0').first().boundingBox();
        const img2 = await page.locator('.fixed.inset-0.z-50.bg-black .flex-1 img').boundingBox();
        // 하단 패널: 편집 모드에서만 존재하는 마지막 shrink-0
        const panels = await page.locator('.fixed.inset-0.z-50.bg-black > .shrink-0').all();
        const panelBox = panels.length > 1 ? await panels[panels.length - 1].boundingBox() : null;

        const editResult = {
          res: res.label, mode: 'edit',
          topBar: topBar2 ? `bottom=${Math.round(topBar2.y + topBar2.height)}` : 'N/A',
          img: img2 ? `y=${Math.round(img2.y)} h=${Math.round(img2.height)} bottom=${Math.round(img2.y + img2.height)}` : 'N/A',
          panel: panelBox ? `y=${Math.round(panelBox.y)} h=${Math.round(panelBox.height)}` : 'N/A',
          pass_top: img2 && topBar2 ? img2.y >= topBar2.y + topBar2.height - 1 : false,
          pass_bottom: img2 && panelBox ? Math.round(img2.y + img2.height) <= Math.round(panelBox.y) + 1 : false,
        };
        console.log(`EDIT: topBar bottom=${Math.round(topBar2?.y + topBar2?.height)}, img y=${Math.round(img2?.y)} bottom=${Math.round(img2?.y + img2?.height)}, panel y=${Math.round(panelBox?.y)}`);
        console.log(`  top ok: ${editResult.pass_top}, bottom ok: ${editResult.pass_bottom}`);
        results.push(editResult);

        await page.screenshot({ path: resolve(outDir, `ep13-cuteditor-${res.label}-edit.png`) });
      }
    } catch (e) {
      console.log('Edit mode failed:', e.message.split('\n')[0]);
    }

    await closeCutEditor();
  }

  // ── 팔레트 드롭다운 검증 (1920x950) ──
  console.log('\n=== Palette dropdown test (1920x950) ===');
  await page.setViewportSize({ width: 1920, height: 950 });
  await page.waitForTimeout(500);

  // Gate5로 돌아가서 편집 열기
  {
    const cards = await page.$$('.grid .border-2.rounded-2xl');
    const target = cards[9];
    if (target) {
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const eBtn = await target.$('button:has-text("편집")');
      if (eBtn) await eBtn.click();
      await page.waitForTimeout(2000);

      // 편집 모드 전환
      const emBtn = await page.$('.bg-purple-600:has-text("편집")');
      if (emBtn) {
        await emBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1000);

        // 말풍선 클릭
        const bubbleHit = await page.$('svg rect[style*="cursor: grab"]');
        if (bubbleHit) {
          await bubbleHit.click({ force: true, timeout: 3000 });
          await page.waitForTimeout(500);

          // "종류" 버튼 클릭 → 팔레트 열기
          const kindBtn = await page.$('button:has-text("자동"), button:has-text("round"), button:has-text("shout"), button:has-text("shy")');
          if (kindBtn) {
            await kindBtn.click({ timeout: 3000 });
            await page.waitForTimeout(500);

            // 팔레트 메뉴 boundingBox
            const menu = await page.locator('[style*="position: fixed"][style*="z-index: 60"]').boundingBox();
            if (menu) {
              console.log(`Palette menu: x=${Math.round(menu.x)} y=${Math.round(menu.y)} w=${Math.round(menu.width)} h=${Math.round(menu.height)} bottom=${Math.round(menu.y + menu.height)}`);
              console.log(`  menu.y >= 0: ${menu.y >= 0 ? 'PASS' : 'FAIL'}`);
              console.log(`  menu.bottom <= vpH: ${Math.round(menu.y + menu.height) <= 950 ? 'PASS' : 'FAIL'}`);
            } else {
              console.log('Palette menu not found!');
            }

            // 모든 BubbleMiniIcon 항목 수 확인
            const icons = await page.$$('[style*="position: fixed"][style*="z-index: 60"] svg');
            console.log(`  Bubble icons visible: ${icons.length} (expected: 11 = 4 basic + 7 emotion)`);

            await page.screenshot({ path: resolve(outDir, 'ep13-palette-open.png') });
            console.log('Saved: ep13-palette-open.png');

            // 스타일 변경 테스트: round → shy → shout
            const testStyles = ['shy', 'shout', 'round'];
            for (const sk of testStyles) {
              // 팔레트가 닫혔으면 다시 열기
              const menuCheck = await page.$('[style*="position: fixed"][style*="z-index: 60"]');
              if (!menuCheck) {
                const kb = await page.$('button:has-text("자동"), button:has-text("round"), button:has-text("shout"), button:has-text("shy")');
                if (kb) { await kb.click({ timeout: 3000 }); await page.waitForTimeout(300); }
              }
              // 아이콘 클릭 (title 속성 사용)
              const icon = await page.$(`[style*="position: fixed"][style*="z-index: 60"] svg[data-style="${sk}"]`);
              if (icon) {
                await icon.click({ force: true });
                await page.waitForTimeout(300);
                console.log(`  Changed to ${sk}: OK`);
              } else {
                // fallback: BubbleMiniIcon은 div 래퍼일 수 있음
                const allIcons = await page.$$('[style*="position: fixed"][style*="z-index: 60"] [role="button"], [style*="position: fixed"][style*="z-index: 60"] svg');
                console.log(`  ${sk}: icon not found by data-style, ${allIcons.length} clickable elements`);
              }
            }
          } else {
            console.log('Kind button not found');
          }
        }
      }
    }
  }

  // ── C단계: 저장 왕복 검증 ──
  console.log('\n=== C: Save round-trip test (#10) ===');
  // Gate5로 복귀
  await page.goto(episodeUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  {
    const g5 = await page.$('button:has-text("이미지"), button:has-text("5단계"), [data-gate="5"]');
    if (g5) { await g5.click(); await page.waitForTimeout(2000); }
    try { await page.waitForSelector('.aspect-square img', { timeout: 10000 }); } catch {}
    await page.waitForTimeout(2000);
  }

  // #10 편집 열기
  {
    const cards = await page.$$('.grid .border-2.rounded-2xl');
    const target = cards[9];
    if (target) {
      await target.scrollIntoViewIfNeeded();
      const eBtn = await target.$('button:has-text("편집")');
      if (eBtn) await eBtn.click();
      await page.waitForTimeout(2000);

      // 편집 모드
      const emBtn = await page.$('.bg-purple-600:has-text("편집")');
      if (emBtn) {
        await emBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1000);

        // 말풍선 드래그: 첫 말풍선의 위치를 읽고 50px 오른쪽으로 이동
        const bubbleHit = await page.$('svg rect[style*="cursor: grab"]');
        if (bubbleHit) {
          const box = await bubbleHit.boundingBox();
          const fromX = box.x + box.width / 2;
          const fromY = box.y + box.height / 2;
          await page.mouse.move(fromX, fromY);
          await page.mouse.down();
          await page.mouse.move(fromX + 50, fromY, { steps: 10 });
          await page.mouse.up();
          await page.waitForTimeout(300);
          console.log(`  Dragged bubble from x=${Math.round(fromX)} to x=${Math.round(fromX + 50)}`);
        }

        // 저장 버튼 클릭
        const saveBtn = await page.$('button:has-text("저장")');
        if (saveBtn) {
          await saveBtn.click({ timeout: 5000 });
          await page.waitForTimeout(3000); // API + loadCuts 대기
          console.log('  Save clicked, waiting for reload...');
        }

        // 저장 후 보기 모드로 전환되었는지 확인
        const modeLabel = await page.$('text=보기 모드');
        console.log(`  After save, view mode: ${modeLabel ? 'YES' : 'NO'}`);

        // 스크린샷
        await page.screenshot({ path: resolve(outDir, 'ep13-c-after-save.png') });
        console.log('Saved: ep13-c-after-save.png');

        // CutEditor 닫기
        try {
          const xBtn = await page.$('.fixed.inset-0.z-50.bg-black .shrink-0 button:has(svg.lucide-x)');
          if (xBtn) await xBtn.click({ force: true, timeout: 2000 });
        } catch {}
        await page.waitForTimeout(500);
      }

      // 페이지 새로고침 후 유지 확인
      console.log('  Refreshing page...');
      await page.goto(episodeUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      {
        const g5 = await page.$('button:has-text("이미지"), button:has-text("5단계"), [data-gate="5"]');
        if (g5) { await g5.click(); await page.waitForTimeout(2000); }
        try { await page.waitForSelector('.aspect-square img', { timeout: 10000 }); } catch {}
        await page.waitForTimeout(2000);
      }

      // #10 다시 편집 열기 → 위치 유지 확인
      const cards2 = await page.$$('.grid .border-2.rounded-2xl');
      const target2 = cards2[9];
      if (target2) {
        await target2.scrollIntoViewIfNeeded();
        const eBtn2 = await target2.$('button:has-text("편집")');
        if (eBtn2) await eBtn2.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: resolve(outDir, 'ep13-c-after-refresh.png') });
        console.log('Saved: ep13-c-after-refresh.png');
        console.log('  Round-trip: check screenshots for position persistence');

        // CutEditor 닫기
        try {
          const xBtn = await page.$('.fixed.inset-0.z-50.bg-black .shrink-0 button:has(svg.lucide-x)');
          if (xBtn) await xBtn.click({ force: true, timeout: 2000 });
        } catch {}
        await page.waitForTimeout(500);
      }
    }
  }

  // ── 결과 요약 ──
  console.log('\n========== LAYOUT RESULTS ==========');
  let allPass = true;
  for (const r of results) {
    const pass = r.pass_top && r.pass_bottom;
    if (!pass) allPass = false;
    console.log(`${r.res} ${r.mode}: top=${r.pass_top} bottom=${r.pass_bottom} ${pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`Overall: ${allPass ? 'ALL PASS' : 'SOME FAILED'}`);

  await browser.close();
  console.log(`\nDone. Screenshots saved to test-shots/`);
}

main();
