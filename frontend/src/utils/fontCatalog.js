/**
 * fontCatalog.js — 커스텀 폰트 단일 소스
 *
 * usage: 'sfx' = 효과음 전용, 'bubble' = 말풍선, 'default' = 기본
 * charWidth: 실측 기반 (measureText × 1.413 안전 계수, Pretendard 0.93 기준)
 * file: /WEBTOON/fonts/xxx.woff2 경로 (Vite public/ 기준)
 */

const BASE = import.meta.env.BASE_URL || '/WEBTOON/';

const FONT_CATALOG = [
  {
    id: 'pretendard',
    label: '프리텐다드 (기본)',
    family: "'Pretendard', 'Nanum Gothic', sans-serif",
    file: null,  // CDN 로드
    usage: 'default',
    charWidth: 0.93,
  },
  {
    id: 'nanum-brush',
    label: '나눔손글씨 붓',
    family: "'NanumBrush', 'Pretendard', sans-serif",
    file: `${BASE}fonts/nanum-brush.woff2`,
    usage: 'sfx',
    charWidth: 0.68,
  },
  {
    id: 'nanum-bisang',
    label: '나눔손글씨 비상체',
    family: "'NanumBisang', 'Pretendard', sans-serif",
    file: `${BASE}fonts/nanum-bisang.woff2`,
    usage: 'sfx',
    charWidth: 0.60,
  },
  {
    id: 'nanum-nunchi',
    label: '나눔손글씨 눈치체',
    family: "'NanumNunchi', 'Pretendard', sans-serif",
    file: `${BASE}fonts/nanum-nunchi.woff2`,
    usage: 'sfx',
    charWidth: 0.61,
  },
  {
    id: 'chab',
    label: '롯데리아 촵땡겨',
    family: "'Chab', 'Pretendard', sans-serif",
    file: `${BASE}fonts/chab.woff2`,
    usage: 'sfx',
    charWidth: 1.03,
  },
  {
    id: 'jeongseon',
    label: '정선아리랑 뿌리',
    family: "'Jeongseon', 'Pretendard', sans-serif",
    file: `${BASE}fonts/jeongseon.woff2`,
    usage: 'sfx',
    charWidth: 0.80,
  },
  // ── 말풍선 폰트 ──
  {
    id: 'recipekorea',
    label: '레코체',
    family: "'Recipekorea', 'Pretendard', sans-serif",
    file: `${BASE}fonts/recipekorea.woff2`,
    usage: 'bubble',
    charWidth: 1.06,
  },
  {
    id: 'bmjua',
    label: '배민 주아체',
    family: "'BMJUA', 'Pretendard', sans-serif",
    file: `${BASE}fonts/bmjua.woff2`,
    usage: 'bubble',
    charWidth: 0.88,
  },
];

export default FONT_CATALOG;

/** id로 카탈로그 항목 찾기 (없으면 pretendard 기본값) */
export function getFontById(id) {
  return FONT_CATALOG.find(f => f.id === id) || FONT_CATALOG[0];
}

/** usage 필터 ('sfx', 'bubble', 'default') — 기본값은 항상 포함 */
export function getFontsByUsage(usage) {
  return FONT_CATALOG.filter(f => f.usage === usage || f.usage === 'default');
}
