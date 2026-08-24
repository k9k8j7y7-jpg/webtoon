# 진행 상태 추적

## 현재 작업: P4 — 1단계 조사 완료 → 2단계 대기

### P4 — 1단계 조사 결과

**① P2 series 최소 API 현재 상태**
- `backend/app/series/router.py` — 2개 API만 존재 (테이블 검증용 최소 골격):
  - `POST /projects/{pid}/series` — 생성 (title, bible, outline)
  - `GET /series/{sid}` — 조회
- 모델: `projects/models.py` Series — id, project_id, title, bible(JSON), outline(JSON), created_at, updated_at
- Episode에 `series_id` FK 컬럼 이미 존재 (step11에서 추가)
- **P4에서 추가 필요:** outline CRUD (PUT), 아웃라인에서 에피소드 생성(지연 생성), 시리즈 목록 조회

**② ProjectPage 리스트 렌더 구조**
- `frontend/src/pages/ProjectPage.jsx` (271줄)
- 에피소드 0개: 온보딩 UI (파이프라인 가이드 + 예시 칩 3개 + CTA)
- 에피소드 N개: `episodes.map()` 카드 — 제목/게이트 라벨/삭제/이동 버튼
- 새 에피소드 모달: 제목 + 아이디어(textarea) + 칩 3개 + storyOptions 자동선택
- `handleCreateEpisode`: `POST /projects/{pid}/episodes` → workflow로 navigate (state에 idea/storyOptions 전달)
- **시리즈 관련 UI 전무.** "+ 연작 시리즈" 버튼, 시리즈 카드, [연작] 뱃지 모두 미구현
- **P4에서 추가 필요:** "+ 연작 시리즈" 버튼, 시리즈 카드 렌더, 시리즈 카드 클릭 → 아웃라인 화면

**③ 단편 Gate 1 기획 프롬프트/응답 구조**
- 입력 스키마 (`PlanningRequest`): idea(str), mood(str|null, 하위호환), characters(list|null), story_options({genre, mood, development}|null)
- `story_options` → `build_story_options_prompt()` → "\n\n연출 지시:\n- {장르}\n- {분위기}\n- {전개}" 조각 조립
- 프롬프트 구성: `"아이디어: {idea}" + options_prompt + characters 정보`
- SYSTEM_INSTRUCTION: JSON 형식 강제 (title, logline, synopsis, world, characters[{ref_key, name, gender, age, description}])
- 응답 JSON → `episode.script = {"planning": result, "story_options": so}` 저장
- **연작 Gate 1과의 차이점:** 연작은 전체 줄거리 → N화 분할 아웃라인 생성 필요. 현재 단편 프롬프트는 1화 완결 전제. 연작용 시스템 프롬프트 + 응답 스키마(outline 배열) 별도 필요

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
