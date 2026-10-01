/**
 * 페이지 형식 정의 — 단일 소스 (프론트엔드).
 * 백엔드 동일: backend/app/workflow/page_formats.py
 *
 * frame: 만화 칸 스타일 상수 (비율 기반 — 실제 px는 렌더 시 pageWidth에 곱해 계산)
 *   border_px  — 칸·외곽 테두리 두께 (Canvas px 기준, CSS에서는 비례 축소)
 *   gap_ratio  — 칸 간격 / 페이지 폭
 *   margin_ratio — 페이지 바깥 여백 / 페이지 폭
 *   bg         — 페이지 배경색
 *   stroke     — 테두리 색
 */
const DEFAULT_FRAME = { border_px: 3, gap_ratio: 0.025, margin_ratio: 0.03, bg: '#ffffff', stroke: '#000000' };

export const PAGE_FORMATS = {
  vertical:  { label: '세로 웹툰', cols: 1, rows: null, cell_ratio: null,   per_page: null, page_ratio: null,  frame: null },
  grid_2x2:  { label: '2x2 페이지', cols: 2, rows: 2,  cell_ratio: '1:1',  per_page: 4,    page_ratio: '1:1', frame: { ...DEFAULT_FRAME } },
  strip_3:   { label: '3단 페이지', cols: 1, rows: 3,  cell_ratio: '16:9', per_page: 3,    page_ratio: '3:4', frame: { ...DEFAULT_FRAME } },
};

export const FORMAT_KEYS = Object.keys(PAGE_FORMATS);
export const DEFAULT_FORMAT = 'vertical';
