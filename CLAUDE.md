# EziToon(이지툰) — AI 웹툰 생성 서비스

> 아이디어를 입력하면 캐릭터·장소·스타일이 일관되게 유지되는 웹툰을 자동 생성하는 서비스

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
└── docs/              # 설계 문서 + CLAUDE_archive.md (이력)
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
- **과금:** 패킷 차감 (컷 1, 시트 2, 장소 1, 사진변환 1, 텍스트 0). 생성 전 잔량 가드(402), 실패 미차감

## 현재 상태 (2026-09-11)

**전체 완료:** 백엔드 7단계 + 프론트엔드 MVP + 5게이트 전체 + 연작 P1~P6 + 콘티 인라인 수정 + 0-2 appearance_en + 1-8 바이블 수정 + 1-7 지문 AI 재작성 + AI 토큰 상수화 + 0-4 커스텀 폰트 + 캐릭터 이름 편집 + 1-1 장소 사진 업로드 + 인물 배치 상식 + 1-1c 캐릭터 사진→시트(플랜C+참조토글) + 표정 시트 2×3 격자(expressions, 컷 참조, 감정 88→6) + 업로드 검증 개선(Pillow·20MB·리사이즈·동물 체크박스) + 1-4 배경효과 PNG 오버레이(effect_items+카탈로그10종+편집UI+내보내기Base64+배포) + 2층 0~3단계(스키마→로그인→대시보드→패킷)

**주요 기능 요약:**
- 게이트 1~5: 기획→대본→자산(캐릭터 7필드+이름 편집/장소 AI 제안·mood_notes)→콘티(컷 수 조정)→이미지(배치 5컷씩/부분 실패 UI)
- 말풍선: 12종 SVG + CutEditor 드래그 편집 + SFX 효과음 + 커스텀 폰트 (효과음 5종 + 말풍선 2종)
- 배경효과: 10종 PNG 카탈로그(집중선·속도선·깜짝 등) + EffectLayer + CutEditor 배치·크기·회전·불투명도·반전 편집 + 카드/라이트박스 표시
- Export: 프론트 렌더링 (PNG ZIP/세로/인스타/A4) + 커스텀 폰트 Base64 인라인 + 배경효과 PNG Base64 인라인 + document.fonts.load() 동기화
- 연작(Series): 바이블→아웃라인→회차 대본 생성→3단계 잠금→revise API→merge/split
- 캐릭터: 라이브러리 피커 + appearance_en 외형 명세 주입 + 이름 편집(외형 무관, appearance_en 불변) + 사진→외형 추출 + 표정 시트 2×3 격자(expressions) + 컷 참조에 표정 시트 포함 + 감정 88종→6패널 매핑 + 동물 캐릭터 체크박스
- 업로드: Pillow 실제 포맷 검증(JPEG/PNG/WEBP), 20MB 제한, EXIF 보정 + 긴 변 2400px 리사이즈 + JPEG q88. 캐릭터·장소 공용(image_util.py)
- 폰트: FONT_CATALOG 단일 소스 (8종, charWidth 실측), woff2 서브셋 파이프라인 (scripts/build-fonts.py)
- 장소 사진: 업로드→비전 묘사 추출→일러스트 생성 (플랜 C). 제안 단계 사진 대체, 카드 변환본/원본 병기, 다시 변환

**교훈:** Gemini 2.5-flash의 image-to-image 스타일 변환은 불신뢰 (플랜 A: 프롬프트 강화 실패, 플랜 B: 참조 이미지 변환 실패 → 사진풍 유지). 플랜 C(비전 텍스트 추출→텍스트→이미지)로 해결 — 참조 이미지를 전달하지 않아 사진풍 오염 원천 차단. Pro 모델의 image-to-image는 1-5 모델 실험에서 재도전 가능.

**2층(로그인·대시보드·패킷·결제·랜딩) 진행 중:**
- 지시서: `docs/지시서-2층-메인페이지.md` (5단계 구성)
- [x] 0단계: 현황 조사 + 스키마 설계 → `docs/2층-스키마-설계안.md`
- [x] 1단계: 소셜 로그인 3사 + 본계정 확정(구글 id=3, 김김준) + 프로젝트 4·5·6 귀속 마이그레이션 완료 (2026-09-09)
- [x] 2단계: 대시보드 완료 (2026-09-09, 공지 바·헤더 리뉴얼·패킷 잔량 API·법률 페이지 3종·EziToon 전환·step18 마이그레이션). 구글 OAuth 앱 게시 완료(프로덕션 — 아무 구글 계정 로그인 가능). 네이버 검수는 오픈 준비 때
- [x] 3단계: 패킷 시스템 완료 (2026-09-11 검증 통과). 생성 5지점 차감(컷1/시트2/장소1/사진변환1/텍스트0) + 잔량 가드(402) + 실패 미차감 + /packets 현황 페이지 + admin_grant.py + 402 alert 팝업 통일(axios 인터셉터). 도도 실서버 테스트 완료: 잔량 표시·버튼 비용 표시·차감·부족 차단 alert 확인
- [ ] 다음: 4단계(토스페이먼츠) — 테스트 API 키로 개발, 멱등 처리(중복 지급 방지) 필수
- 메모: 서비스명 EziToon(이지툰) 확정 (콘솔 3사 포함 전환 완료). 문의처 k9k8j7y7@naver.com 단일화. 토스 가맹 신청은 4단계 전

**도도 시리즈:** 1~3화 이미지 완료 (사용자 완주)

**미수집 데이터:** 3화 손본 컷 수 (모델 실험 우선순위 근거 — 사용자 재확인 필요)

## 남은 작업

- [x] 0-2 캐릭터 외형 명세 주입
- [x] 0-4 커스텀 폰트 (효과음 5종 + 말풍선 2종 + charWidth 실측)
- [x] 1-1 장소 사진 업로드 (플랜 C: 비전 묘사 추출→일러스트 생성, step14+15 배포)
- [x] 1-1c 캐릭터 사진→시트 + 표정 시트 격자화 (step16+17, 감정 매핑, 컷 참조 포함)
- [x] 업로드 검증 개선 (Pillow 실제 포맷 판정, 20MB, EXIF 보정+리사이즈, 동물 체크박스)
- [x] 1-4 배경효과 PNG 오버레이 (완료 2026-09-07, 카탈로그 10종+편집UI+내보내기+검증완화)
- [x] 2층 0단계 스키마 설계 (완료 2026-09-08, docs/2층-스키마-설계안.md)
- [x] 2층 1단계 소셜 로그인 + 귀속 (완료 2026-09-09, 3사 개통+카카오 시크릿 수정+본계정 구글 id=3+프로젝트 귀속)
- [x] 2층 2단계 대시보드 (완료 2026-09-09, step18+공지 바+헤더+패킷API+법률 페이지+EziToon 전환)
- [x] 2층 3단계 패킷 차감 (완료 2026-09-11, 차감·차단·환불·현황 검증 통과 + 402 alert 통일)
- [ ] 2층 4단계 토스페이먼츠 결제 (테스트 API 키로 개발)
- [ ] 0-5 도도 4화~ 제작 (병행)

## 개발 규칙

- **문서대로 구현.** 설계 문서(`docs/`)가 기준. 즉흥 이탈 금지
- **git 안전:** (1) 테스트 통과마다 커밋 (2) 큰 구조 변경 전 커밋 (3) `git checkout`/`git reset` 등 파괴적 명령 전 사용자 확인
- **BubbleOverlay 상수:** `CHAR_WIDTH=0.93`(기본, pretendard), `REF_WIDTH=800`, `LINE_HEIGHT_RATIO=1.45`, `BASE_FONT_SIZE=14`, `BASE_PADDING_X=14`, `BASE_PADDING_Y=10`. 폰트별 charWidth는 FONT_CATALOG 참조. `bubbleSpec.json`의 `charWidth: 0.72` 사용 금지
- **말풍선 렌더러 수정 시:** `composition/service.py`의 `RENDERER_VERSION` 올리고, `frontend/src/utils/bubbleSpec.json` + `backend/app/composition/bubble_spec.json` 동시 업데이트
- **텍스트 렌더 이원 모드:** 화면=`<foreignObject>` / export=SVG `<text>/<tspan>` (`renderMode='svg-text'`). 수정 시 두 모드 동시 수정 + `node scripts/bubble-shot.mjs` 비교 판정 통과 필수
- **Gemini:** API 키 `.env`의 `GEMINI_API_KEY`. 이미지 모델 `gemini-2.5-flash-image`, 텍스트 모델 `gemini-2.5-flash`
- **DB 마이그레이션:** `stepN.sql` + `stepN_down.sql` 쌍. 리허설 up→verify→down→재-up + mysqldump 백업 + 사용자 승인 필수. DB 덤프 .sql 커밋 금지 (stepN은 예외). 마이그레이션 백업은 데이터 포함(no-data 금지)
- **마이그레이션 리허설:** 반드시 별도 DB(`project_t_test`)에서만 실행. 운영 DB에는 도도의 "실행해" 승인 후 단 1회 적용. 리허설·테스트 목적으로 운영 테이블에 DDL/DML 실행 금지. `project_t_test`가 없으면 리허설 전에 먼저 생성 (운영 스키마 복제, 데이터 불필요)
- **캐릭터 구조:** `episode_characters` JOIN이 표준 조회. link시 ref_key 대조, unlink 2단계(409+force), 삭제는 연결 0건만. 연결 캐릭터(`episode_id≠현재`)는 이미지 재생성 스킵. `characters.style`: 불일치 시 ⚠(차단 아님)
- **캐릭터 ref_key:** 바이블/기획 시점 확정 (영문 snake_case). 시트·대본·컷 전부 이 키 기준. 불일치 시 Gate5 ⚠, 콘티 모달에서 제거/치환. 바이블 인물 이름 ≠ 시트 이름 가능 (ref_key 매칭)
- **텍스트 AI 호출:** `AI_TOKENS_SHORT`(4096)/`MEDIUM`(8192)/`LONG`(16384) 상수만 사용. JSON 파싱은 `parse_ai_json()` 경유
- **컷 프롬프트 한글 금지:** 외형은 appearance_en(영어)만 주입. 지문(action)에는 한국어 짧은 괄호 외형만
- **서브 경로:** Vite `base: '/WEBTOON/'`, FastAPI `root_path="/WEBTOON"` — 새 컴포넌트 작성 시 prefix 반영
- **정적 파일:** `app.mount()` 미사용 → SPA fallback 핸들러에서 storage/assets/frontend 통합 서빙
- **배포:** 파일별 `scp` → uvicorn `--reload` 자동 감지 (프론트는 빌드 후 dist 배포)
- **dev 서버:** 항상 백그라운드 기동 + curl 폴링 후 진행. 재시작 시 묻지 않고 수행, 한 줄 보고
- **다단계 지시서:** `docs/PROGRESS.md`에 현재 단계 갱신. 맥락 불확실 시 이 파일부터 읽기
- **D: 드라이브:** I/O 에러 이력 있음. 이상 시 즉시 C:로 사본

## 배포 명령 참고

```bash
# 백엔드: scp -i "C:/Users/k9k8j/Downloads/DONGHAESSHKE.pem" <파일> bitnami@52.79.94.122:/home/bitnami/project-t/backend/<경로>
# 프론트: cd frontend && npx vite build && scp -r dist/. bitnami@52.79.94.122:/home/bitnami/project-t/backend/frontend/dist/
# DB: ssh bitnami@52.79.94.122 '/opt/bitnami/mariadb/bin/mariadb -u root -p"<비밀번호>" project_t < /home/bitnami/project-t/backend/stepN.sql'
# JWT: ssh -i "..." bitnami@52.79.94.122 'cd /home/bitnami/project-t/backend && source venv/bin/activate && python3 -c "from app.auth.jwt import create_access_token; print(create_access_token(user_id=1))"'
```
