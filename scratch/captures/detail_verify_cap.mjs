// 상세페이지 검증 캡처 — ⑤ 빨간 배지 / ⑦ 갤러리 배지·뷰어 세로 스크롤 / mobile-check(375 가로 넘침)
// TOKEN env (테스트 계정). ep171 잠깐 공개 → 캡처 → 비공개 복귀.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(process.cwd() + '/frontend/package.json');
const { chromium } = require('playwright');
const BASE = 'https://ssagda.com/WEBTOON', API = BASE + '/api/v1', OUT = 'scratch/captures/detail';
fs.mkdirSync(OUT, { recursive: true });
const TOKEN = process.env.TOKEN;
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const j = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
};
const browser = await chromium.launch();
const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
const pc = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
for (const [c, theme] of [[phone, 'dark'], [pc, 'light']]) await c.addInitScript(([t, th]) => { localStorage.setItem('token', t); localStorage.setItem('theme', th); }, [TOKEN, theme]);
const P = { phone: await phone.newPage(), pc: await pc.newPage() };
const errors = [];
for (const [k, p] of Object.entries(P)) p.on('pageerror', (e) => errors.push(`${k}: ${e.message}`));
const overflow = async (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ⑤ 빨간 배지 (ep171 Hero: warning_claims "pH 5.5 약산성" 등)
for (const [dev, page] of Object.entries(P)) {
  await page.goto(BASE + '/projects/24/episodes/171/workflow', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const red = page.getByText('확인 필요한 문구', { exact: false }).first();
  await red.scrollIntoViewIfNeeded();
  const gray = page.getByText('원문에 없는 글자', { exact: false });
  if (await gray.count()) { await gray.first().click(); await page.waitForTimeout(300); }
  const path = `${OUT}/07_red_badge_${dev}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(path, `확인필요=${await page.getByText('확인 필요한 문구', { exact: false }).count()}`, `pH5.5=${await page.getByText('pH 5.5', { exact: false }).count()}`, `원문에없는글자=${await gray.count()}`, `overflowX=${await overflow(page)}`);
}

// mobile-check: 브리프·섹션(새 ep)·준비(ep172) 375 가로 넘침
const w = await j('POST', `/my/works?type=detail_page&title=${encodeURIComponent('상세페이지 모바일체크')}`);
const wf = `/projects/${w.project_id}/episodes/${w.episode_id}/workflow`;
await P.phone.goto(BASE + wf, { waitUntil: 'networkidle' }); await P.phone.waitForTimeout(1200);
console.log('mobile brief overflowX=', await overflow(P.phone));
await j('POST', `/projects/${w.project_id}/episodes/${w.episode_id}/detail/plan`, { product_name: '자연바람 허브팩 1000g', features: '녹차 쿨링, 각질 케어, 1000g', usage: '도포 후 3분 마사지', target: '30~40대', tone: 'info' });
await P.phone.goto(BASE + wf, { waitUntil: 'networkidle' }); await P.phone.waitForTimeout(1200);
console.log('mobile sections overflowX=', await overflow(P.phone));
await P.phone.goto(BASE + '/projects/24/episodes/172/workflow', { waitUntil: 'networkidle' }); await P.phone.waitForTimeout(1200);
console.log('mobile prepare overflowX=', await overflow(P.phone));
await P.phone.goto(BASE + '/my', { waitUntil: 'networkidle' }); await P.phone.waitForTimeout(1000);
console.log('mobile myworks overflowX=', await overflow(P.phone), 'new ep', w.episode_id);

// ⑦ 공개 → 갤러리 상세페이지 탭 배지 + 뷰어 세로 스크롤 → 비공개
const pub = await j('POST', '/episodes/171/publish?brief_public=false');
try {
  for (const [dev, page] of Object.entries(P)) {
    await page.goto(BASE + '/#gallery', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '상세페이지', exact: true }).first().click();
    await page.waitForTimeout(2000);
    const path = `${OUT}/08_gallery_${dev}.png`;
    await page.locator('#gallery').screenshot({ path });
    console.log(path, `상세페이지배지=${await page.locator('#gallery').getByText('상세페이지', { exact: true }).count()}`, `작품=${await page.locator('#gallery').getByText('상세페이지 테스트 허브팩', { exact: false }).count()}`);

    await page.goto(`${BASE}/view/${pub.share_token}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const m = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')].filter((i) => i.src.includes('/cuts/'));
      const r = imgs.map((i) => i.getBoundingClientRect());
      return { imgs: imgs.length, tops: r.map((x) => Math.round(x.top)), lefts: r.map((x) => Math.round(x.left)), scrollH: document.documentElement.scrollHeight, viewH: window.innerHeight };
    });
    const vpath = `${OUT}/09_viewer_${dev}.png`;
    await page.screenshot({ path: vpath, fullPage: true });
    console.log(vpath, JSON.stringify(m), `overflowX=${await overflow(page)}`);
  }
} finally {
  await j('POST', '/episodes/171/unpublish');
  const st = await j('GET', '/projects/24/episodes/171');
  console.log('unpublished is_public=', st.is_public);
}
console.log('errors', errors.length ? errors : 'none');
await browser.close();
