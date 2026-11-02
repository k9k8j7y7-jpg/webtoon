import { chromium } from 'playwright';
import fs from 'fs';
const JWT = process.argv[2];
if (!JWT) { console.error('Usage: ...'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'frontend/scripts/brand-series-check';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 }, colorScheme: 'dark',
  storageState: { cookies: [], origins: [{ origin: 'https://ssagda.com', localStorage: [
    { name: 'token', value: JWT }, { name: 'theme', value: 'dark' },
  ]}]},
});
const page = await ctx.newPage();
const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); console.log(`  ${name}.png`); };

// brand_series project page (project 13) — [새 화] button + episode list
console.log('ProjectPage — brand_series project 13');
await page.goto(`${BASE}/projects/13`, { waitUntil: 'networkidle' });
await shot('01_project_list');

// brand_series brief — ep115 (gate 1)
console.log('Brief — ep115 (prefill)');
await page.goto(`${BASE}/projects/13/episodes/115/workflow`, { waitUntil: 'networkidle' });
await shot('02_brief_prefill');

// brand_series Gate3 — ep114 (gate 3)
console.log('Gate3 — ep114');
await page.goto(`${BASE}/projects/13/episodes/114/workflow?gate=3`, { waitUntil: 'networkidle' });
await shot('03_gate3_model_buttons');

// Gate2 — ep114 (view script for cut count chips)
console.log('Gate2 — ep114');
await page.goto(`${BASE}/projects/13/episodes/114/workflow?gate=2`, { waitUntil: 'networkidle' });
await shot('04_gate2_cut_chips');

// onecut_ad regression — ep118 project page
console.log('Onecut regression — project 12');
await page.goto(`${BASE}/projects/12`, { waitUntil: 'networkidle' });
await shot('05_onecut_project');

// instatoon_ad regression — project 14
console.log('Instatoon regression — project 14');
await page.goto(`${BASE}/projects/14`, { waitUntil: 'networkidle' });
await shot('06_instatoon_project');

await browser.close();
console.log(`Done. Screenshots in ${OUT}`);
