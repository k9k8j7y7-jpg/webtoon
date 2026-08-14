# Project T — 컷 명세(Cut Spec) JSON 스키마

> **버전:** v1.0
> **작성일:** 2026-07-31
> **상태:** 확정 (PRD v0.1의 8.2 정밀화)
> **역할:** 파이프라인의 척추. 대본 파싱 · 콘티(게이트 4) · 부분 재생성 · 과금이 모두 이 단위에 물린다.

---

## 0. 설계 원칙

컷 명세는 **콘텐츠만** 담는다. 생성 결과와 회계는 분리한다.

```
컷 명세 (cut spec)      = 무엇을 그릴지 (콘텐츠). 재생성해도 대체로 유지
  └ generation (객체)   = 지금 화면에 표시 중인 이미지가 무엇인지 + 재생성 조건
generation_logs (테이블) = 매 생성마다 비용을 append (회계·cost_usd 실측)
```

이 3분할이 핵심이다. 컷 명세에 비용을 넣지 않는 이유는, **재생성 시 한 컷이 여러 번 과금**되므로 비용은 append-only 로그여야 정확하기 때문이다.

---

## 1. 전체 스키마

```jsonc
{
  // ── 식별 ──────────────────────────────
  "cut_id": "ep01_c012",          // 컷 고유 ID (재생성 단위)
  "scene_id": "s03",              // 소속 씬
  "cut_number": 12,               // 에피소드 내 정렬 순서

  // ── 콘텐츠: 등장인물 (컷 내 상태) ──────────
  "characters": [
    {
      "character_id": "hero",     // 캐릭터 자산 참조 (불변 자산)
      "emotion": "surprised",     // 이 컷에서의 표정
      "pose": "커피잔을 떨어뜨림",   // 이 컷에서의 동작/포즈
      "outfit": "default"         // 의상 세트 참조 (캐릭터 자산의 의상 중 택1)
    },
    {
      "character_id": "sidekick",
      "emotion": "laughing",
      "pose": "앉아서 지켜봄",
      "outfit": "default"
    }
  ],

  // ── 콘텐츠: 장소 ──────────────────────
  "location_id": "cafe_interior", // 장소 자산 참조 (불변 자산)

  // ── 콘텐츠: 연출 ──────────────────────
  "shot": "close_up",             // long | full | bust | close_up
  "action": "커피잔을 떨어뜨린다",   // 컷 전체 상황 서술

  // ── 콘텐츠: 대사/텍스트 ────────────────
  "dialogue": [
    { "order": 1, "type": "speech",    "speaker": "hero", "text": "안녕?" },
    { "order": 2, "type": "narration", "speaker": null,   "text": "그날 아침이었다" },
    { "order": 3, "type": "thought",   "speaker": "hero", "text": "(왜 여기 있지?)" }
  ],

  // ── 조판 힌트 ─────────────────────────
  "emphasis": "normal",           // normal | large | full_bleed
  "transition": null,             // null | scene_break

  // ── 사용자 미세조정 ────────────────────
  "prompt_override": null,        // 지정 시 자동 프롬프트 대신 사용

  // ── 상태 ─────────────────────────────
  "status": "pending",            // pending | approved | regenerating | invalidated

  // ── 생성 결과 (현재 버전) ───────────────
  "generation": {
    "image_url": "s3://.../ep01_c012_v2.png",
    "previous_image_url": "s3://.../ep01_c012_v1.png",  // 되돌리기 1단계
    "seed": 483920,
    "model": "gemini-3.1-flash-image-preview",
    "used_references": ["hero", "sidekick", "cafe_interior", "style:korean_webtoon"],
    "generated_at": "2026-07-31T10:00:00Z",
    "version": 2
  }
}
```

---

## 2. 필드별 상세

### 2.1 식별

| 필드 | 타입 | 설명 |
|---|---|---|
| `cut_id` | string | 컷 고유 ID. **부분 재생성의 단위.** `{ep}_{c번호}` 규칙 |
| `scene_id` | string | 소속 씬 ID. 씬 단위 작업·무효화에 사용 |
| `cut_number` | int | 에피소드 내 정렬 순서. 세로 스크롤 배치 순서 |

### 2.2 등장인물 (컷 내 상태)

`characters`는 **객체 배열**이다. 같은 인물이라도 컷마다 표정·포즈·의상이 다르므로 컷 단위로 상태를 지정한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `character_id` | string | 캐릭터 자산 참조 (게이트 3에서 확정된 불변 시트) |
| `emotion` | string | 이 컷에서의 표정 (예: surprised, laughing, angry) |
| `pose` | string | 이 컷에서의 동작/포즈 (자연어 서술) |
| `outfit` | string | 의상 세트 참조. 캐릭터 자산에 등록된 의상 중 택1 (교복→사복 등) |

> 이미지 생성 시 각 캐릭터의 확정 시트를 레퍼런스로 주입하고, `emotion`/`pose`/`outfit`을 프롬프트로 지정한다.

### 2.3 장소

| 필드 | 타입 | 설명 |
|---|---|---|
| `location_id` | string | 장소 자산 참조. 해당 장소 레퍼런스를 컷 생성 시 주입 |

### 2.4 연출

| 필드 | 타입 | 값 |
|---|---|---|
| `shot` | enum | `long` \| `full` \| `bust` \| `close_up` |
| `action` | string | 컷 전체 상황 서술 (자연어) |

### 2.5 대사/텍스트

`dialogue`는 순서와 타입을 가진 배열이다. MVP는 편집기가 없으므로, 이 정보로 **말풍선을 자동 배치**한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `order` | int | 말풍선 배치 순서 |
| `type` | enum | `speech`(일반 말풍선) \| `narration`(사각 박스) \| `thought`(구름형/독백) |
| `speaker` | string\|null | 화자 character_id. narration은 null |
| `text` | string | 대사 내용 |

> `type`에 따라 말풍선 모양이 갈린다. 좌표/꼬리 방향은 자동 배치 로직이 결정한다(편집기는 V1).

### 2.6 조판 힌트

세로 스크롤 웹툰의 리듬을 위한 최소 힌트. 대본/콘티 AI가 채운다.

| 필드 | 타입 | 값 |
|---|---|---|
| `emphasis` | enum | `normal` \| `large`(강조 컷, 높이 증가) \| `full_bleed`(전면 컷) |
| `transition` | enum\|null | `null` \| `scene_break`(씬 전환 시 여백/구분선) |

### 2.7 사용자 미세조정

| 필드 | 타입 | 설명 |
|---|---|---|
| `prompt_override` | string\|null | 지정 시 자동 조립 프롬프트 대신 이 값 사용. 고급 사용자용 |

### 2.8 상태

| 필드 | 값 | 의미 |
|---|---|---|
| `status` | `pending` | 콘티 확정됐으나 아직 이미지 미생성 |
| | `approved` | 이미지 생성·검수 완료 |
| | `regenerating` | 재생성 진행 중 |
| | `invalidated` | 의존 자산 변경으로 무효화됨 (재생성 필요) |

### 2.9 생성 결과 (generation)

현재 표시 중인 이미지와 **재생성에 필요한 조건**을 담는다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `image_url` | string | 현재 버전 이미지 |
| `previous_image_url` | string\|null | 직전 버전 1개 (되돌리기 1단계) |
| `seed` | int | 생성 시드. 재생성 시 고정 또는 변경 대상 |
| `model` | string | 사용 모델 ID (예: gemini-3.1-flash-image-preview) |
| `used_references` | string[] | **실제로 주입한 자산 목록.** 무효화 인덱스로 사용 (2.10 참조) |
| `generated_at` | ISO8601 | 생성 시각 |
| `version` | int | 현재 버전 번호 |

### 2.10 무효화 인덱스로서의 `used_references`

별도 의존성 필드를 두지 않는다. `used_references`가 **실제 사용한 자산**이므로 의존성의 정의 그 자체다.

```
자산 변경 시 무효화 규칙:
  "hero" 캐릭터 시트 변경    → used_references에 "hero" 포함된 컷을 invalidated
  "cafe_interior" 장소 변경  → 해당 location 포함 컷을 invalidated
  "style:korean_webtoon" 변경 → 해당 style 포함 컷(사실상 전체)을 invalidated
```

> **계획상 의존(`characters` 필드) ≠ 실제 사용(`used_references`).**
> 예: 캐릭터가 명세엔 있으나 뒷모습이라 레퍼런스를 주입하지 않은 경우. 무효화는 "실제 사용"을 기준으로 해야 정확하므로 `used_references`를 인덱스로 쓴다.

---

## 3. 회계 로그 (별도 테이블)

컷 명세와 분리된 append-only 로그. 재생성마다 1줄씩 쌓인다.

```jsonc
// generation_logs 테이블 레코드
{
  "log_id": "log_88213",
  "cut_id": "ep01_c012",
  "project_id": "proj_001",
  "user_id": "user_042",
  "model": "gemini-3.1-flash-image-preview",
  "model_tier": "flash",          // flash | pro (라우팅 반영)
  "cost_usd": 0.021,              // 실측 원가 (가격 확정의 근거)
  "credits_charged": 2,
  "seed": 483920,
  "created_at": "2026-07-31T10:00:00Z"
}
```

집계 용도:
- `SUM(cost_usd) WHERE cut_id = ?` → 그 컷의 총 원가 (재생성 누적 포함)
- `SUM(cost_usd) WHERE user_id = ? AND 월` → 사용자별 월 사용량
- 스타일·모델 tier별 평균 `cost_usd` → **PRD 9.3의 가격 확정 근거**

---

## 4. 재생성 동작 정의

부분 재생성 시 무엇이 바뀌고 무엇이 유지되는지.

| 재생성 유형 | 유지 | 변경 |
|---|---|---|
| **단순 재생성** (같은 컷 다시) | 컷 명세 전체 + used_references | seed만 변경 → 얼굴 유지, 구도만 달라짐 |
| **표정/포즈 수정** | 캐릭터 시트 + 장소 + 스타일 | 해당 캐릭터의 emotion/pose |
| **대사 수정** | 이미지 (generation 그대로) | dialogue만 변경 (이미지 재생성 없음, 과금 없음) |
| **의상 변경** | 캐릭터 시트 + 장소 | outfit → 이미지 재생성 |

> **대사 수정은 이미지 재생성이 아니므로 과금하지 않는다.** 텍스트 레이어만 갱신. 이 구분이 크레딧 절약의 핵심.

---

## 5. 미해결 / 다음 작업 연결

- 이 스키마의 `status`와 무효화 규칙은 **백엔드 상태 모델**(다음 작업)에서 자산 의존 그래프로 확장된다.
- `outfit` 의상 세트의 구체 구조는 **캐릭터 자산 스키마**에서 정의 필요.
- `emphasis`/`transition` → 조판(Layout) 엔진의 입력 스펙으로 연결.

---

*문서 끝 — Cut Spec Schema v1.0*
