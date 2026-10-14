/**
 * test-step-header.mjs — StepHeader Playwright 검증
 * PC 1280·폰 375에서 게이트 헤더 캡처 + 메뉴 이동·보기 모드
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node test-step-header.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const EP_PATH = '/projects/5/episodes/36/workflow';

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`   캡처: ${name}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const [label, viewport] of [['pc', { width: 1280, height: 900 }], ['mobile', { width: 375, height: 812 }]]) {
    console.log(`\n[${label}] 검증 시작`);
    const isMobile = label === 'mobile';
    const ctx = await browser.newContext({
      viewport,
      ...(isMobile ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), JWT);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(`${BASE}${EP_PATH}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 현재 게이트 헤더
    await shot(page, `step-header-current-${label}`);

    // 메뉴 열기
    await page.locator('button:has-text("단계 이동")').click({ force: true });
    await page.waitForTimeout(800);
    await shot(page, `step-header-menu-${label}`);

    // STEP 1 클릭 (visible한 것만)
    const step1 = page.locator('button[role="menuitem"]:has-text("STEP 1")').locator('visible=true');
    if (await step1.count() > 0 && !(await step1.isDisabled())) {
      await step1.click({ force: true });
      await page.waitForTimeout(1000);
      await shot(page, `step-header-viewing-step1-${label}`);
      const hasView = await page.locator('text=보기 모드').count() > 0;
      console.log(`   보기 모드 배지: ${hasView}`);

      // 현재 단계로 돌아가기
      const back = page.locator('button:has-text("현재 단계로")').locator('visible=true').first();
      if (await back.count() > 0) {
        await back.click({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // STEP 3 보기
    await page.locator('button:has-text("단계 이동")').click({ force: true });
    await page.waitForTimeout(800);
    const step3 = page.locator('button[role="menuitem"]:has-text("STEP 3")').locator('visible=true');
    if (await step3.count() > 0 && !(await step3.isDisabled())) {
      await step3.click({ force: true });
      await page.waitForTimeout(1000);
      await shot(page, `step-header-step3-${label}`);
      const back2 = page.locator('button:has-text("현재 단계로")').locator('visible=true').first();
      if (await back2.count() > 0) await back2.click({ force: true });
    }

    await ctx.close();
  }

  console.log('\nDone.');
  await browser.close();
})();
