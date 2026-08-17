/**
 * bubble-shot.mjs — 말풍선 테스트 페이지 스크린샷
 * Usage: node scripts/bubble-shot.mjs [style]
 * Default style: round
 * Requires: vite dev server running on localhost:5173
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'test-shots');

const style = process.argv[2] || 'round';
const port = process.env.VITE_PORT || '5173';
const devUrl = `http://localhost:${port}/WEBTOON/bubble-test?style=${style}`;

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('Chromium launch failed:', e.message);
    process.exit(1);
  }

  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

  try {
    await page.goto(devUrl, { waitUntil: 'networkidle', timeout: 10000 });
  } catch (e) {
    console.error(`Cannot reach ${devUrl}`);
    console.error('Is the vite dev server running? Start it with: npm run dev');
    await browser.close();
    process.exit(1);
  }

  // Wait for SVG elements to render
  await page.waitForTimeout(1000);

  const outPath = resolve(outDir, `${style}.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`Screenshot saved: ${outPath}`);

  // ── min_height 수치 판정 ──
  const mhSection = await page.$('#min-height-section');
  if (mhSection) {
    console.log('\n=== min_height 수치 판정 ===');
    const styles = ['round', 'narration', 'shout'];
    const ratios = [0, 25, 50];
    const containerH = 300;

    for (const st of styles) {
      for (const r of ratios) {
        const testId = `mh-${st}-${r}`;
        const cell = await page.$(`[data-testid="${testId}"]`);
        if (!cell) { console.log(`  [SKIP] ${testId} not found`); continue; }

        // 말풍선 shape의 bounding box
        const shapeBB = await cell.evaluate(el => {
          const shape = el.querySelector('svg path[fill], svg rect[fill], svg ellipse[fill]');
          if (!shape) return null;
          const bb = shape.getBBox();
          return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
        });

        // 텍스트 bounding box
        const textBB = await cell.evaluate(el => {
          const fo = el.querySelector('foreignObject');
          if (!fo) return null;
          return { x: +fo.getAttribute('x'), y: +fo.getAttribute('y'),
                   w: +fo.getAttribute('width'), h: +fo.getAttribute('height') };
        });

        if (!shapeBB) { console.log(`  [SKIP] ${testId} no shape`); continue; }

        const minReq = (r / 100) * containerH;
        const hOk = shapeBB.h >= minReq - 2;
        const textInside = textBB
          ? (textBB.y >= shapeBB.y - 1 && textBB.y + textBB.h <= shapeBB.y + shapeBB.h + 1)
          : 'N/A';

        console.log(`  ${testId}: shape=${Math.round(shapeBB.w)}x${Math.round(shapeBB.h)} ` +
          `minReq=${Math.round(minReq)} h≥min:${hOk ? 'OK' : 'FAIL'} ` +
          `textInside:${textInside === 'N/A' ? 'N/A' : textInside ? 'OK' : 'FAIL'}`);
      }
    }
  }

  await browser.close();
}

main();
