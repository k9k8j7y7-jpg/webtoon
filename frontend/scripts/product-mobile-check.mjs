/**
 * 제품 자산 mobile-check: Gate3 제품 모달·Gate4 토글·빠른 컷 375/412
 * Usage: node frontend/scripts/product-mobile-check.mjs <JWT>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node product-mobile-check.mjs <JWT>'); process.exit(1); }

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/mobile-check');
mkdirSync(OUT, { recursive: true });

const PID = 12, EID = 71;
const WIDTHS = [375, 412];

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

(async () => {
  const browser = await chromium.launch();

  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 900 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();

    // 인증 + 다크
    await page.goto(`${BASE}/login`);
    await page.evaluate(t => localStorage.setItem('token', t), JWT);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));

    // ── Gate3 제품 섹션 ──
    await page.goto(`${BASE}/projects/${PID}/episodes/${EID}/workflow`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);
    // STEP 3으로 이동
    await page.locator('button', { hasText: '단계 이동' }).click({ force: true });
    await page.waitForTimeout(1500);
    const s3 = page.locator('[data-step-menu] button', { hasText: 'STEP 3' });
    if (await s3.count() > 0) {
      await s3.first().click({ force: true });
      await page.waitForTimeout(3000);
    }
    // 제품 섹션 스크롤
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('h2')].find(e => e.textContent.includes('제품'));
      if (h) h.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    let ov = await overflowX(page);
    await page.screenshot({ path: path.join(OUT, `product-gate3-${w}.png`), fullPage: true });
    console.log(`✅ Gate3 제품 ${w}px  overflow=${ov}`);

    // ── Gate3 제품 모달 ──
    const editBtn = page.locator('button[title="편집"]');
    if (await editBtn.count() > 0) {
      await editBtn.first().click({ force: true });
      await page.waitForTimeout(1200);
      ov = await overflowX(page);
      await page.screenshot({ path: path.join(OUT, `product-modal-${w}.png`) });
      console.log(`✅ 제품 모달 ${w}px  overflow=${ov}`);
      // 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      // 추가 버튼
      const addBtn = page.locator('button', { hasText: '제품 추가' });
      if (await addBtn.count() > 0) {
        await addBtn.first().click({ force: true });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(OUT, `product-modal-${w}.png`) });
        console.log(`✅ 제품 추가 모달 ${w}px`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // ── Gate4 콘티 토글 ──
    await page.goto(`${BASE}/projects/${PID}/episodes/${EID}/workflow`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    await page.locator('button', { hasText: '단계 이동' }).click({ force: true });
    await page.waitForTimeout(1500);
    const s4 = page.locator('[data-step-menu] button', { hasText: 'STEP 4' });
    if (await s4.count() > 0) {
      await s4.first().click({ force: true });
      await page.waitForTimeout(4000);
    }
    ov = await overflowX(page);
    await page.screenshot({ path: path.join(OUT, `product-gate4-${w}.png`), fullPage: true });
    console.log(`✅ Gate4 토글 ${w}px  overflow=${ov}`);

    // ── 빠른 한 컷 ──
    await page.goto(`${BASE}/quick`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    ov = await overflowX(page);
    await page.screenshot({ path: path.join(OUT, `product-quick-${w}.png`), fullPage: true });
    console.log(`✅ 빠른 컷 ${w}px  overflow=${ov}`);

    await ctx.close();
  }

  await browser.close();
  console.log('\n✅ product mobile-check 완료');
})();
