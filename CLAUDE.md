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
| 이미지 생성 | Gemini 3.1 Flash Image API (레퍼런스 주입, `IMAGE_MODEL` env) |
| 텍스트 생성 | Gemini 2.5 Flash API |
| 프론트엔드 | React 19 + Vite + Tailwind CSS 4 (코믹북 디자인 시스템) |
| 파일 저장 | 로컬 FS 폴백 (`/home/bitnami/project-t/storage/`) |
| 인증 | OAuth (Google/Kakao/Naver) + JWT (HS256) |
| 비동기 작업 | FastAPI BackgroundTasks + 인메모리 Job 스토어 |
| 인프라 | AWS Lightsail (52.79.94.122) + S3 |

## 서버 접속 정보

- **도메인:** `ssagda.com` — **서비스:** `https://ssagda.com/WEBTOON` — **API:** `https://ssagda.com/WEBTOON/docs`
- **SSH:** `bitnami@52.79.94.122` (키: `%USERPROFILE%\.ssh\DONGHAESSHKEy.pem`) — **배포 경로:** `/home/bitnami/project-t/`
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
- **패킷 가격 정책:** 순마진 = 결제액×0.872 − 93원×패킷수 기준으로 소량 45% / 중량 40% / 대량 35% 계단. 패킷당 판매가 최저 178원. 이미지 모델·환율 변경으로 원가가 바뀌면 재계산. 고품질 모델은 가격표 대신 패킷 차감 수(2패킷 등)로 반영. 가격 값은 /admin에서만 변경(코드에 박지 않음)

## 현재 상태 (2026-10-02)

**전체 완료:** 백엔드 7단계 + 프론트엔드 MVP + 5게이트 전체 + 연작 P1~P6 + 콘티 인라인 수정 + 0-2 appearance_en + 1-8 바이블 수정 + 1-7 지문 AI 재작성 + AI 토큰 상수화 + 0-4 커스텀 폰트 + 캐릭터 이름 편집 + 1-1 장소 사진 업로드 + 인물 배치 상식 + 1-1c 캐릭터 사진→시트(플랜C+참조토글) + 표정 시트 2×3 격자(expressions, 컷 참조, 감정 88→6) + 업로드 검증 개선(Pillow·20MB·리사이즈·동물 체크박스) + 1-4 배경효과 PNG 오버레이(effect_items+카탈로그10종+편집UI+내보내기Base64+배포) + 2층 완공(0~5단계, 2026-09-15) + 이미지 모델 3.1 전환 + 갤러리 좋아요·조회수(step21) + 관리자 페이지 완공(1~5단계, step22+23, 2026-09-15) + 컷 비율 선택(1:1/9:16, step24, 2026-09-16) + 단편 대본 완결 구조 강제(2026-09-16) + 광고 에피소드 1단계(타입·배지·광고 대본, 검증 통과 2026-09-16) + 생성 실패 자동 재시도+안내 개선(2026-09-16) + 광고 2단계(제품 자산, step25, 시트 생성+컷 참조, 2026-09-16) + 광고 3단계(제품 레이어 게이트5+뷰어+내보내기, step26 ENUM, 2026-09-17) + 광고 컷 품질(제품 컷별 선택 has_product+스케일 앵커 프롬프트, 2026-09-17) + 컷 패널 분할 수정(단일 일러스트 강제+장소 참조 샷 분기+다인물 세로 구도, 2026-09-18) + 제품 투명 PNG 전용 업로드+시트 유지+게이트3 읽기 전용+내보내기 PNG 투명 보존(2026-09-18) + 관리자 갤러리 showcase 카테고리 is_ad 자동 결정 버그 수정+AD 배지+ep30 광고 탭 공개(2026-09-19) + v2 1단계: 컷 비율 5종(1:1/9:16/16:9/3:4/4:3)+인스타 letterbox+prompt-preview API(2026-09-20) + 게이트1 기획서 개편(idea_brief 구조+등장인물 미리 채움+기획 생성 주입+시놉시스 4단+제목 유지, 2026-09-22) + 특수 말풍선 PNG 레이어(pngbubble_items 5종+편집기+뷰어+내보내기4경로, 2026-09-22) + 장소 텍스트화 1·2단계(step27 location_spec_en+게이트4 콘티&장소+장소 이미지 옵션+사진 업로드 비전 전용+컷 카드 한글 이름, 2026-09-23) + 캐릭터 연결 수정(기획 캐릭터 승계·ref_key 자동 매핑·콘티 가드·피커 스타일 필터, 2026-10-01) + 게이트1 캐릭터 승계 보강(동물 성별 기타 자동·카드 값 우선·설명 원문 보존, 2026-10-02) + 형식/레이아웃 0~4단계(형식 정의·백엔드·게이트3/4·페이지 합성·미리보기·뷰어·내보내기 page_format 분기, 2026-10-02)

**특수 말풍선 PNG 레이어 완료 (2026-09-22):** 지시서 `docs/지시서-특수말풍선PNG.md`
- pngbubble_items: cuts.spec JSON 배열 (effect_items 패턴). bubble_id·x·y·width·rotation·flip_h·opacity·text·font_size·font_family·text_align
- 카탈로그 5종: bubble_burst(외침/폭발), bubble_shout(외침/꼬리), bubble_think(생각/구름), bubble_burst_wide(폭발 가로), bubble_burst_tall(폭발 세로). `frontend/public/bubbles/` + `bubbles_meta.json` 단일 소스
- 카탈로그 추가 방법: PNG를 `public/bubbles/`에 넣고 `bubbles_meta.json`에 한 줄(size·text_area·label·has_tail) + 백엔드 `VALID_PNGBUBBLE_IDS`에 키 추가
- 레이어 순서 (6단): 이미지 → 제품 → 효과 → SVG말풍선 → **PNG말풍선** → 효과음
- 글자: svg-text 전용(foreignObject 금지). text_area 안 자동 줄바꿈+넘침 자동 축소. font_size=0은 자동. flip_h 시 글자 뒤집지 않음
- 편집기: [특수 말풍선] 보라 버튼, 5종 피커, 드래그·회전·반전·삭제, 우측 패널(텍스트·크기·폰트·정렬·[대사 가져오기])
- 내보내기: 4경로(ZIP·세로·인스타·A4) PNG Base64 인라인, src→dataUrl 치환(CORS taint 방지)

**게이트1 기획서 개편 완료 (2026-09-22):** 지시서 `docs/지시서-게이트1-기획서.md`, 단편·광고 대상 (연작은 바이블 기반이므로 범위 밖)
- 1단계: idea_brief 구조(raw→LLM 자동 정리→5칸 편집→재정리→읽기 전용). 광고 모달 제품 필드. gate_status 단일 소스
- 2단계: 등장인물 미리 채움(gender/age, charTouched 보호). 3축 user_touched 세분화. 기획 생성에 idea_brief 전체 주입("인물·사건 따를 것, 새 인물 금지"). 시놉시스 4단 dict(synopsis_parts). 제목 유지/AI 추천 별도 표시
- 3단계(읽기 전용 보강): 1·2단계에서 이미 반영 — 아이디어 정리 카드+시놉시스 4단+장르·분위기·전개 칩 모두 읽기 전용 표시 포함. Gate2/3 읽기 전용은 입력 옵션 미표시(현행 유지, 추가 필요 시 별도 작업)

**장소 텍스트화 완료 (2026-09-23):** 지시서 `docs/지시서-장소텍스트화.md`
- 장소 = 텍스트 스펙 중심: `locations.location_spec_en` (영문 ≤80단어, step27). 이름·묘사·분위기 변경 시 `generate_location_spec_en()` 자동 재생성 (Gemini 텍스트, 무료). 컷 프롬프트는 spec_en 우선, 없으면 `"name. description"` 한글 폴백(기존 에피소드). 로그 `"location_ref: text_only|attached(768px) spec=en|ko"`
- 장소 이미지 = 옵션(1패킷): [장소 이미지 만들기]/[다시 만들기] 버튼. 참고 사진 업로드는 비전 추출만(0패킷, description 비었을 때 채움, 이미지 변환은 하지 않음)
- 게이트 역할 변경: 게이트3 = 스타일·비율·캐릭터·(광고) 제품 (장소 섹션 제거, 기존 에피소드는 읽기 전용 요약). 게이트4 "콘티&장소" = 상단 장소 패널(카드 편집·사진 업로드·이미지 옵션·EN 스펙 미리보기·삭제) + 하단 콘티. 콘티 편집 모달에서 location_id 드롭다운 변경 가능(게이트4·5 둘 다). 게이트5 이후에도 장소 텍스트 편집 가능, 삭제는 콘티 참조 시 409
- 장소 API 게이트 완화: locations CRUD가 게이트 3·4·5 허용. 콘티 생성 시 대본 location_id 중 DB 미등록 있으면 400 + 누락 목록
- 대본 장소 지침: "물리적으로 다른 공간만 구분, 같은 앵글·입구/내부 통합, 단편 2~4개 최대 5개"
- UI 표시: ref_key 직접 노출 금지 — 한글 이름 + 작은 회색 ref_key (`utils/refNames.js` 공용 헬퍼). 컷 카드 장소·인물, 편집 모달 드롭다운에 적용

**스타일 썸네일 (2026-09-27, 1·2단계 완료):** 지시서 `docs/지시서-스타일썸네일.md`
- 파일: `frontend/public/styles/{key}.jpg` 15장 (STYLE_PRESETS 키와 1:1). 미리보기 `docs/스타일썸네일-미리보기.jpg`, 프롬프트 전문 `docs/스타일썸네일-프롬프트.md`
- 생성: `scripts/style_thumbs.py` — 게이트5와 동일한 `build_cut_prompt` + `STYLE_PRESETS` 프롬프트, 1:1 → 768px JPEG q85. `--keys a,b` / `--all`(기존 파일 건너뜀) / `--force`(덮어쓰기) / `--dry-run`. 로컬 API 직접 호출(패킷 무관, 장당 ~$0.07)
- **스타일 프리셋 문구를 바꾸면 그 키의 썸네일도 재생성**
- 현재: 15장 생성·게이트3 카드 UI 적용 완료(2026-09-28). marvel·western_fantasy는 도도 판단으로 유지

**장소 문장 버그 수정 완료 (2026-09-28):** `build_cut_prompt`에 `loc_image_attached` 파라미터 추가. True(long/full+이미지 첨부)면 LOCATION_REFRAME, False(bust/close_up 또는 한도 초과)면 `"Setting (text description only, no location image attached): …"`. "behind her"→"behind the character(s)" 성별 중립화. prompt-preview도 동일 로직(ref_labels 미첨부 시 장소 라벨 제외). style_thumbs.py는 문자열 replace 해킹 → `loc_image_attached=False` 파라미터로 정리

**모바일 다크 테마 완료 (2026-09-30):** 지시서 `docs/지시서-모바일다크테마.md` 4단계 완공
- 기반: `darkMode: 'class'`, night/neon 토큰, `.glass-card`/`.neon-btn`/`.neon-ring` 유틸, `useTheme` 훅(localStorage+모바일 기본 다크), 헤더 ☀/🌙 토글
- 1단계: 헤더 다크(bg-night-bg/80 backdrop-blur, 그라데이션 로고), 프로젝트/에피소드 카드 glass-card, "새 에피소드" neon-btn
- 2단계: 스텝바 현재 게이트 neon-ring·잠긴 탭 대비 ↑, 게이트 카드 glass-card, 읽기 전용 배너 모바일 2줄 grid-cols-2, 게이트1~4 폼 다크 확인
- 3단계: 게이트5 컷 카드 glass-card, 카드 버튼 5개 컴팩트(h-8, min-[400px] 라벨), N컷 생성 neon-btn, 내보내기 유리 스타일, 캐릭터 이름 줄바꿈
- 게이트 로딩 실패 대응: `useGateLoad` 공용 훅(스켈레톤·자동 재시도 1회·에러 카드·cancelled), Gate1~5 적용, `catch {}` 침묵 제거

**주요 기능 요약:**
- 게이트 1~5: 기획→대본→자산(캐릭터·스타일·비율·제품)→**콘티&장소**(장소 패널+콘티 생성)→이미지(배치 5컷씩/부분 실패 UI)
- 컷 비율: 에피소드별 5종 선택(1:1 정사각/9:16 세로/16:9 가로/3:4 세로/4:3 가로). Gate3 UI 5버튼, 첫 이미지 생성 후 잠금(프론트 비활성+백엔드 거부). 기존 에피소드 1:1 잠금, 신규 기본 9:16. gate_status JSON 저장(step24). Gemini image_config.aspect_ratio 실전달. 시트 1:1 고정, 장소 16:9 고정, 컷은 에피소드 비율. 가로 비율 프롬프트: 풀샷 앵커 "characters occupy 60-80% HEIGHT" 보강. 인스타 캐러셀 export: letterbox(비율 유지+흰 배경, center-crop 폐지)
- 대본 생성: 단편=STANDALONE_ADDON(완결 필수·기승전결), 연작=SERIES_ADDON(훅 끊기), 광고=AD_ADDON(제품 자연 노출+완결). 공용 SYSTEM_INSTRUCTION + 분기 애드온
- 광고 에피소드: gate_status.is_ad 플래그(JSON, 마이그레이션 불필요). 프로젝트 페이지 3버튼(단편/연작/광고), 카드 amber 배지. 관리자 showcase 기본 카테고리 "ad"
- 제품 자산: products 테이블(step25). Gate3 제품 섹션(광고 전용) — 사진 업로드→비전 추출→일러스트 시트(1패킷, 플랜C+참조 사진 직접 첨부). 컷별 has_product 플래그로 제품 등장 컷만 시트 참조+프롬프트 주입 (폴백 false — 기존 컷은 Gate5 콘티 수정 토글로 지정). Gate4 콘티 생성 시 대본 기반 자동 판단, Gate4/5 편집 모달에서 수동 토글 가능
- 제품 레이어: product_items(spec JSON). ProductLayer 컴포넌트 — 제품 실사 사진 오버레이. CutEditor 드래그·회전·크기·투명도 편집. 레이어 순서: 이미지→제품→효과→SVG말풍선→PNG말풍선→효과음. 뷰어+내보내기 4경로 Base64 인라인
- 생성 재시도: gemini_image.py·gemini.py 최대 2회 재시도(3초 간격). 패킷은 최종 성공 시에만 차감. Gate3/5 에러 문구 통일+"패킷 미차감" 안내
- 말풍선: 12종 SVG + CutEditor 드래그 편집 + SFX 효과음 + 커스텀 폰트 (효과음 5종 + 말풍선 2종) + 특수 말풍선 PNG 5종(pngbubble_items, svg-text 글자, bubbles_meta.json 카탈로그)
- 배경효과: 10종 PNG 카탈로그(집중선·속도선·깜짝 등) + EffectLayer + CutEditor 배치·크기·회전·불투명도·반전 편집 + 카드/라이트박스 표시
- Export: 프론트 렌더링 (PNG ZIP/세로/인스타/A4) + 커스텀 폰트 Base64 인라인 + 배경효과 PNG Base64 인라인 + document.fonts.load() 동기화
- 연작(Series): 바이블→아웃라인→회차 대본 생성→3단계 잠금→revise API→merge/split
- 캐릭터: 라이브러리 피커 + appearance_en 외형 명세 주입 + 이름 편집(외형 무관, appearance_en 불변) + 사진→외형 추출 + 표정 시트 2×3 격자(expressions) + 컷 참조에 표정 시트 포함 + 감정 88종→6패널 매핑 + 동물 캐릭터 체크박스
- 업로드: Pillow 실제 포맷 검증(JPEG/PNG/WEBP), 20MB 제한, EXIF 보정 + 긴 변 2400px 리사이즈 + JPEG q88. 캐릭터·장소 공용(image_util.py). 제품 사진은 별도 검증(validate_product_photo): 투명 배경 PNG만 허용(알파 채널 필수, 투명 픽셀 5%↑), RGBA 유지+PNG 저장. 시트 생성 참조는 흰 배경 합성본 사용(composite_on_white), 원본 미변경
- 폰트: FONT_CATALOG 단일 소스 (8종, charWidth 실측), woff2 서브셋 파이프라인 (scripts/build-fonts.py)
- 장소 사진: 업로드→비전 묘사 추출→일러스트 생성 (플랜 C). 제안 단계 사진 대체, 카드 변환본/원본 병기, 다시 변환

**컷 패널 분할 수정 (2026-09-18):** 9:16 세로 캔버스에서 2인 바스트샷 생성 시 장소 레퍼런스 원본이 별도 패널로 재현되는 문제. 원인: 원본 크기 장소 이미지가 Gemini에 "포함할 이미지"로 오해됨 + 프롬프트의 "panel/page" 어휘가 분할 유도. 해결: (1) 프롬프트 앞에 단일 일러스트 강제 문구 추가 + "webtoon panel" 등 분할 유발 어휘 제거, (2) bust/close_up 샷은 장소 이미지 미첨부(텍스트 설명만), long/full 샷은 768px 썸네일로 다운스케일 후 첨부, (3) 2인 이상 + bust/close_up + 9:16일 때 깊이 배치 구도 지시. 장소 텍스트 설명(Location.description)은 모든 샷에서 프롬프트에 포함.

**GPT Image 품질 실험 결론 (2026-09-23):** `scripts/gpt_image_test.py`로 ep30(광고) 컷 #1·#4·#5 × 2회 = 6장 생성. 모델 `gpt-image-2.5-sunburst`, `images.edit()` 엔드포인트, 참조 이미지 3~4장(캐릭터 시트+표정+장소/제품), quality=high, 1024x1536.
- **비용:** 장당 ~$0.073 (input $8/1M + output $30/1M, 출력 1372 tokens 고정). Gemini 3.1 Flash($0.067)와 동급
- **장점:** 배경 밀도·표정 자연스러움·구도가 Gemini보다 우위. 캐릭터 시트 추종 양호
- **단점:** 안경 오삽입 2/6 (시트에 없는 안경 추가). 화풍이 Gemini(수채풍)와 확연히 다름 → 에피소드 단위 모델 고정 필수. 제품 라벨 텍스트 재현 불가(양쪽 다 — 제품 레이어로 해결이 정답)
- **결정:** C(모델 선택 구조)는 형식/레이아웃 기능 완성 이후. GPT 칸 분할 실험은 레이아웃 기능 완성 후 "우리 합성 vs GPT 한 방" 비교로 진행

**교훈:** Gemini 2.5-flash의 image-to-image 스타일 변환은 불신뢰 (플랜 A: 프롬프트 강화 실패, 플랜 B: 참조 이미지 변환 실패 → 사진풍 유지). 플랜 C(비전 텍스트 추출→텍스트→이미지)로 해결 — 참조 이미지를 전달하지 않아 사진풍 오염 원천 차단. Pro 모델의 image-to-image는 1-5 모델 실험에서 재도전 가능.

**이미지 모델 전환 (2026-09-11):** `gemini-2.5-flash-image` → `gemini-3.1-flash-image` 완료. 2.5는 2026-10-02 종료 예정이었음. `IMAGE_MODEL` 환경변수로 관리 — 롤백은 `.env` 한 줄 변경 + touch main.py. 신모델 특성: 9:16 비율을 실제 준수(2.5는 정사각 출력이었음 — 새 컷부터 세로 비율), JPEG 출력(PNG 대비 30~60% 작음), generate_content API 호환 확인됨, 참조 5장 통과. 이미지당 원가 $0.039→$0.067.

**2층(로그인·대시보드·패킷·결제·랜딩) 완공 (2026-09-15):**
- 지시서: `docs/지시서-2층-메인페이지.md` (5단계 구성)
- [x] 0단계: 현황 조사 + 스키마 설계 → `docs/2층-스키마-설계안.md`
- [x] 1단계: 소셜 로그인 3사 + 본계정 확정(구글 id=3, 김김준) + 프로젝트 4·5·6 귀속 마이그레이션 완료 (2026-09-09)
- [x] 2단계: 대시보드 완료 (2026-09-09, 공지 바·헤더 리뉴얼·패킷 잔량 API·법률 페이지 3종·EziToon 전환·step18 마이그레이션). 구글 OAuth 앱 게시 완료(프로덕션 — 아무 구글 계정 로그인 가능). 네이버 검수는 오픈 준비 때
- [x] 3단계: 패킷 시스템 완료 (2026-09-11 검증 통과). 생성 5지점 차감(컷1/시트2/장소1/사진변환1/텍스트0) + 잔량 가드(402) + 실패 미차감 + /packets 현황 페이지 + admin_grant.py + 402 alert 팝업 통일(axios 인터셉터). 도도 실서버 테스트 완료: 잔량 표시·버튼 비용 표시·차감·부족 차단 alert 확인
- [x] 4단계: 토스페이먼츠 결제 완료 (2026-09-13 테스트 키 기준). 위젯 SDK v2 + API 개별 연동 키(ck) 조합 확정. step19 orders 테이블, payments 모듈(상품 정의·주문·승인·내역), 프론트 위젯 연동. 서버 검증 통과: 금액 불일치 거부·토스 거부·패킷 지급(purchase reason)·멱등(already_paid)·failed 주문 거부. 상품: packet_30(6,900원)/packet_100(19,900원)/packet_300(54,900원). 남은 것: 라이브 키 전환(가맹 심사 후) + 실카드 1건 최종 확인
- [x] 5단계 1차: 랜딩 페이지 배포 (2026-09-14, 네온 다크 디자인, antigravity 제작 — LandingPage.jsx, 비로그인 루트=랜딩 / 로그인=대시보드)
- [x] 5단계 2차: 공개 뷰어 + 갤러리 실데이터 배포 (2026-09-14). 공개 뷰어(/view/{UUID 토큰}, 비로그인 열람, BubbleOverlay+SfxLayer+EffectLayer 재사용). 갤러리 실데이터(episodes.showcase 플래그 + showcase_category + share_token, step20 마이그레이션, admin SQL 지정). 공개 API 2개(showcase/episodes + showcase/view/{token}). optional auth(get_optional_user). 이미지 URL /WEBTOON prefix 수정(resolveUrl 헬퍼). 노출작: ep26(연작), ep25·ep20(단편), ep30(광고)
- [x] 5단계 마무리: 도도 재확인 4항목 통과 (2026-09-15, 시크릿 창 갤러리 썸네일→뷰어 컷 표시→폰 공유 링크 → 2층 공식 완공)
- 메모: 서비스명 EziToon(이지툰) 확정 (콘솔 3사 포함 전환 완료). 문의처 k9k8j7y7@naver.com

**관리자 페이지 완공 (2026-09-15):**
- 지시서: `docs/지시서-관리자페이지.md` (5단계 구성)
- [x] 1단계: 권한(step22, users.is_admin) + /admin 뼈대 + 운영 대시보드(회원·가입·생성·판매·조회수)
- [x] 2단계: 갤러리 노출 관리 (에피소드 목록·토글·카테고리·URL 복사·프로젝트 필터)
- [x] 3단계: 패킷 운영 (회원 목록+검색·패킷 지급/차감·주문 목록+필터·pending 만료)
- [x] 4단계: 공지 관리 (등록/수정·활성 1건 원칙·유형·기간·KST/UTC 변환)
- [x] 5단계: 상품·가격 관리 (step23 packet_products DB 이전·products.py→DB 조회·변경 로그·노출 토글)
- 설계: 관리자 API는 전부 POST 통일 (Apache 리버스 프록시 PATCH 인증 헤더 누락 이슈 회피)
- 보안: require_admin 의존성 (is_admin=false → 403), 프론트도 is_admin 체크 + 홈 리다이렉트, 진입점 미노출

**토스 결제 키 현황:** 테스트는 공용 결제창형(gck) 키로 위젯 동작 확인. 라이브 전환 시 가맹 심사 후 상점 라이브 키로 교체 (.env 1줄 변경 + 재시작)

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
- [x] 2층 4단계 토스페이먼츠 결제 (완료 2026-09-13 테스트 키 기준, 위젯 SDK + ck 키, 승인·지급·멱등·금액검증 서버 검증 통과, step19 orders 테이블). 남은 것: 라이브 키 전환(가맹 심사 후) + 실카드 1건 최종 확인
- [x] 2층 5단계 1차 랜딩 페이지 (완료 2026-09-14, antigravity 제작, 네온 다크 디자인)
- [x] 2층 5단계 2차 공개 뷰어+갤러리 (완료 2026-09-14, step20 마이그레이션, showcase+share_token, 뷰어+갤러리 실데이터+이미지 URL 수정)
- [x] 2층 5단계 마무리 (완료 2026-09-15, 도도 재확인 4항목 통과 → 2층 완공)
- [x] 관리자 페이지 1~5단계 (완료 2026-09-15, step22+23, 대시보드·갤러리·패킷·공지·상품)
- [x] 컷 비율 선택 (완료 2026-09-16, step24, Gate3 UI, Gemini image_config 버그 수정, 기존 16ep 1:1 잠금 + 신규 9:16 기본, 도도 실서버 검증 통과)
- [x] 단편 대본 완결 구조 강제 (완료 2026-09-16, STANDALONE_SCRIPT_INSTRUCTION_ADDON — 기승전결 필수·예고 금지, 도도 검증 통과)
- [x] 광고 1단계 (완료 2026-09-16, 타입 플래그+배지+AD_ADDON, 도도 검증 통과)
- [x] 생성 실패 자동 재시도+안내 개선 (완료 2026-09-16, 최대 2회 재시도 3초간격, 에러 문구 통일)
- [x] 광고 2단계 제품 자산 (완료 2026-09-16, step25 products 테이블, Gate3 제품 섹션, 시트 생성+컷 참조 연동). 제품 시트 버그 3건 수정: 업로드 헤더 누락→화이트스크린, step26 ENUM 누락, 참조 사진 직접 첨부로 실루엣 충실도 개선 (도도 검증 통과 2026-09-17)
- [x] 광고 3단계 제품 레이어 (완료 2026-09-17, ProductLayer+CutEditor+Gate5+뷰어+내보내기4경로, step26 generation_logs ENUM, ErrorBoundary 추가)
- [x] 광고 컷 품질 수정 (완료 2026-09-17, has_product 컷별 제어+Gate4/5 토글+자동 판단, SHOT_SCALE_GUIDE 4종+PLACEMENT_COMMON_SENSE 스케일 앵커+LOCATION_REFRAME, 도도 검증 통과)
- [x] 컷 패널 분할 수정 (완료 2026-09-18, 단일 일러스트 강제+장소 참조 샷 분기(bust/close_up 텍스트만, long/full 768px 썸네일)+다인물 세로 구도, 도도 검증 통과)
- [x] 제품 투명 PNG 전용 + 시트 유지 + 게이트3 읽기 전용 + 내보내기 PNG 투명 보존 (완료 2026-09-18, 도도 검증 통과). 광고 기능 전체 실서버 검증 완료
- [x] ep30 광고 샘플 showcase 공개 (완료 2026-09-19, 카테고리 자동 결정 버그 수정+AD 배지, 랜딩 광고 탭 오픈, 도도 검증 통과)
- [x] v2 1단계 비율 5종 (완료 2026-09-20, Gate3 UI 5버튼+백엔드 검증+프롬프트 분기+인스타 letterbox+prompt-preview API). 말풍선 여백 프롬프트·고급 프롬프트 편집 UI는 도도 판단으로 제거(사용자 불필요). 16:9 실생성 검증 대기(ep31 슛돌이 단편)
- [x] **게이트1 기획서 개편** (완료 2026-09-22, 1~3단계, idea_brief 구조+등장인물 미리 채움+기획 생성 idea_brief 주입+시놉시스 4단+제목 유지+읽기 전용 보강)
- [x] GPT Image 품질 실험 (완료 2026-09-23, gpt_image_test.py, ep30 광고 #1·#4·#5 × 2 = 6장, gpt-image-2.5-sunburst images.edit)
- [x] 장소 텍스트화 1·2단계 (완료 2026-09-23, step27+location_spec_en+게이트4 콘티&장소+장소 이미지 옵션+사진 비전 전용+컷 카드 한글 이름)
- [ ] 16:9 실생성 검증 (ep32 슛돌이 단편, v2 비율 5종 관련)
- [x] B 스타일 썸네일 — 1~3단계 완료(15장 생성+Gate3 카드 UI, 2026-09-28). 4단계(마무리)는 모바일 레이아웃과 함께
- [x] 장소 문장 버그 수정 (완료 2026-09-28, loc_image_attached 플래그+성별 중립+prompt-preview 일치+style_thumbs 정리)
- [x] 모바일 다크 테마 1~4단계 (완료 2026-09-30, class 방식·night/neon 토큰·glass-card/neon-btn·헤더+목록+게이트1~5 전체·읽기 전용 배너 2줄·컷 버튼 한 줄·캐릭터 이름 줄바꿈·게이트 로딩 실패 대응 useGateLoad 훅)
- [x] B 형식/레이아웃 0~4단계 (완료 2026-10-02, 형식 정의·백엔드 비율 강제·콘티 가이드·게이트3 형식 카드·게이트4 페이지 배지·페이지 합성 composePageGrid·게이트5 미리보기·뷰어 페이지 표시·내보내기 page_format 분기)
- [ ] F 실사 캐릭터 (에피소드 단위 전 컷 GPT)
- [ ] 모바일 레이아웃 1차 (`docs/지시서-모바일레이아웃-1차.md`, 0단계 조사부터) → 2차(랜딩·게이트1~3·편집기)
- [ ] C 이미지 모델 선택 (에피소드 단위 모델 잠금, openai_image.py 어댑터)
- [ ] 폴리싱 잔여: 뷰어 컷 클릭 확대 모달(게이트5 미리보기 스타일)
- [ ] 후순위: ep_no 중복 정리, 텍스트 모델(gemini-2.5-flash) 교체(종료일 발표 시)
- [ ] 백로그: 기획 생성 시 AI가 빠뜨려 카드 값으로 추가된 인물의 ref_key가 한글 코드 해시(`c149c124c648`)로 생성됨 — `story/service.py` `_name_to_ref_key`. 읽을 수 있는 영문 snake_case로 개선 필요

## 개발 규칙

- **문서대로 구현.** 설계 문서(`docs/`)가 기준. 즉흥 이탈 금지
- **git 안전:** (1) 테스트 통과마다 커밋 (2) 큰 구조 변경 전 커밋 (3) `git checkout`/`git reset` 등 파괴적 명령 전 사용자 확인
- **BubbleOverlay 상수:** `CHAR_WIDTH=0.93`(기본, pretendard), `REF_WIDTH=800`, `LINE_HEIGHT_RATIO=1.45`, `BASE_FONT_SIZE=14`, `BASE_PADDING_X=14`, `BASE_PADDING_Y=10`. 폰트별 charWidth는 FONT_CATALOG 참조. `bubbleSpec.json`의 `charWidth: 0.72` 사용 금지
- **말풍선 렌더러 수정 시:** `composition/service.py`의 `RENDERER_VERSION` 올리고, `frontend/src/utils/bubbleSpec.json` + `backend/app/composition/bubble_spec.json` 동시 업데이트
- **텍스트 렌더 이원 모드:** 화면=`<foreignObject>` / export=SVG `<text>/<tspan>` (`renderMode='svg-text'`). 수정 시 두 모드 동시 수정 + `node scripts/bubble-shot.mjs` 비교 판정 통과 필수
- **편집기 오버레이:** 편집기 오버레이 레이어는 루트에 pointer-events none, 실제 조작 요소에만 all. 레이어 추가 시 아래 레이어 선택 회귀 테스트 필수(일반 말풍선·효과음·효과·제품)
- **편집기 입력:** Pointer 이벤트(`onPointerDown/pointermove/pointerup`)로 통일. 선택은 `pointerdown` 즉시. **`onClick` 핸들러 금지** — 터치에서 pointerdown→click 버블링으로 선택이 해제됨. 컷 영역 `touch-action: none`(300ms 탭 지연 제거)·하단 패널 `touch-action: pan-y`(스크롤 유지). `DRAG_THRESHOLD` = mouse 5px / touch 12px. 실기기 검증 필수
- **모바일 레이아웃:** 모바일 기준 640px 미만(`sm:` 경계). 카드 그리드는 모바일 1열, 게이트 스텝바는 가로 스크롤(현재 게이트 자동 가운데). 게이트5 썸네일 틀은 에피소드 `aspect_ratio`(미설정 1:1). 모바일 확인은 `node frontend/scripts/mobile-check.mjs <JWT>` 다크/라이트 × 375/412/1280 스크린샷(`frontend/scripts/mobile-check/`, gitignore)
- **다크 테마:** class 방식(`darkMode: 'class'`), 모바일(640px 미만) 기본 다크 / PC 기본 라이트. 사용자 토글 `localStorage 'theme'`. 토큰 `night-bg`/`night-card`/`night-border`/`neon-from`/`neon-to`. 유틸 `.glass-card`(유리 카드)·`.neon-btn`(그라데이션 버튼)·`.neon-ring`(현재 게이트 강조). **새 컴포넌트는 `dark:` 클래스 필수.** 랜딩·뷰어는 항상 다크(변경 불필요)
- **게이트 초기 로드:** `useGateLoad` 훅 필수(`frontend/src/hooks/useGateLoad.js`) — 스켈레톤·자동 재시도 1회(1.5초)·실패 시 "다시 시도" 카드·언마운트 안전(cancelled). **`catch {}` 로 에러 삼키기 금지** — 실패 시 빈 화면 고착 원인. 게이트 컴포넌트 상단에 `if (loading) return <GateSkeleton />;` + `if (loadError) return <GateLoadError ... />;` 가드
- **Gemini:** API 키 `.env`의 `GEMINI_API_KEY`. 이미지 모델 `.env`의 `IMAGE_MODEL` (현재 `gemini-3.1-flash-image`), 텍스트 모델 `gemini-2.5-flash`
- **서버 .env 안전:** 서버 .env는 로컬과 다르다(GEMINI_API_KEY·SECRET_KEY·TOSS 키·IMAGE_MODEL 등 운영 전용 값). **절대 파일 통째로 scp 덮어쓰지 말 것.** 키 추가/변경은 서버에서 해당 줄만 `sed`/`echo >>` 로. 변경 전 `cp .env .env.bak.$(date +%Y%m%d)` 백업, 변경 후 `GEMINI_API_KEY` 등 기존 키 길이 확인. OAuth 키는 콘솔에서만 조회 가능, 서버 .env 백업은 날짜별 유지
- **DB 마이그레이션:** `stepN.sql` + `stepN_down.sql` 쌍. 리허설 up→verify→down→재-up + mysqldump 백업 + 사용자 승인 필수. DB 덤프 .sql 커밋 금지 (stepN은 예외). 마이그레이션 백업은 데이터 포함(no-data 금지)
- **운영 DB 데이터 변경 금지:** DDL뿐 아니라 단일 행 UPDATE/INSERT/DELETE도 예외 없음. SQL 텍스트 보고 → 도도 "실행해" 승인 → 실행 순서 필수. Python ORM 직접 실행도 동일
- **마이그레이션 리허설:** 반드시 별도 DB(`project_t_test`)에서만 실행. 운영 DB에는 도도의 "실행해" 승인 후 단 1회 적용. 리허설·테스트 목적으로 운영 테이블에 DDL/DML 실행 금지. `project_t_test`가 없으면 리허설 전에 먼저 생성 (운영 스키마 복제, 데이터 불필요)
- **페이지 형식:** `gate_status.page_format` (vertical/grid_2x2/strip_3). 단일 소스 `pageFormats.js`·`page_formats.py`. 형식이 `cell_ratio` 강제(2x2→1:1, 3단→16:9). 합성은 `composePageGrid`(프론트 Canvas). 내보내기는 `pageFormat` 분기 — vertical이면 현행 경로, 그 외면 페이지 단위. 템플릿 추가 = 정의 한 줄 + 콘티 가이드 문단
- **캐릭터 구조:** `episode_characters` JOIN이 표준 조회. link시 ref_key 대조, unlink 2단계(409+force), 삭제는 연결 0건만. 연결 캐릭터(`episode_id≠현재`)는 이미지 재생성 스킵. `characters.style`: 불일치 시 ⚠(차단 아님)
- **캐릭터 ref_key:** 바이블/기획 시점 확정 (영문 snake_case). 시트·대본·컷 전부 이 키 기준. 불일치 시 Gate5 ⚠, 콘티 모달에서 제거/치환. 바이블 인물 이름 ≠ 시트 이름 가능 (ref_key 매칭)
- **캐릭터 승계:** 게이트1 카드 값(`body.characters`)이 원본. AI 기획 결과의 gender/name/age는 카드 값으로 덮어씀. description은 카드 원문 맨 앞 + AI 보충 뒤(중복 문장 제거, `_dedupe_description`). 동물 키워드(강아지·고양이 등) 감지 시 gender "기타" 자동(카드에서 직접 바꾼 값은 유지). `/characters/link`가 대본 ref_key 자동 매핑
- **텍스트 AI 호출:** `AI_TOKENS_SHORT`(4096)/`MEDIUM`(8192)/`LONG`(16384) 상수만 사용. JSON 파싱은 `parse_ai_json()` 경유
- **컷 프롬프트 한글 금지:** 외형은 appearance_en, 장소는 location_spec_en(영어)만 주입. 지문(action)에는 한국어 짧은 괄호 외형만. spec_en 없으면 한글 폴백(기존 에피소드 호환)
- **프론트 FormData 업로드:** `api.post(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } })` 필수. 누락 시 422 + 흰 화면 (제품·장소 사진에서 2회 발생 이력)
- **ref_key UI 표시:** 사용자에게 ref_key 직접 노출 금지 → 한글 이름 + 작은 회색 ref_key. `utils/refNames.js` 공용 헬퍼(`locationName`, `characterName`, `locationOptionLabel`) 사용
- **서브 경로:** Vite `base: '/WEBTOON/'`, FastAPI `root_path="/WEBTOON"` — 새 컴포넌트 작성 시 prefix 반영
- **정적 파일:** `app.mount()` 미사용 → SPA fallback 핸들러에서 storage/assets/frontend 통합 서빙
- **배포 전 생성 작업 확인:** 배포 전 서버 로그(`/tmp/uvicorn.log`)에서 진행 중인 생성 작업(`generate_all_cuts START` 후 `DONE` 없음) 유무 확인, 있으면 완료 후 배포. `--reload`는 진행 중 작업이 끝날 때까지 새 요청을 받지 않아 health·폴링이 수 분간 멈추고, 재시작 후 인메모리 job이 사라짐(2026-10-05 ep41)
- **배포:** 파일별 `scp` → uvicorn `--reload` 자동 감지 (프론트는 빌드 후 dist 배포). **`.env` 변경은 `--reload`가 감지 못함** → 변경 후 반드시 `touch app/config.py`로 재시작 + `tail /tmp/uvicorn.log`에서 `Started server process` 확인
- **dev 서버:** 항상 백그라운드 기동 + curl 폴링 후 진행. 재시작 시 묻지 않고 수행, 한 줄 보고
- **다단계 지시서:** `docs/PROGRESS.md`에 현재 단계 갱신. 맥락 불확실 시 이 파일부터 읽기
- **로컬 스크립트 실행 전제:** `backend/.env`에 `IMAGE_MODEL`(없으면 config 기본값 2.5로 생성됨)·`GEMINI_API_KEY` 값 필요. venv는 PC별 Python 경로에 묶이므로 다른 PC면 `backend/venv` 재생성
- **D: 드라이브:** I/O 에러 이력 있음. 이상 시 즉시 C:로 사본
- **작업 환경:** 저장소는 각 PC의 `C:\vibecoding\WEBTOON` (외장하드에 두지 않음). PC 이동 = 떠나기 전 커밋+push, 앉으면 git pull. 외장하드는 백업 전용. `.env`·SSH 키는 git 밖 — 각 PC에 한 번씩 수동 배치. 정적 에셋(`public/`)은 반드시 git 추적 — clone만으로 동일 환경

## 배포 명령 참고

```bash
# 백엔드: scp -i "$USERPROFILE/.ssh/DONGHAESSHKEy.pem" <파일> bitnami@52.79.94.122:/home/bitnami/project-t/backend/<경로>
# 프론트: cd frontend && npx vite build && scp -r dist/. bitnami@52.79.94.122:/home/bitnami/project-t/backend/frontend/dist/
# DB: ssh bitnami@52.79.94.122 '/opt/bitnami/mariadb/bin/mariadb -u root -p"<비밀번호>" project_t < /home/bitnami/project-t/backend/stepN.sql'
# JWT: ssh -i "..." bitnami@52.79.94.122 'cd /home/bitnami/project-t/backend && source venv/bin/activate && python3 -c "from app.auth.jwt import create_access_token; print(create_access_token(user_id=1))"'
```
