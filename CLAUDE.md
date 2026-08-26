# Project T — AI 웹툰 생성 서비스

> 아이디어를 입력하면 캐릭터·장소·스타일이 일관되게 유지되는 웹툰을 자동 생성하는 서비스

## 프로젝트 구조

```
WEBTOON/
├── backend/           # FastAPI 모듈러 모놀리스 (Python)
│   ├── app/
│   │   ├── adapters/      # Gemini API 어댑터 (텍스트·이미지)
│   │   ├── auth/          # OAuth + JWT 인증
│   │   ├── billing/       # 과금 (구독 + 크레딧)
│   │   ├── characters/    # 캐릭터 시트 관리
│   │   ├── composition/   # 말풍선/대사 조판 엔진 (Pillow)
│   │   ├── export/        # 내보내기 (PNG/세로/인스타)
│   │   ├── images/        # 컷 이미지 생성 엔진 (핵심)
│   │   ├── locations/     # 장소 레퍼런스 관리
│   │   ├── projects/      # 프로젝트/에피소드 CRUD
│   │   ├── prompts/       # 프롬프트 엔진
│   │   ├── script/        # 대본 생성 (게이트 2)
│   │   ├── story/         # 기획 생성 (게이트 1)
│   │   ├── series/        # 시리즈(연작) CRUD (P2 신설)
│   │   ├── storyboard/    # 콘티 (게이트 4)
│   │   ├── styles/        # 스타일 프리셋
│   │   ├── workflow/      # 게이트 상태 + 무효화 전파
│   │   ├── config.py      # 환경설정 (pydantic-settings)
│   │   ├── database.py    # SQLAlchemy 엔진/세션
│   │   ├── jobs.py        # 비동기 Job 관리 (인메모리)
│   │   ├── storage.py     # 파일 저장 (S3 → 로컬 폴백)
│   │   └── main.py        # FastAPI 앱 + 라우터 등록 + SPA 서빙
│   ├── frontend/dist/     # 빌드된 프론트엔드 (서버에서 서빙)
│   ├── init_db.sql ~ step11.sql # DB 마이그레이션 스크립트 (+ stepN_down.sql 롤백)
│   └── requirements.txt
├── frontend/          # React 19 + Vite + Tailwind CSS
│   └── src/
│       ├── api/client.js          # Axios + JWT + Job 폴링
│       ├── contexts/AuthContext   # 인증 컨텍스트
│       ├── components/            # Layout, GateProgress, JobProgress, CutEditor, BubbleOverlay, SfxLayer
│       │   └── gates/             # Gate1~5 컴포넌트
│       └── pages/                 # Login, Dashboard, Project, Workflow
└── docs/              # 설계 문서 7종 (PRD, API-Spec, Data-Model 등)
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| 백엔드 | Python + FastAPI, SQLAlchemy ORM |
| DB | MariaDB (Lightsail 인스턴스 내 로컬) |
| 이미지 생성 | Gemini 2.5 Flash Image API (레퍼런스 주입) |
| 텍스트 생성 | Gemini 2.5 Flash API |
| 프론트엔드 | React 19 + Vite + Tailwind CSS 4 (코믹북 디자인 시스템) |
| 파일 저장 | 로컬 FS 폴백 (`/home/bitnami/project-t/storage/`) |
| 인증 | OAuth (Google/Kakao/Naver) + JWT (HS256) |
| 비동기 작업 | FastAPI BackgroundTasks + 인메모리 Job 스토어 |
| 인프라 | AWS Lightsail (52.79.94.122) + S3 |

## 서버 접속 정보

- **도메인:** `ssagda.com` (공용 서버, 여러 프로젝트가 서브 경로로 배포)
- **서비스 URL:** `https://ssagda.com/WEBTOON`
- **API 문서:** `https://ssagda.com/WEBTOON/docs`
- **SSH:** `bitnami@52.79.94.122` (키: `DONGHAESSHKE.pem`)
- **DB:** MariaDB, 비밀번호는 `AWS.txt` 참조
- **배포 경로:** `/home/bitnami/project-t/`
- **웹서버:** Apache 2.4 (Bitnami), HTTPS + Let's Encrypt
- **리버스 프록시:** Apache `/WEBTOON/` → `localhost:8000/` (설정: `/opt/bitnami/apache/conf/bitnami/bitnami-ssl.conf`)

## 핵심 아키텍처 — 5게이트 파이프라인

```
아이디어 → [게이트1 기획] → [게이트2 대본] → [게이트3 자산] → [게이트4 콘티] → [게이트5 이미지]
                                                 ↑ 불변 자산 확정       ↑ 비용 경계     ↑ 레퍼런스 주입
```

- **해자:** 여러 컷에 걸친 캐릭터·장소·스타일 일관성 파이프라인
- **레퍼런스 주입:** 캐릭터 시트(정면) + 장소 레퍼런스 이미지를 매 컷 생성 시 Gemini에 함께 전달
- **무효화 전파:** 대본 수정 → diff 판정 → 영향 자산/컷만 invalidated (이미지는 유지, stale 표시)
- **과금:** 구독 할당량 우선 → 초과분 크레딧 차감 (게이트4 승인 시 강제 정지)

## 완료된 작업 (7단계 백엔드 + 프론트엔드)

### 백엔드 — 전체 완료

| 단계 | 내용 | 상태 |
|---|---|---|
| 1단계 | 프로젝트 골격 + OAuth/JWT 인증 | ✅ 완료 |
| 2단계 | 프로젝트/에피소드 CRUD + 게이트 초기화 | ✅ 완료 |
| 3단계 | 게이트 1·2 (기획→대본) + Gemini 텍스트 API | ✅ 완료 |
| 4단계 | 캐릭터 시트/장소 레퍼런스/스타일 프리셋 + 이미지 어댑터 | ✅ 완료 |
| 5단계 | 콘티 + 이미지 생성 + 부분 재생성 + 되돌리기 | ✅ 완료 |
| 6단계 | Export (PNG/세로/인스타) + 과금 시스템 | ✅ 완료 |
| 7단계 | 무효화 전파 (diff 판정 + cut_asset_refs 기반 정밀 무효화) | ✅ 완료 |

### 프론트엔드 — MVP 완료

| 화면 | 경로 | 상태 |
|---|---|---|
| 로그인 | `/login` | ✅ JWT 직접 입력 |
| 대시보드 | `/` | ✅ 프로젝트 CRUD |
| 프로젝트 상세 | `/projects/:id` | ✅ 에피소드 목록 |
| 워크플로우 | `/projects/:id/episodes/:id/workflow` | ✅ 5게이트 전체 |
| 게이트 1 기획 | 워크플로우 내 | ✅ 아이디어→기획 생성→**인라인 수정**→승인 |
| 게이트 2 대본 | 워크플로우 내 | ✅ 대본 생성→씬/컷 뷰→승인→**무효화 감지/재생성/이전 대본 모달** |
| 게이트 3 자산 | 워크플로우 내 | ✅ 캐릭터/장소/스타일 생성→**이미지 미리보기**→승인→**캐릭터 조건 편집(7개 필드)**→**장소 AI 제안·편집(mood_notes)** |
| 게이트 4 콘티 | 워크플로우 내 | ✅ 콘티 생성→**컷 수 조정(권장 범위/하한·상한 강제)**→**컷별 편집**→비용 경고→승인 |
| 게이트 5 이미지 | 워크플로우 내 | ✅ 이미지 그리드/재생성/되돌리기/Export/**컷 편집화면(말풍선·효과음 드래그 편집)** |

### 배포 인프라 구성 (2026-08-03)

- **Apache 리버스 프록시:** `/WEBTOON/` → `localhost:8000/` 매핑 (SSL VirtualHost 내 설정)
- **FastAPI root_path:** `root_path="/WEBTOON"` 설정으로 서브 경로 대응
- **프론트엔드 base path:** Vite `base: '/WEBTOON/'`, React Router `basename="/WEBTOON"`
- **API client:** baseURL을 `/WEBTOON/api/v1`로 설정
- **정적 파일 서빙:** `app.mount()` 제거 → SPA fallback 핸들러에서 storage/assets/frontend 파일 통합 서빙 (mount와 catch-all 라우트 충돌 해결)

### 프론트엔드 디자인 시스템 (2026-08-03)

- **코믹북 비비드 디자인** 전체 적용 (Antigravity 작업 + Claude Code 배포)
- **디자인 토큰:** `index.css` `@theme` 블록에 정의 — `comic-orange(#FF5722)`, `comic-blue(#2563EB)`, `ink-black(#121212)`, `border(#dfe4dc)`
- **폰트:** Pretendard(본문) + Playfair Display(제목/브랜드, `font-serif`)
- **다크모드:** 전 컴포넌트 `dark:` 변형 지원
- **버튼:** `rounded-full font-bold hover:-translate-y-0.5 shadow-sm`
- **카드:** `border-2 border-border rounded-2xl backdrop-blur-sm`
- **디자인 가이드:** `frontend/DESIGN_MIGRATION_GUIDE.md` 참조

### 온보딩 UI (2026-08-03)

- **ProjectPage 빈 상태:** 5게이트 파이프라인 시각 가이드 + 예시 아이디어 3개 + CTA 버튼

### 버그 수정 및 기능 개선 (2026-08-03)

- **에피소드 생성 버튼 무반응 수정:** `ProjectPage.jsx`의 `handleCreateEpisode`가 `{ title }` 전송 → 백엔드 스키마 `{ episode_no, idea }` 불일치로 422 에러 무반응. 스키마 맞춤 + try-catch 에러 핸들링 추가. 예시 아이디어 클릭 시 idea 텍스트도 전달되도록 수정.
- **게이트1 기획 수정 기능 추가:** `Gate1Planning.jsx`에 인라인 편집 UI 추가 (제목/로그라인/시놉시스/등장인물). 백엔드 `PUT /planning` API 활용. 수정/저장/취소 버튼 포함.

### 게이트3 자산 리비전 — Bundle A (2026-08-04)

설계 문서: `docs/Gate3-Asset-Revision-v1.0.md`

- **스타일 선택 UI 순서 변경:** Gate3에서 스타일을 최상단에 배치, 스타일 미선택 시 캐릭터/장소 생성 버튼 비활성화
- **스타일 프리셋 확장:** 12개 → 15개 (emotional_romance, marvel, western_fantasy 추가). core(3) / beta(12) 그룹 분리 + 아코디언 UI
- **스타일 실제 적용 버그 수정:** `characters/router.py`, `locations/router.py`에서 하드코딩된 style_prompt → Style 테이블 조회로 변경
- **캐릭터/장소 이미지 미리보기:** 목록 API 후 상세 API 병렬 호출로 이미지 로드. 썸네일 + 라이트박스 모달
- **이미지 캐시 버스팅:** 재생성 시 동일 파일명 덮어쓰기 → `?v=${Date.now()}` 쿼리로 브라우저 캐시 무효화
- **BackgroundTask DB 세션 수정:** `characters/service.py`, `locations/service.py`에서 `SessionLocal()` 자체 세션 생성 + 기존 이미지 레코드 삭제 후 재생성

### 게이트4 콘티 UI 개선 (2026-08-04)

- **컷 카드 상세화:** `Gate4Storyboard.jsx` — 장소, 캐릭터(감정/포즈 태그), 액션 텍스트, 대사(타입별 라벨) 표시
- **API 응답 확장:** `storyboard/router.py` GET /cuts — `composed_image_url`, `action`, `dialogue`, `location_id`, `emphasis` 필드 추가, characters를 `{character_id, emotion, pose}` 객체 배열로 변경

### 말풍선/대사 자동 조판 — Bundle A (2026-08-04)

설계 문서: `docs/Gate4-5-Speech-Product-Revision-v1.0.md`

- **DB 마이그레이션:** `step7.sql` — cuts 테이블에 `composed_image_url` 컬럼 추가
- **조판 엔진 신규:** `app/composition/service.py` — Pillow 기반 말풍선 합성
  - speech: 흰색 둥근 사각형 + 삼각형 꼬리 (상단 배치)
  - thought: 구름형 둥근 사각형 + 점 꼬리 (상단 배치)
  - narration: 반투명 검정 사각형 (하단 배치)
  - 한글 줄바꿈 (글자 단위), 자동 크기 조절, NanumSquareRoundB 폰트
- **이미지 생성 후 자동 조판:** `images/service.py` — generate_cut_image() 완료 후 compose_cut() 호출 → composed_image_url 저장
- **대사 편집 API:** `PUT /cuts/{cut_id}/dialogue` — 대사만 수정 → 재조판 (이미지 재생성 없음, 과금 없음)
- **Export 연동:** `export/service.py` — composed_image_url 우선 사용 (`_get_best_image_url()`)
- **Gate5 프론트엔드:** `Gate5Review.jsx` — composed 이미지 우선 표시, "말풍선" 배지, 대사 편집 모달 (타입별 라벨, textarea, 저장 시 재조판)

### 컷 수 관리 리비전 (2026-08-05)

설계 문서: `docs/Cut-Count-Management-Revision-v1.0.md`

**Part A — 게이트 2 대본 컷 수 자동 조절:**
- **고정 상한(8~15컷) 제거:** `script/service.py` SYSTEM_INSTRUCTION에서 "1화 분량 8~15컷" 제한 삭제
- **이야기 완결성 우선:** "시놉시스의 모든 주요 장면을 빠짐없이 대본화, 결말까지 반드시 포함" 지시로 교체
- **느슨한 가드레일:** 최소 6컷 ~ 최대 40컷 범위 (극단만 방지)
- **프롬프트 강화:** 시놉시스 분석 → 주요 사건 파악 → 클라이맥스/결말 포함 지시 추가
- **max_output_tokens:** 8192 → 16384 확대

**Part B — 게이트 4 컷 수 조정:**
- **권장 컷 수 API:** `GET /storyboard/recommend` — 대본 분석 후 권장 범위(±20%) + 최소값 반환
- **컷 수 재분할:** `POST /storyboard` — `target_cut_count` 파라미터로 AI 재분할 지원
- **하한·상한 강제:** 최소(씬×2) 미만 또는 권장 상한 초과 시 400 에러 + 안내 메시지
- **컷별 편집 UI:** `Gate4Storyboard.jsx` — 각 컷 카드에 편집 버튼, 모달에서 샷 타입/액션/대사 편집 (`PUT /cuts/{cut_id}` 연결)
- **무효화 상태 감지:** Gate4에서도 invalidated 상태 시 경고 표시

### 게이트 2 무효화 감지 + 재생성 UI (2026-08-05)

- **무효화 상태 감지:** `Gate2Script.jsx` — `gateStatus.gates['2_script'].status === 'invalidated'` 체크
- **재생성 경고:** 주황색 배너 "기획이 수정되어 대본을 다시 생성해야 합니다" + "대본 재생성" 버튼
- **이전 대본 참고:** 재생성 전에는 이전 대본을 50% 투명도로 표시, 재생성 후에는 모달로 확인 가능
- **재생성 후 UX:** 초록색 "대본이 재생성되었습니다" 안내 + "이전 대본 보기" 버튼 + 승인 버튼 활성화
- **approve_gate 버그 수정:** `workflow/gate.py` — 게이트 승인 시 다음 게이트가 `invalidated`면 상태 유지 (기존: 무조건 `draft`로 덮어씌움)

### 에러 안내 UX 개선 (2026-08-05)

- **Gemini API 일시 오류 안내:** Gate2, Gate4에서 생성 실패 시 "일시적인 오류일 수 있습니다. 잠시 후 다시 시도해주세요" 메시지 추가

### 게이트5 이미지 생성 안정화 (2026-08-06)

설계 문서: `docs/Gate5-Image-Generation-Stabilization-v1.0.md`

- **배치 처리 (5컷씩):** `images/service.py` `generate_all_cuts()` — 전체 컷을 `BATCH_SIZE=5` 단위로 순차 생성, 배치마다 DB 커밋 + 진행률 갱신
- **Job 상태 확장:** `jobs.py` — `completed_partial` 상태 + `failed` 리스트(실패 cut_id 목록) 추가
- **연속 실패 조기 종료:** 연속 5회 실패 시 나머지 건너뛰고 `completed_partial` 처리
- **폴링 안전장치:** `api/client.js` `pollJob()` — 네트워크 에러 재시도(최대 5회), 최대 폴링 1800회(≈60분), 요청별 timeout 10초
- **Gemini API 타임아웃:** `gemini_image.py` — `httpOptions=types.HttpOptions(timeout=120_000)` (밀리초 단위, 120초)
- **httpx 타임아웃:** `images/service.py` `_load_image_bytes()` — `httpx.get(url, timeout=30.0)`
- **부분 실패 UI:** `Gate5Review.jsx` — `completed_partial` 시 실패 컷 수 안내 + 개별 재시도 안내
- **에러 메시지 한국어화:** "Network Error" → "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
- **백그라운드 에러 로깅:** `jobs.py` `run_job_async()` — `logger.error()` 추가로 백그라운드 태스크 에러가 `server.log`에 기록됨

### 캐릭터 일관성 강화 — Part A (2026-08-06)

설계 문서: `docs/Character-Consistency-Korean-Text-Revision-v1.0.md`

- **A-1 이미지-캐릭터 매핑:** `gemini_image.py` — 레퍼런스 이미지 앞에 `"Reference Image 1: Character 'jun_kim' (김준) - front reference sheet"` 라벨 삽입. `reference_labels` 파라미터 추가
- **A-2 강한 앵커링 지시:** `prompts/service.py` — 프롬프트 최상단에 영어 CRITICAL 지시 추가 ("MUST exactly match the provided reference images. Replicate facial features, hairstyle, hair color, age, body type precisely. NEVER alter facial identity.")
- **A-3 프롬프트 순서 재조정:** `prompts/service.py` — 캐릭터 앵커링(최우선) → 캐릭터 표정/포즈 → 장소/액션 → 스타일 → 샷/강조. 스타일 지시에 "Apply to coloring/rendering only, preserve character facial identity from references" 제한 추가
- **A-4 다인 컷 자동 처리:** 여러 캐릭터 등장 시 각각의 레퍼런스 + 라벨이 자동 매핑 (`Image 1 = jun_kim, Image 2 = jeongsin_kim`)
- **레퍼런스 라벨 전달:** `images/service.py` `_get_character_references()` — 3-tuple 반환 `(ref_images, ref_labels, char_descs)`, 장소 레퍼런스에도 라벨 추가

### 게이트5 이미지 라이트박스 미리보기 (2026-08-06)

- **확대 미리보기:** `Gate5Review.jsx` — 컷 이미지 호버 시 돋보기(ZoomIn) 오버레이, 클릭 시 전체화면 라이트박스 모달
- **좌우 네비게이션:** 좌/우 화살표 버튼 + 키보드 ArrowLeft/ArrowRight로 이전/다음 컷 이동, ESC로 닫기
- **컷 정보 표시:** 모달 상단에 컷 번호/총 수, 하단에 샷 타입·캐릭터명·말풍선 여부

### 게이트4→5 자동 이미지 생성 + 이미지 생성 안정화 (2026-08-10)

- **게이트4 승인 → 게이트5 자동 생성:** `Gate5Review.jsx` — 마운트 시 이미지가 없는 컷만 있으면 자동으로 `handleGenerateAll()` 호출. `useRef` 플래그로 중복 실행 방지. 기존 수동 "N컷 생성" 버튼은 부분 실패 재시도용으로 유지
- **`regenerating` 상태 컷 처리:** `images/router.py`, `images/service.py` — 생성 대상에 `regenerating` 상태도 포함 (이전 실패로 상태가 멈춘 컷 재처리)
- **배치 생성 rollback 안전성:** `images/service.py` `generate_all_cuts()` — cut_id 목록을 먼저 수집 후 매 컷마다 DB에서 fresh 로드. rollback 후 객체 참조 깨짐 방지
- **`db.expire_all()` 제거:** `generate_cut_image()` 내 `cut_asset_refs` 재작성 전 호출되던 `db.expire_all()`이 `cut.image_url`, `cut.status` 등 변경사항을 전부 expired시켜 커밋 시 유실 → 제거로 해결 (이미지 생성 성공인데 DB 미반영되던 근본 원인)
- **`cut_asset_refs` raw SQL 전환:** ORM `db.query().delete()`가 MariaDB 시스템 버전 테이블에서 `(1020)` 에러 → `db.execute(text("DELETE FROM cut_asset_refs WHERE cut_id = :cid"))`로 변경

### 한국어 텍스트 억제 + 말풍선 12종 SVG 시스템 (2026-08-11)

설계 문서: `docs/Korean-Text-Speech-Bubble-System-v1.0.md`

**A파트 — 그림 속 텍스트 억제:**
- **게이트5 컷:** `prompts/service.py` 웹툰 기본 지시에 "DO NOT render any text, letters, words, or speech bubbles in the image. No Korean text, no English text, no signs, no captions." 추가
- **게이트3 캐릭터 시트:** `adapters/gemini_image.py` `generate_character_sheet()` 프롬프트 3종(정면/smile/angry) 모두에 동일 텍스트 금지 지시 추가
- **캐릭터 description 단축:** `images/service.py` 컷 생성 시 `char_descs`에 이름만 사용 (긴 설명 제거로 텍스트 렌더링 트리거 방지)

**B파트 — 말풍선 12종 SVG + 자동 매핑:**
- **백엔드 매핑 모듈:** `composition/bubble_mapping.py` (신규) — `resolve_bubble_style(dialogue_item, cut_spec)` 함수. 감정→스타일 매핑 딕셔너리 (`EMOTION_TO_BUBBLE`). `bubble_style` 필드 non-null이면 사용자 지정 우선
- **백엔드 조판 엔진 확장:** `composition/service.py` — 12종 Pillow 그리기 함수 추가 (round/narration/thought/whisper/shout/angry/happy/sad/surprised/shy/flustered/realize). `BUBBLE_RENDERERS` 딕셔너리 디스패치. `compose_dialogue_on_image(base_image, dialogue, cut_spec=None)` 시그니처 변경
- **프론트엔드 유틸:** `utils/bubbleMapping.js` (신규) — JS판 `resolveBubbleStyle()` + `EMOTION_TO_BUBBLE` 매핑
- **프론트엔드 SVG 컴포넌트:** `components/BubbleOverlay.jsx` (신규) — 12종 말풍선을 코드로 그리는 SVG 오버레이. `BUBBLE_CONFIGS`(fill/stroke/textColor/shape/tail/icon/position), `SingleBubble`, `BubbleOverlay`, `BubbleMiniIcon` export
- **나레이션 자막 처리:** `isCaption: true` — 하단 전폭 반투명 rect, 말풍선 없음, 팔레트 미표시
- **Gate5 SVG 오버레이 연결:** `Gate5Review.jsx` — `CutImageWithBubbles` 컴포넌트로 raw 이미지 위에 SVG 말풍선 오버레이. `getCutImageUrl()`이 `image_url`(raw) 반환으로 변경

**B-3 — 아이콘 팔레트 (수동 말풍선 교체):**
- 대사 편집 모달에서 각 대사 항목마다 말풍선 아이콘 버튼 + 12종 팔레트 드롭다운
- 나레이션 항목은 "자막" 라벨만 표시 (팔레트 없음)
- `updateDialogueBubbleStyle(index, styleKey)` 핸들러 — `dialogue[i].bubble_style` 필드 업데이트

**컷 UI 개선:**
- **액션 버튼 항상 표시:** 재생성/되돌리기/대사 버튼이 hover 없이 카드 하단에 항상 보임
- **한글 라벨:** 샷 타입(long→롱샷/full→풀샷 등), 캐릭터명(charNameMap으로 ref_key→한글명 변환)

### 게이트3 자산 리비전 — Bundle B (캐릭터 조건) (2026-08-11)

설계 문서: `docs/Gate3-Asset-Revision-v1.0.md` 수정 1·6(캐릭터분)

- **DB 마이그레이션:** `step8.sql` — `characters` 테이블에 7개 컬럼 추가 (gender/age_group/hair_style/hair_color/body_type/mood/detail_notes)
- **모델 업데이트:** `characters/models.py` — 7개 필드 추가
- **description 자동 조립:** `characters/service.py` `build_character_description()` — 구조화 필드 → 단일 description 문자열 조합
- **조건 수정 API:** `characters/router.py` `PUT /characters/{id}` — 7개 조건 필드 업데이트 후 description 자동 재조립
- **GET 응답 확장:** `GET /characters/{id}` — 7개 조건 필드 포함 반환
- **프론트엔드 편집 UI:** `Gate3Assets.jsx` — 각 캐릭터 카드에 [캐릭터 편집] 버튼. 클릭 시 인라인 폼 (드롭다운 6개 + detail_notes textarea). "조건 저장" / "조건 저장 + 재생성" / "취소" 버튼
- **Placeholder:** `detail_notes` → `"예: 은테 안경, 왼쪽 눈 밑 점, 항상 후드티"`

### 게이트3 자산 리비전 — Bundle C (장소 AI 제안·편집) (2026-08-11)

설계 문서: `docs/Gate3-Asset-Revision-v1.0.md` 수정 4·6(장소분)·7

- **DB 마이그레이션:** `step9.sql` — `locations` 테이블에 `mood_notes TEXT` 컬럼 추가
- **모델 업데이트:** `locations/models.py` — `mood_notes` 필드 추가
- **mood_notes 프롬프트 반영:** `locations/service.py` — `"Atmosphere: {mood_notes}"` 형식으로 장소 생성 프롬프트에 포함, DB 저장
- **장소 제안 API:** `GET /projects/{id}/episodes/{id}/locations/suggest` — 대본에서 장소 목록 추출 반환 (동기, 무료)
- **장소 생성 API 확장:** `POST .../locations` — 요청 바디 `{locations: [...]}` 수신 시 해당 목록으로 생성. 없으면 대본에서 추출 (하위 호환)
- **장소 수정 API:** `PUT /locations/{id}` — mood_notes 수정. **수정 7:** 이미지 있는 장소의 이름 변경 시 400 + `"장소를 다른 곳으로 바꾸려면 대본에서 수정해주세요"` 안내
- **개별 재생성 API:** `POST /locations/{id}/regenerate` — 장소 1개 재생성 (mood_notes 반영)
- **프론트엔드 2단계 UI:** `Gate3Assets.jsx`
  - 이미지 없을 때: "AI 장소 제안 받기" CTA → 제안 편집기 (장소 이름/분위기 서술 입력, 추가/삭제 가능) → "레퍼런스 이미지 생성" 실행
  - 이미지 있을 때: 카드에 분위기 서술 textarea + "분위기 저장" + "재생성" 버튼. "다시 제안받기" 버튼으로 편집기 재오픈
- **Placeholder:** `mood_notes` → `"예: 따뜻한 오후 햇살이 드는, 아늑한 분위기"`
- **수정 7 구현 방식:** UI에서 이름 수정 칸 미제공(UI 없음 차단) + API 레벨 안전망. 향후 이름 옆 "변경하려면 대본에서 수정" 힌트 추가 예정

### 게이트2 대본 편집 UI (2026-08-12)

설계 문서: `docs/Gate-Navigation-Rollback-Revision-v1.0.md`

- **컷별 편집 버튼:** `Gate2Script.jsx` — 대본으로 되돌아간 후 각 컷 카드에 [편집] 버튼 표시 (readOnly=false일 때만)
- **컷 편집 모달:** 샷 타입 선택(롱샷/풀샷/버스트/클로즈업), 액션 textarea, 대사 목록(타입/화자/텍스트, 추가/삭제)
- **저장:** `PUT /projects/{pid}/episodes/{eid}/script` — 전체 script JSON 전송, 무효화 diff 실행
- **저장 후 갱신:** `onRefresh()` 호출로 게이트 상태 최신화

### 컷 편집화면(CutEditor) 신규 구현 (2026-08-12)

설계 문서: `docs/Cut-Editor-Speech-Bubble-v1.0.md`

**컴포넌트 구조:**
- **`CutEditor.jsx`** (신규) — 전체화면 편집기. 보기/편집 모드 분리
- **`SfxLayer.jsx`** (신규) — 효과음 SVG 읽기 전용 오버레이
- **`Gate5Review.jsx`** — 라이트박스 → CutEditor로 교체. 컷 이미지 호버 시 "[컷 편집]" 버튼

**말풍선 편집 기능 (bubble_layout):**
- **드래그 이동:** 마우스/터치, 5px 임계값으로 클릭/드래그 구분
- **꼬리 방향:** ↓↑←→× 5방향 + ↔ 좌우 반전(`tail_flip`)
- **너비 슬라이더:** 15~92% 실시간 조정
- **최소 높이 슬라이더:** `min_height` (0~50%). 텍스트 따라 자동 확장, 하드 고정 금지
- **종류 팔레트:** 12종 (기본/감정 분류)
- **글자 크기:** 작게/보통/크게 버튼 (`font_scale`)
- **텍스트:** textarea 직접 수정
- **저장:** `PUT /cuts/{cut_id}/dialogue` — bubble_layout 포함, 이미지 재생성 없음

**bubble_layout 스키마 (cuts.spec.dialogue[].bubble_layout):**
```json
{
  "x": 0.30, "y": 0.10, "width": 0.45, "min_height": 0.0,
  "tail_direction": "down", "tail_flip": false, "font_scale": 1.0
}
```

**효과음(SFX) 편집 기능 (sfx_layout):**
- **추가:** 상단 "[⚡ 효과음 추가]" 버튼 → 컷 위에 "쾅!" 생성
- **드래그 이동 + 회전 핸들:** ↻ 원형 핸들 드래그로 자유 회전
- **글자 크기:** 소/중/대/특대 버튼
- **색상 프리셋:** 검정·빨강·파랑·노랑·흰색 (흰색 선택 시 아웃라인 자동 검정)
- **텍스트:** input 직접 수정 / 삭제 버튼
- **저장:** `sfx_items` 필드로 백엔드 저장 (`PUT /cuts/{cut_id}/dialogue` 확장)

**sfx_layout 스키마 (cuts.spec.sfx_items[]):**
```json
{
  "id": "sfx_1749123456", "text": "쾅!",
  "sfx_layout": { "x": 0.3, "y": 0.4, "font_scale": 1.5, "rotation": -15, "color": "#1a1a1a" }
}
```

### 말풍선 SVG 시스템 개편 (2026-08-12)

**`BubbleOverlay.jsx` 주요 변경:**
- **`tailDirection` prop:** `SingleBubble`에 up/down/left/right/none 방향 지원 추가
- **`flipTail` prop:** 꼬리 좌우 반전. `OvalBubble`/`TailElements` 모두 지원
- **`fontScale` prop:** 글자 크기 배율
- **`bubbleH` prop (최소 높이):** `needH = max(computedH, bubbleH)` — 텍스트 기반 높이 자동 확장, 잘림 없음
- **`bubble_layout` 지원:** BubbleOverlay auto-layout 경로에서 `bubble_layout`이 있으면 사용자 좌표 우선 사용
- **`min_height` 지원:** `(item.bubble_layout.min_height || 0) * height`로 최소 높이 픽셀 계산

**`round`/`happy` → 타원(isOval) 변경: (⚠️ 2026-08-14 복원 시 되돌림)**
- `isOval: true` 추가 → 화면 깨짐 유발 → 제거, 원래 radius 기반 rounded rect로 복원

**텍스트 잘림 버그 수정: (⚠️ 2026-08-14 복원 시 되돌림)**
- 글자 너비 계수 `0.55` → `0.72` 변경 → 5~6글자 강제 줄바꿈 유발 → `0.55`로 복원
- ⚠️ **교훈:** `charWidth`는 `0.55` 유지. bubbleSpec.json의 `0.72` 사용 금지

### 말풍선 레이아웃 공유 스펙 (bubble_spec.json) (2026-08-12)

- **`frontend/src/utils/bubbleSpec.json`** (신규) — 프론트 공유 설정
- **`backend/app/composition/bubble_spec.json`** (신규) — 백엔드 공유 설정 (동일 내용 유지)
- **스타일별 내부 여백:** `paddingX`/`paddingY`가 스타일에 따라 다름 (spiky 계열은 더 큰 여백)
  - round/happy: paddingX=16, paddingY=14
  - shout: paddingX=26, paddingY=22 (스파이크 침범 보정)
  - angry: paddingX=28, paddingY=24
  - surprised: paddingX=24, paddingY=20
- **앞으로:** 렌더러 수정 시 두 파일을 동시 업데이트할 것

### composition/service.py 전면 개편 (2026-08-12)

- **12종 렌더러 색상 중앙화:** `STYLE_FILL`, `STYLE_STROKE`, `TEXT_COLORS` 딕셔너리로 통합
- **oval 스타일 (round/happy):** Pillow `draw.ellipse()` + `_draw_oval_tail()` — 프론트 SVG와 형태 일치
- **`_render_bubble_item()` 개선:** `tail_flip`, `font_scale`, `min_height_px` 모두 `bubble_layout`에서 읽어 반영
- **`_draw_directional_tail()` 신규:** 방향별 꼬리 + 좌우 반전 지원
- **spec 기반 padding:** 스타일별 `paddingX`/`paddingY`를 `bubble_spec.json`에서 로드
- **`RENDERER_VERSION = "v2-oval-2026-08"`** 상수 — Export stale 판정에 사용

### Export 개선 (2026-08-12)

- **다운로드 버그 수정:** `Gate5Review.jsx` `handleExport` — `result?.download_url` → `result?.result?.download_url` (스키마 불일치 수정)
- **렌더러 버전 추적:** `step10.sql` — `cuts.composed_renderer_version`, `composed_at` 컬럼 추가
- **stale 판정 + 조건부 재조판:** `export/service.py` `_is_stale()` + `_ensure_composed()` — `composed_renderer_version != RENDERER_VERSION`인 컷만 재조판, 나머지는 즉시 실행
- **렌더러 업데이트 정책:** 말풍선 렌더러 변경 시 `RENDERER_VERSION` 상수만 올리면 다음 Export 때 전체 자동 재조판
- **cut_005 세로 Export 수정:** `export_vertical_single` — x 중앙 정렬 (`x_offset = (target_width - img.width) // 2`), RGBA→RGB 변환 추가
- **DB 마이그레이션:** `step10.sql` 실행 완료 (2026-08-12)
- **ep13 1회성 재조판:** 12컷 전부 `v2-oval-2026-08` 버전으로 갱신 완료

### Pretendard 폰트 CDN 수정 + BubbleOverlay 복원 (2026-08-14)

**Pretendard 폰트 CDN 404 수정:**
- **원인:** GitHub CDN URL `@v3.2.1` 태그 만료로 Pretendard-Black.woff2 등 404 에러
- **수정:** `utils/fontEmbed.js` — CDN URL을 npm 기반으로 변경: `https://cdn.jsdelivr.net/npm/pretendard/dist/web/static/woff2`
- **수정:** `index.css` — Pretendard import URL도 npm 기반으로 변경: `https://cdn.jsdelivr.net/npm/pretendard/dist/web/static/pretendard.css`

**BubbleOverlay.jsx 화면 깨짐 + 복원:**
- **증상:** 말풍선 크기 과대, 줄바꿈 과다(5~6글자), 12종 스타일이 모두 동일한 타원형, 일부 컷에 다른 컷 이미지 표시
- **근본 원인:** 이전 세션에서 `charWidth: 0.55 → 0.72`, `maxBubbleW: 0.78 → 0.60`, `paddingX/Y: bubbleSpec.json 값(16~28)`, `round/happy: isOval 추가`로 변경한 것이 화면을 깨뜨림
- **사고:** `git checkout c581116 -- BubbleOverlay.jsx Gate5Review.jsx` 실행 → 커밋이 1개뿐이라 12종 말풍선+CutEditor 연동 코드 전부 유실 (복구 불가)
- **대응:** `git add -A && git commit`으로 현재 상태 백업 후 BubbleOverlay.jsx 재작성 결정
- **git 안전 규칙 수립:** 테스트 통과마다 커밋, 구조 변경 전 커밋, 파괴적 git 명령 전 사용자 확인

**BubbleOverlay.jsx 1단계 복원 (커밋 f4b2b68):**
- **12종 BUBBLE_CONFIGS 복원:** round/narration/thought/whisper/shout/angry/happy/sad/surprised/shy/flustered/realize — 원래 스타일(isSpiky/isEllipse/radius) 유지, isOval 미사용
- **6개 export 복원:** `default(BubbleOverlay)`, `BUBBLE_CONFIGS`, `SingleBubble`, `BubbleMiniIcon`, `wrapText`, `computeSingleBubbleGeo`
- **하드코딩 상수 (bubbleSpec.json 미사용):** `CHAR_WIDTH=0.55`, `PADDING_X=14`, `PADDING_Y=10`, `BASE_FONT_SIZE=14`, `LINE_HEIGHT_RATIO=1.45`
- **SingleBubble props 확장:** `tailDirection`(up/down/left/right/none), `flipTail`, `fontScale`, `fixedWidth`, `bubbleH`(최소 높이)
- **TailElements 내부 컴포넌트:** 방향별 꼬리 렌더링 (삼각형/dots/small × 4방향)
- **computeSingleBubbleGeo:** CutEditor 편집 모드 선택 박스·히트 영역 계산용. 반환: `{ bx, by, needW, needH }`
- **bubble_layout 지원:** BubbleOverlay 메인 컴포넌트에서 `item.bubble_layout` 있으면 사용자 좌표 우선 사용
- **foreignObject 텍스트:** minHeight 적용 시 텍스트 세로 중앙 정렬

**Export 렌더러 유틸 분리:**
- **`utils/bubbleLayout.js`** (신규) — `computeInitialLayouts()` 함수를 CutEditor에서 분리. bubble_layout 없는 대사에 화자 기반 기본 좌표 할당
- **`utils/exportRenderer.js`** — `computeInitialLayouts` import 추가, BubbleOverlay에 dialogue 전달 전 초기 레이아웃 적용

**현재 상태 (2026-08-19 기준):**
- `Gate5Review.jsx` — CutEditor/SfxLayer 연동 완료. 프론트 Export import 추가됨 (배선 WIP)
- 프론트엔드 Export — `exportRenderer.js` import 완료, `handleExport` 함수 본체 교체 필요
- 백엔드 Export (`export/service.py`) — 아직 삭제하지 않음 (호출만 끊는 중)

### BubbleOverlay 말풍선 round+narration 리팩토링 (2026-08-14~16)

설계 문서: `docs/Bubble-Round-Narration-Fix-v2.0.md`

**A-1: 나레이션 바 각진 사각형 복구, 꼬리 제거 (커밋 11524cc)**
- 나레이션을 둥근모서리 사각형 → 각진 사각형(`<rect>`)으로 변경, 꼬리 제거

**A-2: round 타원 + 갈고리 꼬리 (커밋 8dbd02c)**
- round `isOval: true`, `<ellipse>` + `buildRoundTail()` 단일 path
- 꼬리: 낫형 갈고리 (바깥 직선 + 안쪽 Q 곡선), sweep-flag flip 대응
- `/bubble-test` 페이지 + `scripts/bubble-shot.mjs` Playwright 검증 추가

**B-1: 텍스트 렌더링 정규화 (커밋 bf4f5a2)**
- 나레이션 바 높이를 줄수에 비례하도록 수정
- `CHAR_WIDTH` 0.55→0.93 (Playwright 실측, Pretendard + letter-spacing 0.02em)
- `nowrap` + `overflow: visible` 줄단위 렌더 통일 (round/narration 동일 방식)

**B-2: round 타원 방정식 텍스트 맞춤 (커밋 a37e186)**
- `fixedWidth=true`: `ry = b / √(1 - (a/rx)²)` 역산 + `safeRatio = min(a/rx, 0.85)` 상한
- `fixedWidth=false`: `√2` 배율 자동 크기
- `REF_WIDTH=800` 스케일링: `scale = viewW/800` → fontSize, PADDING_X, PADDING_Y 비례 조정
- `scripts/episode-shot.mjs`: 실제 에피소드 모달 컷별 스크린샷 스크립트
- `BubbleTestPage`: fixedWidth=true 테스트 섹션 추가
- 미리보기 모달 기준 12/12컷 통과

**현재 상수 (BubbleOverlay.jsx):**
```
CHAR_WIDTH = 0.93, REF_WIDTH = 800, BASE_FONT_SIZE = 14
LINE_HEIGHT_RATIO = 1.45, BASE_PADDING_X = 14, BASE_PADDING_Y = 10
```

**검증 인프라:**
- `/bubble-test` 페이지: 방향4×flip2×줄수3 그리드 + fixedWidth=true 섹션 + 스타일 드롭다운
- `scripts/bubble-shot.mjs`: 테스트 페이지 스크린샷
- `scripts/episode-shot.mjs`: 실제 에피소드 모달 컷별 스크린샷 (JWT로 로그인 → Gate5 라이트박스 순회)
- 작업 방식: 코드 수정 → 스크린샷 셀프 검증 → 통과 시에만 보고

**8-2: flustered·shy 구현 (커밋 12abebf)**
- 고정 크기 낫형 꼬리 시스템: TAIL_BASE=18, TAIL_LEN=26 (viewW/REF_WIDTH 비례 스케일)
- flustered(당황), shy(수줌) 3종 꼬리 방향 적용

**8-3: whisper/thought/happy/sad/realize — 타원 통일 (커밋 7e0e38f 이전)**
- 구름 윤곽 접근 폐기 → 5종 모두 isOval (round와 동일 타원형)
- thought, whisper: strokeDash '6,4' 점선으로 구분
- 색·선 스타일만으로 감정 구분 (happy=노란, sad=파란, realize=초록 등)

**8-4: shout/angry/surprised — spiky 구현 (커밋 7c92ef9)**
- spikyPath: 교대 외곽/내곽 반경 타원 기반 돌기 생성
- isSpiky + innerRatio 기반 텍스트 크기 계산 (텍스트가 골 안쪽에 맞춤)
- shout: 돌기 13, innerRatio 0.80 — 통과
- angry: 돌기 15, innerRatio 0.72, i%3 변주 — 통과
- surprised: 돌기 8, innerRatio 0.78, roundedValleys(Q곡선) — WIP
- 꼬리: buildRoundTail을 innerR 타원에 부착, 본체가 위에 덮어 base 은폐
- 데드 코드 정리: buildTailA/B/C/D, lerpPt, pointOnEllipse, tailBaseAngle 등 삭제

**12종 완료 현황:** 12/12종 본체 통과. surprised 스파이크 재구현(돌기 10, innerRatio 0.78) 완료. realize 전구 제거 완료.

### Gate5Review 재작성 3단계 (CutEditor 연동) (2026-08-17)

설계 문서: `docs/Gate5Review-Rebuild-v1.0.md`

**B단계 — 편집 진입 (커밋 971a406):**
- Gate5Review에 CutEditor 모달 연동: 각 컷 카드에 "편집" 버튼 추가
- CutEditor props: cut, imageUrl, characters, charNameMap, onClose, onSave, onPrev, onNext, cutIndex, totalCuts
- JS ResizeObserver 기반 이미지 크기 계산 (CSS % 체인 실패 → JS pixel 방식)
- 플로팅 좌우 화살표 (라이트박스 스타일 통일)
- Fixed position 종류 팔레트 드롭다운 (overflow:hidden 탈출)
- 하단 패널 max-h-[40vh] overflow-y-auto

**C단계 — 저장 왕복 (커밋 3ada0c6):**
- CutEditor handleSave → `PUT /cuts/{cut_id}/dialogue` → Gate5 cacheBuster + loadCuts
- 드래그·종류변경 저장 → 새로고침 후 유지 확인
- spec 필드 보존: 백엔드가 dialogue만 갱신, 나머지 spec 필드 보존

**D단계 — SfxLayer 배선 (커밋 3ada0c6):**
- CutImageWithBubbles, LightboxImageWithBubbles에 SfxLayer 추가
- 백엔드 `PUT /cuts/{cut_id}/dialogue`에 sfx_items 저장 추가
- ep13 #8 "쾅!" SFX 썸네일+미리보기 표시 확인

**말풍선 추가 수정:**
- surprised: spikeCount 8→10, roundedValleys 제거 (표준 spikyPath 사용)
- realize: `icon: 'lightbulb'` 제거
- 나머지 아이콘: angry(lightning), sad(teardrop), surprised(star) 유지

**알려진 사항:**
- ep13 #7 `dialogue=[]` — 데이터 비어있음, 코드 문제 아님
- 미리보기(모달)가 판정 기준. 썸네일은 스케일링 수정 전까지 무시
- 커밋 규칙: 단계 완료 + 사용자 확인 후에만. 파괴적 git 명령 금지

### 말풍선 세로 크기 검증 인프라 — 4-A (2026-08-18)

지시서: `docs/지시서-4A-세로크기.md`

- **BubbleTestPage min_height 검증 섹션:** 3종(round/narration/shout) × 3비율(0%/25%/50%) 그리드, `data-testid` 속성 부여
- **bubble-shot.mjs min_height 수치 판정:** shape BB vs minReq 비교, textInside 검증. 9케이스 전수 통과
- **기존 min_height 로직 검증 통과:** `needH = max(computedH, bubbleH)` 구조 정상 작동 확인

### 말풍선 텍스트 위치 조절 — 4-B (2026-08-18)

지시서: `docs/지시서-4B-텍스트위치.md`

**핵심 수식:**
```
marginX = max(0, (availW - textBlockW)) / 2
marginY = max(0, (availH - textBlockH)) / 2
shiftX = text_offset_x × 2 × marginX
shiftY = text_offset_y × 2 × marginY
```
- offset ±0.5 → 텍스트 가장자리가 가용 영역 경계에 정확히 닿음
- margin이 0이면 offset 자동 무력화 (여유 없음 = 이동 불가)

**1단계 — 렌더 반영 (커밋 8813b92):**
- `computeTextShift()` 공유 헬퍼: 스타일별(oval/spiky/rect) 가용 영역 계산 → margin → shift
- `computeSingleBubbleGeo` 반환값에 `shiftX`, `shiftY` 추가
- `SingleBubble` foreignObject 위치에 `shiftX`, `shiftY` 적용
- BubbleTestPage text_offset 검증 섹션: 3종 × 5 offset × 2 텍스트 = 30케이스 전수 `inside:OK`
- bubble-shot.mjs text_offset 판정: Range API 글리프 측정, 대칭 이동 수치 확인
- exportRenderer 자동 반영 (SingleBubble 내부 수정이므로 별도 수정 불필요)

**2단계 — CutEditor UI (커밋 8813b92):**
- 텍스트 가로/세로 슬라이더 2개 추가 (범위 -50~50%, step 1, 더블클릭 0 리셋)
- `updateLayout` 패턴으로 `text_offset_x`, `text_offset_y` 갱신
- SingleBubble에 `textOffsetX`, `textOffsetY` props 전달
- ep13 #8 실측: Y ±34.3px 대칭 이동, X는 긴 텍스트로 margin=0 (정상)

**bubble_layout 스키마 확장:**
```json
{
  "x": 0.30, "y": 0.10, "width": 0.45, "min_height": 0.0,
  "tail_direction": "down", "tail_flip": false, "font_scale": 1.0,
  "text_offset_x": 0.0, "text_offset_y": 0.0
}
```

### 이미지 모델 현황 조사 (2026-08-19)

지시서: `docs/지시서-이미지모델-현황조사.md`

**조사 완료, 코드 수정 없음.** 주요 발견:

- **현재 이미지 모델:** `gemini-2.5-flash-image` — `adapters/gemini_image.py:19` 하드코딩 상수
- **텍스트 모델:** `gemini-2.5-flash` — `adapters/gemini.py:41` 리터럴
- **모델 문자열 환경변수화 안 됨:** `config.py`에는 `GEMINI_API_KEY`만 있음
- **호출 방식:** `google-genai` Python SDK, `client.models.generate_content()`
- **배치:** `BATCH_SIZE=5` 순차(병렬 아님), 재시도 없음, 연속 5회 실패 시 조기 종료
- **참조 이미지:** 캐릭터당 1장(정면 front), 장소 1장, 스타일 0장(텍스트만). 인라인 bytes + 라벨
- **하드 제한:** 코드에 참조 개수 제한 없음. API 측 제한은 미확인
- **어댑터 추상화:** `adapters/base.py` ABC + `gemini_image.py` 구현체 + 싱글턴 팩토리
- **교체 용이성:** `IMAGE_MODEL` 상수 1곳 변경으로 가능 (동일 SDK 인터페이스 가정)
- **비용 계측:** `GenerationLog` 테이블 존재, `cost_usd=0.02` 하드코딩 추정값. 토큰 수 파싱 미구현
- **비용 조회 API/대시보드:** 없음

### Export 프론트 배선 + 실출력 검증 + A4 내보내기 (2026-08-20)

지시서: `docs/지시서-Export검증-A4.md` — **전 단계 완료, 배포 완료**

**1단계 — 현행 Export 경로 조사 (2026-08-19 완료)**
**2단계 — 프론트 배선 + 실출력 검증 (2026-08-20 완료):**
- `exportRenderer.js`: `useCORS=false`, `renderMode='svg-text'` — foreignObject canvas taint 해결
- `BubbleOverlay.jsx`: `renderMode` prop 추가, svg-text 모드에서 `<text>/<tspan>` 렌더링
- `Gate5Review.jsx`: `handleExport` 본체를 백엔드 API → 프론트 exportRenderer 호출로 교체
- 7/7 검증 항목 PASS (PNG ZIP, 세로, 인스타, min_height, shout, SFX, narration, #7 빈 대사)
- renderMode 비교 회귀 테스트 추가 (`bubble-shot.mjs`)

**3단계 — A4 내보내기 (2026-08-20 완료):**
- `exportRenderer.js`: `exportAsA4Single()` + `exportAsA4Grid()` 추가
- 상수: `A4_WIDTH=2480`, `A4_HEIGHT=3508`, `A4_MARGIN=59`, `GRID_COLS=4`, `GRID_ROWS=3`, `GRID_GAP=20`
- `Gate5Review.jsx`: A4 드롭다운 버튼 (그리드 4×3 / 한 컷 선택)
- 검증 4/4 PASS: 그리드 2480×3508, 한 컷 중앙 배치, 24컷 페이지 분할, 300DPI 텍스트 시인성

**4단계 — 배포 + 커밋 (2026-08-20 완료):** 커밋 `9b1a52b`

### 등장인물 추가설명(description) 필드 추가 (2026-08-20)

지시서: `docs/지시문서_등장인물_동물타입_추가.md` — **전 단계 완료, 배포 완료**

- **Gate1 UI:** 캐릭터 행에 추가설명 입력란 추가 (`Gate1Planning.jsx`). placeholder: "추가설명 (예: 포메라니안, 안경 쓴 회사원)"
- **백엔드:** `CharacterInput`에 `description: str | None` 추가 (`story/router.py`)
- **자동 생성 프롬프트:** 동물 인식 규칙 + description 필드 지시 추가 (`story/service.py`). 사용자 입력 description도 프롬프트에 전달
- **Gate 2/3 전달:** 수정 불필요 — Gate 2는 `json.dumps`로 전체 직렬화, Gate 3는 이미 `char_data.get("description", "")` 사용
- **캐릭터 시트 템플릿 충돌:** 없음 (사람 전제 키워드 없음). 동물용 시트 템플릿 설계는 향후 별도 세션
- 커밋: `24fc5d1`, `54e3751`, `c1657af`

### SeriesPage 비동기 진행 표시 + 모바일 수정모드 (2026-08-26)

**비동기 동작 진행 표시:**
- **`activeJob` 상태:** `{ type, affectedNos, message, error }` — 병합/분할/regen_from/bible 4종 추적
- **카드 오버레이:** 대상 회차 카드에 반투명 오버레이 + 스피너 + 문구 표시 (merge: 2카드, split: 1카드, regen_from: fromNo~끝 전체)
- **바이블 배너:** 전체 재생성은 상단 보라색 배너로 표시
- **조작 잠금:** `jobRunning = !!activeJob` — 진행 중 모든 편집/병합/분할/삭제/이동/추가 버튼 `disabled`
- **완료 하이라이트:** 변경된 카드 border 초록색 2초 강조 후 복귀
- **실패 처리:** 첫 번째 대상 카드에 에러 문구 + 재시도 버튼 + X 닫기. 바이블은 상단 빨간 배너

**모바일 수정모드 개선:**
- **제목 넘침 수정:** flex 컨테이너 `min-w-0`, 회차 번호 `shrink-0`, input `min-w-0 flex-1`
- **요약/훅 auto-resize:** textarea `onChange`/`onFocus`에서 `scrollHeight` 기반 자동 확장. 요약 `rows={4}`, 훅 `<input>` → `<textarea rows={2}>`
- **자동완성 차단:** `autoComplete="off"` + `autoCorrect="off"` + 중립적 `name` 속성

### P3 — 캐릭터 라이브러리 (2026-08-23~24)

지시서: `docs/지시서-P3-캐릭터라이브러리.md`

**백엔드 API 8종** (`characters/router.py`):
- `GET /projects/{pid}/characters` — 집계형 (front 이미지 + episode_count + style)
- `POST .../characters/link` — ref_key 충돌 검사 (EC JOIN 전체 대조)
- `DELETE .../characters/{cid}/link` — 2단계 확인 (409 + force)
- `DELETE /characters/{cid}` — 보수적 삭제 (연결 0건만, raw SQL 연쇄)
- `POST /characters/{cid}/promote` / `POST /characters/{cid}/demote`
- `GET /users/me/characters` — style 포함
- `GET /characters/{cid}/link-info`

**프론트 Gate3 피커** (`Gate3Assets.jsx`):
- 2탭 피커 모달 (이 프로젝트 / 내 캐릭터), 불러오기/연결 해제/별표 승격
- 삭제 버튼: 피커 "이 프로젝트" 탭, episode_count==0인 항목에만 표시
- 재생성 경고: link-info로 episode_count ≥ 2 시 확인 다이얼로그
- 스타일 뱃지: 각 캐릭터에 스타일 표시, 현재 에피소드와 불일치 시 ⚠ "그림체가 섞일 수 있어요" 경고 (차단 아님)
- 스타일 미기록 캐릭터: 회색 "스타일 미기록" 뱃지

**P3 보완 (2026-08-24):**
- **DB 마이그레이션:** `step12.sql` — `characters.style VARCHAR(50)` 추가 + 기존 17건 백필 (styles.preset_key 기준). 전수 커버리지 100%
- **스타일 기록:** 캐릭터 생성 시 에피소드의 선택 스타일 `preset_key`를 `characters.style`에 저장
- **자동 생성 스킵:** 피커로 연결된 캐릭터(원 소속 에피소드 ≠ 현재 에피소드)는 이미지 재생성 스킵 + "N명은 이미 연결되어 건너뛰었습니다" 배너
- **카드 레이아웃:** 헤더 flex-wrap + min-w-0 truncate (3개+ 카드 밀림 방지)
- **🔗 연결 해제 툴팁:** "이 에피소드에서 제외 (캐릭터는 프로젝트에 유지됩니다)"

### 발견 및 수정한 버그

- **Gemini 모델 404:** `gemini-2.0-flash-exp` → `gemini-2.5-flash-image`로 변경
- **BackgroundTask DB 세션 만료:** 재생성/생성 시 `SessionLocal()`로 자체 세션 생성하도록 수정
- **StaticFiles mount 충돌:** `app.mount("/assets"|"/storage")` 와 SPA fallback `/{path:path}` 충돌로 정적 파일 404 → mount 제거 후 fallback 핸들러에서 통합 처리
- **스타일 미적용:** characters/locations 라우터에서 style_prompt 하드코딩 → Style 테이블 조회로 수정
- **재생성 후 이미지 불변:** 동일 파일명 덮어쓰기로 브라우저 캐시 문제 → cacheBuster 쿼리 파라미터 추가
- **Gate4 콘티 내용 미표시:** API 응답에 action/dialogue/location 필드 누락 → 응답 스키마 확장
- **Gate5 [object Object]:** characters 배열이 객체로 변경됨 → `typeof c === 'string' ? c : c.character_id` 분기 처리
- **게이트 승인 시 invalidated 덮어씌움:** `approve_gate()`에서 다음 게이트를 항상 `draft`로 설정 → `invalidated` 상태면 유지하도록 수정
- **대본 이야기 잘림:** 시스템 프롬프트의 8~15컷 고정 상한이 긴 시놉시스 후반부를 잘라냄 → 상한 제거 + 이야기 완결성 우선 지시로 교체
- **Gemini SDK `request_options` TypeError:** `generate_content()`에 존재하지 않는 `request_options` 파라미터 전달 → 백그라운드 스레드에서 `TypeError` 발생, job이 영원히 `processing` 상태. `config` 내부의 `httpOptions=types.HttpOptions(timeout=120_000)`으로 수정
- **`cut_asset_refs` MariaDB 동시성 충돌:** 재생성 시 `DELETE FROM cut_asset_refs` 에서 `(1020, "Record has changed since last read")` 에러 → ORM DELETE를 raw SQL(`DELETE FROM cut_asset_refs WHERE cut_id = :cid`)로 변경
- **`db.expire_all()` 변경사항 유실:** `generate_cut_image()`에서 `cut.image_url`, `cut.status` 설정 후 `db.expire_all()` 호출 → 모든 변경이 expired되어 커밋 시 이전 값 유지. `db.expire_all()` 제거로 해결
- **백그라운드 Job 에러 미로깅:** 백그라운드 스레드에서 발생한 예외가 `server.log`에 기록되지 않음 → `jobs.py`에 `logger.error(exc_info=True)` 추가
- **말풍선 클릭 선택 간헐적 실패:** `mousedown`의 `preventDefault()`가 SVG에서 `click` 이벤트를 억제 → 마우스 이벤트에서 `preventDefault()` 제거. `dragMoved` ref로 드래그/클릭 구분. 배경 투명 rect로 선택 해제 담당 (SVG element onClick 로직 단순화)
- **말풍선 텍스트 너비 변경 시 잘림:** 글자 너비 계수 `0.55`가 한국어 기준으로 너무 낙관적 → `0.72`로 상향. `foreignObject height`에 1줄 버퍼 추가
- **Export 다운로드 안 됨:** `Gate5Review.jsx` `handleExport`에서 `result?.download_url`이 `undefined` (실제 URL은 `result?.result?.download_url`) → 수정
- **Export 말풍선 모양 불일치:** `composed_image_url`이 구버전 렌더러(rounded_rectangle)로 생성된 stale 파일 → 렌더러 버전 추적(`RENDERER_VERSION`) + Export 시 stale 판정 + 조건부 재조판으로 해결
- **Export 세로 이어붙이기 x 정렬:** `canvas.paste(img, (0, y_offset))`로 항상 좌측 정렬 → `x_offset = (target_width - img.width) // 2`로 중앙 정렬
- **Pretendard 폰트 CDN 404:** GitHub CDN `@v3.2.1` 태그 만료 → npm CDN `https://cdn.jsdelivr.net/npm/pretendard/dist/web/static/woff2`로 변경 (fontEmbed.js + index.css)
- **BubbleOverlay charWidth 0.72 버그:** bubbleSpec.json의 `charWidth: 0.72`가 한국어 5~6글자에서 강제 줄바꿈 유발 → 하드코딩 `0.55`로 복원, bubbleSpec.json 미참조
- **BubbleOverlay isOval 버그:** round/happy에 `isOval: true` 추가로 모든 스타일이 동일한 타원형 → isOval 제거, 원래 radius 기반 rounded rect 복원
- **미커밋 코드 유실 사고:** git checkout으로 커밋 1개뿐인 상태에서 파일 되돌리기 → 12종 말풍선+CutEditor 연동 코드 전부 유실. 복구 불가. git 안전 규칙 수립으로 재발 방지

## 남은 작업 (향후)

### 최근 완료 (2026-08-26)
- [x] **P5 — 회차 대본 생성(2-B)** — 구현 + 검증 9/9 PASS + 배포 완료. 스킵 배너 실발화 확인 (P3 이월 항목 종결). generate 엔드포인트 + 바이블→기획 파생 + 연작 컨텍스트 주입 + 캐릭터 자동 연결 + SeriesPage 대본 생성/완료/잠금 + WorkflowPage 시리즈 복귀 + Gate1 파생 읽기전용 (6a2e8a7)
- [x] **P4 — 연작 입구 + 바이블 + 아웃라인** — 백엔드 10 API + SeriesPage + ProjectPage 연작 모달. 검증 27/27 ALL PASS. 실사용 테스트 통과 (0171dd2, eee782f)
- [x] **P4 보완** — 비동기 진행 표시(오버레이/잠금/하이라이트/재시도) + 모바일 수정모드 (eee782f)
- [x] **P3 보완** — 스타일 뱃지/경고, 자동생성 스킵, step12, 카드 밀림 수정, 🔗 툴팁 (a906a4e, e453647)
- [x] **P3 — 캐릭터 라이브러리** — 피커 2단/불러오기/승격/보수적 삭제. 8 API + Gate3 피커 모달 (b8edb19)
- [x] **P2 — DB 기반 공사** — series·episode_characters 신설 (ed3fa37)
- [x] **P1 — 단편 아이디어 입력 UI** (0844047)

### 다음 세션 시작점
- **사용자 실전 테스트:** "아빠 엄마에 우리 도도" 1화 [대본 생성] → 대본 품질/훅 반영/Gate 1 스킵 사용감 판단 → P5 커밋 마감
- **P6 범위:** 상태 뱃지 정식화, 이미지 회차 잠금, 대본 있는 회차 합치기(아웃라인 병합→재생성), 리넘버링 마무리
- **테스트 데이터:** 프로젝트 6 / 시리즈 11 (3화 연결) — P6 검증 재료로 보존

### 기타 후보
- [ ] 동물용 캐릭터 시트 템플릿 설계
- [ ] (선택) IMAGE_MODEL 환경변수화
- [ ] Character Consistency — Part B: 그림 속 한글 텍스트 처리

### 설계 문서 기반 미완료 번들
- [x] **말풍선 12종 본체 구현 (12/12 완료).** 스파이크 3종 꼬리 제거로 확정 (2026-08-17)
- [x] **Gate5Review CutEditor 연동 (3단계 B+C+D 완료, 2026-08-17)**
- [x] **4-A 말풍선 세로 크기 검증 인프라 (2026-08-18)**
- [x] **4-B 텍스트 위치 조절 text_offset_x/y (2026-08-18)**
- [x] **이미지 모델 현황 조사 (2026-08-19, 코드 수정 없음)**
- [x] **Export 프론트 배선 + A4 (2026-08-20, 배포 완료)**
- [x] **등장인물 description 필드 (2026-08-20, 배포 완료)**
- [x] Gate3 Asset Revision — Bundle B: 캐릭터 조건 폼 (2026-08-11 완료)
- [x] Gate3 Asset Revision — Bundle C: 장소 AI 제안·편집 + mood_notes (2026-08-11 완료)
- [x] Cut Editor Speech Bubble — 말풍선 편집화면 (2026-08-12 완료)
- [ ] Cut Editor Speech Bubble — 효과음 Export 반영 (SFX는 프론트 SVG 경로로 이미 포함 — 검증만 필요)
- [ ] Cut Editor Speech Bubble — 긴 대사 문장 단위 분할 + 세로 연결 (D단계)
- [ ] Gate4-5 Speech-Product Revision — Bundle B: 제품 레퍼런스 업로드 (PPL)
- [ ] 배경 효과 PNG 레이어 (별도 지시서)
- [ ] UI 자잘한 개선 모음: 생성된 장소 이름 옆 "변경하려면 대본에서 수정" 힌트 등

### 우선순위 높음
- [ ] OAuth 로그인 UI (Google/Kakao/Naver 버튼) — 현재 JWT 직접 입력
- [x] 프론트엔드 에러 핸들링 강화 — pollJob 안전장치, 부분 실패 UI, 에러 메시지 한국어화 (2026-08-06 완료)
- [ ] S3 업로드 연동 — 현재 로컬 FS 폴백 사용 중

### 우선순위 중간
- [ ] Celery + Redis 큐 — 현재 BackgroundTasks + 인메모리 Job (서버 재시작 시 소실)
- [ ] 프론트엔드 대본 수정 UI — 무효화 dry_run 미리보기 연동
- [ ] 모바일 반응형 UI 최적화

### 우선순위 낮음 (V2)
- [ ] 결제 PG 연동 (Toss Payments)
- [ ] 사용자별 프로젝트 공유/협업
- [ ] 영상 변환 (웹툰 → 숏폼)
- [ ] 오래된 invalidated 이미지 주기적 정리 배치
- [ ] 어드민 대시보드

## 개발 규칙

- **문서대로 구현.** 설계 문서 7종(`docs/`)이 기준. 즉흥 이탈 금지.
- **git 안전 규칙:** (1) 테스트 통과마다 반드시 커밋 (2) 큰 구조 변경 전 반드시 커밋 (3) `git checkout`, `git reset` 등 파괴적 명령 실행 전 반드시 사용자(도도)에게 확인
- **BubbleOverlay CHAR_WIDTH:** 반드시 `0.93` 사용 (Pretendard 14px + letter-spacing 0.02em 실측값). `bubbleSpec.json`의 `charWidth: 0.72`는 사용 금지
- **BubbleOverlay 비율 상수 불변:** `CHAR_WIDTH`, `LINE_HEIGHT_RATIO` 등 비율 상수는 변경 금지. 스케일링은 `REF_WIDTH=800` 기반 `getScale(viewW)` 사용
- **말풍선 렌더러 수정 시:** `composition/service.py`의 `RENDERER_VERSION` 상수를 올리고, `frontend/src/utils/bubbleSpec.json`과 `backend/app/composition/bubble_spec.json`을 동시 업데이트할 것. 다음 Export 때 stale 컷이 자동 재조판됨.
- **Gemini API 키:** `.env` 파일의 `GEMINI_API_KEY` 사용
- **이미지 모델:** `gemini-2.5-flash-image` (adapters/gemini_image.py)
- **텍스트 모델:** `gemini-2.5-flash` (adapters/gemini.py)
- **DB 마이그레이션:** `stepN.sql` + `stepN_down.sql` 쌍 작성 + `schema_migrations` 테이블에 버전 기록. 서버 실행 전 리허설 DB에서 up→verify→down→재-up 사이클 통과 + mysqldump 백업 + 사용자 "실행해" 승인 필수. DB는 Lightsail 인스턴스 내 MariaDB (RDS 아님)
- **DB 덤프/백업 .sql 커밋 금지:** `project_t_*.sql`, `server_dump.sql` 등은 절대 커밋하지 않음. `stepN.sql` 마이그레이션 파일은 예외
- **캐릭터 이중 기록 기간:** characters 테이블은 episode_id + project_id + episode_characters 연결을 모두 기록. episode_id 컬럼 제거는 P3 안정화 후 별도 진행
- **캐릭터 에피소드 조회:** `episode_characters` JOIN이 표준 경로. `project_id` 직접 조회는 라이브러리 기능 전용 (에피소드 범위를 넘는 결과가 반환되므로 기존 기능에 사용 금지)
- **link ref_key 중복 검사:** EC JOIN 전체 대조 (원 소속 에피소드만이 아님)
- **unlink 2단계 확인:** 참조 컷 있으면 409 + referencing_cuts 반환(삭제 안 함) → `?force=true`로 실제 삭제. 캐릭터 삭제는 연결 0건만 허용 (보수적 삭제)
- **characters 삭제:** raw SQL 연쇄 (ORM cascade 미설정 — StaleDataError 방지)
- **캐릭터 삭제 버튼:** 피커의 "이 프로젝트" 탭에서 episode_count==0인 항목에만 표시 (설계 의도). "삭제 안 보임" 문의 시 연결 해제 → 0건 → 휴지통 흐름 안내
- **characters.style:** 생성 시 에피소드 스타일(preset_key) 기록. 피커에서 현재 에피소드와 불일치 시 ⚠ 경고 (차단 아님). NULL은 "스타일 미기록" 표시
- **자동 생성 연결 캐릭터 스킵:** `character.episode_id != episode_id`이면 이미지 재생성 스킵 + "N명은 이미 연결되어 건너뛰었습니다" 배너
- **series outline 리넘버링:** 서버 책임. episode_id 있는 항목 삭제/병합 방어는 P5부터 실효
- **D: 드라이브 I/O 에러 이력:** 2026-08-21 발생. 세션 시작 시 git status 확인 습관화. 이상 시 즉시 C:로 사본
- **배포:** 파일별 `scp` → uvicorn `--reload` 자동 감지 (프론트는 빌드 후 dist 배포)
- **서브 경로:** 프론트엔드 Vite `base: '/WEBTOON/'`, FastAPI `root_path="/WEBTOON"` — 새 컴포넌트 작성 시 API/라우팅에 `/WEBTOON` prefix 반영 필요
- **디자인 작업 분담:** Antigravity에서 디자인 변경 → Claude Code에서 빌드+배포
- **텍스트 렌더 이원 모드:** 화면은 `<foreignObject>` + HTML div / export는 SVG `<text>/<tspan>` (`renderMode='svg-text'`). 폰트·줄높이·자간 수정 시 두 모드 동시 수정 + `node scripts/bubble-shot.mjs` renderMode 비교 판정 통과 필수 (중심 좌표 ±2px, 너비 ±6px)
- **dev 서버 백그라운드 기동:** dev 서버는 항상 백그라운드로 기동 + curl 응답 폴링 후 진행. 재시작 필요 시 묻지 않고 수행, 보고에 한 줄만
- **다단계 지시서 진행 추적:** 다단계 지시서 작업 중 `docs/PROGRESS.md`에 현재 단계 갱신. 맥락 불확실 시 이 파일부터 읽기

## 배포 명령 참고

```bash
# 백엔드 파일 배포
scp -i "C:\Users\user\Downloads\DONGHAESSHKEy.pem" <로컬파일> bitnami@52.79.94.122:/home/bitnami/project-t/backend/<경로>

# 프론트엔드 빌드 + 배포
cd frontend && npx vite build
scp -r dist/. bitnami@52.79.94.122:/home/bitnami/project-t/backend/frontend/dist/

# DB 스키마 실행
ssh bitnami@52.79.94.122 '/opt/bitnami/mariadb/bin/mariadb -u root -p"<비밀번호>" project_t < /home/bitnami/project-t/backend/stepN.sql'

# JWT 토큰 발급 (user_id=1, 유효기간 7일)
ssh -i "C:\Users\user\Downloads\DONGHAESSHKEy.pem" -o StrictHostKeyChecking=no bitnami@52.79.94.122 'cd /home/bitnami/project-t/backend && source venv/bin/activate && python3 -c "from app.auth.jwt import create_access_token; print(create_access_token(user_id=1))"'
```

> **JWT 발급 요청 시:** 위 명령을 Bash 도구로 직접 실행하여 토큰을 발급하고 사용자에게 전달할 것. SSH 키 경로 포함 필수.
