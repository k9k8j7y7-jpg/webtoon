# Project T — 게이트 4·5 수정 지시서 (말풍선 + 제품 참조)

> **버전:** v1.0
> **작성일:** 2026-07-31
> **대상:** Claude Code
> **참조 문서:** docs/ 의 Cut-Spec-Schema-v1.0, Data-Model-v1.0, API-Spec-v1.0, Project-T-PRD-v0.1
> **범위:** 두 기능. (A) 말풍선/대사 자동 조판, (B) 제품 참조 이미지 업로드.

---

## 배경

게이트 5(이미지 검수) 테스트 결과 두 가지 문제 확인:

1. **말풍선/대사가 없음.** 컷 이미지만 나오고 대사가 안 얹혀 "웹툰"이 아니라 "삽화" 상태. 컷 명세에 dialogue 데이터는 이미 생성되고 있으나(Cut-Spec 2.5), 이미지 위에 얹는 **조판 단계가 미구현**.
2. **제품을 AI가 임의 생성.** 대본의 "아로마 스캘프 허브팩" 텍스트만으로 AI가 가짜 제품 외형을 그림. 실제 제품 사진을 참조로 주입하는 기능 필요. (PRD 7.6 용도 3 — 원래 V1 예정, MVP로 당김)

> 두 기능 모두 MVP로 편입. 테스트로 "쓸만한 웹툰이 나오는가"를 검증하려면 둘 다 필요.

---

# A. 말풍선/대사 자동 조판

## A-0. 핵심 방침

- **이미지 모델에 말풍선을 그리게 하지 않는다.** Nano Banana는 텍스트(특히 한글)를 정확히 못 쓰고 위치 통제도 안 됨. (현재 #1 이미지에 "IMMER) - Before Cooling Hair Pack" 같은 잘못된 텍스트가 그려진 것이 그 증거.)
- **이미지는 인물·배경만 생성**하고(현행 유지), 그 위에 **말풍선 레이어를 코드로 합성**한다.
- 이 방식이라 **대사만 수정은 이미지 재생성 없이 가능**(Cut-Spec 4의 "대사 수정 = 과금 없음"과 정합).

## A-1. 조판 방식 — 단순 고정 규칙 (MVP)

dialogue의 `type`에 따라 말풍선 모양과 위치를 고정 규칙으로 배치. (얼굴 회피 등 정교한 배치는 이후 개선)

| dialogue.type | 말풍선 모양 | 위치(MVP 고정 규칙) |
|---|---|---|
| `speech` | 일반 말풍선(꼬리 있음) | 컷 상단 |
| `narration` | 사각 박스(꼬리 없음) | 컷 하단 |
| `thought` | 구름형 말풍선 | 컷 상단 |

- 한 컷에 dialogue가 여러 개면 `order` 순서대로 세로로 쌓아 배치.
- 텍스트가 길면 말풍선 크기 자동 확장 + 줄바꿈.
- 폰트: 한글 웹툰용 가독성 폰트 지정(예: 나눔손글씨 계열 또는 프로젝트 지정 폰트).

## A-2. 구현 위치

- **조판(Composition) 단계**를 이미지 생성 이후, Export 이전에 추가.
- 흐름: `컷 이미지 생성(Nano Banana) → 조판(말풍선 합성) → 게이트 5 표시/Export`
- 이미지 합성은 서버 측에서 처리 (Python Pillow 또는 유사 라이브러리). SmartDetail의 Sharp 대응.

## A-3. 데이터

- 추가 테이블 불필요. dialogue는 이미 `cuts.spec` JSON에 있음(Cut-Spec 2.5).
- 합성된 최종 이미지(말풍선 포함)를 별도 저장:
```sql
ALTER TABLE cuts
  ADD COLUMN composed_image_url VARCHAR(500) AFTER image_url;  -- 말풍선 합성 결과
-- image_url = 원본(말풍선 없음), composed_image_url = 조판 결과
-- 원본을 남기는 이유: 대사 수정 시 원본 위에 다시 합성(이미지 재생성 불필요)
```

## A-4. 대사 수정 흐름 (과금 없음)

- `PUT /cuts/{cut_id}/dialogue` (API-Spec 7장, 기존) 호출 시:
  1. `cuts.spec`의 dialogue 갱신
  2. **원본 `image_url` 위에 조판만 다시 실행** → `composed_image_url` 갱신
  3. 이미지 재생성 없음 → 크레딧 미차감
- 게이트 5 화면에 컷별 **대사 편집** UI 추가(간단한 텍스트 편집).

## A-5. Export 반영

- Export(세로/인스타/PNG)는 `composed_image_url`(말풍선 포함본)을 사용.

---

# B. 제품 참조 이미지 업로드

## B-0. 핵심 방침 (PRD 7.6 용도 3)

- 용도 3(제품/소품)은 사용자 소유물이라 리스크 낮음 → MVP 편입.
- 원칙 **"업로드 → 자산화 → 주입"**(PRD 7.6): 원본을 매 컷 직접 넣지 않고, 제품 자산으로 등록 후 등장 컷에 레퍼런스 주입.
- **위치: 게이트 3(자산 단계), 이미지 생성 전.** 캐릭터·장소처럼 제품도 여기서 업로드·확정.

## B-1. 데이터 모델 — 제품 자산 테이블 신규

캐릭터/장소 자산과 동일 패턴.

```sql
CREATE TABLE products (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  ref_key       VARCHAR(50) NOT NULL,           -- 컷 명세 참조용 (예: "herb_pack")
  episode_id    BIGINT NOT NULL,
  name          VARCHAR(100),                   -- 제품명 (예: "아로마 스캘프 허브팩")
  description    TEXT,                           -- 설명/노출 방식
  source_image_url VARCHAR(500) NOT NULL,       -- 사용자 업로드 원본 (S3)
  status        ENUM('draft','approved','invalidated') DEFAULT 'draft',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id),
  UNIQUE KEY uq_ref (episode_id, ref_key),
  INDEX idx_episode (episode_id)
);
```

- 업로드 원본은 S3에 저장(캐릭터 시트와 동일 버킷 규칙).
- 업로드 시 **"본인 또는 권리 보유 이미지만" 동의 체크박스** 필수 (PRD 7.6 리스크 관리).

## B-2. 프론트엔드 — 게이트 3에 제품 섹션 추가

- 게이트 3에 **[제품] 섹션** 신설(캐릭터·장소·스타일과 나란히).
- 기능: 제품 이미지 업로드 + 제품명 입력 + 노출 방식 서술(선택, placeholder 예시).
- 업로드 동의 체크박스.
- MVP는 배경 제거(rembg 등) 없이 원본 그대로 주입으로 시작. (배경 제거는 이후 개선)

## B-3. 컷 주입 — 자동 감지 + 수동 보정 (Q4: 나)

**자동 감지:** 대본/컷 명세에서 제품명 언급이 있는 컷을 찾아 해당 컷에 제품 레퍼런스 자동 연결.

**수동 보정:** 사용자가 컷별로 제품 등장 여부를 추가/제외.

- 컷 명세(Cut-Spec)에 제품 참조 필드 추가:
```jsonc
// cuts.spec 에 추가
"products": ["herb_pack"]   // 이 컷에 등장할 제품 ref_key (자동감지+수동보정 결과)
```
- 이미지 생성 시, `products`에 있는 제품의 `source_image_url`을 **캐릭터·장소 레퍼런스와 함께 Nano Banana에 주입**.
- `used_references`에 `product:herb_pack` 포함(Cut-Spec 2.10, 무효화 인덱스에도 반영).
- `cut_asset_refs`에 `asset_type='product'` 추가:
```sql
-- cut_asset_refs.asset_type ENUM 에 'product' 추가
ALTER TABLE cut_asset_refs
  MODIFY COLUMN asset_type ENUM('character','location','style','product') NOT NULL;
```

## B-4. API — API-Spec 5장(게이트 3) 확장

- `POST /episodes/{id}/products` — 제품 업로드(멀티파트: 이미지 + 제품명 + 동의).
- `GET /episodes/{id}/products` — 제품 목록.
- `DELETE /products/{id}` — 제품 삭제.
- `PUT /cuts/{cut_id}/products` — 컷별 제품 등장 수동 보정(추가/제외).

## B-5. 게이트 3 승인 연동

- 제품도 캐릭터·장소처럼 게이트 3 자산의 일부. 제품 status가 draft여도 승인 진행 가능(제품은 선택적 자산).

---

## 우선순위 / 묶음

| 순서 | 묶음 | 이유 |
|---|---|---|
| 1 | A. 말풍선 조판 | 웹툰의 정의 자체. 이게 없으면 결과물이 삽화. 최우선 |
| 2 | B. 제품 참조 업로드 | 마케팅형 검증에 필요. A 다음 바로 |

> A(말풍선)를 먼저 완성해 "웹툰다운 결과물"을 확보한 뒤 B(제품)로. 두 기능은 독립적이라 순서대로 진행 가능.

---

## 이번 범위 아님 (나중에)

- 말풍선 얼굴 회피 등 정교한 자동 배치 (MVP는 고정 규칙)
- 제품 배경 제거(rembg) 후 합성
- 참조 업로드 용도 1(캐릭터 사진)·용도 2(스타일) — PRD 7.6대로 V2/보류
- 로깅

---

*문서 끝 — Gate4-5 Speech-Product Revision v1.0*
