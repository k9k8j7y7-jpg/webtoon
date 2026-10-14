import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });
const EP = '/projects/5/episodes/36/workflow';

const browser = await chromium.launch({ headless: true });

for (const [label, w, mob] of [['375', 375, true], ['1280', 1280, false]]) {
  console.log(`\n[${label}]`);
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    ...(mob ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.evaluate(t => localStorage.setItem('token', t), JWT);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.goto(`${BASE}${EP}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // CutEditor 열기
  await page.locator('button:has-text("편집")').first().click({ force: true });
  await page.waitForTimeout(2000);

  // 편집 모드 진입
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.className || '').includes('from-neon-from') && b.textContent.includes('편집'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(1000);

  // 효과음 클릭
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('효과음'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);

  const hasBatchOnSfx = await page.evaluate(() => document.body.innerText.includes('전체 박스로'));
  console.log(`   효과음 선택 시 [전체 박스로] 표시: ${hasBatchOnSfx}`);
  await page.screenshot({ path: `${OUT}/cuteditor-sfx-${label}.png` });

  // 내레이션 클릭
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes('내레이션'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);

  const hasBatchOnNarr = await page.evaluate(() => document.body.innerText.includes('전체 박스로'));
  console.log(`   내레이션 선택 시 [전체 박스로] 표시: ${hasBatchOnNarr}`);
  await page.screenshot({ path: `${OUT}/cuteditor-narr-batch-${label}.png` });

  console.log(`   verdict: ${!hasBatchOnSfx && hasBatchOnNarr ? 'PASS' : 'FAIL'}`);

  await ctx.close();
}

await browser.close();
