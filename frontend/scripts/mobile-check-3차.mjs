/**
 * mobile-check 3차 — 42·43·45·51 at 375/412 dark
 * Usage: node frontend/scripts/mobile-check-3차.mjs <JWT>
 */
import { chromium } from 'playwright';
import fs from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node mobile-check-3차.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'frontend/scripts/mobile-check-3차';
fs.mkdirSync(OUT, { recursive: true });

async function runWidth(width) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width, height: 812 },
    colorScheme: 'dark',
    storageState: {
      cookies: [],
      origins: [{ origin: 'https://ssagda.com', localStorage: [
        { name: 'token', value: JWT },
        { name: 'theme', value: 'dark' },
      ]}],
    },
  });
  const page = await ctx.newPage();
  const shot = async (name) => {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${width}_${name}.png`, fullPage: true });
    console.log(`  ${width}_${name}.png`);
  };

  // 42: Gate1 brief button — ep115 (brand_series, gate 1)
  await page.goto(`${BASE}/projects/13/episodes/115/workflow`, { waitUntil: 'networkidle' });
  await shot('42_gate1');

  // 43: Gate2 scene — ep117 (instatoon_ad, gate 2)
  await page.goto(`${BASE}/projects/14/episodes/117/workflow`, { waitUntil: 'networkidle' });
  await shot('43_gate2');

  // 45: Gate3 buttons — ep114 (brand_series, gate 3)
  await page.goto(`${BASE}/projects/13/episodes/114/workflow?gate=3`, { waitUntil: 'networkidle' });
  await shot('45_gate3');

  // 51: Gate5 regen — ep111 (instatoon_ad, gate 5) - open regen dropdown
  await page.goto(`${BASE}/projects/12/episodes/111/workflow?gate=5`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  // Click chevron-down to open regen sheet
  const chevrons = await page.$$('svg.lucide-chevron-down');
  for (const svg of chevrons) {
    const btn = await svg.evaluateHandle(el => el.closest('button'));
    if (btn) {
      const parent = await btn.evaluate(el => el.closest('.relative')?.textContent || '');
      if (parent.includes('재생성')) {
        await btn.asElement()?.click();
        await page.waitForTimeout(500);
        break;
      }
    }
  }
  await shot('51_regen');

  await browser.close();
}

console.log('=== 375px ===');
await runWidth(375);
console.log('=== 412px ===');
await runWidth(412);
console.log(`Done. Screenshots in ${OUT}`);
