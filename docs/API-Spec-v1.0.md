# Project T — API 명세 초안

> **버전:** v1.0 (초안)
> **작성일:** 2026-07-31
> **상태:** 착수용 초안
> **전제:** Data-Model-v1.0, Backend-State-Model-v1.0, Cut-Spec-Schema-v1.0, Tech-Stack-Decision-v1.0 (FastAPI)
> **목적:** 게이트 파이프라인과 상태 전이를 REST 엔드포인트로 노출한다. Claude Code 착수의 API 계약.

---

## 0. 공통 규약

- **Base URL:** `/api/v1`
- **인증:** `Authorization: Bearer <JWT>` (인증 엔드포인트 제외)
- **비동기 작업:** 오래 걸리는 생성은 `202 Accepted` + `job_id` 반환 → 폴링 (Q27)
- **무효화 유발 요청:** `?dry_run=true`로 영향 범위 미리보기 지원 (Q28)
- **에러 포맷:**
  ```json
  { "error": { "code": "INSUFFICIENT_CREDITS", "message": "..." } }
  ```
- **페이지네이션:** `?limit=20&cursor=...`

---

## 1. 인증

### `POST /auth/{provider}/callback`
OAuth 콜백. `provider` ∈ {google, kakao, naver}.
```jsonc
// req
{ "code": "oauth_authorization_code" }
// res 200
{ "access_token": "<JWT>", "user": { "id": 42, "display_name": "..." } }
```

### `GET /me`
현재 사용자 정보.

---

## 2. 프로젝트 · 에피소드

### `POST /projects`
```jsonc
// req
{ "title": "...", "genre": "romance", "language": "ko", "visibility": "private" }
// res 201
{ "id": 1, "title": "...", ... }
```

### `GET /projects` · `GET /projects/{id}` · `DELETE /projects/{id}`
목록 / 상세 / 소프트 삭제(`deleted_at`).

### `POST /projects/{id}/episodes`
```jsonc
// req
{ "episode_no": 1, "idea": "한 줄 아이디어", "mood": "..." }
// res 201
{ "id": 10, "gate_status": { "current_gate": 1, ... } }
```

---

## 3. 게이트 1 — 기획

### `POST /episodes/{id}/planning`
아이디어 → 제목·로그라인·시놉시스·세계관·인물목록 생성. (텍스트, 무료·동기)
```jsonc
// res 200
{ "title": "...", "logline": "...", "synopsis": "...",
  "world": "...", "characters": ["hero", "sidekick"] }
```

### `PUT /episodes/{id}/planning`
사용자 수정.

### `POST /episodes/{id}/planning/approve`
게이트 1 승인 → `current_gate=2`.
```jsonc
// req (선택)
{ "auto_advance": false }
```

---

## 4. 게이트 2 — 대본

### `POST /episodes/{id}/script`
씬·컷·대사 생성. (텍스트, 무료·동기)

### `PUT /episodes/{id}/script`  ⚠️ 무효화 유발
대본 수정. `dry_run`으로 영향 미리보기 (Q28).
```jsonc
// PUT .../script?dry_run=true  → 실행 안 함, 영향만 반환
// res 200
{ "invalidation_preview": {
    "characters": ["sidekick"],     // 무효화될 자산
    "locations": [],
    "cuts_count": 12,               // 무효화될 컷 수
    "message": "이 수정은 캐릭터 'sidekick'와 컷 12개를 재확정하게 합니다."
} }

// PUT .../script  (dry_run 없음) → 실제 수정 + 무효화 실행
// res 200
{ "script": {...}, "invalidated": { "characters": ["sidekick"], "cuts": 12 } }
```

### `POST /episodes/{id}/script/approve`
게이트 2 승인 → `current_gate=3`.

---

## 5. 게이트 3 — 자산 (캐릭터 · 장소 · 스타일)

### `POST /episodes/{id}/characters`
대본 인물 → 캐릭터 시트 생성. (이미지, 소액·비동기)
```jsonc
// res 202
{ "job_id": "job_c001", "characters": ["hero", "sidekick"] }
```

### `GET /characters/{id}`
```jsonc
// res 200
{ "id": 5, "ref_key": "hero", "status": "draft",
  "images": [ { "type": "front", "url": "s3://..." },
              { "type": "expression", "label": "smile", "url": "s3://..." } ],
  "outfits": [ { "outfit_key": "default", "is_default": true, "images": [...] } ] }
```

### `POST /characters/{id}/regenerate`  ⚠️ 무효화 유발
시트 재생성. `dry_run` 지원(이 캐릭터 쓰는 컷 무효화 미리보기).
```jsonc
// res 202
{ "job_id": "job_c002", "will_invalidate_cuts": 8 }
```

### `POST /characters/{id}/outfits`
추가 의상 생성 (MVP: default만 자동, 추가는 요청 시).

### `POST /episodes/{id}/locations` · `GET /locations/{id}` · `POST /locations/{id}/regenerate`
장소 자산. 캐릭터와 동일 패턴.

### `PUT /episodes/{id}/style`
스타일 락 선택.
```jsonc
// req
{ "preset_key": "korean_webtoon", "tier": "core" }
```

### `POST /episodes/{id}/assets/approve`
게이트 3 승인 → `current_gate=4`. 캐릭터·장소 status = approved.

---

## 6. 게이트 4 — 콘티 ⭐ 비용 경계

### `POST /episodes/{id}/storyboard`
컷 분할·연출 → 컷 명세(JSON) 생성. (텍스트/썸네일, 무료)
```jsonc
// res 200
{ "cuts": [ { "cut_id": "ep01_c001", "cut_number": 1, "shot": "long", ... }, ... ] }
```

### `GET /episodes/{id}/cuts`
컷 명세 목록 (cut_number 정렬).

### `PUT /cuts/{cut_id}`
컷 수정 (앵글·대사·순서·emphasis). 아직 이미지 전이라 무효화 없음.

### `POST /episodes/{id}/cuts/reorder`
컷 순서 변경 / 추가 / 삭제 / 병합.

### `POST /episodes/{id}/storyboard/approve`  ⚠️ 과금 시작 지점
게이트 4 승인. **auto_advance여도 이 지점은 반드시 명시 호출**(강제 정지). 승인 후 게이트 5(이미지 생성) 가능.
```jsonc
// res 200
{ "approved": true, "estimated_cost": { "cuts": 40, "credits": 80 } }  // 사전 비용 고지
```

---

## 7. 게이트 5 — 컷 검수 · 생성

### `POST /episodes/{id}/generate`
승인된 컷 명세 → 이미지 일괄 생성. (이미지, 과금·비동기)
```jsonc
// res 202
{ "job_id": "job_gen_01", "total_cuts": 40 }
```

### `POST /cuts/{cut_id}/regenerate`
부분 재생성. (과금·비동기)
```jsonc
// req (선택)
{ "mode": "reseed",           // reseed(구도만) | emotion | pose | outfit
  "seed": null,               // null이면 새 시드
  "params": { "emotion": "angry" } }
// res 202
{ "job_id": "job_re_88", "credits_will_charge": 2 }
```

### `PUT /cuts/{cut_id}/dialogue`  💡 과금 없음
대사만 수정. 이미지 재생성 아님 → 크레딧 미차감. (Cut-Spec 4)
```jsonc
// req
{ "dialogue": [ { "order": 1, "type": "speech", "speaker": "hero", "text": "..." } ] }
```

### `POST /cuts/{cut_id}/revert`
직전 버전으로 되돌리기 1단계 (`prev_image_url` → `image_url`).

---

## 8. 내보내기

### `POST /episodes/{id}/export`
```jsonc
// req
{ "format": "instagram_carousel" }  // png_cuts | vertical_single | instagram_carousel
// res 202
{ "job_id": "job_exp_3" }
// 완료 후 job 응답에 다운로드 URL(zip)
```

---

## 9. 상태 · 큐 · 과금

### `GET /episodes/{id}/status`
게이트 상태 조회 (gate_status 그대로).
```jsonc
// res 200
{ "current_gate": 4, "auto_advance": false,
  "gates": { "1_planning": {"status":"approved"}, ... } }
```

### `GET /jobs/{job_id}`  (폴링, Q27)
```jsonc
// res 200
{ "job_id": "job_gen_01", "status": "processing",  // queued|processing|completed|failed
  "progress": { "done": 12, "total": 40 },
  "result": null,                                   // completed 시 결과/URL
  "error": null }
```

### `GET /me/credits`
```jsonc
{ "balance": 150, "subscription": { "plan": "basic", "cut_quota": 200, "cut_used": 47 } }
```

### `GET /me/subscription`
구독 상세.

---

## 10. 엔드포인트 ↔ 상태전이 매핑

| 엔드포인트 | 상태 전이 |
|---|---|
| `*/approve` | 게이트 draft → approved, current_gate++ |
| `PUT .../script` | diff 판정 → 자산/컷 invalidated (dry_run 시 미리보기만) |
| `*/regenerate` | 자산 재생성 → cut_asset_refs 조회 → 관련 컷 invalidated |
| `.../generate` | 컷 pending → regenerating → approved, generation_logs 기록 |
| `.../dialogue` | 텍스트만 갱신, 과금·이미지 변화 없음 |
| `.../revert` | image_url ↔ prev_image_url |

---

## 11. 착수 체크리스트

이 문서로 착수 전 설계 세트가 완성된다.

- ✅ 제품 기획 (PRD v0.1)
- ✅ 컷 명세 스키마 (Cut-Spec v1.0)
- ✅ 기술 스택 (Tech-Stack v1.0)
- ✅ 데이터 모델 (Data-Model v1.0)
- ✅ 상태 모델 (Backend-State-Model v1.0)
- ✅ API 명세 (본 문서)

**개발 착수 권장 순서 (수직 슬라이스)**
1. 인증 + 프로젝트/에피소드 CRUD (게이트 없는 기본 골격)
2. 게이트 1·2 (텍스트 파이프라인 — 무료라 저비용 검증)
3. adapters/ + 캐릭터 시트 생성 (게이트 3 — 이미지 첫 도입)
4. 게이트 4 콘티 + 컷 명세
5. 게이트 5 이미지 생성 + 큐 + 부분 재생성 (핵심 가설 검증)
6. Export + 과금
7. 무효화 전파 (전체 흐름 검증 후 통합)

> 처음부터 전체를 짜지 말고, 게이트 1→2→3 순으로 수직 슬라이스를 쌓으며 검증한다.

---

*문서 끝 — API Spec v1.0 (초안)*
