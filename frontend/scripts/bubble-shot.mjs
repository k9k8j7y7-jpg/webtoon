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

  // ── text_offset 수치 판정 ──
  const toSection = await page.$('#text-offset-section');
  if (toSection) {
    console.log('\n=== text_offset 수치 판정 ===');
    const toStyles = ['round', 'narration', 'shout'];
    const toOffsets = [
      { label: '0,0', ox: 0, oy: 0 },
      { label: 'n5n5', ox: -0.5, oy: -0.5 },
      { label: 'p5p5', ox: 0.5, oy: 0.5 },
      { label: 'p50', ox: 0.5, oy: 0 },
      { label: '0n5', ox: 0, oy: -0.5 },
    ];
    const toTexts = ['short', 'full'];
    const spikeTol = 2;  // 스파이크 ±2px 허용

    // 기준값 저장 (offset 0,0)
    const baselines = {};

    for (const st of toStyles) {
      const tol = st === 'shout' ? spikeTol : 1;
      for (const tl of toTexts) {
        for (const { label: ol, ox, oy } of toOffsets) {
          const testId = `to-${st}-${tl}-${ol}`;
          const cell = await page.$(`[data-testid="${testId}"]`);
          if (!cell) { console.log(`  [SKIP] ${testId} not found`); continue; }

          const shapeBB = await cell.evaluate(el => {
            const shape = el.querySelector('svg path[fill], svg rect[fill], svg ellipse[fill]');
            if (!shape) return null;
            const bb = shape.getBBox();
            return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
          });

          // 실제 텍스트 글리프 위치 (Range API → SVG 좌표 변환)
          const textBB = await cell.evaluate(el => {
            const svg = el.querySelector('svg');
            const fo = svg?.querySelector('foreignObject');
            if (!fo) return null;
            const svgRect = svg.getBoundingClientRect();
            const svgW = +svg.getAttribute('width');
            const svgH = +svg.getAttribute('height');
            const scaleX = svgW / svgRect.width;
            const scaleY = svgH / svgRect.height;
            // Range API로 각 줄의 실제 텍스트 글리프 bounding box 측정
            const lineDivs = fo.querySelectorAll('div > div');
            if (lineDivs.length === 0) return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const ld of lineDivs) {
              const textNode = ld.firstChild;
              if (!textNode || textNode.nodeType !== 3) continue;
              const range = document.createRange();
              range.selectNode(textNode);
              for (const r of range.getClientRects()) {
                minX = Math.min(minX, r.left);
                minY = Math.min(minY, r.top);
                maxX = Math.max(maxX, r.right);
                maxY = Math.max(maxY, r.bottom);
              }
            }
            if (minX === Infinity) return null;
            return {
              x: (minX - svgRect.left) * scaleX,
              y: (minY - svgRect.top) * scaleY,
              w: (maxX - minX) * scaleX,
              h: (maxY - minY) * scaleY,
            };
          });

          if (!shapeBB || !textBB) { console.log(`  [SKIP] ${testId} missing element`); continue; }

          // 검증 1: 텍스트 BB ⊂ 말풍선 BB
          const inside =
            textBB.x >= shapeBB.x - tol &&
            textBB.y >= shapeBB.y - tol &&
            textBB.x + textBB.w <= shapeBB.x + shapeBB.w + tol &&
            textBB.y + textBB.h <= shapeBB.y + shapeBB.h + tol;

          // 기준값 (0,0) 저장/비교
          const baseKey = `${st}-${tl}`;
          if (ol === '0,0') {
            baselines[baseKey] = { tx: textBB.x, ty: textBB.y };
          }

          // 검증 2: 기준(0,0) 대비 변위 분석 (X/Y 독립)
          let moveLabel = '-';
          if (ol === '0,0') {
            moveLabel = 'BASE';
          } else if (baselines[baseKey]) {
            const base = baselines[baseKey];
            const dx = Math.abs(textBB.x - base.tx);
            const dy = Math.abs(textBB.y - base.ty);
            const xPart = dx > 0.5 ? `X:${ox > 0 ? '+' : '-'}${dx.toFixed(1)}` : 'X:fixed';
            const yPart = dy > 0.5 ? `Y:${oy > 0 ? '+' : '-'}${dy.toFixed(1)}` : 'Y:fixed';
            moveLabel = `${xPart} ${yPart}`;
          }

          // 검증 3: 가장자리 간격
          const gapLeft = textBB.x - shapeBB.x;
          const gapRight = (shapeBB.x + shapeBB.w) - (textBB.x + textBB.w);
          const gapTop = textBB.y - shapeBB.y;
          const gapBot = (shapeBB.y + shapeBB.h) - (textBB.y + textBB.h);

          console.log(`  ${testId}: inside:${inside ? 'OK' : 'FAIL'} ${moveLabel} ` +
            `gaps(L=${gapLeft.toFixed(1)} R=${gapRight.toFixed(1)} T=${gapTop.toFixed(1)} B=${gapBot.toFixed(1)}) ` +
            `text@(${textBB.x.toFixed(1)},${textBB.y.toFixed(1)}) shape@(${shapeBB.x.toFixed(1)},${shapeBB.y.toFixed(1)},${(shapeBB.x+shapeBB.w).toFixed(1)},${(shapeBB.y+shapeBB.h).toFixed(1)})`);
        }
      }
    }
  }

  await browser.close();
}

main();
