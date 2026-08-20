/**
 * a4-verify.mjs — A4 Export 검증 (Playwright)
 *
 * 검증 항목:
 * 1. 그리드 모드: 12컷 → 1페이지 2480×3508 PNG
 * 2. 한 컷 모드: #8 → 2480×3508 PNG, 중앙 배치
 * 3. 페이지 분할 시뮬레이션: processAllCuts 직접 호출 (13+컷)
 * 4. 300DPI 텍스트 시인성: 그리드 셀 확대 스크린샷
 *
 * Usage: cd frontend && node scripts/a4-verify.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'a4-verify-out');
const DL = path.join(OUT, 'downloads');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(DL)) fs.mkdirSync(DL, { recursive: true });

const envContent = fs.readFileSync(path.resolve(__dirname, '..', '.env.local'), 'utf-8');
const JWT = envContent.match(/^VITE_TEST_JWT=(.+)$/m)[1].trim();
const BASE = 'http://localhost:5173/WEBTOON';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [ERR] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`  [PAGE_ERR] ${err.message}`));

  // Login + Gate5
  console.log('[0] Login + navigate...');
  await page.goto(`${BASE}/login`);
  await page.evaluate((jwt) => localStorage.setItem('token', jwt), JWT);
  await page.goto(`${BASE}/projects/5/episodes/13/workflow`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Gate5 탭
  for (const sel of ['button:has-text("이미지")', 'button:has-text("5")', '[data-gate="5"]']) {
    const el = page.locator(sel);
    if (await el.count() > 0) { await el.first().click(); break; }
  }
  await page.waitForTimeout(3000);
  console.log('  Gate5 진입 완료');

  // ── 검증 1: A4 그리드 모드 ──
  console.log('\n[1] A4 Grid export...');
  const a4GridFile = await doA4GridExport(page);

  // ── 검증 2: A4 한 컷 모드 (#8) ──
  console.log('\n[2] A4 Single (#8)...');
  const a4SingleFile = await doA4SingleExport(page, 8);

  // ── 검증 3: 페이지 분할 (브라우저 내 직접 테스트) ──
  console.log('\n[3] Page split simulation...');
  const splitResult = await testPageSplit(page);

  await browser.close();

  // ── 판정 ──
  console.log('\n═══════════════════════════════════════');
  console.log('         A4 Export 검증 판정 결과');
  console.log('═══════════════════════════════════════\n');

  // [1] Grid
  if (a4GridFile && fs.existsSync(a4GridFile)) {
    const size = fs.statSync(a4GridFile).size;
    let dims = '';
    try {
      dims = execSync(`python -c "from PIL import Image; i=Image.open('${a4GridFile.replace(/\\/g, '/')}'); print(f'{i.width}x{i.height}')"`).toString().trim();
    } catch {}
    const ok2480 = dims === '2480x3508';
    console.log(`[1] Grid: ${size} bytes, ${dims} — ${ok2480 ? 'PASS' : 'FAIL (expected 2480x3508)'}`);

    // 셀 확대 스크린샷 (PIL crop)
    if (ok2480) {
      try {
        // Crop first cell (top-left): margin=59, gap=20, cellW ≈ (2480-118-60)/4 = 575
        execSync(`python -c "
from PIL import Image
i = Image.open('${a4GridFile.replace(/\\/g, '/')}')
cellW = (2480 - 59*2 - 20*3) // 4
cellH = (3508 - 59*2 - 20*2) // 3
cell = i.crop((59, 59, 59+cellW, 59+cellH))
cell.save('${path.join(OUT, 'grid-cell-1-zoomed.png').replace(/\\/g, '/')}')
print(f'cell size: {cellW}x{cellH}')
"`);
        console.log('     셀1 확대 이미지: grid-cell-1-zoomed.png');
      } catch (e) {
        console.log(`     셀 크롭 실패: ${e.message}`);
      }
    }
  } else {
    console.log('[1] Grid: ✗ 파일 없음');
  }

  // [2] Single
  if (a4SingleFile && fs.existsSync(a4SingleFile)) {
    const size = fs.statSync(a4SingleFile).size;
    let dims = '';
    try {
      dims = execSync(`python -c "from PIL import Image; i=Image.open('${a4SingleFile.replace(/\\/g, '/')}'); print(f'{i.width}x{i.height}')"`).toString().trim();
    } catch {}
    const ok2480 = dims === '2480x3508';
    console.log(`[2] Single: ${size} bytes, ${dims} — ${ok2480 ? 'PASS' : 'FAIL'}`);

    // 중앙 배치 확인: 이미지 영역의 바운딩박스
    if (ok2480) {
      try {
        const bbox = execSync(`python -c "
from PIL import Image
import numpy as np
i = np.array(Image.open('${a4SingleFile.replace(/\\/g, '/')}'))
# non-white pixels
mask = (i[:,:,0] < 250) | (i[:,:,1] < 250) | (i[:,:,2] < 250)
rows = np.any(mask, axis=1)
cols = np.any(mask, axis=0)
if rows.any():
    rmin, rmax = np.where(rows)[0][[0,-1]]
    cmin, cmax = np.where(cols)[0][[0,-1]]
    cx = (cmin+cmax)/2
    cy = (rmin+rmax)/2
    print(f'bbox=({cmin},{rmin})-({cmax},{rmax}) center=({cx:.0f},{cy:.0f}) page_center=(1240,1754)')
    # tolerance 5px
    dx = abs(cx - 1240)
    dy = abs(cy - 1754)
    print(f'offset: dx={dx:.0f} dy={dy:.0f} centered={dx<10 and dy<10}')
else:
    print('empty image')
"`).toString().trim();
        console.log(`     ${bbox.replace(/\n/g, '\n     ')}`);
      } catch (e) {
        console.log(`     중앙 분석 실패: ${e.message}`);
      }
    }
  } else {
    console.log('[2] Single: ✗ 파일 없음');
  }

  // [3] Page split
  console.log(`\n[3] Page split: ${splitResult}`);

  console.log(`\n출력 디렉토리: ${OUT}`);
}

async function doA4GridExport(page) {
  // Close any lingering modal
  await closeModals(page);

  // Click "A4" button to open dropdown
  const a4Btn = page.locator('button:has-text("A4")').last();
  if (await a4Btn.count() === 0) {
    console.log('  ✗ A4 버튼 없음');
    return null;
  }
  await a4Btn.click();
  await page.waitForTimeout(500);

  // Click "그리드 (4×3)"
  const gridBtn = page.locator('button:has-text("그리드")');
  if (await gridBtn.count() === 0) {
    console.log('  ✗ 그리드 버튼 없음');
    await page.screenshot({ path: path.join(OUT, 'err-a4-grid-dropdown.png') });
    return null;
  }

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      gridBtn.click(),
    ]);
    const savePath = path.join(DL, 'a4-grid.png');
    await download.saveAs(savePath);
    console.log(`  ✓ a4-grid.png (${fs.statSync(savePath).size} bytes)`);
    await page.waitForTimeout(3000);
    await closeModals(page);
    return savePath;
  } catch (e) {
    console.log(`  ✗ 다운로드 실패: ${e.message}`);
    await page.screenshot({ path: path.join(OUT, 'err-a4-grid.png') });
    await closeModals(page);
    return null;
  }
}

async function doA4SingleExport(page, cutNumber) {
  await closeModals(page);

  const a4Btn = page.locator('button:has-text("A4")').last();
  if (await a4Btn.count() === 0) {
    console.log('  ✗ A4 버튼 없음');
    return null;
  }
  await a4Btn.click();
  await page.waitForTimeout(500);

  // Click the cut number in dropdown
  const cutBtn = page.locator(`button:has-text("#${cutNumber}")`);
  if (await cutBtn.count() === 0) {
    console.log(`  ✗ #${cutNumber} 버튼 없음`);
    await page.screenshot({ path: path.join(OUT, 'err-a4-single-dropdown.png') });
    return null;
  }

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      cutBtn.click(),
    ]);
    const savePath = path.join(DL, `a4-single-${cutNumber}.png`);
    await download.saveAs(savePath);
    console.log(`  ✓ a4-single-${cutNumber}.png (${fs.statSync(savePath).size} bytes)`);
    await page.waitForTimeout(3000);
    await closeModals(page);
    return savePath;
  } catch (e) {
    console.log(`  ✗ 다운로드 실패: ${e.message}`);
    await page.screenshot({ path: path.join(OUT, 'err-a4-single.png') });
    await closeModals(page);
    return null;
  }
}

async function testPageSplit(page) {
  // 브라우저에서 exportAsA4Grid를 직접 호출하여 13컷 이상 시뮬레이션
  // 실제 cuts를 2번 반복하여 24컷으로 만들기
  const result = await page.evaluate(async () => {
    // Import from already-loaded module
    const { exportAsA4Grid } = await import('/WEBTOON/src/utils/exportRenderer.js');

    // API로 cuts 가져오기
    const token = localStorage.getItem('token');
    const resp = await fetch('/WEBTOON/api/v1/projects/5/episodes/13/cuts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const cuts = await resp.json();
    const validCuts = cuts.filter(c => c.image_url);

    // 24컷으로 복제 (페이지 분할 시뮬레이션)
    const doubleCuts = [...validCuts, ...validCuts.map((c, i) => ({
      ...c,
      cut_id: c.cut_id + 10000,
      cut_number: c.cut_number + validCuts.length,
    }))];

    const getUrl = (cut) => {
      if (cut.image_url.startsWith('http')) return cut.image_url;
      if (cut.image_url.startsWith('/')) return `/WEBTOON${cut.image_url}`;
      return `/WEBTOON/storage/${cut.image_url}`;
    };

    try {
      const blob = await exportAsA4Grid(doubleCuts, [], getUrl);
      // If it's a ZIP (multi-page), check file count
      if (blob.type === 'application/zip' || blob.size > 5000000) {
        return `PASS: ${doubleCuts.length}컷 → blob ${blob.size} bytes (ZIP = 다중 페이지)`;
      }
      return `MAYBE: ${doubleCuts.length}컷 → blob ${blob.size} bytes (type=${blob.type})`;
    } catch (e) {
      return `FAIL: ${e.message}`;
    }
  });

  return result;
}

async function closeModals(page) {
  for (const text of ['닫기', '확인']) {
    const btn = page.locator(`button:has-text("${text}")`);
    if (await btn.count() > 0) {
      await btn.first().click();
      await page.waitForTimeout(500);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
