/**
 * 예시 아이디어 칩 풀 — ProjectPage, Gate1Planning 공용.
 * 각 칩은 텍스트 + 어울리는 장르/분위기/전개 연동값을 가진다.
 */
export const IDEA_CHIPS = [
  { text: '꽃집을 운영하는 청년이 손님들의 사연을 들으며 자신의 상처도 치유해가는 이야기', genre: 'daily', mood: 'warm', development: null },
  { text: '회사에서 잘린 날, 우연히 복권에 당첨된 40대 가장에게 벌어지는 일', genre: 'comedy', mood: 'cheerful', development: null },
  { text: '전학 첫날, 옆자리 아이가 10년 전 헤어진 소꿉친구라는 걸 알아버렸다', genre: 'romance', mood: 'warm', development: null },
  { text: '죽은 사람의 마지막 문자를 대신 전해주는 아르바이트를 시작했다', genre: 'drama', mood: 'touching', development: null },
  { text: '매일 같은 하루가 반복되는데, 나만 그걸 기억한다', genre: 'fantasy', mood: 'tense', development: null },
  { text: '천재 요리사였던 할머니의 레시피 노트를 물려받은 손녀의 성장기', genre: 'drama', mood: 'warm', development: 'growth' },
  { text: '고백하려던 날, 상대가 먼저 다른 사람과 사귄다는 소식을 들었다', genre: 'romance', mood: 'touching', development: null },
  { text: '지방 소도시에 혼자 내려온 신입 경찰이 마을의 오래된 실종 사건을 파헤친다', genre: 'thriller', mood: 'dark', development: 'mystery' },
];

/** 배열에서 랜덤 n개를 뽑는다 (Fisher-Yates 셔플 후 slice). */
export function pickRandomChips(n = 3) {
  const shuffled = [...IDEA_CHIPS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
