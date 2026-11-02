import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const JWT = process.argv[2];
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = 'scripts/mobile-check';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  colorScheme: 'dark',
  ignoreHTTPSErrors: true,
});

const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate((t) => { localStorage.setItem('token', t); localStorage.setItem('theme', 'dark'); }, JWT);

// Gate5 result (ep80, onecut_ad, has image + copy render)
await page.goto(BASE + '/projects/12/episodes/80/workflow', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(OUT, 'copy-gate5-375.png'), fullPage: true });
console.log('copy-gate5-375.png saved');

// Gate1 대본 카드 (ep81, onecut_ad)
await page.goto(BASE + '/projects/12/episodes/81/workflow', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(OUT, 'copy-gate1-375.png'), fullPage: true });
console.log('copy-gate1-375.png saved');

await browser.close();
console.log('All done');
