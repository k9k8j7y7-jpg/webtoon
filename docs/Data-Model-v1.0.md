# Project T — 데이터 모델 (MySQL 스키마)

> **버전:** v1.0
> **작성일:** 2026-07-31
> **상태:** 확정
> **전제:** Tech-Stack-Decision-v1.0 (MySQL 8), Cut-Spec-Schema-v1.0
> **목적:** 착수 전 전체 데이터 모델을 확정한다. API 명세·구현이 이 스키마를 전제로 작성된다.

---

## 0. 설계 원칙

1. **불변 자산 우선.** 게이트 3에서 확정되는 캐릭터·장소·스타일은 불변 자산으로 저장하고, 컷은 이를 참조한다.
2. **JSON 원본 + 정규화 조회 테이블 병행.** 컷 명세는 JSON으로 원본 보관하고, 무효화·필터에 쓰는 값만 별도 테이블로 인덱싱한다. (MySQL JSON 쿼리 약점 우회)
3. **회계는 append-only.** 비용·크레딧 증감은 로그 테이블에 누적한다. 잔액은 파생값.
4. **소프트 삭제.** 주요 엔티티는 `deleted_at`으로 복구 가능하게 (PRD의 프로젝트 복구 요구).

---

## 1. 전체 테이블 지도

```
users
  └ projects
       ├ project_memory          (전역 일관성 규칙 · AI Context Manager)
       └ episodes
            ├ characters ─ character_images     (정면/측면/표정)
            │            └ character_outfits ─ outfit_images
            ├ locations ─ location_images
            ├ styles                            (선택된 스타일 락)
            └ scenes
                 └ cuts ─ cut_asset_refs        (무효화 조회 전용)
                       └ generation_logs        (회계 append-only)

과금:  subscriptions · credit_balances · credit_transactions
```

---

## 2. 사용자 · 프로젝트

### 2.1 users

```sql
CREATE TABLE users (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  provider      ENUM('google','kakao','naver') NOT NULL,
  provider_uid  VARCHAR(255) NOT NULL,          -- OAuth 제공자의 사용자 ID
  email         VARCHAR(255),
  display_name  VARCHAR(100),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider (provider, provider_uid)
);
```

### 2.2 projects

```sql
CREATE TABLE projects (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  title        VARCHAR(200) NOT NULL,
  genre        VARCHAR(50),
  language     VARCHAR(10) DEFAULT 'ko',
  visibility   ENUM('private','public') DEFAULT 'private',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,                   -- 소프트 삭제(복구)
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id)
);
```

### 2.3 project_memory — AI Context Manager

프로젝트 전역에서 AI가 항상 지켜야 하는 규칙. 대본·콘티·이미지 생성 시 자동 주입.

```sql
CREATE TABLE project_memory (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id   BIGINT NOT NULL,
  rules        JSON NOT NULL,                   -- 아래 구조
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  UNIQUE KEY uq_project (project_id)
);
```

`rules` JSON 예시:
```jsonc
{
  "speech_style": "반말",
  "forbidden": ["유혈", "욕설"],
  "world_rules": ["현대 서울 배경", "마법 없음"],
  "brand_guide": { "logo_color": "#1A73E8", "product_placement": "자연스럽게" }
}
```

---

## 3. 에피소드 · 씬

### 3.1 episodes

```sql
CREATE TABLE episodes (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  project_id   BIGINT NOT NULL,
  episode_no   INT NOT NULL,
  title        VARCHAR(200),
  logline      TEXT,
  synopsis     TEXT,
  script       JSON,                            -- 대본 원본(씬·컷·대사 트리)
  gate_status  JSON,                            -- 게이트별 상태 (상태 모델 문서에서 확장)
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  INDEX idx_project (project_id)
);
```

> `gate_status`의 상세 구조(각 게이트 draft/approved/invalidated)는 **③ 백엔드 상태 모델** 문서에서 확정한다.

### 3.2 scenes

```sql
CREATE TABLE scenes (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  episode_id   BIGINT NOT NULL,
  scene_no     INT NOT NULL,
  summary      TEXT,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  INDEX idx_episode (episode_id)
);
```

---

## 4. 불변 자산 — 캐릭터

### 4.1 characters

```sql
CREATE TABLE characters (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  ref_key       VARCHAR(50) NOT NULL,           -- 컷 명세가 참조하는 character_id (예: "hero")
  episode_id    BIGINT NOT NULL,                -- 자산 소유 범위 (프로젝트 재사용은 V1)
  name          VARCHAR(100),
  description    TEXT,                           -- 외모·성격·나이·말투
  status        ENUM('draft','approved','invalidated') DEFAULT 'draft',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_ref (episode_id, ref_key),
  INDEX idx_episode (episode_id)
);
```

### 4.2 character_images — 시트 (Q22: 다)

정면/측면/표정을 타입 태그로 유연하게 저장. 레퍼런스 주입 시 필요한 타입만 선택.

```sql
CREATE TABLE character_images (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  character_id  BIGINT NOT NULL,
  type          ENUM('front','side','expression') NOT NULL,
  label         VARCHAR(50),                    -- 표정명 등 (예: "smile","angry")
  image_url     VARCHAR(500) NOT NULL,          -- S3 경로
  seed          BIGINT,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  INDEX idx_character (character_id)
);
```

> **MVP 생성 장수 최소화:** 정면 1 + 표정 2 정도로 시작. 구조는 확장 가능.

### 4.3 character_outfits (Q21: 나) + outfit_images

의상 세트를 별도 자산으로. 컷 명세의 `outfit` 필드가 `character_outfits.outfit_key`를 참조.

```sql
CREATE TABLE character_outfits (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  character_id  BIGINT NOT NULL,
  outfit_key    VARCHAR(50) NOT NULL,           -- 컷 명세 참조값 (예: "default","casual")
  label         VARCHAR(100),                   -- "교복","사복"
  description    TEXT,
  is_default    BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  UNIQUE KEY uq_outfit (character_id, outfit_key)
);

CREATE TABLE outfit_images (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  outfit_id     BIGINT NOT NULL,
  image_url     VARCHAR(500) NOT NULL,
  FOREIGN KEY (outfit_id) REFERENCES character_outfits(id),
  INDEX idx_outfit (outfit_id)
);
```

> **MVP:** 캐릭터당 기본 의상(`default`) 1벌만 자동 생성. 추가 의상은 사용자 요청 시.

---

## 5. 불변 자산 — 장소 · 스타일

### 5.1 locations

```sql
CREATE TABLE locations (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  ref_key       VARCHAR(50) NOT NULL,           -- 컷 명세 참조 location_id (예: "cafe_interior")
  episode_id    BIGINT NOT NULL,
  name          VARCHAR(100),
  description    TEXT,
  status        ENUM('draft','approved','invalidated') DEFAULT 'draft',
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_ref (episode_id, ref_key)
);

CREATE TABLE location_images (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  location_id   BIGINT NOT NULL,
  image_url     VARCHAR(500) NOT NULL,
  seed          BIGINT,
  FOREIGN KEY (location_id) REFERENCES locations(id),
  INDEX idx_location (location_id)
);
```

### 5.2 styles

에피소드에 적용된 스타일 락. 컷 명세 `used_references`의 `style:...`가 이를 가리킴.

```sql
CREATE TABLE styles (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  episode_id    BIGINT NOT NULL,
  preset_key    VARCHAR(50) NOT NULL,           -- "korean_webtoon","romance","sd"...
  tier          ENUM('core','beta') DEFAULT 'core',
  prompt_snippet TEXT,                          -- 프리셋 프롬프트 조각
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_episode_style (episode_id)
);
```

---

## 6. 컷 (Q24: 나 — JSON 원본 + 정규화 조회)

### 6.1 cuts

자주 쓰는 스칼라만 컬럼으로, 컷 명세 전체는 `spec` JSON에 원본 보관.

```sql
CREATE TABLE cuts (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  cut_id        VARCHAR(50) NOT NULL,           -- 컷 명세 cut_id (예: "ep01_c012")
  episode_id    BIGINT NOT NULL,
  scene_id      BIGINT NOT NULL,
  cut_number    INT NOT NULL,                   -- 정렬
  status        ENUM('pending','approved','regenerating','invalidated') DEFAULT 'pending',
  spec          JSON NOT NULL,                  -- 컷 명세 원본 통째 (Cut-Spec-Schema)
  image_url     VARCHAR(500),                   -- 현재 버전 (generation.image_url 미러)
  prev_image_url VARCHAR(500),                  -- 되돌리기 1단계
  seed          BIGINT,
  version       INT DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_cut (episode_id, cut_id),
  INDEX idx_episode_order (episode_id, cut_number),
  INDEX idx_status (status)
);
```

> `image_url`/`seed`/`version`은 `spec.generation`의 미러(자주 조회하므로 컬럼으로도 노출). 원본은 `spec` JSON.

### 6.2 cut_asset_refs — 무효화 조회 전용

컷 명세의 `generation.used_references`를 행으로 펼쳐 인덱싱. **무효화의 핵심.**

```sql
CREATE TABLE cut_asset_refs (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  cut_id        VARCHAR(50) NOT NULL,           -- cuts.cut_id
  episode_id    BIGINT NOT NULL,
  asset_type    ENUM('character','location','style') NOT NULL,
  asset_ref     VARCHAR(50) NOT NULL,           -- ref_key (예: "hero","cafe_interior","korean_webtoon")
  INDEX idx_asset (episode_id, asset_type, asset_ref),  -- "hero 쓰는 컷 전부" 한 방
  INDEX idx_cut (cut_id)
);
```

**무효화 쿼리 예시**
```sql
-- "hero 캐릭터 시트가 바뀜" → 영향받는 컷 전부 무효화
UPDATE cuts SET status = 'invalidated'
WHERE cut_id IN (
  SELECT cut_id FROM cut_asset_refs
  WHERE episode_id = ? AND asset_type = 'character' AND asset_ref = 'hero'
);
```

> 이미지 생성 성공 시, `used_references`를 파싱해 이 테이블을 재작성(delete+insert)한다. JSON은 원본, 이 테이블은 조회 인덱스.

---

## 7. 회계 (append-only)

### 7.1 generation_logs

매 이미지 생성마다 1행. 재생성 시 누적. **cost_usd 실측의 원천.**

```sql
CREATE TABLE generation_logs (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  cut_id          VARCHAR(50),                  -- 캐릭터/장소 생성 시 NULL 가능
  episode_id      BIGINT NOT NULL,
  project_id      BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  kind            ENUM('cut','character','location') NOT NULL,
  model           VARCHAR(80) NOT NULL,
  model_tier      ENUM('flash','pro') DEFAULT 'flash',
  cost_usd        DECIMAL(10,5) NOT NULL,       -- 실측 원가
  credits_charged INT NOT NULL,
  seed            BIGINT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_time (user_id, created_at),
  INDEX idx_cut (cut_id),
  INDEX idx_project (project_id)
);
```

**집계 예시**
```sql
-- 사용자 이번 달 사용량
SELECT SUM(cost_usd), SUM(credits_charged) FROM generation_logs
WHERE user_id = ? AND created_at >= ?;

-- 스타일/tier별 평균 컷 원가 (가격 확정 근거)
SELECT model_tier, AVG(cost_usd) FROM generation_logs
WHERE kind='cut' GROUP BY model_tier;
```

---

## 8. 과금 (Q23: 나 — 표준 3테이블)

### 8.1 subscriptions

```sql
CREATE TABLE subscriptions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  plan          VARCHAR(50) NOT NULL,           -- "free","basic","pro"...
  status        ENUM('active','canceled','past_due') DEFAULT 'active',
  cut_quota     INT NOT NULL DEFAULT 0,         -- 이번 주기 이미지 컷 할당량
  cut_used      INT NOT NULL DEFAULT 0,         -- 소진량
  renews_at     DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user (user_id)
);
```

### 8.2 credit_balances

```sql
CREATE TABLE credit_balances (
  user_id       BIGINT PRIMARY KEY,
  balance       INT NOT NULL DEFAULT 0,         -- 구독 할당량 초과분용 구매 크레딧
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 8.3 credit_transactions (append-only)

```sql
CREATE TABLE credit_transactions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id       BIGINT NOT NULL,
  delta         INT NOT NULL,                   -- +충전 / -차감
  reason        ENUM('subscription_grant','purchase','generation','refund') NOT NULL,
  ref_log_id    BIGINT,                         -- generation_logs 연결 (차감 시)
  balance_after INT NOT NULL,                   -- 검증용 스냅샷
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_time (user_id, created_at)
);
```

**과금 흐름 (하이브리드)**
```
컷 생성 요청
  → 구독 할당량(subscriptions.cut_quota - cut_used) 남았나?
       예 → cut_used += 1
       아니오 → credit_balances.balance 차감 + credit_transactions(reason=generation)
  → generation_logs 기록 (cost_usd 실측)
```

> 결제 PG(Toss Payments) 연동은 MVP 후반/출시 직전. 테이블 구조만 지금 확정.

---

## 9. 상태(status) 필드 요약

무효화 전파의 대상. 상세 전파 규칙은 ③ 백엔드 상태 모델에서 확정.

| 테이블 | status 값 |
|---|---|
| characters | draft / approved / invalidated |
| locations | draft / approved / invalidated |
| cuts | pending / approved / regenerating / invalidated |
| episodes.gate_status | (게이트별 JSON, ③에서 정의) |

---

## 10. 다음 작업

1. **③ 백엔드 상태 모델** — `episodes.gate_status` 구조 확정, 자산 변경 → 무효화 전파 로직, `cut_asset_refs` 재작성 트리거.
2. **④ API 명세 초안** — 이 스키마 기반 FastAPI 엔드포인트.

---

*문서 끝 — Data Model v1.0*
