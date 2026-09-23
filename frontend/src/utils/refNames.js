/**
 * ref_key → 한글 이름 조회 헬퍼.
 * 장소·캐릭터 목록에서 ref_key로 이름을 찾는다.
 * 못 찾으면 ref_key 그대로 반환.
 */

/** 장소 ref_key → "한글이름" 또는 ref_key */
export function locationName(refKey, locations) {
  if (!refKey) return '';
  const loc = locations?.find(l => l.ref_key === refKey);
  return loc?.name || refKey;
}

/** 장소 드롭다운 옵션 텍스트: "한글이름 (ref_key)" */
export function locationOptionLabel(refKey, name) {
  if (name && name !== refKey) return `${name} (${refKey})`;
  return refKey;
}

/** 캐릭터 ref_key → "한글이름" 또는 ref_key */
export function characterName(refKey, characters) {
  if (!refKey) return '';
  // characters: [{ref_key, name}, ...] 또는 charNameMap {ref_key: name}
  if (Array.isArray(characters)) {
    const ch = characters.find(c => c.ref_key === refKey);
    return ch?.name || refKey;
  }
  // object map
  return characters?.[refKey] || refKey;
}
