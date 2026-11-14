// 상세페이지 2단계 프론트 캡처 — 폰 375 다크 / PC 1280 라이트. 테스트 계정(TOKEN env), 운영 ssagda.com
// 새 작품 1개를 브리프→섹션→준비로 API 진행하며 단계별 캡처, 완성은 ep171(첫 실생성) 사용.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(process.cwd() + '/frontend/package.json');
const { chromium } = require('playwright');
const BASE = 'https://ssagda.com/WEBTOON', API = BASE + '/api/v1', OUT = 'scratch/captures/detail';
fs.mkdirSync(OUT, { recursive: true });
const TOKEN = process.env.TOKEN;
const H = { Authorization: `Bearer ${TOKEN}` };
const j = async (method, path, body, isForm) => {
  const r = await fetch(API + path, { method, headers: isForm ? H : { ...H, 'Content-Type': 'application/json' }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 300)}`);
  return JSON.parse(t);
};

const browser = await chromium.launch();
const ctxs = {
  phone: await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true }),
  pc: await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' }),
};
await ctxs.phone.addInitScript((t) => { localStorage.setItem('token', t); localStorage.setItem('theme', 'dark'); }, TOKEN);
await ctxs.pc.addInitScript((t) => { localStorage.setItem('token', t); localStorage.setItem('theme', 'light'); }, TOKEN);
const pages = { phone: await ctxs.phone.newPage(), pc: await ctxs.pc.newPage() };
const errors = [];
for (const [k, p] of Object.entries(pages)) p.on('pageerror', (e) => errors.push(`${k}: ${e.message}`));

async function shot(name, url, keys = [], before) {
  for (const [dev, page] of Object.entries(pages)) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    if (before) await before(page);
    const path = `${OUT}/${name}_${dev}.png`;
    await page.screenshot({ path, fullPage: true });
    const found = [];
    for (const k of keys) found.push(`${k}=${await page.getByText(k, { exact: false }).count()}`);
    console.log(path, found.join(' '));
  }
}

// 0. 내 작품 — 상세페이지 카드 활성(준비 중 배지 없음)
await shot('00_myworks', '/my', ['상세페이지', '준비 중']);

// 1. 새 작품 + 정면 사진 → 브리프
const w = await j('POST', `/my/works?type=detail_page&title=${encodeURIComponent('상세페이지 캡처 허브팩')}`);
const wf = `/projects/${w.project_id}/episodes/${w.episode_id}/workflow`;
console.log('work', w);
const prod = await j('POST', `/projects/${w.project_id}/episodes/${w.episode_id}/products`, { name: 'AROMA Herb Pack Green Tea Spa' });
const photo = fs.readFileSync('scratch/detail/product_photo.jpg');
const fd = new FormData();
fd.append('kind', 'front');
fd.append('file', new Blob([photo], { type: 'image/jpeg' }), 'photo.jpg');
await j('POST', `/products/${prod.id}/photos`, fd, true);
await j('PUT', `/products/${prod.id}`, { name_ko: '아로마 그린티 스파 스칼프 허브 팩' });
await shot('01_brief', wf, ['제품 사진', '정면', '웹에서 보완', '기획안 만들기', '후킹']);

// 2. 기획안 → 섹션
await j('POST', `/projects/${w.project_id}/episodes/${w.episode_id}/detail/plan`, {
  product_name: '자연바람 아로마 그린티 스파 스캘프 허브팩 1000g',
  features: '아로마 그린티 쿨링 성분으로 두피 열감 진정, 녹차 베이스로 각질·피지 케어, 두피와 모발 동시 케어, 1000g 대용량 펌프형',
  usage: '샴푸 후 가르마 따라 도포, 3분 마사지, 5~10분 방치 후 미온수로 헹굼',
  target: '두피 열감·냄새가 고민인 30~40대', tone: 'hook',
});
await shot('02_sections', wf, ['섹션 8개', '등장', '제품만', '권장 60~180자', '섹션 추가', '다시 만들기', '이대로 진행']);

// 3. 섹션 승인 → 준비
await j('POST', `/projects/${w.project_id}/episodes/${w.episode_id}/detail/sections/approve`);
await shot('03_prepare', wf, ['세로 2:3', '그림 스타일', '캐릭터', '제품', '준비 완료']);

// 4. 완성 — ep171 (Point 1 1장 생성됨)
const wf171 = '/projects/24/episodes/171/workflow';
await shot('04_complete', wf171, ['전부 생성', '이 섹션 생성', '다시 그리기', '내보내기', '세로 1장', '섹션별 PNG']);
await shot('05_stack', wf171, ['세로 스택 미리보기'], async (page) => {
  await page.getByRole('button', { name: '세로 스택' }).first().click();
  await page.waitForTimeout(1200);
});
// 5-1. 다시 그리기 시트 (열기만, 생성 안 함)
await shot('06_redraw_sheet', wf171, ['다시 그리기 · 1패킷', '캐릭터 등장', '제품만'], async (page) => {
  await page.getByRole('button', { name: '다시 그리기' }).first().click();
  await page.waitForTimeout(800);
});

console.log('new episode', w.episode_id, 'errors', errors.length ? errors : 'none');
await browser.close();
