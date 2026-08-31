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
│   │   ├── export/        # 내보내기 (PNG/세로/인스타/A4)
│   │   ├── images/        # 컷 이미지 생성 엔진 (핵심)
│   │   ├── locations/     # 장소 레퍼런스 관리
│   │   ├── projects/      # 프로젝트/에피소드 CRUD
│   │   ├── prompts/       # 프롬프트 엔진
│   │   ├── script/        # 대본 생성 (게이트 2)
│   │   ├── story/         # 기획 생성 (게이트 1)
│   │   ├── series/        # 시리즈(연작) CRUD
│   │   ├── storyboard/    # 콘티 (게이트 4)
│   │   ├── styles/        # 스타일 프리셋
│   │   ├── workflow/      # 게이트 상태 + 무효화 전파
│   │   ├── config.py      # 환경설정 (pydantic-settings)
│   │   ├── database.py    # SQLAlchemy 엔진/세션
│   │   ├── jobs.py        # 비동기 Job 관리 (인메모리)
│   │   ├── storage.py     # 파일 저장 (S3 → 로컬 폴백)
│   │   └── main.py        # FastAPI 앱 + 라우터 등록 + SPA 서빙
│   ├── frontend/dist/     # 빌드된 프론트엔드 (서버에서 서빙)
│   ├── init_db.sql ~ step12.sql # DB 마이그레이션 (+ stepN_down.sql 롤백)
│   └── requirements.txt
├── frontend/          # React 19 + Vite + Tailwind CSS
│   └── src/
│       ├── api/client.js          # Axios + JWT + Job 폴링
│       ├── contexts/AuthContext
│       ├── components/            # Layout, GateProgress, JobProgress, CutEditor, BubbleOverlay, SfxLayer
│       │   └── gates/             # Gate1~5 컴포넌트
│       └── pages/                 # Login, Dashboard, Project, Series, Workflow
└── docs/              # 설계 문서 + 지시서 + CLAUDE_archive.md (이력 전문)
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

- **도메인:** `ssagda.com` — **서비스:** `https://ssagda.com/WEBTOON` — **API:** `https://ssagda.com/WEBTOON/docs`
- **SSH:** `bitnami@52.79.94.122` (키: `DONGHAESSHKE.pem`) — **배포 경로:** `/home/bitnami/project-t/`
- **DB:** MariaDB, 비밀번호 `AWS.txt` 참조
- **웹서버:** Apache 2.4 (Bitnami), HTTPS — **리버스 프록시:** `/WEBTOON/` → `localhost:8000/`

## 핵심 아키텍처 — 5게이트 파이프라인

```
아이디어 → [게이트1 기획] → [게이트2 대본] → [게이트3 자산] → [게이트4 콘티] → [게이트5 이미지]
                                                 ↑ 불변 자산 확정       ↑ 비용 경계     ↑ 레퍼런스 주입
```

- **레퍼런스 주입:** 캐릭터 시트(정면) + 장소 레퍼런스를 매 컷 생성 시 Gemini에 전달
- **무효화 전파:** 대본 수정 → diff 판정 → 영향 자산/컷만 invalidated
- **과금:** 구독 할당량 우선 → 초과분 크레딧 차감 (게이트4 승인 시 강제 정지)

## 현재 상태 (2026-08-27)

**전체 완료:** 백엔드 7단계 + 프론트엔드 MVP + 5게이트 전체 + 연작 골격 P1~P6 + 게이트5 콘티 인라인 수정

**주요 기능 요약:**
- 게이트 1~5: 기획→대본→자산(캐릭터 7필드 편집/장소 AI 제안·mood_notes)→콘티(컷 수 조정)→이미지(배치 5컷씩/부분 실패 UI)
- 말풍선: 12종 SVG (round/narration/thought/whisper/shout/angry/happy/sad/surprised/shy/flustered/realize) + CutEditor 드래그 편집 + SFX 효과음
- Export: 프론트 렌더링 (PNG ZIP/세로/인스타/A4 그리드·한 컷). 백엔드 렌더러 버전 추적 (`RENDERER_VERSION`)
- 연작(Series): 바이블→아웃라인→회차 대본 생성→3단계 잠금(outline/script/image)→revise API→merge/split
- 캐릭터 라이브러리: 피커 2탭/불러오기/승격/보수적 삭제/스타일 뱃지

**실사용:** "아빠 엄마에 우리 도도" 1화 12컷 완주. 핵심 문제: 캐릭터 외형 일관성 (안경·머리·복장이 컷마다 흔들림)

## 남은 작업 (로드맵 v6 — 0층)

- [ ] 0-2 캐릭터 외형 명세 주입 (appearance → 프롬프트 명세 블록)
- [ ] 0-3 도도 1화 문제 컷 재생성 → 안경 유지율로 모델 실험 시급도 결정
- [ ] 0-4 커스텀 폰트 (효과음 1차 → 말풍선 2차, 폭 계수 테이블)
- [ ] 0-5 도도 2~3화 제작 (병행)

상세는 `docs/로드맵-v6.md` 참조

## 개발 규칙

- **문서대로 구현.** 설계 문서(`docs/`)가 기준. 즉흥 이탈 금지
- **git 안전:** (1) 테스트 통과마다 커밋 (2) 큰 구조 변경 전 커밋 (3) `git checkout`/`git reset` 등 파괴적 명령 전 사용자 확인
- **BubbleOverlay 상수 불변:** `CHAR_WIDTH=0.93`, `REF_WIDTH=800`, `LINE_HEIGHT_RATIO=1.45`, `BASE_FONT_SIZE=14`, `BASE_PADDING_X=14`, `BASE_PADDING_Y=10`. `bubbleSpec.json`의 `charWidth: 0.72` 사용 금지
- **말풍선 렌더러 수정 시:** `composition/service.py`의 `RENDERER_VERSION` 올리고, `frontend/src/utils/bubbleSpec.json` + `backend/app/composition/bubble_spec.json` 동시 업데이트
- **텍스트 렌더 이원 모드:** 화면=`<foreignObject>` / export=SVG `<text>/<tspan>` (`renderMode='svg-text'`). 수정 시 두 모드 동시 수정 + `node scripts/bubble-shot.mjs` 비교 판정 통과 필수
- **Gemini:** API 키 `.env`의 `GEMINI_API_KEY`. 이미지 모델 `gemini-2.5-flash-image`, 텍스트 모델 `gemini-2.5-flash`
- **DB 마이그레이션:** `stepN.sql` + `stepN_down.sql` 쌍. 리허설 up→verify→down→재-up + mysqldump 백업 + 사용자 승인 필수. DB 덤프 .sql 커밋 금지 (stepN은 예외)
- **캐릭터 구조:** `episode_characters` JOIN이 에피소드 조회 표준 경로. `project_id` 직접 조회는 라이브러리 전용. link시 ref_key EC JOIN 전체 대조. unlink 2단계(409+force). 삭제는 연결 0건만(raw SQL 연쇄). 피커 삭제 버튼은 episode_count==0만. 연결 캐릭터(`episode_id≠현재`)는 이미지 재생성 스킵. `characters.style`: 생성 시 preset_key 기록, 불일치 시 ⚠ 경고(차단 아님)
- **series outline 리넘버링:** 서버 책임
- **서브 경로:** Vite `base: '/WEBTOON/'`, FastAPI `root_path="/WEBTOON"` — 새 컴포넌트 작성 시 prefix 반영
- **정적 파일:** `app.mount()` 미사용 → SPA fallback 핸들러에서 storage/assets/frontend 통합 서빙
- **배포:** 파일별 `scp` → uvicorn `--reload` 자동 감지 (프론트는 빌드 후 dist 배포)
- **dev 서버:** 항상 백그라운드 기동 + curl 폴링 후 진행. 재시작 시 묻지 않고 수행, 한 줄 보고
- **다단계 지시서:** `docs/PROGRESS.md`에 현재 단계 갱신. 맥락 불확실 시 이 파일부터 읽기
- **D: 드라이브:** I/O 에러 이력 있음. 이상 시 즉시 C:로 사본

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

> **JWT 발급 요청 시:** 위 명령을 Bash 도구로 직접 실행하여 토큰을 발급하고 사용자에게 전달할 것.
