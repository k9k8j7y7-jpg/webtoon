// 광고 브리프 칩 라벨 — AdBriefForm(입력)·ViewerPage(작품 페이지 카드) 공용 단일 소스
export const AD_PURPOSES = [
  { key: 'product_ad', label: '상품 광고', desc: '제품 판매·인지도' },
  { key: 'brand_promo', label: '브랜드 홍보', desc: '브랜드 이미지' },
  { key: 'sns_content', label: 'SNS 콘텐츠', desc: '팔로워 참여·공유' },
  { key: 'event_promo', label: '이벤트 홍보', desc: '할인·시즌·오프닝' },
  { key: 'info_delivery', label: '정보 전달', desc: '사용법·후기·비교' },
  { key: 'meme_parody', label: '밈·패러디', desc: '유머·트렌드·바이럴' },
];

export const AD_MOODS = [
  { key: 'premium', label: '프리미엄', desc: '고급스럽고 깔끔한' },
  { key: 'webtoon', label: '웹툰·캐릭터', desc: '친근하고 캐릭터 중심' },
  { key: 'humor', label: '유머·병맛', desc: '웃기고 파격적인' },
  { key: 'emotional', label: '감성·무드', desc: '따뜻하고 분위기 있는' },
  { key: 'photo_real', label: '실사 광고', desc: '실제 사진 같은' },
  { key: 'ai_pick', label: 'AI 추천', desc: '자동으로 골라요' },
];

export const COPY_FONTS = [
  { key: 'handwritten', label: '손글씨' },
  { key: 'bold_gothic', label: '굵은 고딕' },
  { key: 'clean_gothic', label: '깔끔한 고딕' },
];

export const COPY_POSITIONS = [
  { key: 'auto', label: '자동' },
  { key: 'top', label: '상단' },
  { key: 'bottom', label: '하단' },
];

export const DEVICE_KR = {
  zoom_inset: '확대 단면', icon_badges: '아이콘 배지', before_after: '전·후',
  steps: '단계', size_compare: '크기 비교', process: '작용 과정',
};

// 키 → 한글 라벨. 모르는 키는 null(내부 키 노출 금지)
export function labelOf(list, key) {
  if (!key) return null;
  return list.find(x => x.key === key)?.label || null;
}
