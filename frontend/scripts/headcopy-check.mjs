import { chromium } from 'playwright';
import path from 'path';
import { mkdirSync } from 'fs';
const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/product-check');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:600,height:600}, deviceScaleFactor:2 });
const page = await ctx.newPage();

// ① compose 이미지 직접 다운로드
const resp1 = await page.goto(`${BASE}/storage/episodes/80/cuts/ep80_c001_composed.png`);
const buf1 = await resp1.body();
const fs = await import('fs');
fs.writeFileSync(path.join(OUT, 'headcopy-compose.png'), buf1);
console.log('✅ headcopy-compose.png saved', buf1.length, 'bytes');

// ② 원본 이미지 다운로드
const resp2 = await page.goto(`${BASE}/storage/episodes/80/cuts/ep80_c001_v2.png`);
const buf2 = await resp2.body();
fs.writeFileSync(path.join(OUT, 'headcopy-original.png'), buf2);
console.log('✅ headcopy-original.png saved', buf2.length, 'bytes');

await browser.close();
