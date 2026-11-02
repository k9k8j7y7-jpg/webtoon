import { chromium } from 'playwright';
import path from 'path';
const JWT = process.argv[2];
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = path.resolve('frontend/scripts/product-check');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:375,height:812}, deviceScaleFactor:2, colorScheme:'dark' });
const page = await ctx.newPage();
await page.goto(BASE+'/login');
await page.evaluate(t=>localStorage.setItem('token',t), JWT);
await page.evaluate(()=>localStorage.setItem('theme','dark'));
await page.goto(BASE+'/projects/12/episodes/71/workflow');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(4000);

// Playwright 네이티브 locator로 단계 이동 버튼 클릭
const stepBtn = page.locator('button', { hasText: '단계 이동' });
await stepBtn.click({ force: true });
await page.waitForTimeout(1500);

// 바텀시트에서 STEP 4 클릭 — force:true로 overlay intercept 우회
const step4Btn = page.locator('[data-step-menu] button', { hasText: 'STEP 4' });
const step4Count = await step4Btn.count();
console.log('STEP 4 buttons found:', step4Count);
if (step4Count > 0) {
  await step4Btn.first().click({ force: true });
  await page.waitForTimeout(4000);
}

// Gate4 확인
const isGate4 = await page.evaluate(()=>{
  return [...document.querySelectorAll('span')].some(s=>
    s.textContent.includes('제품 등장') || s.textContent.includes('제품 없음'));
});
console.log('Gate4 confirmed:', isGate4);

// 배지 전체 출력
const badges = await page.evaluate(()=>{
  return [...document.querySelectorAll('span')].filter(s=>s.textContent.includes('📦')).map(s=>s.textContent.trim());
});
console.log('Total badges:', badges.length);
badges.forEach((b,i)=>console.log('  Cut#'+(i+1)+': '+b));

const summary = await page.evaluate(()=>{
  return [...document.querySelectorAll('p,span')].find(e=>e.textContent.includes('컷 중'))?.textContent.trim()||'NOT FOUND';
});
console.log('Summary:', summary);

// 캡처
await page.screenshot({ path: path.join(OUT, '04-gate4-product-toggle.png'), fullPage: true });
console.log('Screenshot saved');

await browser.close();
