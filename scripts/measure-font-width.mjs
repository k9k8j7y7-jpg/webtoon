/**
 * measure-font-width.mjs — 폰트별 charWidth 실측
 *
 * Canvas measureText로 한글 혼합 샘플 3종을 각 폰트로 측정 →
 * fontSize 대비 평균 글자폭 비율 산출 (CHAR_WIDTH 정의와 동일)
 *
 * 사용법: node scripts/measure-font-width.mjs
 * 요구: @napi-rs/canvas (node-canvas 대안) 또는 브라우저 환경
 *
 * 브라우저 기반 측정: Playwright로 실행
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// playwright는 frontend/node_modules에 설치됨
const { chromium } = require('../frontend/node_modules/playwright');
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FONTS_DIR = resolve(ROOT, 'frontend/public/fonts');

// 측정 대상 폰트
const FONTS = [
  { id: 'pretendard', family: 'Pretendard', file: null, cdn: 'https://cdn.jsdelivr.net/npm/pretendard/dist/web/static/pretendard.css' },
  { id: 'nanum-brush', family: 'NanumBrush', file: 'nanum-brush.woff2' },
  { id: 'nanum-bisang', family: 'NanumBisang', file: 'nanum-bisang.woff2' },
  { id: 'nanum-nunchi', family: 'NanumNunchi', file: 'nanum-nunchi.woff2' },
  { id: 'chab', family: 'Chab', file: 'chab.woff2' },
  { id: 'jeongseon', family: 'Jeongseon', file: 'jeongseon.woff2' },
  { id: 'recipekorea', family: 'Recipekorea', file: 'recipekorea.woff2' },
  { id: 'bmjua', family: 'BMJUA', file: 'bmjua.woff2' },
];

// 측정 샘플 3종
const SAMPLES = [
  '안녕하세요 반가워요!',           // 짧은 대사
  '그날 밤 하늘에서 별이 쏟아지고 있었다. 아무도 예상하지 못한 일이 벌어졌다.',  // 긴 나레이션
  '오후 3시 30분, 기온 -5°C! 확률 99.7%',  // 숫자·문장부호
];

const FONT_SIZE = 14;  // BubbleOverlay BASE_FONT_SIZE와 동일

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 폰트 로드용 HTML 생성
  let fontFaceCSS = '';
  for (const f of FONTS) {
    if (f.file) {
      const fontPath = resolve(FONTS_DIR, f.file);
      const buf = readFileSync(fontPath);
      const b64 = buf.toString('base64');
      fontFaceCSS += `@font-face { font-family: '${f.family}'; src: url(data:font/woff2;base64,${b64}) format('woff2'); }\n`;
    }
  }

  const html = `<!DOCTYPE html>
<html><head>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard/dist/web/static/pretendard.css">
<style>${fontFaceCSS}
body { margin: 0; }
canvas { display: block; }
</style>
</head><body>
<canvas id="c" width="2000" height="200"></canvas>
<script>
async function measure() {
  // 모든 폰트 로드 대기
  await document.fonts.ready;
  const fonts = ${JSON.stringify(FONTS.map(f => ({ id: f.id, family: f.family })))};
  const samples = ${JSON.stringify(SAMPLES)};
  const fontSize = ${FONT_SIZE};
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const results = {};

  for (const f of fonts) {
    // 폰트 로드 확인
    try {
      await document.fonts.load('400 ' + fontSize + 'px "' + f.family + '"');
      await document.fonts.load('500 ' + fontSize + 'px "' + f.family + '"');
      await document.fonts.load('700 ' + fontSize + 'px "' + f.family + '"');
      await document.fonts.load('900 ' + fontSize + 'px "' + f.family + '"');
    } catch {}

    ctx.font = '500 ' + fontSize + 'px "' + f.family + '", sans-serif';

    let totalWidth = 0;
    let totalChars = 0;
    const sampleResults = [];

    for (const text of samples) {
      const m = ctx.measureText(text);
      const avgPerChar = m.width / text.length;
      const ratio = avgPerChar / fontSize;
      sampleResults.push({ text: text.substring(0, 20), width: m.width, chars: text.length, ratio: ratio });
      totalWidth += m.width;
      totalChars += text.length;
    }

    const overallRatio = (totalWidth / totalChars) / fontSize;
    results[f.id] = {
      samples: sampleResults,
      charWidth: Math.round(overallRatio * 1000) / 1000,
    };
  }
  return results;
}
measure().then(r => window.__RESULT__ = r);
</script>
</body></html>`;

  await page.setContent(html, { waitUntil: 'networkidle' });
  // 폰트 로드 + 측정 완료 대기
  await page.waitForFunction(() => window.__RESULT__, { timeout: 15000 });
  const results = await page.evaluate(() => window.__RESULT__);

  console.log('\n=== charWidth 실측 결과 (fontSize 대비 평균 글자폭 비율) ===\n');
  console.log(`${'폰트 ID'.padEnd(16)} ${'charWidth'.padStart(10)}  샘플별 비율`);
  console.log('-'.repeat(70));

  for (const f of FONTS) {
    const r = results[f.id];
    if (!r) { console.log(`${f.id.padEnd(16)}  (측정 실패)`); continue; }
    const sampleRatios = r.samples.map(s => s.ratio.toFixed(3)).join(' / ');
    console.log(`${f.id.padEnd(16)} ${r.charWidth.toFixed(3).padStart(10)}  [${sampleRatios}]`);
  }

  console.log('\n// FONT_CATALOG charWidth 업데이트용:');
  for (const f of FONTS) {
    const r = results[f.id];
    if (r) console.log(`  ${f.id}: ${r.charWidth},`);
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
