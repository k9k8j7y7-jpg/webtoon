/**
 * CutEditor 기능 회귀 테스트 — 보기→편집 전환 + 도구바 확인
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const JWT = process.argv[2];
if (!JWT) { console.error('Usage: node test-cuteditor-regression.mjs <JWT>'); process.exit(1); }
const BASE = 'https://ssagda.com/WEBTOON';
const OUT = new URL('./mobile-check/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
mkdirSync(OUT, { recursive: true });
const EP = '/projects/5/episodes/36/workflow';

const results = [];
const browser = await chromium.launch({ headless: true });

for (const [label, w, mob] of [['375', 375, true], ['1280', 1280, false]]) {
  console.log(`\n[${label}]`);
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    ...(mob ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.evaluate(t => localStorage.setItem('token', t), JWT);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.goto(`${BASE}${EP}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Gate5 첫 컷 카드의 편집 버튼 (말풍선 아이콘 옆)
  await page.locator('button:has-text("편집")').first().click({ force: true });
  await page.waitForTimeout(2000);
  console.log('   CutEditor 보기 모드 열림');
  await page.screenshot({ path: `${OUT}/cuteditor-view-${label}.png` });

  // CutEditor 내부 [편집] 버튼 — 그라데이션 neon 버튼 (from-neon-from)
  // evaluate로 직접 찾아서 클릭
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    // CutEditor의 편집 버튼은 그라데이션 배경 + "편집" 텍스트
    const neonEdit = btns.find(b => {
      const cl = b.className || '';
      return cl.includes('from-neon-from') && b.textContent.includes('편집');
    });
    if (neonEdit) { neonEdit.click(); return true; }
    return false;
  });
  console.log('   편집 모드 버튼 클릭:', clicked);
  await page.waitForTimeout(1000);

  // 편집 모드 확인
  const bodyText = await page.evaluate(() => document.body.innerText);
  const inEditMode = bodyText.includes('저장') && bodyText.includes('취소');
  console.log('   편집 모드 진입:', inEditMode);

  await page.screenshot({ path: `${OUT}/cuteditor-edit-${label}.png` });

  // 도구바 확인
  const checks = {};
  for (const tool of ['효과', '말풍선', '효과음', '내레이션']) {
    checks[tool] = bodyText.includes(tool);
  }
  checks['저장'] = bodyText.includes('저장');
  checks['취소'] = bodyText.includes('취소');
  console.log('   도구바:', JSON.stringify(checks));

  // 내레이션 클릭 → 박스/띠 확인
  if (checks['내레이션']) {
    const narrClicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const nb = btns.find(b => b.textContent.trim() === '내레이션' || b.textContent.includes('내레이션'));
      if (nb) { nb.click(); return true; }
      return false;
    });
    console.log('   내레이션 클릭:', narrClicked);
    await page.waitForTimeout(800);
    const text2 = await page.evaluate(() => document.body.innerText);
    checks['박스/띠'] = text2.includes('박스') || text2.includes('띠');
    console.log('   내레이션 패널:', checks['박스/띠']);
    await page.screenshot({ path: `${OUT}/cuteditor-narr-${label}.png` });
  }

  const allOk = checks['효과'] && checks['말풍선'] && checks['효과음'] && checks['내레이션'] && checks['저장'] && checks['취소'];
  results.push({ label, checks, verdict: allOk ? 'PASS' : 'FAIL' });

  await ctx.close();
}

console.log('\n=== RESULTS ===');
console.log(JSON.stringify(results, null, 2));
await browser.close();
