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
await page.goto('https://ssagda.com/WEBTOON/projects/13/episodes/114/workflow?gate=3', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const rects = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  return btns.filter(b => {
    const t = b.textContent;
    return t.includes('캐릭터') || t.includes('실사') || t.includes('불러오기') || t.includes('1인 2패킷');
  }).map(b => {
    const r = b.getBoundingClientRect();
    return { text: b.textContent.trim().slice(0, 40), h: Math.round(r.height), w: Math.round(r.width) };
  });
});
console.log(JSON.stringify(rects, null, 2));
await b.close();
