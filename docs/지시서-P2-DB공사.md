# 지시서 P2 — DB 기반 공사 (series + 캐릭터 소속 이전 + 마이그레이션)

> **전제:** P1 커밋 완료. 결정서-연작설계-v5.md 확정 결정 2·3의 데이터 부분 구현.
> **성격:** 화면 변화 없음. DB 스키마 + 마이그레이션 + 최소 API만.
> **작업 방식: 각 단계 종료 시 반드시 멈추고 보고 → 사용자 확인 후 다음 단계.**
> **이 지시서는 단계 건너뛰기 절대 금지. 특히 3단계(마이그레이션)는
> 사용자의 명시적 "실행해" 승인 없이 실행하지 않는다.**
> 커밋은 사용자 확인 후. 파괴적 git 명령 금지.

---

## 0. 목표와 안전 원칙

- series 테이블 신설, episodes 확장, characters 소속 이전(프로젝트 레벨),
  episode_characters 신설, 기존 데이터 마이그레이션.
- **최우선 판정 기준: 마이그레이션 후 기존 기능이 전부 무변경 동작.**
  기존 에피소드 조회/편집/생성/이미지 생성/export가 전과 동일해야 한다.
- 마이그레이션은 **되돌릴 수 있어야 한다** (down 스크립트 또는 백업 복원).

## 1단계 — 현황 조사 (수정 금지)

1. 현재 DB 마이그레이션 방식: Alembic 사용 여부. 없다면 스키마 변경을
   어떻게 해왔는지 (수동 SQL? create_all?)
2. characters 테이블 현재 스키마 전체 (컬럼 목록, FK, 이미지 테이블 관계)
3. characters를 참조하는 모든 코드 경로 목록:
   - 캐릭터 CRUD (characters/router, service)
   - 이미지 생성의 참조 조회 (images/service.py:62-64 부근 등)
   - 프론트에서 캐릭터를 다루는 컴포넌트 (Gate3 등)
4. episodes 테이블 현재 스키마 (script JSON 구조 포함)
5. 서버 DB 종류/버전 (MySQL로 보임 — 확인) + 현재 백업 체계 유무
6. 로컬 개발 DB와 서버 DB의 관계 (로컬에 별도 DB가 있는지,
   마이그레이션 리허설을 로컬에서 할 수 있는지)

**보고 후 멈춤.** (조사 결과에 따라 2단계 방식 조정)

## 2단계 — 스키마 변경 + 마이그레이션 스크립트 작성 (실행은 아직 금지)

### 스키마 (결정서 확정안)
```
series: id, project_id FK, title,
        bible JSON, outline JSON, created_at, updated_at
episodes: + series_id (nullable FK, 기본 NULL),
          + episode_no (nullable int)
characters: + project_id (FK), + user_id (nullable — 라이브러리 승격용,
            이번엔 컬럼만), episode_id는 유지하되 사용 중단 예정 표시
            (제거는 P3 안정화 후 별도)
episode_characters: episode_id FK, character_id FK, (복합 PK 또는 unique)
```

### 마이그레이션 스크립트 (up/down 쌍)
- up:
  1. 새 테이블/컬럼 추가
  2. 데이터 이전: 각 character에 소속 episode의 project_id 기입,
     episode_characters에 (episode_id, character_id) 1행씩 삽입
  3. 검증 쿼리 내장: 이전 후 characters.project_id NULL 0건,
     episode_characters 행수 == 기존 캐릭터 수
- down: 추가 테이블/컬럼 제거 (데이터 이전분 롤백 포함)
- 실행하지 말고 스크립트 + dry-run 계획만 보고

### 코드 수정 (동작 불변 원칙)
- 캐릭터 조회 경로: 기존 episode_id 조회를 episode_characters 경유로
  교체하되, **결과가 기존과 동일함**을 보장 (마이그레이션이 1:1 연결을
  만들었으므로 동일해야 정상)
- 캐릭터 생성: episode_id + project_id + episode_characters 연결을
  모두 기록 (이중 기록 기간 — P3에서 정리)
- 이미지 생성 참조 조회 경로 동일 원칙
- series CRUD API 최소 골격만: POST /projects/{id}/series,
  GET /series/{id} (P4에서 본격 사용, 지금은 테이블 검증용)

**스크립트 전문 + 수정 diff 요약 보고 후 멈춤. 실행 금지.**

## 3단계 — 리허설 → 백업 → 실행 (사용자 승인 후에만)

1. **로컬 리허설** (1단계에서 로컬 DB 확인된 경우): 서버 DB 덤프를
   로컬에 복원 → up 실행 → 검증 쿼리 → down 실행 → 재-up. 결과 보고
2. **서버 백업**: mysqldump 전체 백업 → 파일명/크기/위치 보고.
   백업 확인 전 실행 금지
3. **사용자 "실행해" 승인 대기**
4. 실행 → 내장 검증 쿼리 결과 보고

## 4단계 — 무변경 판정 (전 기능 회귀)

- 기존 에피소드 (13 등) 대상:
  1. 에피소드 목록/진입 정상
  2. Gate 3 캐릭터 목록이 전과 동일하게 표시 (수치: 캐릭터 수 일치)
  3. 컷 이미지 재생성 1건 — 참조 이미지가 전과 동일하게 전달되는지
     (요청 페이로드의 참조 수 로그 확인, 실제 생성은 1컷만)
  4. export PNG 1회 정상
  5. 새 단편 에피소드 생성 → 캐릭터 자동 생성 → project_id/연결 기록 확인
- Playwright + API 응답 비교. 눈대중 금지

## 5단계 — 배포 + 커밋

- 백엔드 배포(코드) — 마이그레이션은 3단계에서 이미 서버 실행됨
- 커밋 분리:
  1. `feat(db): series/episode_characters 신설 + characters 프로젝트
     소속 이전 (P2)` — 스키마/마이그레이션/코드
  2. `docs: P2 지시서 보관 + PROGRESS 갱신`

## 범위 제한
- 화면/UI 변경 금지 (Gate 3 개편은 P3)
- 캐릭터 라이브러리 승격 로직 금지 (user_id 컬럼만)
- series를 사용하는 프론트 금지 (P4)
- episodes.episode_id 컬럼 삭제 금지

---
*지시서 끝 — P2*
