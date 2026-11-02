import { chromium } from 'playwright';
const JWT = process.argv[2];
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({
  viewport: { width: 375, height: 812 },
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
// ep111 is at gate 5 — view gate 2 via step navigation
await page.goto('https://ssagda.com/WEBTOON/projects/12/episodes/111/workflow?gate=2', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const fs = await import('fs');
fs.mkdirSync('frontend/scripts/b-items-check', { recursive: true });
await page.screenshot({ path: 'frontend/scripts/b-items-check/43_gate2_ep111.png', fullPage: true });
console.log('43_gate2_ep111.png');
await b.close();
