/**
 * 말풍선 자동 매핑 — dialogue type + character emotion → bubble_style
 * 백엔드 bubble_mapping.py와 동일 로직
 */

const EMOTION_TO_BUBBLE = {
  angry: 'angry',
  furious: 'angry',
  rage: 'angry',
  sad: 'sad',
  crying: 'sad',
  tearful: 'sad',
  happy: 'happy',
  joyful: 'happy',
  excited: 'happy',
  surprised: 'surprised',
  shocked: 'surprised',
  startled: 'surprised',
  shy: 'shy',
  embarrassed: 'shy',
  flustered: 'flustered',
  confused: 'flustered',
  panicked: 'flustered',
  realization: 'realize',
  enlightened: 'realize',
};

export const VALID_STYLES = [
  'round', 'narration', 'thought', 'whisper',
  'shout', 'angry', 'happy', 'sad', 'surprised',
  'shy', 'flustered', 'realize',
];

/**
 * dialogue 아이템의 말풍선 스타일을 결정
 * @param {object} dialogueItem - { type, speaker, text, bubble_style, ... }
 * @param {Array} characters - [{ character_id, emotion, pose }, ...]
 * @returns {string} bubble style key
 */
export function resolveBubbleStyle(dialogueItem, characters = []) {
  // 1. 사용자 수동 지정
  if (dialogueItem.bubble_style && VALID_STYLES.includes(dialogueItem.bubble_style)) {
    return dialogueItem.bubble_style;
  }

  const dtype = dialogueItem.type || 'speech';

  // 2. narration / thought
  if (dtype === 'narration') return 'narration';
  if (dtype === 'thought') return 'thought';

  // 3. speech → 캐릭터 감정 매핑
  if (dtype === 'speech' && dialogueItem.speaker) {
    const char = characters.find(c => c.character_id === dialogueItem.speaker);
    if (char?.emotion) {
      const mapped = EMOTION_TO_BUBBLE[char.emotion.toLowerCase()];
      if (mapped) return mapped;
    }
  }

  return 'round';
}
