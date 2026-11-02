/**
 * B items check — 42/43/45/46/47/51 mobile 375 dark screenshots
 * Usage: node frontend/scripts/b-items-check.mjs <JWT>
 */
import { chromium } from 'playwright';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node b-items-check.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'frontend/scripts/b-items-check';
const VIEWPORT = { width: 375, height: 812 };

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    storageState: {
      cookies: [],
      origins: [{
        origin: 'https://ssagda.com',
        localStorage: [
          { name: 'token', value: JWT },
          { name: 'theme', value: 'dark' },
        ],
      }],
    },
  });
  const page = await ctx.newPage();
  const fs = await import('fs');
  fs.mkdirSync(OUT, { recursive: true });

  // Helper
  const shot = async (name) => {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`  ${name}.png`);
  };

  // 45: Gate3 character sheet buttons — ep114 (brand_series, gate 3)
  console.log('45: Gate3 buttons — ep114');
  await page.goto(`${BASE}/projects/13/episodes/114/workflow?gate=3`, { waitUntil: 'networkidle' });
  await shot('45_gate3_buttons');
  // Measure button rects
  const rects = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    const targets = [];
    for (const b of btns) {
      const t = b.textContent.trim();
      if (t.includes('캐릭터 자동 생성') || t.includes('재생성 (1인') || t.includes('실사 캐릭터') || t.includes('캐릭터 불러오기')) {
        const r = b.getBoundingClientRect();
        targets.push({ text: t.slice(0, 30), height: Math.round(r.height), width: Math.round(r.width) });
      }
    }
    return targets;
  });
  console.log('  Button rects:', JSON.stringify(rects));

  // 46/47: Gate5 — ep111 (instatoon_ad, gate 5)
  console.log('46/47: Gate5 — ep111');
  await page.goto(`${BASE}/projects/12/episodes/111/workflow?gate=5`, { waitUntil: 'networkidle' });
  await shot('46_47_gate5_cuts');

  // 51: RegenDropdown — click first regen chevron
  console.log('51: RegenDropdown');
  const chevBtn = await page.$('button[title="재생성 (1패킷)"]');
  if (chevBtn) {
    // Click the dropdown chevron (right part of split button)
    const splitBtns = await page.$$('button');
    for (const b of splitBtns) {
      const txt = await b.textContent();
      if (txt.includes('▾') || txt.trim() === '') {
        const parent = await b.evaluate(el => el.closest('.relative')?.textContent || '');
        if (parent.includes('재생성')) {
          await b.click();
          break;
        }
      }
    }
  }
  // Try clicking the chevron-down button
  const chevDown = await page.$$('button');
  for (const b of chevDown) {
    try {
      const svg = await b.$('svg.lucide-chevron-down');
      if (svg) {
        const parent = await b.evaluate(el => el.closest('.relative')?.querySelector('button')?.textContent || '');
        if (parent.includes('재생성')) {
          await b.click();
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch {}
  }
  await shot('51_regen_sheet');

  // 43: Gate2 scene — ep117 (instatoon_ad, gate 2)
  console.log('43: Gate2 — ep117');
  await page.goto(`${BASE}/projects/14/episodes/117/workflow?gate=2`, { waitUntil: 'networkidle' });
  await shot('43_gate2_scene');

  // 42: Gate1 brief — go to a gate1 episode or create new
  console.log('42: Gate1 — ep115 (brand_series, gate 1)');
  await page.goto(`${BASE}/projects/13/episodes/115/workflow?gate=1`, { waitUntil: 'networkidle' });
  await shot('42_gate1_brief');

  await browser.close();
  console.log('Done. Screenshots in', OUT);
}

run().catch(e => { console.error(e); process.exit(1); });
