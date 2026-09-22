/**
 * pngBubbleCatalog.js — 특수 말풍선 PNG 카탈로그 (5종)
 *
 * bubbles_meta.json을 단일 소스로 사용.
 * 새 말풍선 추가: PNG를 public/bubbles/에 넣고 meta.json에 한 줄 추가.
 */

import meta from '../../public/bubbles/bubbles_meta.json';

const BASE = import.meta.env.BASE_URL || '/WEBTOON/';

const PNGBUBBLE_CATALOG = Object.entries(meta).map(([id, entry]) => ({
  id,
  label: entry.label,
  src: `${BASE}bubbles/${id}.png`,
  size: entry.size,           // [w, h]
  text_area: entry.text_area, // {x, y, w, h} 비율
  has_tail: entry.has_tail,
}));

export default PNGBUBBLE_CATALOG;
