# CLAUDE-detail.md — 세부 이력·기능 상세

> CLAUDE.md에서 분리된 세부 내용. 규칙은 CLAUDE.md, 이 파일은 참조용 이력·상세.

## 현재 상태 이력

**제품 자산 2단계 완료 (2026-10-27):** 지시서 `docs/지시서-제품자산.md`
- Gate3 제품 섹션: isAd 조건 제거 → 항상 표시. [제품 추가] 모달(사진 필수·들고 사진 선택·[분석]→이름·한글이름·색·라벨글자·형태 칩7·크기 칩5 자동 선택→저장). 누끼 썸네일 카드+형태·크기 칩. 편집도 같은 모달
- Gate4 콘티: 컷 카드 "📦 제품 등장"/"📦 제품 없음" 배지(자동이면 "자동" 표시), 상단 "N컷 중 M컷에 제품" 요약, 편집 모달 토글 hasProducts 조건
- Gate5 이미지: 컷 카드 📦 배지, RegenDropdown "제품 참조 포함" 표시, 콘티 수정 토글 products.length>0 조건
- 빠른 한 컷: "제품 사진 (선택)" 업로드 + placeholder "제품을 들고 웃는다" + FormData 분기
- 컷 편집기: 제품 버튼 "실사 제품" + tooltip
- 백엔드: analyze name_ko 추출, size_ratio 프롬프트 보강+교차검증(product_px÷hand_px)+파싱 폴백, _detect_product_in_cut 한글 키워드 추가, step34 name_ko

**모션 웹툰 1단계 완료 (2026-10-16):** 지시서 `docs/지시서-모션.md`
- Veo lite image-to-video: 4초 생성→3초 트림, 비율별 패딩·크롭, 후보 2개 순차(세마포어 1)
- 격자 몽타주 비전 검사(원본+5프레임 한 장 Gemini flash), 탈락 시 1회 재생성
- 4패킷, 전부 실패 시 환불+알림, 실사 컷 제외, 이미지 재생성 시 motion 자동 삭제
- export: Pillow return_overlay(RGBA) + ffmpeg overlay → 말풍선 합성 mp4
- 프론트: Gate5 [움직이게]·MotionModal·MotionPicker, CutImageWithBubbles/Lightbox/뷰어 video 교체
- 비용: lite $0.05/s → 후보 2개 $0.40 + 검사·재생성 ≈ $0.47/컷

**전체 완료 목록:** 백엔드 7단계 + 프론트엔드 MVP + 5게이트 전체 + 연작 P1~P6 + 콘티 인라인 수정 + 0-2 appearance_en + 1-8 바이블 수정 + 1-7 지문 AI 재작성 + AI 토큰 상수화 + 0-4 커스텀 폰트 + 캐릭터 이름 편집 + 1-1 장소 사진 업로드 + 인물 배치 상식 + 1-1c 캐릭터 사진→시트(플랜C+참조토글) + 표정 시트 2×3 격자(expressions, 컷 참조, 감정 88→6) + 업로드 검증 개선(Pillow·20MB·리사이즈·동물 체크박스) + 1-4 배경효과 PNG 오버레이(effect_items+카탈로그10종+편집UI+내보내기Base64+배포) + 2층 완공(0~5단계, 2026-09-15) + 이미지 모델 3.1 전환 + 갤러리 좋아요·조회수(step21) + 관리자 페이지 완공(1~5단계, step22+23, 2026-09-15) + 컷 비율 선택(1:1/9:16, step24, 2026-09-16) + 단편 대본 완결 구조 강제(2026-09-16) + 광고 에피소드 1단계(타입·배지·광고 대본, 검증 통과 2026-09-16) + 생성 실패 자동 재시도+안내 개선(2026-09-16) + 광고 2단계(제품 자산, step25, 시트 생성+컷 참조, 2026-09-16) + 광고 3단계(제품 레이어 게이트5+뷰어+내보내기, step26 ENUM, 2026-09-17) + 광고 컷 품질(제품 컷별 선택 has_product+스케일 앵커 프롬프트, 2026-09-17) + 컷 패널 분할 수정(단일 일러스트 강제+장소 참조 샷 분기+다인물 세로 구도, 2026-09-18) + 제품 투명 PNG 전용 업로드+시트 유지+게이트3 읽기 전용+내보내기 PNG 투명 보존(2026-09-18) + 관리자 갤러리 showcase 카테고리 is_ad 자동 결정 버그 수정+AD 배지+ep30 광고 탭 공개(2026-09-19) + v2 1단계: 컷 비율 5종(1:1/9:16/16:9/3:4/4:3)+인스타 letterbox+prompt-preview API(2026-09-20) + 게이트1 기획서 개편(idea_brief 구조+등장인물 미리 채움+기획 생성 주입+시놉시스 4단+제목 유지, 2026-09-22) + 특수 말풍선 PNG 레이어(pngbubble_items 5종+편집기+뷰어+내보내기4경로, 2026-09-22) + 장소 텍스트화 1·2단계(step27 location_spec_en+게이트4 콘티&장소+장소 이미지 옵션+사진 업로드 비전 전용+컷 카드 한글 이름, 2026-09-23) + 캐릭터 연결 수정(기획 캐릭터 승계·ref_key 자동 매핑·콘티 가드·피커 스타일 필터, 2026-10-01) + 게이트1 캐릭터 승계 보강(동물 성별 기타 자동·카드 값 우선·설명 원문 보존, 2026-10-02) + 형식/레이아웃 0~4단계(형식 정의·백엔드·게이트3/4·페이지 합성·미리보기·뷰어·내보내기 page_format 분기, 2026-10-02) + F 실사 캐릭터 1~4단계(step28·GPT 분기·게이트3 시트 UX·웹툰 세계 프롬프트·콘티 등장인물 자동 보강, 2026-10-05) + 흑백 만화 스타일 bw_manga(프리셋 16종째·썸네일·실사 컬러 유지·stub is_photo_real·동의 순서·콘티 장소 자동 생성, 2026-10-08) + 모션 웹툰 1단계(Veo lite image-to-video·후보 2·격자 비전 검사·export ffmpeg overlay·MotionModal/Picker·뷰어 video, 2026-10-16)

## 기능별 상세

### 특수 말풍선 PNG 레이어 (2026-09-22)
지시서 `docs/지시서-특수말풍선PNG.md`
- pngbubble_items: cuts.spec JSON 배열 (effect_items 패턴). bubble_id·x·y·width·rotation·flip_h·opacity·text·font_size·font_family·text_align
- 카탈로그 5종: bubble_burst(외침/폭발), bubble_shout(외침/꼬리), bubble_think(생각/구름), bubble_burst_wide(폭발 가로), bubble_burst_tall(폭발 세로). `frontend/public/bubbles/` + `bubbles_meta.json` 단일 소스
- 카탈로그 추가 방법: PNG를 `public/bubbles/`에 넣고 `bubbles_meta.json`에 한 줄(size·text_area·label·has_tail) + 백엔드 `VALID_PNGBUBBLE_IDS`에 키 추가
- 레이어 순서 (6단): 이미지 → 제품 → 효과 → SVG말풍선 → **PNG말풍선** → 효과음
- 글자: svg-text 전용(foreignObject 금지). text_area 안 자동 줄바꿈+넘침 자동 축소. font_size=0은 자동. flip_h 시 글자 뒤집지 않음
- 편집기: [특수 말풍선] 보라 버튼, 5종 피커, 드래그·회전·반전·삭제, 우측 패널(텍스트·크기·폰트·정렬·[대사 가져오기])
- 내보내기: 4경로(ZIP·세로·인스타·A4) PNG Base64 인라인, src→dataUrl 치환(CORS taint 방지)

### 게이트1 기획서 개편 (2026-09-22)
지시서 `docs/지시서-게이트1-기획서.md`, 단편·광고 대상 (연작은 바이블 기반이므로 범위 밖)
- 1단계: idea_brief 구조(raw→LLM 자동 정리→5칸 편집→재정리→읽기 전용). 광고 모달 제품 필드. gate_status 단일 소스
- 2단계: 등장인물 미리 채움(gender/age, charTouched 보호). 3축 user_touched 세분화. 기획 생성에 idea_brief 전체 주입("인물·사건 따를 것, 새 인물 금지"). 시놉시스 4단 dict(synopsis_parts). 제목 유지/AI 추천 별도 표시
- 3단계(읽기 전용 보강): 아이디어 정리 카드+시놉시스 4단+장르·분위기·전개 칩 모두 읽기 전용 표시 포함

### 장소 텍스트화 (2026-09-23)
지시서 `docs/지시서-장소텍스트화.md`
- 장소 = 텍스트 스펙 중심: `locations.location_spec_en` (영문 ≤80단어, step27). 이름·묘사·분위기 변경 시 `generate_location_spec_en()` 자동 재생성 (Gemini 텍스트, 무료). 컷 프롬프트는 spec_en 우선, 없으면 한글 폴백
- 장소 이미지 = 옵션(1패킷). 참고 사진 업로드는 비전 추출만(0패킷)
- 게이트 역할: 게이트3 = 스타일·비율·캐릭터·제품 (장소 제거). 게이트4 "콘티&장소" = 상단 장소 패널 + 하단 콘티
- 장소 API 게이트 완화: locations CRUD가 게이트 3·4·5 허용. 콘티 생성 시 미등록 장소 자동 생성(0패킷)
- 대본 장소 지침: "물리적으로 다른 공간만 구분, 같은 앵글·입구/내부 통합, 단편 2~4개 최대 5개"

### 스타일 썸네일 (2026-09-27)
지시서 `docs/지시서-스타일썸네일.md`
- 파일: `frontend/public/styles/{key}.jpg` 16장. 생성: `scripts/style_thumbs.py`
- **스타일 프리셋 문구를 바꾸면 그 키의 썸네일도 재생성**
- bw_manga: "seinen-style manga print look, setting-neutral" — 일본풍 단어(Japanese) 금지

### 장소 문장 버그 수정 (2026-09-28)
`build_cut_prompt`에 `loc_image_attached` 파라미터 추가. bust/close_up은 텍스트만, long/full은 768px 썸네일. 성별 중립화

### 모바일 다크 테마 (2026-09-30)
지시서 `docs/지시서-모바일다크테마.md` 4단계 완공. `useGateLoad` 공용 훅 도입

### 실사 캐릭터 (F, 2026-10-05)
지시서 `docs/지시서-실사캐릭터.md`
- 데이터: `characters.is_photo_real`·`consent_given`·`reference_photos`(정면 필수, 최대 3장) — step28
- 시트 없음·패킷 미차감. stub에 `is_photo_real=True` 저장. 초상권 동의 필수
- 실사 캐릭터 1명+ → 전 컷 `OpenAIImageAdapter`(`gpt-image-2.5-sunburst`, `images.edit`). 비율 GPT size 매핑 + 3:4·4:3 중앙 크롭. 약 80원·34초/컷
- 프롬프트: 맨 앞 "2D 웹툰 일러스트" 강제, 예외는 실사 인물. "photorealistic" 사용 금지. 흑백 스타일이어도 실사 인물은 풀 컬러
- 참조 이미지 번호는 실제 첨부 순번. 콘티 등장인물 자동 보강

### 컷 패널 분할 수정 (2026-09-18)
단일 일러스트 강제 문구 + bust/close_up 장소 이미지 미첨부 + 2인 이상 깊이 배치 구도

### GPT Image 품질 실험 (2026-09-23)
ep30 × 6장, gpt-image-2.5-sunburst. 비용 동급($0.073 vs $0.067). 장점: 배경·표정·구도. 단점: 안경 오삽입, 화풍 차이. C(모델 선택)는 별도 작업

### 제품 컷 모델 규칙 (2026-10-28)
- 제품 컷(has_product=true) = GPT 기본. Gemini 라벨 뭉개짐, GPT는 판독 가능
- GPT 슬로건 삽입 → "no text except product label" 추가
- 정밀 합성 E(실사 오버레이 마스킹)는 백로그

### 광고 트랙 3차 (2026-11-02)
- 훅 카피 분기(instatoon_ad·brand_series): 1컷=hook_copy(15자, sub 없음), 마지막=head+sub. `_is_hook_cut` 플래그
- 렌더 컷 말풍선 초기 y≥0.70. `_apply_copy_cut_positions(purpose=)`
- has_product 손·팔 비전 검사: `check_anatomy()` hands/arms>2 → 재시도 1회. `build_product_clause(anatomy_hint=True)`
- purpose별 모델 수: `_PURPOSE_MODEL_LIMIT = {brand_series:2, instatoon_ad:1, onecut_ad:1}`
- 완성 컷별 생성: [이 컷 생성 · 1패킷], `GET .../pending-cuts`
- [이대로 진행] 스피너. 시트 버튼 `h-12 w-full`. JobProgress idle 비표시

### 광고 트랙 4차 (2026-11-03)
- 광고 3종 자동 생성 없음 (story만 자동)
- [다시 그리기] 단일 진입 → 바텀시트/팝오버(메모+연출+제품+인라인 확인)
- 카피 디자인 3트랙 공통(글씨체·위치·강조). `idea_brief.copy_design`
- 컷 수 칩 문구: 인스타 4/6/8, 연재 6/8/10
- 장소 칩 "📍 X 외 N곳", 훅/카피 라벨
- `location_hint`: cut spec에 저장(프롬프트 무관)

### 광고 트랙 5차 (2026-11-03)
- 전 컷 제품 참조 (instatoon_ad·brand_series): 모든 컷에 제품 참조. 비has_product 컷은 `build_product_exclusion_clause`("가짜 포장/라벨 금지"). `_ad_needs_product_ref` + `_reserved=2`
- 빈 카드 콘티 요약: action 2줄 + 첫 대사. 훅/카피 머리말
- 생성 버튼 동적 문구. 안내 한 줄. 준비 승인 버튼 문구 분기

### 브랜드 연재툰 2단계 (2026-11-03)
지시서 `docs/지시서-연재툰.md`
- brand_series = 인스타툰 파이프라인 + `series_defaults`(프리필, 제품 복사) + `episode_topic` + 연재 addon 6/8/10
- DB: `projects.series_defaults` JSON NULL (step35)
- 프론트: [새 화] 버튼, "이번 화 소재", [시리즈 기본값으로 저장], 모델 고르기

### 교훈
Gemini 2.5-flash image-to-image 스타일 변환 불신뢰. 플랜 C(비전 텍스트 추출→텍스트→이미지)로 해결

### 이미지 모델 전환 (2026-09-11)
`gemini-2.5-flash-image` → `gemini-3.1-flash-image`. `IMAGE_MODEL` env. 원가 $0.039→$0.067

### 2층 완공 (2026-09-15)
지시서 `docs/지시서-2층-메인페이지.md`. 0~5단계: 스키마→소셜 로그인 3사→대시보드→패킷→토스 결제→랜딩+갤러리+뷰어. 서비스명 EziToon(이지툰), 문의처 k9k8j7y7@naver.com

### 관리자 페이지 (2026-09-15)
지시서 `docs/지시서-관리자페이지.md`. 1~5단계: 권한→갤러리 관리→패킷 운영→공지→상품. API POST 통일(Apache PATCH 헤더 누락 회피)

### 토스 결제
테스트 gck 키 동작 확인. 라이브 전환 = 가맹 심사 후 .env 1줄

### 주요 기능 요약 (상세)
- 컷 비율: 5종(1:1/9:16/16:9/3:4/4:3). Gate3 UI, 첫 이미지 후 잠금. 시트 1:1, 장소 16:9. 인스타 letterbox
- 대본 생성: 단편=STANDALONE_ADDON(완결 필수), 연작=SERIES_ADDON(훅 끊기), 광고=AD_ADDON(제품 자연 노출)
- 광고 에피소드: gate_status.is_ad, 3버튼(단편/연작/광고), amber 배지
- 제품 자산 상세: products(step25+step34). analyze→시트→has_product 플래그→Gate4/5. product_items 실사 오버레이
- 생성 재시도: 최대 2회(3초), 성공 시에만 차감
- 말풍선: 12종 SVG + SFX + 커스텀 폰트 8종 + PNG 5종
- 배경효과: 10종 PNG 카탈로그 + EffectLayer
- Export: PNG ZIP/세로/인스타/A4 + Base64 인라인 + fonts.load()
- 연작: 바이블→아웃라인→회차 대본→잠금→revise→merge/split
- 캐릭터 상세: 라이브러리 피커 + appearance_en + 표정 시트 2×3 + 감정 88→6 + 동물 체크
- 업로드: Pillow 포맷 검증, 20MB, EXIF+리사이즈. 제품 PNG 투명 전용(알파 5%↑)
- 폰트: FONT_CATALOG 8종, woff2 서브셋 (scripts/build-fonts.py)

## 완료 작업 목록

- [x] 0-2 캐릭터 외형 명세 주입
- [x] 0-4 커스텀 폰트 (효과음 5종 + 말풍선 2종 + charWidth 실측)
- [x] 1-1 장소 사진 업로드 (플랜 C: 비전 묘사 추출→일러스트 생성, step14+15 배포)
- [x] 1-1c 캐릭터 사진→시트 + 표정 시트 격자화 (step16+17, 감정 매핑, 컷 참조 포함)
- [x] 업로드 검증 개선 (Pillow 실제 포맷 판정, 20MB, EXIF 보정+리사이즈, 동물 체크박스)
- [x] 1-4 배경효과 PNG 오버레이 (완료 2026-09-07)
- [x] 2층 0~5단계 (완료 2026-09-15, 완공)
- [x] 관리자 페이지 1~5단계 (완료 2026-09-15)
- [x] 컷 비율 선택 (완료 2026-09-16, step24)
- [x] 단편 대본 완결 구조 강제 (완료 2026-09-16)
- [x] 광고 1~3단계 (완료 2026-09-17)
- [x] 생성 실패 자동 재시도 (완료 2026-09-16)
- [x] 광고 컷 품질·패널 분할·투명 PNG (완료 2026-09-18)
- [x] ep30 showcase 공개 (완료 2026-09-19)
- [x] v2 비율 5종 (완료 2026-09-20)
- [x] 게이트1 기획서 개편 (완료 2026-09-22)
- [x] GPT Image 실험 (완료 2026-09-23)
- [x] 장소 텍스트화 1·2단계 (완료 2026-09-23)
- [x] B 스타일 썸네일 1~3단계 (완료 2026-09-28, bw_manga 2026-10-08)
- [x] 장소 문장 버그 수정 (완료 2026-09-28)
- [x] 모바일 다크 테마 1~4단계 (완료 2026-09-30)
- [x] B 형식/레이아웃 0~4단계 (완료 2026-10-02)
- [x] F 실사 캐릭터 1~4단계 (완료 2026-10-05)
- [x] 문의 게시판 0~4단계 (완료 2026-10-07)
- [x] 내레이션 박스 1~2단계 (완료 2026-10-13)
- [x] 연출 강도 1~2단계 (완료 2026-10-13)
- [x] H 구독·알림 4단계 묶음 3 (완료 2026-10-14)
- [x] 인스타 공유 1~3단계 (완료 2026-10-14)
- [x] 단계 헤더 1~2단계 (완료 2026-10-14)
- [x] 편집기 툴바 B안 (완료 2026-10-14)
- [x] 아이디어 정리 단락 바꾸기 (완료 2026-10-15)
- [x] 재포지셔닝 1차 (완료 2026-10-20)
- [x] 빠른 한 컷 (완료 2026-10-22)
- [x] 제품 자산 2단계 (완료 2026-10-27)
