/**
 * test-insta-share.mjs — Playwright 검증
 * 1) PC 모드: 인스타 공유 모달 안내 모드 (canShare 미지원)
 * 2) 모바일 에뮬 + navigator.share 스텁: 10장 제한, JPEG, 캡션, 복사
 * 3) 뷰어 공유 폴백 (clipboard)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node test-insta-share.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const EP_PATH = '/projects/5/episodes/36/workflow'; // ep36
const VIEWER_TOKEN = 'b99293ca-8dc1-4c61-b8ce-5421a53ef663'; // ep41

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // ══ 테스트 1: PC 모드 — 안내 모드 ══
  console.log('[1] PC 모드 — 인스타 공유 안내 모드');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), JWT);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(`${BASE}${EP_PATH}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Gate5 탭 클릭
    const tabs = await page.$$('[class*="step"]');
    if (tabs.length >= 5) await tabs[4].click();
    await page.waitForTimeout(2000);

    // "인스타 공유" 버튼 찾기
    const shareBtn = await page.$('button:has-text("인스타 공유")');
    if (shareBtn) {
      await shareBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/insta-pc-guide.png` });
      console.log('   PC 안내 모달 캡처 완료');

      // 안내 텍스트 확인
      const guideText = await page.$eval('body', el => el.innerText);
      const hasGuide = guideText.includes('폰에서') && guideText.includes('인스타로 바로 보낼 수 있어요');
      results.push({ test: 'PC 안내 모드', hasGuide, verdict: hasGuide ? 'PASS' : 'FAIL' });
    } else {
      console.log('   인스타 공유 버튼 없음');
      results.push({ test: 'PC 안내 모드', verdict: 'FAIL — 버튼 없음' });
    }
    await ctx.close();
  }

  // ══ 테스트 2: 모바일 에뮬 + navigator.share 스텁 ══
  console.log('\n[2] 모바일 — 인스타 공유 (share 스텁)');
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();

    // navigator.canShare/share 스텁 주입
    await page.addInitScript(() => {
      window.__shareCallArgs = null;
      navigator.canShare = (data) => {
        if (data?.files) return true;
        return false;
      };
      navigator.share = async (data) => {
        window.__shareCallArgs = {
          fileCount: data?.files?.length || 0,
          fileTypes: (data?.files || []).map(f => f.type),
          fileNames: (data?.files || []).map(f => f.name),
          title: data?.title,
        };
        return Promise.resolve();
      };
    });

    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), JWT);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(`${BASE}${EP_PATH}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Gate5 탭
    const tabs = await page.$$('[class*="step"]');
    if (tabs.length >= 5) await tabs[4].click();
    await page.waitForTimeout(2000);

    const shareBtn = await page.$('button:has-text("인스타 공유")');
    if (shareBtn) {
      await shareBtn.click();
      // 렌더링 완료 대기 (최대 60초)
      console.log('   이미지 렌더링 대기...');
      await page.waitForFunction(
        () => document.querySelector('button')?.innerText?.includes('공유하기') &&
              !document.querySelector('button')?.innerText?.includes('준비 중'),
        { timeout: 60000 },
      ).catch(() => console.log('   렌더링 타임아웃'));
      await page.waitForTimeout(1000);

      // 캡션 확인
      const caption = await page.$eval('textarea', el => el.value).catch(() => '');
      console.log('   캡션:', caption.slice(0, 60) + '...');
      const hasCaption = caption.includes('#EziToon');

      // 캡션 복사 테스트
      const copyBtn = await page.$('button:has-text("캡션 복사")');
      if (copyBtn) await copyBtn.click();
      await page.waitForTimeout(500);

      await page.screenshot({ path: `${OUT}/insta-mobile-share.png` });
      console.log('   모바일 모달 캡처 완료');

      // [공유하기] 클릭
      const doShareBtn = await page.$('button:has-text("공유하기")');
      if (doShareBtn) {
        await doShareBtn.click();
        await page.waitForTimeout(1000);

        // 스텁 결과 확인
        const shareArgs = await page.evaluate(() => window.__shareCallArgs);
        console.log('   share 호출:', JSON.stringify(shareArgs));

        const fileCount = shareArgs?.fileCount || 0;
        const allJpeg = (shareArgs?.fileTypes || []).every(t => t === 'image/jpeg');
        const under20 = fileCount <= 20 && fileCount > 0;
        const hasEzitoonPrefix = (shareArgs?.fileNames || []).every(n => n.startsWith('ezitoon_'));

        results.push({
          test: '모바일 공유 스텁',
          fileCount,
          allJpeg,
          under20,
          hasEzitoonPrefix,
          hasCaption,
          verdict: allJpeg && under20 && hasEzitoonPrefix && hasCaption ? 'PASS' : 'FAIL',
        });
      } else {
        results.push({ test: '모바일 공유 스텁', verdict: 'FAIL — 공유하기 버튼 없음' });
      }
    } else {
      results.push({ test: '모바일 공유 스텁', verdict: 'FAIL — 인스타 공유 버튼 없음' });
    }
    await ctx.close();
  }

  // ══ 테스트 3: 뷰어 공유 폴백 ══
  console.log('\n[3] 뷰어 공유 폴백 (clipboard)');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), JWT);

    await page.goto(`${BASE}/view/${VIEWER_TOKEN}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 공유 버튼 찾기 (Share2 아이콘 — title="공유")
    const shareIcon = await page.$('button[title="공유"]');
    if (shareIcon) {
      // clipboard mock
      await page.evaluate(() => {
        window.__clipboardText = null;
        navigator.clipboard.writeText = async (text) => { window.__clipboardText = text; };
      });
      await shareIcon.click();
      await page.waitForTimeout(1000);

      const clipText = await page.evaluate(() => window.__clipboardText);
      console.log('   clipboard:', clipText);

      await page.screenshot({ path: `${OUT}/viewer-share.png` });
      console.log('   뷰어 공유 캡처 완료');

      const hasViewUrl = clipText && clipText.includes('/view/');
      results.push({
        test: '뷰어 공유 폴백',
        clipboard: clipText,
        verdict: hasViewUrl ? 'PASS' : 'FAIL',
      });
    } else {
      results.push({ test: '뷰어 공유 폴백', verdict: 'FAIL — 공유 버튼 없음' });
    }
    await ctx.close();
  }

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
