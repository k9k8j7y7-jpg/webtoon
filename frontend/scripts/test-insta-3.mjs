/**
 * test-insta-3.mjs — 3단계 Playwright 검증
 * 1) 세로 에피소드 → 토글 없음 확인
 * 2) 모바일 모달 캡처 (토글·크레딧·피드 안내)
 * 3) 크레딧 샘플 3장 캡처 (share 스텁으로 File 추출 → blob URL → 스크린샷)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node test-insta-3.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });

const EP_VERTICAL = '/projects/5/episodes/36/workflow'; // ep36 (세로)

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // ══ 테스트 1: 세로 에피소드 → 토글 없음 ══
  console.log('[1] 세로 에피소드 — 토글 없음 확인');
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__shareFiles = null;
      navigator.canShare = (d) => !!(d?.files);
      navigator.share = async (d) => { window.__shareFiles = d.files; };
    });
    await page.goto(`${BASE}/`);
    await page.evaluate(t => localStorage.setItem('token', t), JWT);
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto(`${BASE}${EP_VERTICAL}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const tabs = await page.$$('[class*="step"]');
    if (tabs.length >= 5) await tabs[4].click();
    await page.waitForTimeout(2000);

    const shareBtn = await page.$('button:has-text("인스타 공유")');
    if (shareBtn) {
      await shareBtn.click();
      await page.waitForTimeout(2000);

      // 토글 유무 확인
      const hasToggle = await page.$eval('body', el => el.innerText.includes('페이지로'));
      console.log('   페이지/컷별 토글 표시:', hasToggle);
      results.push({ test: '세로 에피소드 토글 없음', hasToggle, verdict: !hasToggle ? 'PASS' : 'FAIL' });

      // 크레딧 체크박스 확인
      const hasCredit = await page.$eval('body', el => el.innerText.includes('크레딧 표시'));
      console.log('   크레딧 체크박스:', hasCredit);

      // 피드 안내 확인
      const hasFeedGuide = await page.$eval('body', el => el.innerText.includes('피드'));
      console.log('   피드 안내:', hasFeedGuide);

      // 렌더 완료 대기
      console.log('   렌더링 대기...');
      await page.waitForFunction(
        () => {
          const btns = [...document.querySelectorAll('button')];
          return btns.some(b => b.textContent.includes('공유하기') && !b.textContent.includes('준비 중'));
        },
        { timeout: 90000 },
      ).catch(() => console.log('   렌더링 타임아웃'));
      await page.waitForTimeout(500);

      // 모달 캡처
      await page.screenshot({ path: `${OUT}/insta3-modal-375.png`, fullPage: true });
      console.log('   모달 캡처 완료');

      // [공유하기] → 스텁 → files 추출
      const doShare = await page.$('button:has-text("공유하기")');
      if (doShare) {
        await doShare.click();
        await page.waitForTimeout(1000);

        // 첫 3장 File을 blob URL → 이미지로 캡처
        const fileCount = await page.evaluate(() => window.__shareFiles?.length || 0);
        console.log('   공유 파일 수:', fileCount);

        for (let i = 0; i < Math.min(3, fileCount); i++) {
          const dataUrl = await page.evaluate(async (idx) => {
            const file = window.__shareFiles[idx];
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(file);
            });
          }, i);

          // data URL에서 base64 추출 → 파일로 저장
          const base64 = dataUrl.split(',')[1];
          const buf = Buffer.from(base64, 'base64');
          const path = `${OUT}/insta3-credit-sample-${i + 1}.jpg`;
          writeFileSync(path, buf);
          console.log(`   크레딧 샘플 ${i + 1} 저장: ${path} (${Math.round(buf.length / 1024)}KB)`);
        }

        results.push({
          test: '크레딧 샘플',
          fileCount,
          verdict: fileCount > 0 ? 'PASS' : 'FAIL',
        });
      }
    } else {
      results.push({ test: '세로 에피소드 토글 없음', verdict: 'FAIL — 버튼 없음' });
    }
    await ctx.close();
  }

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
