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
const devUrl = `http://localhost:5173/WEBTOON/bubble-test?style=${style}`;

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

  await browser.close();
}

main();
