/**
 * 인스타툰 광고 — 후반부 캡처 (07~12)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: ...'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('../scratch/flow/instatoon/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 }, colorScheme: 'dark', ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(t => { localStorage.setItem('token', t); localStorage.setItem('theme', 'dark'); }, TOKEN);

const shot = async (name) => {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}${name}`, fullPage: true });
  console.log(`  >> ${name}`);
};

try {
  // 07 — gate4 view via StepHeader
  console.log('07 콘티·장소...');
  await page.goto(`${BASE}/projects/12/episodes/106/workflow`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  // Open step menu
  await page.locator('button:has-text("단계 이동")').first().click();
  await page.waitForTimeout(800);
  // Click STEP 4 item inside the step menu bottom sheet
  const menuItems = page.locator('[data-step-menu] button');
  const count = await menuItems.count();
  for (let i = 0; i < count; i++) {
    const text = await menuItems.nth(i).textContent();
    if (text.includes('STEP 4') || text.includes('콘티·장소')) {
      await menuItems.nth(i).click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('07-storyboard.png');

  // 09 — gate5 with images
  console.log('09 생성 후...');
  // Navigate back to gate 5 via step menu
  await page.locator('button:has-text("단계 이동")').first().click();
  await page.waitForTimeout(800);
  const menuItems2 = page.locator('[data-step-menu] button');
  const count2 = await menuItems2.count();
  for (let i = 0; i < count2; i++) {
    const text = await menuItems2.nth(i).textContent();
    if (text.includes('STEP 5') || text.includes('웹툰 만들기') || text.includes('완성')) {
      await menuItems2.nth(i).click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('09-after-gen.png');

  // 10 — page preview
  console.log('10 페이지 미리보기...');
  const prevBtn = page.locator('button:has-text("페이지 미리보기")').first();
  if (await prevBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await prevBtn.click();
    await page.waitForTimeout(2500);
    await shot('10-page-preview.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    await shot('10-page-preview.png');
  }

  // 11 — insta share
  console.log('11 인스타 공유...');
  const instaBtn = page.locator('button:has-text("인스타 공유")').first();
  if (await instaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await instaBtn.click();
    await page.waitForTimeout(3000);
    await shot('11-insta-share.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    await shot('11-insta-share.png');
  }

  // 12 — episode list
  console.log('12 에피소드 목록...');
  await page.goto(`${BASE}/my`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('text=product_test_project').first().click();
  await page.waitForTimeout(2000);
  await shot('12-episode-list.png');

  console.log('\nDone');
} catch (err) {
  console.error('ERROR:', err.message);
  await shot('error2.png').catch(() => {});
} finally {
  await browser.close();
}
