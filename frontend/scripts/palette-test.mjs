/**
 * 편집기 종류 팔레트 검증 — 마우스(PC) + 터치(모바일)
 * ep111 c002 (중간 컷, 대사 있음) 편집기에서 종류 팔레트 열기
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const TOKEN = process.argv[2];
const BASE = process.argv[3] || 'https://ssagda.com/WEBTOON';
const OUT = new URL('../scratch/flow/palette/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

async function testPalette(label, ctxOpts) {
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...ctxOpts });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(t => { localStorage.setItem('token', t); localStorage.setItem('theme', 'dark'); }, TOKEN);

  await page.goto(`${BASE}/projects/12/episodes/111/workflow`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Find 2nd cut's 편집 button (c002 has dialogue)
  const editBtns = page.locator('button:has-text("편집")');
  const count = await editBtns.count();
  console.log(`  ${label}: ${count} edit buttons`);

  // Click the second one (c002)
  const targetIdx = Math.min(1, count - 1); // 2nd if available
  if (count > 0) {
    await editBtns.nth(targetIdx).click();
    await page.waitForTimeout(2000);

    // Switch to edit mode (click "편집" in the top header)
    const editModeBtn = page.locator('button:has-text("편집")').first();
    if (await editModeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editModeBtn.click();
      await page.waitForTimeout(1000);
    }

    await page.screenshot({ path: `${OUT}${label}-01-editor.png` });
    console.log(`  ${label}: 01-editor`);

    // Click on a bubble in the image area (approximate center for speech bubble)
    const imageArea = page.locator('canvas, img').first();
    const box = await imageArea.boundingBox().catch(() => null);
    if (box) {
      // Click near top-center where speech bubbles typically are
      const clickX = box.x + box.width * 0.5;
      const clickY = box.y + box.height * 0.15;
      if (ctxOpts.hasTouch) {
        await page.touchscreen.tap(clickX, clickY);
      } else {
        await page.mouse.click(clickX, clickY);
      }
      await page.waitForTimeout(800);
    }

    await page.screenshot({ path: `${OUT}${label}-02-selected.png` });
    console.log(`  ${label}: 02-selected`);

    // Check if "종류" is visible (bubble selected)
    const kindLabel = page.locator('text=종류').first();
    const hasKind = await kindLabel.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`  ${label}: "종류" visible = ${hasKind}`);

    if (hasKind) {
      // Find the palette trigger button (shows current style name like "자동" or style icon)
      const palBtn = page.locator('button').filter({ has: page.locator('text=자동') }).last();
      const palBtnAlt = page.locator('button:near(:text("종류"), 50)').last();
      const target = (await palBtn.isVisible().catch(() => false)) ? palBtn : palBtnAlt;

      if (await target.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (ctxOpts.hasTouch) {
          await target.tap();
        } else {
          await target.click();
        }
        await page.waitForTimeout(1000);

        await page.screenshot({ path: `${OUT}${label}-03-palette.png` });
        console.log(`  ${label}: 03-palette`);

        // Check if palette icons are visible
        const paletteOpen = await page.locator('text=기본').first().isVisible({ timeout: 1000 }).catch(() => false);
        console.log(`  ${label}: PALETTE OPEN = ${paletteOpen}`);

        if (paletteOpen) {
          // Click a style icon to verify it works
          // The palette has BubbleMiniIcon buttons
          const styleBtn = page.locator('[style*="position: fixed"][style*="z-index: 60"] button, div.bg-zinc-800.shadow-2xl button').first();
          if (await styleBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            if (ctxOpts.hasTouch) {
              await styleBtn.tap();
            } else {
              await styleBtn.click();
            }
            await page.waitForTimeout(500);
            console.log(`  ${label}: style icon clicked ✓`);
          }
        }
      }
    }

    await page.screenshot({ path: `${OUT}${label}-04-final.png` });
  } else {
    console.log(`  ${label}: no edit buttons found`);
  }

  await browser.close();
}

console.log('=== PC (mouse click) ===');
await testPalette('pc', { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });

console.log('=== Mobile (touch tap) ===');
await testPalette('mobile', {
  viewport: { width: 375, height: 812 },
  colorScheme: 'dark',
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});

console.log('\nDone');
