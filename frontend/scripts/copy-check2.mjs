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

// ep80 gate1 view mode (StepHeader 단계 이동으로 gate1 보기)
await page.goto(BASE + '/projects/12/episodes/80/workflow?gate=1', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(OUT, 'copy-gate1-view-375.png'), fullPage: true });
console.log('copy-gate1-view-375.png saved');

await browser.close();
console.log('Done');
