/**
 * export-verify.mjs — Export 실출력 검증 (Playwright)
 *
 * 검증 항목:
 * 1. PNG 개별컷 — #8 min_height/text_offset, #3 shout, #8 SFX, #12 narration×2
 * 2. 세로 이어붙이기
 * 3. 인스타 1080×1080
 * 4. #7 dialogue 빈 상태 처리
 *
 * Usage: cd frontend && node scripts/export-verify.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, 'export-verify-out');
const DL = path.join(OUT, 'downloads');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(DL)) fs.mkdirSync(DL, { recursive: true });

// JWT from .env.local
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

  // Login
  console.log('[1] Login + navigate...');
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
  await page.screenshot({ path: path.join(OUT, '00-gate5-grid.png'), fullPage: true });

  // 컷 이미지 로드 확인
  const cutImgs = page.locator('img[alt*="컷"]');
  const cutCount = await cutImgs.count();
  console.log(`  컷 이미지 수: ${cutCount}`);

  // ── 미리보기 스크린샷: #3, #7, #8, #12 ──
  for (const n of [3, 7, 8, 12]) {
    console.log(`[2] Preview #${n}...`);
    const img = page.locator(`img[alt="컷 ${n}"]`).first();
    if (await img.count() === 0) { console.log(`  #${n} not found`); continue; }

    // 해당 컷의 부모 컨테이너 hover → 확대 버튼
    const container = img.locator('xpath=ancestor::div[contains(@class,"relative")]').first();
    await container.hover();
    await page.waitForTimeout(300);

    // 확대 버튼 또는 "미리보기" 등
    const btn = container.locator('button').first();
    if (await btn.count() > 0) {
      await btn.click();
    } else {
      await img.click();
    }
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(OUT, `01-preview-${n}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ── Export: PNG ZIP ──
  console.log('[3] Export PNG ZIP...');
  const pngFile = await doExport(page, 'PNG', 'export-png.zip');

  // ── Export: 세로 ──
  console.log('[4] Export Vertical...');
  const vertFile = await doExport(page, '세로', 'export-vertical.png');

  // ── Export: 인스타 ──
  console.log('[5] Export Instagram...');
  const instaFile = await doExport(page, '인스타', 'export-insta.zip');

  await browser.close();

  // ── 판정 ──
  console.log('\n═══════════════════════════════════════');
  console.log('         Export 검증 판정 결과');
  console.log('═══════════════════════════════════════\n');

  // [1] PNG ZIP 존재 + 파일 수
  if (pngFile && fs.existsSync(pngFile)) {
    const size = fs.statSync(pngFile).size;
    console.log(`[1] PNG ZIP: ${size} bytes — ✓ 생성됨`);
    // Unzip하여 개별 컷 확인
    const unzipDir = path.join(DL, 'png-unzipped');
    if (!fs.existsSync(unzipDir)) fs.mkdirSync(unzipDir, { recursive: true });
    try {
      execSync(`cd "${unzipDir}" && python -c "
import zipfile, sys, os
z = zipfile.ZipFile('${pngFile.replace(/\\/g, '/')}')
z.extractall('.')
for f in sorted(z.namelist()):
    p = os.path.join('.', f)
    print(f'{f}: {os.path.getsize(p)} bytes')
z.close()
"`);
      const files = fs.readdirSync(unzipDir).filter(f => f.endsWith('.png'));
      console.log(`     컷 파일 수: ${files.length}`);
      // #7(cut_007) 존재 여부 — dialogue 빈 컷도 이미지는 포함되어야
      const has7 = files.some(f => f.includes('007'));
      console.log(`     #7 포함: ${has7 ? '✓' : '✗'}`);
      // 각 파일 크기 + 이미지 크기 (PIL)
      for (const f of files) {
        const sz = fs.statSync(path.join(unzipDir, f)).size;
        let dims = '';
        try {
          dims = execSync(`python -c "from PIL import Image; i=Image.open('${path.join(unzipDir, f).replace(/\\/g, '/')}'); print(f'{i.width}x{i.height}')"`).toString().trim();
        } catch {}
        console.log(`     ${f}: ${sz} bytes ${dims}`);
      }
    } catch (e) {
      console.log(`     unzip 실패: ${e.message}`);
    }
  } else {
    console.log('[1] PNG ZIP: ✗ 파일 없음');
  }

  // [5] Vertical
  if (vertFile && fs.existsSync(vertFile)) {
    const size = fs.statSync(vertFile).size;
    console.log(`\n[5] Vertical: ${size} bytes — ✓ 생성됨`);
    // 이미지 크기 확인 (python PIL)
    try {
      const dims = execSync(`python -c "from PIL import Image; i=Image.open('${vertFile.replace(/\\/g, '/')}'); print(f'{i.width}x{i.height}')"`).toString().trim();
      console.log(`     크기: ${dims}`);
    } catch { console.log('     (PIL로 크기 확인 불가)'); }
  } else {
    console.log('\n[5] Vertical: ✗ 파일 없음');
  }

  // [6] Instagram
  if (instaFile && fs.existsSync(instaFile)) {
    const size = fs.statSync(instaFile).size;
    console.log(`\n[6] Instagram ZIP: ${size} bytes — ✓ 생성됨`);
    const unzipDir2 = path.join(DL, 'insta-unzipped');
    if (!fs.existsSync(unzipDir2)) fs.mkdirSync(unzipDir2, { recursive: true });
    try {
      const result = execSync(`python -c "
import zipfile, os
from PIL import Image
z = zipfile.ZipFile('${instaFile.replace(/\\/g, '/')}')
z.extractall('${unzipDir2.replace(/\\/g, '/')}')
for f in sorted(z.namelist()):
    p = os.path.join('${unzipDir2.replace(/\\/g, '/')}', f)
    i = Image.open(p)
    print(f'{f}: {i.width}x{i.height}')
z.close()
"`).toString().trim();
      console.log(`     ${result.replace(/\n/g, '\n     ')}`);
      // 1080×1080 확인
      const all1080 = result.split('\n').every(l => l.includes('1080x1080'));
      console.log(`     전체 1080×1080: ${all1080 ? '✓' : '✗'}`);
    } catch (e) {
      console.log(`     분석 실패: ${e.message}`);
    }
  } else {
    console.log('\n[6] Instagram ZIP: ✗ 파일 없음');
  }

  console.log('\n[미리보기 스크린샷]');
  for (const n of [3, 7, 8, 12]) {
    const f = path.join(OUT, `01-preview-${n}.png`);
    console.log(`  #${n}: ${fs.existsSync(f) ? fs.statSync(f).size + ' bytes ✓' : '✗'}`);
  }

  console.log(`\n출력 디렉토리: ${OUT}`);
}

async function doExport(page, label, filename) {
  // Export 모달이 남아있으면 닫기
  const closeBtn = page.locator('button:has-text("닫기")');
  if (await closeBtn.count() > 0) {
    await closeBtn.first().click();
    await page.waitForTimeout(500);
  }

  const btn = page.locator(`button:has-text("${label}")`).last();
  if (await btn.count() === 0) {
    console.log(`  ✗ "${label}" 버튼 없음`);
    return null;
  }

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      btn.click(),
    ]);
    const savePath = path.join(DL, filename);
    await download.saveAs(savePath);
    console.log(`  ✓ ${filename} (${fs.statSync(savePath).size} bytes)`);
    // 모달 닫기 대기
    await page.waitForTimeout(3000);
    const cb = page.locator('button:has-text("닫기")');
    if (await cb.count() > 0) await cb.first().click();
    await page.waitForTimeout(1000);
    return savePath;
  } catch (e) {
    console.log(`  ✗ 다운로드 실패: ${e.message}`);
    // 스크린샷 남기기
    await page.screenshot({ path: path.join(OUT, `err-${label}.png`) });
    // 모달 닫기 시도
    const cb2 = page.locator('button:has-text("닫기"), button:has-text("확인")');
    if (await cb2.count() > 0) await cb2.first().click();
    await page.waitForTimeout(1000);
    return null;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
