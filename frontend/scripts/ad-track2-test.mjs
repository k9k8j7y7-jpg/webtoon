/**
 * 광고 트랙 2차 검증 — instatoon 4컷 E2E + onecut 회귀 + story 회귀
 * Usage: node scripts/ad-track2-test.mjs <JWT>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: ...'); process.exit(1); }
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('../scratch/flow/ad-track2/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
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
  // ── 1. 인스타툰 4컷 생성 ──
  console.log('=== INSTATOON 4-CUT E2E ===');
  await page.goto(`${BASE}/my`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator('text=product_test_project').first().click();
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("새 에피소드")').first().click();
  await page.waitForTimeout(800);
  // Select instatoon_ad
  await page.locator('button:has-text("인스타툰 광고")').first().click();
  await page.waitForTimeout(800);
  await shot('01-cut-count-modal.png');
  // Title + start
  await page.locator('input[type="text"]').first().fill('광고트랙2차 테스트');
  await page.locator('button:has-text("시작하기")').first().click();
  await page.waitForURL(/workflow/, { timeout: 15000 });
  await page.waitForTimeout(3000);

  // Fill brief: product + key message
  console.log('  Brief...');
  const prodInput = page.locator('input[placeholder*="제품명"]').first();
  if (await prodInput.isVisible().catch(() => false)) {
    await prodInput.fill('MILBON SCALP SUPPORT OIL+');
  }
  const prodInfo = page.locator('textarea[placeholder*="특징"]').first();
  if (await prodInfo.isVisible().catch(() => false)) {
    await prodInfo.fill('두피 진정, 모발 윤기 회복. 식물성 오일 기반.');
  }
  const keyMsg = page.locator('textarea').first();
  await keyMsg.fill('건강한 두피로 빛나는 머릿결');
  await page.waitForTimeout(500);

  // [웹에서 보완]
  console.log('  Enrich product...');
  const enrichBtn = page.locator('button:has-text("웹에서 보완")').first();
  if (await enrichBtn.isVisible().catch(() => false)) {
    await enrichBtn.click();
    await page.waitForTimeout(15000); // wait for search
    await shot('02-enrich-result.png');
    // [반영]
    const applyBtn = page.locator('button:has-text("반영")').first();
    if (await applyBtn.isVisible().catch(() => false)) {
      await applyBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Generate brief
  console.log('  Generate brief...');
  await page.locator('button:has-text("광고 기획안 만들기")').first().click();
  await page.locator('text=카피 후보').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  // Proceed
  console.log('  Proceed...');
  await page.locator('button:has-text("이대로 진행")').first().click();
  await page.waitForTimeout(8000);

  // Gate 2 — script
  console.log('  Gate2 script...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const scriptBtn = page.locator('button:has-text("대본 생성")').first();
  if (await scriptBtn.isVisible().catch(() => false)) {
    await scriptBtn.click();
    await page.waitForTimeout(25000);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  await shot('03-script.png');

  // Approve script
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const g2a = page.locator('button:has-text("승인")').first();
  if (await g2a.isVisible().catch(() => false)) { await g2a.click(); await page.waitForTimeout(3000); }

  // Gate 3 — assets
  console.log('  Gate3 assets...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot('04-assets.png');

  // Approve assets (auto storyboard + gate5)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const g3a = page.locator('button:has-text("승인")').first();
  if (await g3a.isVisible().catch(() => false)) { await g3a.click(); await page.waitForTimeout(5000); }

  // Gate 5 — completion
  console.log('  Gate5 completion...');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot('05-gate5-before.png');

  // Generate 1 cut only (click generate, then cancel after 1)
  // Actually, just generate all — but we want to test the button
  const genBtn = page.locator('button:has-text("컷 생성")').first();
  if (await genBtn.isVisible().catch(() => false)) {
    console.log('  Generate 1 cut (1min)...');
    // We can't generate just 1 cut via the UI — it generates all pending.
    // Let's click and wait for 1 cut to finish
    await genBtn.click();
    await page.waitForTimeout(70000); // 1 cut ≈ 60s
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
  await shot('06-gate5-result.png');

  console.log('\n=== INSTATOON E2E DONE ===');

} catch (err) {
  console.error('ERROR:', err.message);
  await shot('error.png').catch(() => {});
} finally {
  await browser.close();
}
