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
// ep117 at gate 2 — navigate directly to workflow
await page.goto('https://ssagda.com/WEBTOON/projects/14/episodes/117/workflow', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const fs = await import('fs');
fs.mkdirSync('frontend/scripts/b-items-check', { recursive: true });
await page.screenshot({ path: 'frontend/scripts/b-items-check/43_gate2_ep117.png', fullPage: true });
console.log('done');

// Also check page content
const text = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('Page text:', text.slice(0, 200));
await b.close();
