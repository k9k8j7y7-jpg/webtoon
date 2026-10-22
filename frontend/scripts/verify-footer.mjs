/**
 * verify-footer.mjs — 사업자 정보 푸터 검증
 * 375 모바일 + 1280 PC × 랜딩·로그인 후 페이지
 */
import { chromium } from 'playwright';
import fs from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node verify-footer.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = 'frontend/scripts/verify-footer';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const [w, label] of [[375, 'mobile'], [1280, 'pc']]) {
    const mobile = w < 640;
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: mobile ? 'dark' : 'light',
    });
    const page = await ctx.newPage();

    // ① 랜딩 푸터
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${label}-landing-footer.png` });
    console.log(`${label} landing footer captured`);

    // ② 로그인 후 페이지 푸터
    await page.goto(`${BASE}/login`);
    await page.evaluate((t) => localStorage.setItem('token', t), JWT);
    if (mobile) await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${label}-layout-footer.png` });
    console.log(`${label} layout footer captured`);

    await ctx.close();
  }

  // ③ Layout 푸터 (로그인 후 내부 페이지 /packets)
  for (const [w, label] of [[375, 'mobile'], [1280, 'pc']]) {
    const mobile = w < 640;
    const ctx2 = await browser.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: mobile ? 'dark' : 'light',
    });
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/login`);
    await page2.evaluate((t) => localStorage.setItem('token', t), JWT);
    if (mobile) await page2.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page2.goto(`${BASE}/packets`, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(2000);
    await page2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page2.waitForTimeout(500);
    await page2.screenshot({ path: `${OUT}/${label}-inner-footer.png` });
    console.log(`${label} inner page (packets) footer captured`);
    await ctx2.close();
  }

  await browser.close();
  console.log(`Done → ${OUT}/`);
})();
