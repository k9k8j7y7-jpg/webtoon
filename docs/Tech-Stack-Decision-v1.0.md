# Project T — 기술 스택 결정서

> **버전:** v1.0
> **작성일:** 2026-07-31
> **상태:** 확정
> **목적:** 개발 착수 전 기술 스택을 확정하고 근거를 남긴다. 데이터 모델·API 명세·구현이 이 결정을 전제로 작성된다.

---

## 0. 요약

```
프론트엔드   React 19 + Vite + Tailwind
백엔드       Python + FastAPI  (모듈러 모놀리스)
비동기 큐     Celery + Redis
DB          MySQL 8  (AWS RDS)
이미지 저장   AWS S3
이미지 생성   Nano Banana 2 (Gemini API) via adapters/ 추상화
인증         OAuth (구글 / 카카오 / 네이버) + JWT
인프라       AWS (RDS · S3 · EC2 또는 ECS)
```

---

## 1. 백엔드 — Python + FastAPI

**결정:** Python + FastAPI

**근거**
- 이 제품의 심장은 **AI 워크플로우 오케스트레이션**(여러 LLM·이미지 모델을 순서대로 엮고 큐로 비동기 처리)이며, 이 영역은 Python 생태계가 압도적이다. Gemini SDK, 이미지 처리(Pillow), 프롬프트 오케스트레이션이 모두 Python 1급 지원.
- 개발자가 FastAPI 경험을 보유(WidgetMind)하여 러닝커브가 사실상 없음.
- 이미지 생성의 비동기 특성상 큐가 필수인데, FastAPI + Celery 조합이 검증되어 있음.

**아키텍처 원칙 — 모듈러 모놀리스**
- PRD 8장은 백엔드를 17개 모듈로 MSA처럼 그렸으나, **MVP는 마이크로서비스로 쪼개지 않는다.**
- 하나의 FastAPI 앱 안에서 모듈을 **폴더/패키지로 분리**(modular monolith). 트래픽 증가 시 그때 분리.
- 1인 개발 단계에서 처음부터 MSA는 과도한 운영 부담.

```
app/
├── auth/          # Authentication Service
├── users/         # User Service
├── projects/      # Project Service
├── story/         # Story Engine
├── script/        # Script Engine
├── characters/    # Character Engine
├── locations/     # Location Engine
├── styles/        # Style Engine
├── prompts/       # Prompt Engine
├── context/       # AI Context Manager
├── storyboard/    # Storyboard Engine
├── images/        # Image Generation Engine
├── regeneration/  # Regeneration Engine
├── billing/       # Token/Credit System + generation_logs
├── export/        # Export Engine
├── workflow/      # AI Workflow Engine (오케스트레이션·게이트 상태)
└── adapters/      # 이미지 모델 추상화 레이어
```

---

## 2. 프론트엔드 — React 19 + Vite + Tailwind

**결정:** React 19 + Vite + Tailwind

**근거**
- 게이트 5단계 UI처럼 상태가 복잡한 화면에 React가 적합.
- 개발자가 React 19 / Vite / Tailwind 경험 보유(Openmall-Multi-Manager)로 재사용 가능.
- 게이트 진행·자산 확정·컷 검수 등 상태 전이가 많아 컴포넌트 상태 관리가 중요.

---

## 3. 비동기 큐 — Celery + Redis

**결정:** Celery + Redis (처음부터 도입)

**근거**
- 이미지 생성은 컷당 수 초~수 분 걸리는 비동기 작업으로, **동기 처리 불가**. 큐는 선택이 아니라 필수.
- PRD의 Queue System(모듈 14)의 실제 구현체.
- Redis는 큐 브로커 겸 캐시로 활용.
- 상태 흐름: `대기(queued) → 생성(processing) → 완료(completed) / 실패(failed)`

> MVP를 단순하게 가되, 큐만은 예외적으로 처음부터 포함한다. 이미지 생성 구조상 불가피.

---

## 4. 데이터베이스 — MySQL 8 (AWS RDS)

**결정:** MySQL 8

**근거**
- 개발자가 MySQL 경험 보유(WidgetMind RDS MySQL, Openmall MySQL)로 개발 속도 확보. 1인 개발에서 익숙함의 가치가 큼.
- MySQL 8의 JSON 타입으로 컷 명세·generation 등 반구조적 데이터 저장 가능.

**⚠️ 주의점 — JSON 쿼리**
- 컷 명세의 `generation.used_references`를 **무효화 인덱스**로 쓰는데(Cut-Spec-Schema 2.10), 이는 JSON 배열 내 값 검색이다.
- MySQL은 `JSON_CONTAINS()` / `JSON_TABLE()` 로 처리 가능하나, PostgreSQL의 JSONB + GIN 인덱스보다 성능·문법이 제한적.
- **대응:** 무효화 쿼리가 자주 발생하는 `used_references` 같은 필드는 **JSON 컬럼에만 두지 말고, 조회용 정규화 테이블(예: `cut_asset_refs`)을 병행**하는 것을 데이터 모델 설계 시 검토. (JSON은 원본 보관, 정규화 테이블은 인덱스 조회용)

> 이 주의점은 다음 작업(② 데이터 모델 전체)에서 구체 스키마로 반영한다.

---

## 5. 이미지 저장 — AWS S3

**결정:** AWS S3

**근거**
- 개발자가 S3 경험 보유(SmartDetail Agent).
- 생성 이미지(캐릭터 시트·장소 레퍼런스·컷 이미지) 저장. 컷 명세의 `image_url`이 S3 경로를 가리킴.
- 버전 관리(`previous_image_url`)를 위해 버전별 키 규칙 필요 (예: `.../ep01_c012_v2.png`).

---

## 6. 이미지 생성 — Nano Banana 2 via adapters/

**결정:** Nano Banana 2 (`gemini-3.1-flash-image-preview`), 어댑터 추상화

**근거** (PRD 6장)
- 레퍼런스 주입 캐릭터 일관성의 사실상 표준. 캐릭터 4명 + 오브젝트 14개 일관성 유지.
- 속도·비용 밸런스가 컷 다량 생성에 적합.
- **MVP는 어댑터 뒤에 이 모델 하나만 연결.** 향후 표지 컷 등에 Nano Banana Pro 선택 라우팅.
- SynthID 워터마킹 내장 (AI 기본법 대응).

**⚠️ 확인 필요:** Gemini 앱 기준 이미지 편집 18세 이상 제약 → API 적용 여부를 개발 초기에 Google 정책으로 확인.

---

## 7. 인증 — OAuth + JWT

**결정:** OAuth (구글 / 카카오 / 네이버) + JWT

**근거**
- 한국 웹툰 서비스 특성상 네이버·카카오 로그인 사실상 필수.
- 3종 OAuth로 소셜 로그인, 자체 세션은 JWT.
- 향후 인스타 게시(V1)를 위한 OAuth 토큰 저장 구조와 별개로 설계(사용자 로그인 ≠ SNS 게시 권한).

---

## 8. 인프라 — AWS

**결정:** AWS

**근거**
- 개발자가 AWS 경험 보유(S3, RDS).
- 구성: RDS(MySQL) · S3(이미지) · Redis(ElastiCache 또는 EC2 self-host) · 앱 호스팅(EC2 또는 ECS).
- MVP 단계에서는 EC2 단일 인스턴스 + RDS + S3로 단순하게 시작, 트래픽 증가 시 ECS/오토스케일 검토.

---

## 9. 스택 ↔ PRD 모듈 매핑

| PRD 백엔드 모듈 | 구현 |
|---|---|
| Authentication | FastAPI + OAuth + JWT |
| Queue System | Celery + Redis |
| Image Generation | adapters/ → Gemini API |
| Token/Credit + logs | MySQL (generation_logs 테이블) |
| Storage | S3 |
| 그 외 엔진 모듈 | FastAPI 모듈러 모놀리스 내 패키지 |

---

## 10. 다음 작업

기술 스택 확정으로 다음 문서의 표현 방식이 정해졌다.

1. **② 데이터 모델 전체** — MySQL 스키마. 캐릭터·장소·프로젝트·에피소드·컷·generation_logs. (4번 JSON 주의점 반영: 정규화 조회 테이블 병행 검토)
2. **③ 백엔드 상태 모델** — 게이트 status + 무효화 전파.
3. **④ API 명세 초안** — FastAPI 엔드포인트.

---

*문서 끝 — Tech Stack Decision v1.0*
