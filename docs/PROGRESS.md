# 진행 상태 추적

## 현재: 1-8 바이블 인라인 수정 + 화자/시점 명시 — 1단계 조사 (2026-09-01)

### 1-8 — 2단계 백엔드 완료 (2026-09-01)
- narrator 필드: BIBLE_SYSTEM_INSTRUCTION에 필수 스키마 추가
- PUT /series/{sid}/bible: 필드 단위 병합 (outline 불변), ref_key 변경 불가, 대본 등장 인물 삭제 409
- build_narrator_block(): [화자] 프롬프트 블록 조립 (1인칭/3인칭)
- series_context 4곳에 narrator 주입 (generate/revise/merge/script router)
- _resolve_narrator(): 구 바이블 폴백 (characters[0] 3인칭 + narrator_missing 플래그)
- _series_to_dict에 narrator_missing 응답 포함
- **3단계 프론트 완료:**
  - 바이블 [수정] → 인라인 편집 모드 (시놉시스/세계관 textarea, 화자 라디오+1/3인칭 토글, 인물 카드 편집/추가/삭제, 저장/취소)
  - narrator_missing 경고 배너 (⚠ + 수정 링크)
  - 저장 후 episodes_with_scripts > 0 안내 배너
  - 대본 생성/수정 후 재생성 confirm에 화자 한 줄 표시
  - 보기 모드에 화자 표시 + 인물별 [ref_key] 표시
  - 모바일 375px 대응 확인
- **4단계 검증 완료 (5/5 PASS):**
  1. 도도(10): narrator_missing=True → PUT 화자=husband(1인칭)+인물 정정 → narrator_missing=False, episodes_with_scripts=3 ✅
  2. 테스트(11): 화자=hyungwoo(1인칭) 지정 → 1화 revise → 나레이션 speaker=hyungwoo, 1인칭 서술 일관 ✅
  3. ref_key 보호: 대본 등장 hyungwoo 삭제 시도 → 409 정상 ✅ (character_ids→characters[].character_id 버그 수정 포함)
  4. 신규 시리즈 바이블 → narrator={ethan_reed, first_person} 자동 생성 → 삭제 ✅
  5. 회귀: 단편 조회 + 아웃라인 무변경 ✅
- 배포 완료. 사용자 실전 확인 + 커밋 대기

## 이전: 도도 1화 실전 통과 + 유령 ref_key 정리 (2026-09-01)

### 유령 ref_key 정리 + 재발 방지 — 완료 (2026-09-01)
- ep20 컷 spec에서 char_0→me, char_1→husband 치환 + 중복 제거 (4컷: c003, c006, c009, c010)
- #6 husband 누락 추가 (아내가 안고 남편이 옆에서 보는 장면)
- Gate5 카드: 연결 캐릭터와 매칭 안 되는 ref_key에 ⚠ 표시 (툴팁에 키 이름)
- 콘티 수정 모달: 캐릭터 버튼에 이름(ref_key) 표시 + unknown 캐릭터 주황 ⚠ 버튼으로 제거 가능

## 이전: 0-2 appearance_en 완료 + P5 ref_key 버그 수정 (2026-08-31)

### 0-2 캐릭터 외형 명세 주입 — 완료 (2026-08-31)
- step13 마이그레이션: `characters.appearance_en` VARCHAR(500) 추가
- `build_appearance_en()`: 구조 필드(영어) + detail_notes(한→영 Gemini 번역) 조립
- 컷 프롬프트 주입: `prompts/service.py`에 APPEARANCE_ANCHOR 앵커 + Image N 태그
- `char_descs` 구조 변경: `dict[str, str]` → `dict[str, dict]` (name + appearance_en)
- 백필 API: `POST /characters/backfill-appearance` — 25/27 성공 (2건은 description=None)
- Gate3 UI: "고정 외형 메모" 라벨 + 힌트
- 검증: 남편 캐릭터 ep20_c001 재생성 → v3(외형 없음) vs v4(안경 명세) 비교, 안경 유지 확인

### P5 ref_key 버그 수정 — 완료 (2026-08-31)
- 근본 원인: 바이블 생성 시 characters에 ref_key 필드 없음 → char_{i} 폴백 → 대본은 임의 키 → 100% 불일치 → 참조 이미지 0건
- 수정: (1) BIBLE_SYSTEM_INSTRUCTION에 ref_key 필드 추가 (2) `_ensure_ref_keys()` 후방 호환 (3) 스크립트 프롬프트 강화
- 검증: 테스트 시리즈 4화 생성 → 바이블 ref_key 4개 정상 → 1화 대본 character_id 3/3 일치, 불일치 0건

### 게이트5 콘티 인라인 수정 — 완료 (2026-08-27)
- Gate5 컷 카드에 [콘티] 버튼 → 모달 (샷 타입/등장 캐릭터/지문)
- 저장만 (PUT /cuts/{id}) + 저장 후 재생성 (PUT → POST regenerate)
- 백엔드 수정 없음 — 기존 Gate4 API 재사용
- 검증: ep13 #1 지문 수정 → v2→v3 재생성 → Gate4 화면 반영 확인

## 연작 골격 P1~P6 완성 (2026-08-27)

### P6 — 완료 (2026-08-27, 실전 테스트 통과)

**검증 8/8 PASS + 사용자 실전 테스트 통과:**
- revise 왕복 (요약 수정 → 대본 반영), advice 배너, 이미지 잠금 (409 3종)
- 대본 병합 (ep 재사용 + soft-delete + 대본 재생성 + 캐릭터 보존)
- split 방어, 상태 뱃지 4종, 시리즈 카드 image_count, 회귀 OK

**구현 완료:**
- `POST /series/{sid}/outline/{no}/revise` — 요약·훅 수정 → 대본 재생성 (이미지 409)
- merge 확장: 대본 회차 병합 시 front ep 재사용 + back ep 소프트삭제 + 대본 재생성
- `has_images` 집계: `cuts.image_url IS NOT NULL` 기반, outline 응답 포함
- 3단계 잠금: outline=자유, script=revise만, image=완전잠금
- 상태 뱃지 4종 (아웃라인/대본/이미지/생성중) + Lock 아이콘/툴팁
- advice 배너: revise 후 다음 회차 갱신 권장
- series card `image_count` 집계

### P5 — 완료 (2026-08-27, 실전 테스트 통과)

**검증 9/9 PASS + 사용자 실전 테스트 통과:**
- 대본 생성, 훅 반영 (씬4 "앞으로 우리 삶이..." 정확히 반영), Gate 1 스킵 흐름 모두 정상
- 스킵 배너 실발화 확인 (P3 이월 항목 종결)

**실사용 요구 1건 → P6 이월:**
- 대본 생성 후 아웃라인 수정 경로 부재 → P6 1순위 [수정 후 재생성]

**구현 완료:**
- `POST /series/{sid}/episodes/{no}/generate` — 에피소드 생성 + Gate 1 자동 승인 + 대본 생성(Job)
- 바이블→기획 파생 (`_derive_planning_from_bible`)
- 직전 회차 캐릭터 자동 연결 (`_auto_link_characters`)
- 연작 컨텍스트 프롬프트 주입 (`prompt_fragments.py`)
- outline status 추적 (script_generating → script_done/script_failed)
- merge/split/PUT episode_id 방어 (409)
- list_series에 script_done/image_done 집계
- SeriesPage: 대본 생성/완료/잠금 + 비동기 진행 표시
- WorkflowPage: 시리즈 복귀 + Gate1 파생 읽기전용

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
