// 작품 페이지 "이렇게 만들었어요" 카드 보강 검증 — 로그인 + 실제 경로(갤러리 → 예시 필터 → 작품 클릭)
// 실행: TOKEN_FILE=<jwt 파일 경로> node scripts/verify-brief-card.mjs   (frontend/에서)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';

const BASE = 'https://ssagda.com/WEBTOON';
const OUT = '../scratch/captures/brief-card';
mkdirSync(OUT, { recursive: true });
const TOKEN = readFileSync(process.env.TOKEN_FILE, 'utf8').trim();

const TARGETS = [
  { key: 'kooko', title: '정보 전달', share: '4da8f9d0-19e9-4667-a5f4-4777ee92c8d3' },
  { key: 'scalp8', title: '자연바람 아로마 스캘프 테스트 4', share: '8118c997-47a8-41fe-a757-228fda4192d2' },
];
// 내부 키가 화면에 보이면 실패
const FORBIDDEN = ['info_delivery', 'product_ad', 'ai_pick', 'premium', 'bold_gothic', 'auto', 'process', 'steps',
  'icon_badges', 'zoom_inset', 'before_after', 'undefined', 'null', '0, 1, 3, 2'];

const browser = await chromium.launch();
let fail = 0;
for (const vp of [{ name: 'phone', width: 390, height: 844 }, { name: 'pc', width: 1280, height: 900 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.name === 'phone' ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('token', t), TOKEN);

  for (const t of TARGETS) {
    // 실제 경로: 랜딩 갤러리 → "예시" 칩 → 작품 카드 클릭
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    let via = 'gallery';
    try {
      const chip = page.getByRole('button', { name: '예시 먼저 보기' }).first();
      await chip.scrollIntoViewIfNeeded({ timeout: 5000 });
      await chip.click();
      await page.waitForTimeout(1500);
      const card = page.locator('h3', { hasText: new RegExp(`^${t.title}$`) }).first();
      await card.scrollIntoViewIfNeeded({ timeout: 8000 });
      await card.click();
      await page.waitForURL(`**/view/${t.share}**`, { timeout: 8000 });
    } catch {
      via = 'direct';
      await page.goto(`${BASE}/view/${t.share}`, { waitUntil: 'networkidle' });
    }
    await page.waitForLoadState('networkidle');
    const card = page.locator('section', { has: page.getByText('이렇게 만들었어요') }).first();
    await card.waitFor({ timeout: 10000 });
    const details = card.locator('details');
    if (await details.count()) await details.first().locator('summary').click();
    await card.scrollIntoViewIfNeeded();
    const text = await card.innerText();
    const rows = ['광고 목적', '전달 내용', '분위기', '카피', '카피 디자인', '보여줄 특징', '그림 스타일', '참고 광고'];
    const missing = rows.filter(r => !text.includes(r));
    const leaked = FORBIDDEN.filter(k => new RegExp(`(^|[^A-Za-z_])${k.replace(/[,]/g, ',')}([^A-Za-z_]|$)`).test(text));
    const ok = missing.length === 0 && leaked.length === 0;
    if (!ok) fail++;
    const path = `${OUT}/${vp.name}_${t.key}.png`;
    await card.screenshot({ path });
    console.log(`${ok ? '✅' : '❌'} ${vp.name} ${t.key} via=${via} missing=[${missing}] leaked=[${leaked}] → ${path}`);
    const flat = text.replace(/\n+/g, ' | ');
    console.log('   ' + flat.slice(0, 200) + ' … ' + flat.slice(flat.indexOf('어떻게 그렸나')));
  }
  await ctx.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
