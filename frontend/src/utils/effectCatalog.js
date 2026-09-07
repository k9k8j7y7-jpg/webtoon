/**
 * effectCatalog.js — 배경효과 PNG 카탈로그 (10종)
 *
 * category: 'full' = 컷 전체 덮는 용도(9:16), 'partial' = 부분 배치 용도
 */

const BASE = import.meta.env.BASE_URL || '/WEBTOON/';

const EFFECT_CATALOG = [
  { id: 'focus_thin',       name: '가는 집중선',   src: `${BASE}effects/focus_thin.png`,       category: 'full' },
  { id: 'focus_burst',      name: '굵은 집중선',   src: `${BASE}effects/focus_burst.png`,      category: 'full' },
  { id: 'scribble_burst',   name: '꼬불 강조선',   src: `${BASE}effects/scribble_burst.png`,   category: 'full' },
  { id: 'speed_diagonal',   name: '대각 속도선',   src: `${BASE}effects/speed_diagonal.png`,   category: 'full' },
  { id: 'speed_horizontal', name: '가로 속도선',   src: `${BASE}effects/speed_horizontal.png`, category: 'full' },
  { id: 'line_fall',        name: '세로 낙하선',   src: `${BASE}effects/line_fall.png`,        category: 'full' },
  { id: 'spark_surprise',   name: '깜짝',         src: `${BASE}effects/spark_surprise.png`,   category: 'partial' },
  { id: 'drip_feeling',     name: '느낌 방울',     src: `${BASE}effects/drip_feeling.png`,     category: 'partial' },
  { id: 'sparkle',          name: '반짝',         src: `${BASE}effects/sparkle.png`,          category: 'partial' },
  { id: 'heart',            name: '하트',         src: `${BASE}effects/heart.png`,            category: 'partial' },
];

export default EFFECT_CATALOG;
