# EziToon(이지툰) — AI 웹툰 생성 서비스

> 세부 이력은 `docs/CLAUDE-detail.md`, 흐름은 `docs/흐름-용도별.md`, 최신 진행은 `docs/PROGRESS.md` 참조

## 프로젝트 구조

```
WEBTOON/
├── backend/app/       # FastAPI 모듈러 모놀리스: adapters/ auth/ billing/ characters/
│   │                  # composition/ export/ images/ locations/ projects/ prompts/
│   │                  # script/ story/ series/ storyboard/ styles/ workflow/
│   │                  # config.py database.py jobs.py storage.py main.py
│   ├── frontend/dist/ # 빌드된 프론트엔드 (서버에서 서빙)
│   └── init_db.sql ~ step13.sql  # DB 마이그레이션 (+ stepN_down.sql 롤백)
├── frontend/src/      # React 19 + Vite + Tailwind CSS 4
│   ├── components/    # CutEditor, BubbleOverlay, SfxLayer, gates/Gate1~5
│   └── utils/         # fontCatalog, fontEmbed, exportRenderer, bubbleSpec
├── scripts/           # build-fonts.py, measure-font-width.mjs
└── docs/              # 설계 문서 + CLAUDE-detail.md (이력)
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| 백엔드 | Python + FastAPI, SQLAlchemy ORM |
| DB | MariaDB (Lightsail 인스턴스 내 로컬) |
| 이미지 생성 | Gemini 3.1 Flash Image API (`IMAGE_MODEL` env) |
| 텍스트 생성 | Gemini 2.5 Flash API |
| 프론트엔드 | React 19 + Vite + Tailwind CSS 4 |
| 인증 | OAuth (Google/Kakao/Naver) + JWT (HS256) |
| 인프라 | AWS Lightsail (52.79.94.122) + S3 |

## 서버 접속

- **서비스:** `https://ssagda.com/WEBTOON` — **API docs:** `https://ssagda.com/WEBTOON/docs`
- **SSH:** `bitnami@52.79.94.122` (키: `%USERPROFILE%\.ssh\DONGHAESSHKEy.pem`) — **배포 경로:** `/home/bitnami/project-t/`
- **DB:** MariaDB, 비밀번호 `AWS.txt` — **웹서버:** Apache 2.4, 리버스 프록시 `/WEBTOON/` → `localhost:8000/`

## 핵심 아키텍처 — 5게이트 파이프라인

```
아이디어 → [Gate1 기획] → [Gate2 대본] → [Gate3 자산] → [Gate4 콘티&장소] → [Gate5 이미지]
```

- **레퍼런스 주입:** 캐릭터 시트 + 장소 레퍼런스를 매 컷 Gemini에 전달. 무효화 전파(diff 판정)
- **과금:** 패킷 차감 (컷 1, 시트 2, 장소 1, 사진변환 1, 모션 4, 릴스 1, 텍스트 0). 402 가드, 실패 미차감
- **패킷 가격 = DB `packet_products`** — 4종(15/30/100/300). `packetUsage.js` 단일 상수. /admin에서만 변경
- **환영 패킷:** 신규 가입 3패킷(`auth/router.py`). **환불:** 7일 이내 미사용 전액, 사용분 230원/개(`REFUND_TEXT` 상수 3곳 통일)

## 현재 상태 (2026-11-09)

**다음 작업:** E 오픈 준비(토스·네이버 도도 확인 후)
- **UI는 "내 작품" 단일 목록.** 한 컷·인스타툰 = 사용자별 기본 프로젝트(`is_default`, step37) 에피소드. 연재툰 = kind=series 프로젝트 1행. story = 메뉴 "이야기 만들기" → 기존 화면. **화면에 "프로젝트/에피소드" 용어 금지**

## 남은 작업

- [ ] 16:9 실생성 검증 (ep32 슛돌이 단편)
- [ ] **다음:** E 오픈 준비 1 셀프 청소
- [ ] 모바일 레이아웃 1차 (`docs/지시서-모바일레이아웃-1차.md`)
- [ ] C 이미지 모델 선택 (에피소드 단위 모델 잠금, openai_image.py 어댑터)
- [ ] 폴리싱: 뷰어 컷 확대 모달
- [ ] 후순위: ep_no 중복 정리, 텍스트 모델 교체(종료일 발표 시), push 자동 재등록
- [ ] 백로그: ref_key 한글 해시 → 영문 snake_case 개선(`story/service.py` `_name_to_ref_key`)

## 금지·보호 사항

- **ep30·ep25·ep26 삭제 금지** — 랜딩 참조 에피소드(`LANDING_EPISODES`)
- **프리셋 캐릭터 53~58 삭제 금지** — 빠른 한 컷 시스템 프로젝트 id=7
- **ep30 실행 금지** — 제품 테스트는 **ep71**(project 12)
- **운영 DB 데이터 변경 금지** — DDL·DML 모두 도도 승인 후 1회만. ORM 직접 실행도 동일
- **서버 .env 통째 scp 금지** — 줄 단위 `sed`/`echo >>`. 변경 전 `.env.bak.날짜` 백업

## 광고 트랙 핵심 규칙

- **광고 3종(onecut_ad·instatoon_ad·brand_series) 자동 생성 없음** — story 트랙만 Gate5 자동 시작
- **제품 컷(has_product) = GPT 기본** — `images/service.py`에서 자동 전환. 실사 캐릭터 에피소드도 전 컷 GPT
- **전 컷 제품 참조(instatoon_ad·brand_series):** 모든 컷에 제품 참조 전달. 비has_product 컷은 `build_product_exclusion_clause`
- **훅 카피 분기(instatoon_ad·brand_series):** 1컷=hook_copy(15자, sub 없음), 마지막=head+sub
- **has_product 손·팔 검사(instatoon_ad·brand_series):** `check_anatomy()` → hands/arms>2 재시도 1회
- **purpose별 모델 수:** brand_series:2, instatoon_ad:1, onecut_ad:1 (`_PURPOSE_MODEL_LIMIT`)
- **카피 디자인 3트랙 공통:** 글씨체·위치·강조 → `idea_brief.copy_design`
- **[다시 그리기] 단일 진입:** 바텀시트/팝오버(메모+연출+제품+인라인 확인)
- **설명 컷:** `cut.kind=explain` + `device` 6종(`prompts/explain.py`). 기획안 `visual_points`→대본 N개 강제 배치(검증+1회 재시도), 라벨 허용 프롬프트(`"Render ONLY…"`), 라벨·손 검사, bust 고정·has_product 강제(미등록 시 자동 해제), 말풍선 하단 배치, **1컷(훅)·마지막(카피) 배치 금지**(위반 1회 재생성). onecut_ad 해당 없음
- **연재툰 = 시리즈 프로젝트:** `projects.kind='series'`(step36). 새 화 = 직전 화 복사(브리프·제품·보여줄 특징), 모델 link-previous(n-1 우선, 0패킷). 컷 수 직접 입력(brand_series 4~20, instatoon_ad 4~10, 임의 N 구조 비례 배분). 4:5 비율 제외. 섞인 프로젝트엔 연재툰 입구 없음. 중간 컷 font_scale 1.15(brand_series·instatoon_ad)

## 개발 규칙

### 일반
- **캡처 검증은 Read 금지** — 경로·수치만 보고(컨텍스트 보호)
- **문서대로 구현** — `docs/` 설계 문서 기준. 즉흥 이탈 금지
- **git 안전:** 테스트 통과마다 커밋, 큰 변경 전 커밋, 파괴적 명령 전 사용자 확인
- **서브 경로:** Vite `base: '/WEBTOON/'`, FastAPI `root_path="/WEBTOON"`
- **정적 파일:** SPA fallback 핸들러에서 storage/assets/frontend 통합 서빙(`app.mount()` 미사용)
- **텍스트 AI:** `AI_TOKENS_SHORT`(4096)/`MEDIUM`(8192)/`LONG`(16384) 상수. `parse_ai_json()` 경유
- **컷 프롬프트 한글 금지:** appearance_en, location_spec_en(영어)만 주입. spec_en 없으면 한글 폴백
- **Gemini:** `.env`의 `GEMINI_API_KEY` + `IMAGE_MODEL`(현재 `gemini-3.1-flash-image`)
- **FormData 업로드:** `{ headers: { 'Content-Type': 'multipart/form-data' } }` 필수(누락 시 422 흰 화면)

### 말풍선·렌더링
- **BubbleOverlay 상수:** `CHAR_WIDTH=0.93`, `REF_WIDTH=800`, `LINE_HEIGHT_RATIO=1.45`, `BASE_FONT_SIZE=14`, `BASE_PADDING_X=14`, `BASE_PADDING_Y=10`. `bubbleSpec.json`의 `charWidth: 0.72` 사용 금지
- **렌더러 수정 시:** `RENDERER_VERSION` 올리고 `bubbleSpec.json` 프론트+백엔드 동시 업데이트
- **내레이션 박스:** box(신규 기본, 흰+테두리)/bar(레거시, 반투명 띠). 렌더 5곳 동시 수정. 기존 `bubble_style` 없으면 bar — **자동 변환 금지**
- **텍스트 렌더 이원:** 화면=foreignObject, export=svg-text. 양쪽 동시 수정 + `bubble-shot.mjs` 비교 필수
- **레이어 순서:** 이미지→제품→효과→SVG말풍선→PNG말풍선→효과음

### 편집기
- **입력:** Pointer 이벤트 통일(`onPointerDown/pointermove/pointerup`). **`onClick` 금지**(터치 해제 버그)
- **오버레이:** 루트 pointer-events none, 조작 요소만 all. 추가 시 아래 레이어 회귀 테스트
- **툴바 B안:** 1행 헤더 + 2행 도구(효과·말풍선·효과음·내레이션). 폰 4분할, PC 알약. [전체 박스/띠]는 내레이션 선택 시만
- **touch-action:** 컷 영역 none(탭 지연 제거), 하단 패널 pan-y. `DRAG_THRESHOLD` mouse 5px / touch 12px

### 모달·드롭다운
- **모달 닫기:** `createPortal(document.body)`. 닫기는 **`onClick`만**(onPointerDown 금지, 고스트 클릭). 350ms 투명 실드. **패킷 차감 버튼은 인라인 확인 단계** 필수
- **드롭다운:** portal + `fixed z-[60]`. PC=좌표, 폰=바텀시트. **바깥 클릭 리스너는 `setTimeout(0)` 다음 틱** 등록

### 다크 테마·모바일
- **다크:** `darkMode: 'class'`, 폰 기본 다크/PC 기본 라이트. 토큰 night-*/neon-*. **새 컴포넌트는 `dark:` 필수**
- **모바일:** 640px 미만(`sm:`). 카드 1열, 스텝바 가로 스크롤. 확인: `mobile-check.mjs`
- **게이트 로드:** `useGateLoad` 훅 필수. **`catch {}` 에러 삼키기 금지**. 스켈레톤+재시도+에러 카드

### 게이트·캐릭터
- **StepHeader:** `STEPS` 단일 상수. [단계 이동]은 보기만, 수정은 각 게이트 [수정하기]→`POST revert`
- **캐릭터 ref_key:** 바이블/기획 시점 확정(영문 snake_case). 시트·대본·컷 전부 이 키. 불일치 시 ⚠
- **캐릭터 승계:** Gate1 카드 값이 원본. AI gender/name/age는 카드 값 덮어씀. description은 카드 원문 앞+AI 뒤
- **ref_key UI:** 직접 노출 금지 → 한글 이름 + 작은 회색 ref_key. `refNames.js` 헬퍼
- **연출 강도:** `drama.py`(light/normal/strong). strong은 보호 문구+효과음 글자 금지

### 페이지 형식
- 4종: vertical·single_page·grid_2x2·strip_3. 단일 소스 `pageFormats.js`·`page_formats.py`
- **테스트는 테스트 에피소드만** — 실제 작품 형식 변경 금지

### DB·배포
- **DB 마이그레이션:** `stepN.sql`+`stepN_down.sql` 쌍. 리허설 `project_t_test`에서만. mysqldump 백업+승인 필수
- **마이그레이션 리허설:** 운영 DB 절대 금지. `project_t_test` 없으면 먼저 생성
- **배포 전:** 서버 로그에서 진행 중 생성·모션·릴스 작업 확인(완료 후 배포). `--reload`는 진행 작업 끊김+인메모리 job 소실
- **배포:** 파일별 `scp` → `--reload` 감지. `.env` 변경 시 `touch app/config.py` + 로그 확인
- **dev 서버:** 백그라운드 기동+curl 폴링. 재시작은 묻지 않고 수행

### 기능별 핵심 규칙

- **모션:** Veo lite 4초→3초 트림, 후보 2, 비전 검사, 4패킷. **프롬프트에 캐릭터 이름 금지**(Veo 안전필터). BackgroundTasks에서 ORM 대신 id 추출. 릴스 1패킷, `source_hash` nested 구조 필수
- **인스타 공유:** `share()`는 **`onClick` 동기 호출**(await·pointerdown 금지). 크레딧은 인스타 경로만
- **빠른 한 컷:** `/quick`, 프리셋 6종, 1패킷 후차감. expand→새 프로젝트(revert 금지)
- **제품 자산:** analyze 0패킷. has_product override(null=자동, true/false=수동). 제품 사진 투명 PNG 전용(알파 5%↑)
- **구독·알림:** `notify()` 단일 진입점. BackgroundTasks에서 `send_push()` 직접 호출. WebAPK 자동 재구독
- **문의:** 1:1 열람. 관리자 API POST 통일. `<select>` 명시 색상(dark 상속 금지)
- **아이디어 단락:** `target_section`+`direction`→단락 모드(0패킷). 칩 `flex-wrap`(가로 스크롤 금지)

### 작업 환경
- **Antigravity 협업:** 프론트 작업은 Antigravity, 배포·커밋은 Claude Code. ahead 0 필수
- **다단계 지시서:** `docs/PROGRESS.md`에 현재 단계 갱신
- **PC 이동:** 떠나기 전 커밋+push, 앉으면 pull. `.env`·SSH 키는 git 밖
- **로컬 스크립트:** `backend/.env`에 `IMAGE_MODEL`·`GEMINI_API_KEY` 필요

## 배포 명령 참고

```bash
# 백엔드: scp -i "$USERPROFILE/.ssh/DONGHAESSHKEy.pem" <파일> bitnami@52.79.94.122:/home/bitnami/project-t/backend/<경로>
# 프론트: cd frontend && npx vite build && scp -r dist/. bitnami@52.79.94.122:/home/bitnami/project-t/backend/frontend/dist/
# DB: ssh bitnami@52.79.94.122 '/opt/bitnami/mariadb/bin/mariadb -u root -p"<비밀번호>" project_t < /home/bitnami/project-t/backend/stepN.sql'
# JWT: ssh -i "..." bitnami@52.79.94.122 'cd /home/bitnami/project-t/backend && source venv/bin/activate && python3 -c "from app.auth.jwt import create_access_token; print(create_access_token(user_id=1))"'
```
