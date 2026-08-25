# 진행 상태 추적

## 현재 작업: P4 — 2단계 백엔드 완료 → 3단계(프론트) 대기

### P4 — 2단계 백엔드 완료 (2026-08-25)

**구현 파일:**
- `backend/app/series/router.py` — 10개 API 엔드포인트 (전면 교체)
- `backend/app/series/service.py` — 바이블/아웃라인 생성·편집 로직 (신규)
- `backend/app/series/schemas.py` — Pydantic 스키마 (신규)

**API 엔드포인트 10개:**
1. `POST /projects/{pid}/series` — 시리즈 생성 (idea, story_options, target_episodes를 bible 메타에 저장)
2. `GET /projects/{pid}/series` — 시리즈 목록 (title, outline_count, episode_count)
3. `GET /series/{sid}` — 시리즈 상세 (bible + outline 포함)
4. `DELETE /series/{sid}` — 보수적 삭제 (에피소드 0건만)
5. `POST /series/{sid}/bible` — 바이블+아웃라인 생성 (비동기 Job, AI 1콜)
6. `POST /series/{sid}/bible/regenerate` — 전체 재생성
7. `POST /series/{sid}/outline/regenerate` — from_no 이후만 재생성 (앞 회차 컨텍스트)
8. `PUT /series/{sid}/outline` — 배열 통째 교체 (리넘버링 서버 책임)
9. `POST /series/{sid}/outline/merge` — 인접 회차 병합 (AI 1콜)
10. `POST /series/{sid}/outline/split` — 회차 분할 (AI 1콜)

**실서버 검증 결과:**
- 시리즈 생성 → 바이블 생성 (8화): 아웃라인 8개, 각 항목 title/summary/hook 존재, episode_id 전부 null ✅
- 전체 재생성: 새 아웃라인 8개 생성 ✅
- 병합 (3+4화): 8→7화, 리넘버링 정상, 훅 승계 ✅
- 분할 (3화): 7→8화, 리넘버링 정상 ✅
- 부분 재생성 (from_no=5): 1~4화 유지, 5~8화만 교체 ✅
- 비인접 병합 거부: 400 정상 ✅
- 시리즈 삭제 (에피소드 0건): 성공 ✅
- 시리즈 목록: outline_count/episode_count 정상 ✅

**기술 메모:**
- Job 패턴: `run_job_in_background` → `run_job_async`가 status 관리. 내부 except에서 `raise` 필수 (안 하면 completed로 덮어씌워짐)
- JSON 파싱: 잘린 응답 복구 시도 (_parse_json에 suffix 보완 로직)
- max_output_tokens: 바이블 생성 16384 (8화 아웃라인이 8192에서 잘릴 수 있음)
- bible 메타: idea, story_options, target_episodes를 bible JSON에 함께 저장 (재생성 시 참조)

### P4 — 1단계 조사 결과

**① P2 series 최소 API 현재 상태**
- `backend/app/series/router.py` — 2개 API만 존재 (테이블 검증용 최소 골격):
  - `POST /projects/{pid}/series` — 생성 (title, bible, outline)
  - `GET /series/{sid}` — 조회
- 모델: `projects/models.py` Series — id, project_id, title, bible(JSON), outline(JSON), created_at, updated_at
- Episode에 `series_id` FK 컬럼 이미 존재 (step11에서 추가)

**② ProjectPage 리스트 렌더 구조**
- 시리즈 관련 UI 전무. P4 3단계에서 구현 필요

**③ 단편 Gate 1 기획 프롬프트/응답 구조**
- 연작용 시스템 프롬프트 + 응답 스키마 별도 구현 완료 (service.py)

### 추가 메모
- 스킵 배너 실발화 검증은 P5로 이월 (직전 회차 캐릭터가 대본에 등장하는 케이스)

## 이전 완료
- P3 안정화 — 재생성 고아 레코드 재활용 + 피커 인라인 에러 표시 (1fd7b8a)
- P3 보완 — 스타일 뱃지/경고, 자동생성 스킵, step12 (characters.style 컬럼 + 백필)
- P3 — 캐릭터 라이브러리: 피커 2단/불러오기/승격/보수적 삭제. 8 API + Gate3 피커 모달
- P2 — DB 기반 공사: series/episode_characters 신설 + characters 프로젝트 소속 이전 + schema_migrations. 4단계 무변경 판정 ALL PASS
- P1 — 단편 아이디어 입력 UI: 커밋 완료 (0844047)

## 추후 개선 후보
- locked 게이트 탭 시인성 낮음 (opacity-50 + bg-gray-200이 흰 배경에 녹아듦)
- Gate5Review 제목/Export 버튼 모바일 375px 세로 꺾임
