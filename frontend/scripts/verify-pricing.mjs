// 재포지셔닝 1단계 검증: 가격 페이지·랜딩 가격·FAQ 캡처 + 체험 팩 결제 테스트
// Usage: node scripts/verify-pricing.mjs <JWT>
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node scripts/verify-pricing.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./verify-pricing/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const w of [375, 1280]) {
    const mobile = w < 640;
    const theme = mobile ? 'dark' : 'light';
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.evaluate(({ t, th }) => {
      localStorage.setItem('token', t);
      localStorage.setItem('theme', th);
    }, { t: TOKEN, th: theme });

    const prefix = `${theme}-${w}`;
    const shot = async (name, full = false) => {
      const file = `${OUT}${prefix}-${name}.png`;
      await page.screenshot({ path: file, fullPage: full });
      console.log(`  ${prefix}-${name}.png`);
    };

    // 1. 가격 페이지 (PacketsPage)
    console.log(`\n[${prefix}] 패킷 충전 페이지`);
    await page.goto(`${BASE}/packets`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot('packets', true);

    // 2. 랜딩 전체 (가격 섹션 포함)
    console.log(`[${prefix}] 랜딩 전체`);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot('landing', true);

    // 3. 랜딩 가격 섹션만
    await page.evaluate(() => document.getElementById('pricing')?.scrollIntoView());
    await page.waitForTimeout(500);
    await shot('landing-pricing');

    // 4. 랜딩 FAQ 섹션만
    await page.evaluate(() => document.getElementById('faq')?.scrollIntoView());
    await page.waitForTimeout(500);
    await shot('landing-faq');

    // 5. FAQ 페이지
    console.log(`[${prefix}] FAQ 페이지`);
    await page.goto(`${BASE}/faq`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot('faq', true);

    // 6. 약관 6조 캡처
    console.log(`[${prefix}] 약관`);
    await page.goto(`${BASE}/terms`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    // 6조 (패킷 및 결제) 위치로 스크롤
    await page.evaluate(() => {
      const headings = [...document.querySelectorAll('h2')];
      const h = headings.find(el => el.textContent.includes('제6조'));
      if (h) h.scrollIntoView();
    });
    await page.waitForTimeout(500);
    await shot('terms-article6');

    results.push({ width: w, theme, done: true });
    await ctx.close();
  }

  console.log('\n✅ 캡처 완료:', results.length, '세트');
  console.log('📁', OUT);
  await browser.close();
})();
