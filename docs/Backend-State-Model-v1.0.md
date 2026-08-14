# Project T — 백엔드 상태 모델

> **버전:** v1.0
> **작성일:** 2026-07-31
> **상태:** 확정
> **전제:** PRD v0.1 (3.2 게이트 규칙), Cut-Spec-Schema-v1.0, Data-Model-v1.0
> **목적:** "단방향 + 지능적 무효화"를 실제 구현 규칙으로 확정한다. `episodes.gate_status` 구조, 무효화 전파, 실행 시점을 정의한다.

---

## 0. 핵심 원칙 (PRD 3.2 재확인)

1. **단방향 진행.** 게이트는 1→5 순서로 흐른다.
2. **뒤로 가면 이후는 무효화.** 앞 게이트로 돌아가면 그 이후 산출물은 `invalidated`.
3. **지능적 부분 무효화.** diff로 영향 없는 자산은 유지한다. (규칙 기반, Q25)
4. **이미지는 유지·stale 표시.** 무효화돼도 S3 이미지는 남기고 재생성 필요만 표시. (Q26)

---

## 1. 게이트 상태 구조 — `episodes.gate_status`

에피소드가 지금 어느 게이트에 있고, 각 게이트가 어떤 상태인지.

```jsonc
{
  "current_gate": 4,               // 현재 사용자가 위치한 게이트 (1~5)
  "auto_advance": false,           // "이후 자동 진행" 플래그
  "gates": {
    "1_planning":   { "status": "approved",    "approved_at": "..." },
    "2_script":     { "status": "approved",    "approved_at": "..." },
    "3_assets":     { "status": "approved",    "approved_at": "..." },
    "4_storyboard": { "status": "draft",       "approved_at": null },
    "5_review":     { "status": "locked",      "approved_at": null }
  }
}
```

**게이트 status 값**

| 값 | 의미 |
|---|---|
| `locked` | 아직 도달 못 함 (앞 게이트 미승인) |
| `draft` | 진행 중 (산출물 생성됐으나 미승인) |
| `approved` | 사용자 확정 완료 |
| `invalidated` | 뒤 게이트 수정으로 무효화됨 (재확정 필요) |

**게이트 ↔ 자산 매핑**

| 게이트 | 산출물 | 관련 테이블 |
|---|---|---|
| 1 기획 | 시놉시스·세계관·인물목록 | episodes(logline, synopsis) |
| 2 대본 | 씬·컷·대사 | episodes(script), scenes |
| 3 자산 | 캐릭터·장소·스타일 | characters, locations, styles |
| 4 콘티 | 컷 명세 | cuts (status=pending) |
| 5 컷검수 | 컷 이미지 | cuts (status=approved), generation_logs |

---

## 2. 진행 규칙

### 2.1 자동 진행 (auto_advance)

- 각 게이트에서 "이후 자동 진행" 버튼 → `auto_advance=true`.
- 이후 게이트는 사용자 확인 없이 `draft` 생성 즉시 `approved` 처리하며 다음으로.
- **예외 — 게이트 4는 auto_advance여도 강제 정지.** 이미지 대량 생성(과금) 직전이므로 반드시 사용자 명시 승인 필요.

```
auto_advance=true 일 때:
  게이트 1→2→3 자동 통과
  게이트 4 도달 → 강제 정지 (auto_advance 무시)
  사용자가 콘티 승인 → 게이트 5(이미지 생성) 진행
```

### 2.2 게이트 승인 (전진)

```
게이트 N 승인:
  gates[N].status = 'approved'
  current_gate = N+1
  gates[N+1].status = 'locked' → 'draft' (산출물 생성 시작)
```

---

## 3. 무효화 전파 (뒤로 가기)

### 3.1 전파 방향

사용자가 게이트 N으로 돌아가 수정하면, **N보다 뒤 게이트들**이 영향받는다. 단 지능적 diff로 유지 가능한 자산은 살린다.

```
게이트 2(대본) 수정
  → diff 판정 (3.2)
      ├─ 인물·장소 집합 동일 → 캐릭터·장소 자산 [유지]
      │                        콘티·이미지만 [무효화]
      └─ 인물/장소 추가·삭제 → 해당 자산만 [무효화]
                              콘티·이미지 [무효화]
```

### 3.2 지능적 diff 판정 (Q25 — 규칙 기반)

LLM 의미 분석이 아니라 **집합 비교**로만 자동 판정한다. 명확하고 빠르며 검증 가능.

```python
# 의사코드
def invalidation_scope(old_script, new_script):
    old_chars = extract_character_names(old_script)   # 집합
    new_chars = extract_character_names(new_script)
    old_locs  = extract_location_names(old_script)
    new_locs  = extract_location_names(new_script)

    scope = { "characters": [], "locations": [], "cuts": True }  # 콘티/이미지는 항상 무효화

    if old_chars == new_chars:
        pass  # 캐릭터 자산 전체 유지
    else:
        removed = old_chars - new_chars
        added   = new_chars - old_chars
        scope["characters"] = list(removed | added)  # 변경된 인물만 무효화

    if old_locs != new_locs:
        scope["locations"] = list((old_locs - new_locs) | (new_locs - old_locs))

    return scope
```

**판정 원칙**
- 인물/장소 **이름 집합이 동일** → 해당 자산 유지 (대사·행동만 바뀐 경우)
- 집합이 **다르면** → 추가·삭제된 자산만 무효화 (유지되는 인물은 그대로)
- **애매하면 안전하게 무효화.** 규칙으로 확실히 판정 안 되는 변경은 무효화 쪽으로. (오판으로 옛 자산 남기는 것보다 재확정이 안전)
- **콘티·이미지(cuts)는 대본이 바뀌면 항상 무효화.** 대사·연출이 대본에 직접 의존하므로.

### 3.3 게이트별 무효화 대상

| 돌아간 게이트 | 무효화 대상 (조건부) |
|---|---|
| 1 기획 | 대본 + 자산(diff) + 콘티 + 이미지 |
| 2 대본 | 자산(diff) + 콘티 + 이미지 |
| 3 자산 | 해당 자산을 쓰는 콘티·이미지만 (cut_asset_refs 조회) |
| 4 콘티 | 해당 컷 이미지만 |

### 3.4 자산 변경 시 컷 무효화 (cut_asset_refs 활용)

게이트 3에서 특정 캐릭터/장소 시트를 재생성·수정하면, 그 자산을 **실제 사용한** 컷만 무효화한다.

```sql
-- "hero 캐릭터 시트 변경" → 영향 컷만 invalidated
UPDATE cuts SET status = 'invalidated'
WHERE cut_id IN (
  SELECT cut_id FROM cut_asset_refs
  WHERE episode_id = ? AND asset_type = 'character' AND asset_ref = 'hero'
);

-- 스타일 락 변경 → 사실상 전체 컷
-- (asset_type='style' 인 모든 컷)
```

> `used_references`(실제 주입 자산)를 인덱스로 쓰므로, 명세에만 있고 실제 안 쓰인 자산은 무효화에서 제외된다. (Cut-Spec 2.10)

---

## 4. 이미지 처리 (Q26 — 유지·stale)

무효화 시 S3 이미지는 **삭제하지 않는다.**

```
컷 invalidated 시:
  cuts.status = 'invalidated'
  cuts.image_url 유지 (옛 이미지 참고용으로 계속 표시)
  UI: "이 컷은 재생성이 필요합니다" 배지 + 흐리게 표시

재확정(재생성) 시:
  cuts.prev_image_url = 기존 image_url (되돌리기 1단계)
  새 이미지 생성 → image_url 갱신, status='approved'
```

**장점**
- 사용자가 무효화 상태에서도 옛 이미지를 보며 판단 가능.
- 대본 수정 후 "역시 원래대로" 시 되돌릴 여지.

**저장비 관리 (나중)**
- 오래된 `invalidated` 이미지의 주기적 정리(예: 30일 경과)는 배치 작업으로 향후 도입. MVP엔 미포함.

---

## 5. 전파 실행 시점 (서비스 로직)

무효화는 트리거(DB)가 아니라 **애플리케이션 서비스 계층**에서 처리한다. (트랜잭션 제어·로깅 용이)

```
[게이트 뒤로 가기 / 자산 수정] 요청
  ↓ WorkflowService.invalidate(episode_id, from_gate, diff)
  1. diff 판정 (3.2) → invalidation_scope
  2. 트랜잭션 시작
     - 영향 자산 status = 'invalidated' (characters/locations)
     - 영향 컷 status = 'invalidated' (cut_asset_refs 조회)
     - 뒤 게이트 gate_status = 'invalidated', current_gate 조정
  3. 트랜잭션 커밋
  4. (이미지는 건드리지 않음 — Q26)

[이미지 생성 성공] 시
  ↓ ImageService.on_generated(cut)
  - cuts.spec.generation.used_references 파싱
  - cut_asset_refs 재작성 (해당 cut_id delete + insert)
  - cuts.status = 'approved'
  - generation_logs 기록 + 크레딧 차감
```

**핵심:** `cut_asset_refs`는 이미지 생성 성공 시점에 재작성된다. 이 테이블이 항상 "실제 사용 자산"을 반영해야 무효화가 정확하다.

---

## 6. 상태 전이 다이어그램

### 6.1 게이트

```
locked ──(앞 게이트 승인)──▶ draft ──(사용자 승인)──▶ approved
                                                        │
                              (뒤 게이트에서 수정) ◀─────┘
                                     │
                                     ▼
                                invalidated ──(재확정)──▶ draft ──▶ approved
```

### 6.2 컷

```
pending ──(이미지 생성)──▶ regenerating ──(성공)──▶ approved
                                                      │
              (의존 자산/대본 변경) ◀──────────────────┘
                     │
                     ▼
                invalidated ──(재생성)──▶ regenerating ──▶ approved
                     │
              (이미지는 유지, stale 표시)
```

---

## 7. 다음 작업

1. **④ API 명세 초안** — 게이트 전진/후진, 자산 재생성, 컷 재생성 엔드포인트. 이 상태 모델의 전이를 API로 노출.

---

*문서 끝 — Backend State Model v1.0*
