# CLAUDE-detail.md — 세부 이력·기능 상세

> CLAUDE.md에서 분리된 세부 내용. 규칙은 CLAUDE.md, 이 파일은 참조용 이력·상세.

## 현재 상태 이력

**내 작품 단일 목록 (2026-11-09):** 지시서 `docs/지시서 내작품 · MD`
- 프로젝트/에피소드 2층 → 한 화면 "내 작품"(`/my`). 한 컷·인스타툰 = 사용자별 기본 프로젝트(`projects.is_default=1`, kind=ad, title="내 광고", step37) 안에 에피소드. 연재툰 = kind=series 프로젝트 1행. story = 메뉴 "이야기 만들기" → `/projects`(기존 화면, story만)
- 화면에 "프로젝트"·"에피소드" 단어 금지. "작품"·"이야기"·"만들기" 사용
- 입구 카드 3(한 컷/인스타툰/연재) + 빈 4번째 + 빠른 한 컷 배너 + 필터 칩 + 단일 목록(updated_at desc, 광고 ep 개별 + 시리즈 1행)
- POST /my/works?type=onecut_ad|instatoon_ad|brand_series — 기본 프로젝트 find-or-create, 제목 자동("한 컷 광고 11/09")
- GET /my/works — 광고 ep(어느 프로젝트든) + series 프로젝트 1행, story 제외
- 공개 API 5곳(갤러리·뷰어·작가페이지·구독피드·댓글알림)에서 `is_default` 프로젝트명("내 광고") 폴백 차단
- MySeriesPage(`/my/series/:id`): 화 목록 + [새 화 만들기] + "← 내 작품"
- WorkflowPage: 광고 "← 내 작품", story "← 이야기 목록", 시리즈 "← 시리즈 홈"

**브랜드 연재툰 2차 완료 (2026-11-06):** 지시서 `docs/지시서-연재툰-2차.md`
- 시리즈 = 프로젝트(`projects.kind='series'`, step36). 새 프로젝트 3택(이야기/광고/연재툰), 시리즈 이름·컷 수·비율 선택 → 1화 자동 생성
- 새 화 = 직전 화 복사(브리프·제품·보여줄 특징·target_cuts·비율). prefilled_from 안내 줄. series_defaults UI 제거
- 모델 link-previous: episode_no n-1 우선, 없으면 가장 가까운 이전 화 fallback (0패킷)
- 컷 수 직접 입력: brand_series 4~20, instatoon_ad 4~10 정수. 임의 N 구조 비례 배분(brand_series: 훅 1 + 문제 ⌈N×0.2⌉ + 포인트·사용법 나머지 + CTA 1 / instatoon: 가장 가까운 4/6/8 기반 확장·축소). 4:5 비율 제외
- 설명 컷 위치 제한: 1컷(훅)·마지막(카피) 배치 금지 — addon 프롬프트 + service.py 위치 검증(위반 1회 재생성)
- 중간 컷 font_scale 1.15: brand_series·instatoon_ad 중간 컷(첫/마지막 제외) 말풍선·나레이션 기본 글자 크기 한 단계 키움
- 프론트: DashboardPage "연재" 배지 + ProjectPage "연재" 배지·[새 화 만들기], AdBriefForm 컷 수 칩+직접 입력·프리필 안내·placeholder "예:"·placeholder 회색, Gate3 "지난 화 모델 그대로 쓰기", LandingPage 연재툰→/my?new=series, 섞인 프로젝트 용도 모달에서 brand_series 제거

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

### 광고 트랙 6차 — 설명 컷 (2026-11-04~05)
지시서 `docs/지시서-설명컷.md`
- **컷 종류** `cut.kind`: `scene`(기본) / `explain`(설명 컷). **시각 장치** `cut.device` 6종: zoom_inset(확대 단면), icon_badges(아이콘 배지 3), before_after(전·후 반반), steps(단계 패널 3), size_compare(크기 비교), process(작용 과정 3패널)
- **ad_brief**: `visual_points [{feature, device, labels[], mechanism, elements[], compare?}]` 최대 5개. AI가 제품 특징에서 자동 추출. `idea_brief.ad_brief_result.visual_points`에 저장, `visual_points_selected`(인덱스 배열)로 사용자 선택
- **대본 N개 강제**: 선택된 visual_points 수만큼 "정확히 N개의 explain 컷" 프롬프트 강제(`prompt_fragments.py`). 대본 생성 후 explain 수 != 선택 수 → 1회 재생성, 그래도 불일치 → 경고 로그만(422 안 던짐). `instatoon_ad` target_cuts NULL이면 기본 6
- **콘티**: explain 컷은 `shot=bust` 고정, `has_product=True` 강제. **말풍선 하단 배치**: `_apply_copy_cut_positions(is_copy_cut=True)` 재사용 — 라벨이 상단에 오므로 대사·내레이션 y≥0.70(기존 ep 소급 없음)
- **프롬프트 라벨 허용**: `build_cut_prompt`에 `explain_clause`·`explain_labels` 파라미터 추가. 끝부분 텍스트 금지 블록 3분기: `copy_clause` → 카피 허용 / `explain_labels` → `"Render ONLY these Korean labels, spelled exactly: {labels}. No other text"` / 기본 → "DO NOT render any text…". explain clause는 스타일 뒤·샷 앞(drama_extra 중간 삽입 아님)
- **prompt-preview**: `storyboard/router.py` preview API도 explain clause·라벨 허용 문구 반영
- **제품 미등록 가드**: explain 컷이지만 Product 테이블에 photo_url 있는 행이 0이면 `has_product=False` 강제, 제품 clause 생략(에러 없이 캐릭터만). preview도 동일
- **before_after 템플릿**: LEFT(사용 전) 제품 등장 금지, RIGHT(사용 후) 제품 들기 명시
- **used_references에 product 기록**: `gen_info.used_references`에 `"product"` 포함(기존에는 char+location+style만 기록, 모델에는 첨부됐지만 기록 누락)
- **프롬프트 상세**: `prompts/explain.py` `build_explain_clause(device, labels, compare, elements, palette, mechanism)` — scratch 템플릿 이식. 공통 "clean composition, one focal element, leave negative space for labels". elements→"VISUAL DETAILS" 목록, palette→"use these product colors for infographic accents"
- **검사**: `check_copy_text`에 labels 전달(head=라벨 합침) → 불일치 재시도 1회(0패킷). `check_anatomy` 그대로 적용. gen_info에 `label_check`·`label_retried` 기록
- **PUT /cuts/{id}/device**: explain 컷 장치·라벨·mechanism·elements 변경
- **products analyze**: `palette`(영문 색명 2~3개) 추가. `idea_brief.product_palette`에 저장 → explain clause 강조색
- **프론트**: AdBriefForm "보여줄 특징" 칩(체크 토글, 기본 8컷→3·6컷→2·4컷→1). Gate2 "설명 · {장치}" 보라 배지+라벨 칩+편집. Gate5 빈 카드 "설명 · 장치" 머리말 보라색+(59)요약 text-gray-200 밝게. RegenDropdown 장치 6종 칩+라벨 입력
- **onecut_ad 해당 없음** — diff 0줄

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

## 아키텍처·과금 상세

- **패킷 가격:** 체험(15/3,900) · 시작(30/6,900) · 인기(100/19,900) · 대용량(300/54,900). 1회 결제 문구 고정, 유효기간 없음, 자동결제 없음
- **패킷 사용처:** `frontend/src/utils/packetUsage.js`의 `PACKET_USAGE` 단일 상수 — 가격 페이지·랜딩 FAQ 공유
- **패킷 가격 정책:** 순마진 = 결제액×0.872 − 93원×패킷수. 소량 45%/중량 40%/대량 35% 계단. 패킷당 판매가 최저 178원. 모델·환율 변경 시 재계산
- **환불:** 약관 제6조 4항 — 7일 이내 미사용 전액, 사용분 1개당 230원. `REFUND_TEXT` 상수 3곳(가격 페이지·랜딩 FAQ·약관) 통일
- **환영 패킷:** `auth/router.py` reason=admin_grant. user 생성 분기에서만 → 중복 불가, 기존 회원 소급 없음. 프론트 `sessionStorage('welcome_packets')` → Layout 토스트 5초
- **랜딩 참조 에피소드:** `LandingPage.jsx`의 `LANDING_EPISODES` 상수. ad=ep30(헤어팩), pet=ep25(반려동물), series=ep26(연작). 경량 릴스 `/storage/landing/reel_hairpack_short.mp4`(720×1280, 13초, 1.3MB) + 포스터 jpg. showcase router `reel` 필드(status=done이면 path)
- **파일 저장:** 로컬 FS 폴백(`/home/bitnami/project-t/storage/`)
- **비동기 작업:** FastAPI BackgroundTasks + 인메모리 Job 스토어
- **무효화 전파:** 대본 수정 → diff 판정 → 영향 자산/컷만 invalidated

## 기능별 규칙 상세

### 문의 게시판
`inquiries`·`inquiry_messages`(step29). 1:1 본인·관리자만 열람. 첨부 `inquiries/{id}/attachments/`(storage 재사용). 상태 흐름 received→checking→answered→closed, 관리자 상태 변경 POST(`/admin/inquiries/{id}/status`). 읽음은 사용자 엔드포인트(`GET /inquiries/{id}`)만 `user_read_at` 갱신 — 관리자 탭(`GET /admin/inquiries/{id}`)은 미접촉. 🔔 = `GET /inquiries/unread-count`(마운트·라우트 이동·window focus 갱신). 드로어 `MobileDrawer.jsx`(Layout·Landing 공용). 보호 경로 로그인 복귀 `sessionStorage('login_redirect')`. `<select>`·`<option>`은 명시 색상 필수(`dark:text-white` 상속 금지 — OS 기본 흰 배경에 흰 글자 안 보임). 리포트: 카테고리×주·미답변·평균 답변 시간·👍 비율 쿼리 가능(화면은 오픈 후)

### 구독·알림
구독 = `subscriptions`(작가 단위, step30), 알림 = `notifications` + `notify()` 단일 진입점(새 화·댓글·답글·문의 답변), 댓글 1단계 답글·신고·차단(step31). 웹푸시 = `push_subscriptions` + VAPID(`.env`) + `sw.js` 루트(scope `/WEBTOON/`), PWA `manifest.json`, 열람 공개·행동은 회원. WebAPK는 **별도 SW 컨텍스트**라 `push_enabled_here` localStorage 플래그로 자동 재구독(`PushToggleCard` useEffect — permission granted + 구독 null + 플래그 → `subscribePush()` 자동). 알림 목록(`NotificationsPage`)은 30초 간격 `/unread-count` 폴링 + 증가 시 재조회. `?n={notification_id}` 읽음은 `useAutoReadNotification`(deps `[user, nId]`) — user 로딩 완료 후 호출, `/view` 비보호 라우트에서도 동작. `send_push` 로그(`app.push.service`)는 `main.py`에서 `app` 로거 핸들러 설정. **BackgroundTasks 안에서는 `notify()` 후 `send_push(...)` 직접 호출** — `background=` 인자가 없으므로 `background.add_task` 경로 불가(motion_done·reel_done에 적용됨). 비회원 댓글은 `[댓글을 쓰려면 로그인]` → `navigate('/login', { state: { from: pathname#comments } })` → LoginPage `sessionStorage('login_redirect')` → OAuth 복귀

### 모션 웹툰
`cuts.spec.motion` JSON 확장(DB 마이그레이션 없음). `app/motion/`(service·router·prompts). Veo lite(`veo-3.1-lite-generate-preview`) 4초 생성→ffmpeg 앞 3초 트림, 비율별 패딩·크롭(1:1→16:9 패딩→크롭, 9:16 그대로, 3:4→9:16 패딩). 프롬프트에 캐릭터 **외모 설명**(appearance_en) — **이름(한글·영문) 절대 금지**(Veo 안전필터 celebrity 거부). 후보 2개 순차(서버 전역 세마포어 1), 격자 몽타주(원본+5프레임) Gemini flash 비전 검사 → 1회 재생성(`MOTION_MAX_RETRY`). **4패킷** 선차감(`packet_transactions.reason='generation'` + `description='motion ...'`), 전부 실패 시 환불+알림. BackgroundTasks에는 **ORM 객체 대신 id·값을 변수로 미리 추출**(세션 닫힘 방지). 실사 컷 제외(400). 이미지 재생성 시 motion 자동 삭제(`images/service.py`). export = `compose_dialogue_on_image(return_overlay=True)` RGBA PNG + ffmpeg overlay → 말풍선 합성 mp4(`export_path`). select 시 자동 생성. 뷰어·미리보기는 DOM 오버레이.
**릴스:** `gate_status.reel` JSON. `app/motion/reel.py`. 정지 컷 = blurred pillarbox + zoompan(1.0→1.05) 3초, 영상 컷 = export_path 재사용 + pillarbox. 말풍선 RGBA overlay(원본 좌표계 먼저 합성). 1080×1920 blurred pillarbox. concat demuxer + 무음 AAC + faststart. 끝 크레딧 1초(Pillow). **1패킷**, `source_hash`로 stale 판정 — `_compute_source_hash`는 nested `{"image_url":…, "motion":{"selected":…, "export_path":…}}` 구조 필수. stale → Clapperboard 오렌지 점 + 드롭다운 안내. 인스타 공유 3택(이미지·릴스·뷰어 링크). 배포 전 `Reel start`/`Reel done` 로그 쌍 확인

### 인스타 공유
Web Share API(`navigator.share({files})`) — `share()`는 **`onClick`에서 동기 호출**(await·pointerdown 금지, user activation 소실), 이미지는 모달 열릴 때 사전 렌더. JPEG q0.9 1080×1080 letterbox, 20장 한도(인스타 캐러셀). 캡션은 복사 방식(인스타가 텍스트 무시), 피드 선택 안내. 페이지 형식이면 페이지/컷별 토글(localStorage `insta_share_mode`). 크레딧 `© 닉네임 · EziToon`은 **인스타 경로만**(공유+ZIP, 기본 ON, localStorage `insta_credit`) — letterbox 흰 여백이면 검은 글씨, 이미지 위면 흰+외곽선. 뷰어 공유는 링크만(`share({url})` / clipboard 폴백), 이미지 공유는 작가(게이트5)만. Graph API 자동 발행은 백로그

### 빠른 한 컷
`/quick`(`QuickPage.jsx`) — 프리셋 6종 + 장면 + 대사(선택) + 스타일/비율 → 1컷. 유저당 '빠른 컷' 프로젝트 1개(`is_quick`, `single_page` 형식, gate 1~4 자동 done), 에피소드는 매 생성 시 새로. **프리셋 = `is_preset` 캐릭터**(시스템 프로젝트 id=7, 캐릭터 53~58 삭제 금지) — link로 복사, 시트·표정 참조 포함. 생성은 `generate_cut_image`·`regenerate_single_cut` 재사용, **1패킷 후차감**(`source='quick'`). 결과: composed_image_url 우선, [인스타 공유]·[PNG 저장]·[말풍선 고치기]·[다시 그리기 · 1패킷]·[이야기 만들기]. **expand** = `POST /quick/{episode_id}/expand` — 새 프로젝트·에피소드 생성(원본 복사, gate1 done, `revert` 금지). 입구 3곳: 랜딩·대시보드·GNB 드로어. 배포 전 quick job 확인

### 제품 자산
`products`(+`description`·`shape`·`size_hint`·`size_ratio`·`holding_photo_url`·`label_text`·`name_ko`), step34. **analyze** 0패킷(gemini flash 비전) — name·name_ko·colors·label_text·shape·size_hint·description 추출. 들고 사진 → **size_ratio = product_px ÷ hand_px**(손목~중지끝) 교차검증(직접 계산 우선, `parse_ai_json` 실패 시 정규식 폴백). 프롬프트 `app/prompts/product.py` `build_product_clause` 한 곳. **has_product 컷 참조 2순위** 고정(캐릭터 시트 다음, 2인이면 표정 1장으로 축소). `generation_logs.refs`에 제품 포함. **수동 override** = `cut.spec.has_product`(null=자동, true/false=수동) 단일 소스. **product_items** = 실사 오버레이(디테일 컷용). **합성(마스크·마젠타) 보류**. **ep30 실행 금지** — 테스트는 ep71(project 12)

## 개발 규칙 상세

### DB 마이그레이션 상세
- 리허설 순서: up→verify→down→재-up. `project_t_test` 없으면 먼저 생성(운영 스키마 복제, 데이터 불필요)
- DB 덤프 .sql 커밋 금지(stepN은 예외). 마이그레이션 백업은 데이터 포함(no-data 금지)

### 서버 .env 안전 상세
- 변경 후 `GEMINI_API_KEY` 등 기존 키 길이 확인
- OAuth 키는 콘솔에서만 조회 가능, 서버 .env 백업은 날짜별 유지

### 모달·드롭다운 상세
- 모달 열려 있는 동안 뒤 액션 버튼에 `pointerEvents:'none'`
- 드롭다운 PC: `getBoundingClientRect` 좌표, 모바일(<640px `matchMedia`): 바텀시트
- 메뉴 내부 `data-*-menu` attr로 바깥 클릭에서 제외. RegenDropdown·StepHeader 모두 이 패턴

### StepHeader 상세
- `locked`는 비활성 + 이유 텍스트. `setViewingGate`가 보기 이동 setter
- Gate4 승인 문구 예외: "콘티 승인 → 이미지 생성 시작" 유지

### useGateLoad 상세
- 파일: `frontend/src/hooks/useGateLoad.js`
- 스켈레톤·자동 재시도 1회(1.5초)·실패 "다시 시도" 카드·언마운트 안전(`cancelled` 플래그)
- 게이트 컴포넌트 상단 가드: `if (loading) return <GateSkeleton />;` + `if (loadError) return <GateLoadError ... />;`

### 연출 강도 상세
- `normalize_emotion()`(감정→8카테고리) + `build_drama_prompt()`(light/normal/strong)
- 기본값: `gate_status.drama_level`(광고형 light, 일반 normal), 컷 덮어쓰기 `spec.drama_level`
- strong 보호: 집중선 외곽 30%, 얼굴·배경 가독성, 캐릭터 일관성. **효과음 글자 금지**(모든 단계)
- 주입: `build_cut_prompt`의 `extra_prompt` 인자, `generate_cut_image` 안에서 자동 경유
- 감정 매핑: `drama.py` 상단 dict(나중에 관리자 편집 가능)

### 아이디어 단락 바꾸기 상세
- 방향→문구: `SECTION_DIRECTION_PROMPTS`(service.py, 한 곳). 칩: `SECTION_CHIPS`(Gate1Planning.jsx, 단락별 배열)
- stale 시그니처에 `briefStory` 포함 → 단락 변경 시 기획 재생성 배너 노출
- **이야기 전개는 단락 다시 쓰기 칩으로 대체**(전체 development 칩 없음, `planning_draft.development` 호환용 읽기만)
- `DEVELOPMENT_FRAGMENTS` 주입 제거됨 — story 4단락 ideaText로 직접 전달

### 캐릭터 구조 상세
- `episode_characters` JOIN이 표준 조회. unlink 2단계(409+force), 삭제는 연결 0건만
- 연결 캐릭터(`episode_id≠현재`)는 이미지 재생성 스킵. `characters.style` 불일치 시 ⚠(차단 아님)
- 바이블 인물 이름 ≠ 시트 이름 가능(ref_key 매칭). `/characters/link`가 대본 ref_key 자동 매핑
- 승계: `_dedupe_description`으로 중복 제거. 동물 키워드(강아지·고양이 등) → gender "기타" 자동(카드 값 우선)

### 페이지 형식 상세
- `cell_ratio` 있으면 비율 강제(2x2→1:1, 3단→16:9), `single_page`는 `cell_ratio: null`(비율 자유)
- 합성: `composePageGrid`(프론트 Canvas) — `per_page` null이면 세로 경로, 있으면 Grid 페이지
- 내보내기: `pageFormat` 분기 — vertical이면 현행, 그 외 페이지 단위
- 템플릿 추가 = 정의 한 줄 + 콘티 가이드 문단

### 작업 환경 상세
- D: 드라이브 I/O 에러 이력 — 이상 시 즉시 C:로 사본
- venv는 PC별 Python 경로에 묶임 → 다른 PC면 `backend/venv` 재생성
- `IMAGE_MODEL` 없으면 config 기본값 2.5로 생성됨(주의)
- 정적 에셋(`public/`)은 반드시 git 추적 — clone만으로 동일 환경

### 실사 캐릭터 상세 (보완)
- GPT size 매핑: 9:16·3:4→1024x1536, 16:9·4:3→1536x1024, 1:1→1024x1024. 3:4·4:3 중앙 크롭
- 편집 폼 순서: 실사 토글+초상권 동의 체크가 사진 업로드 **위**에 배치. 동의 미체크 시 업로드 비활성화
- 공개(갤러리·공유 링크) 허용, 마켓(판매·배포 목적) 불가. 약관·개인정보처리방침에 초상권 책임 조항
- 참조 이미지 번호는 `char_descs[...]["ref_images"]` 실제 첨부 순번. 실사 없는 에피소드 프롬프트 수정 전 동일(3,072 조합 비교)
- 검증 스크립트: `scratch/photo/gpt_realphoto_v2.py`(운영 프롬프트·어댑터, ep41 참조, git 밖)

### GPT Image 실험 상세 (보완)
- 스크립트: `scripts/gpt_image_test.py`, quality=high, 1024x1536, 출력 1372 tokens 고정
- 비용: input $8/1M + output $30/1M → 장당 ~$0.073

### 스타일 썸네일 상세 (보완)
- `STYLE_PRESETS` 키와 1:1 대응. 768px JPEG q85. `--keys a,b` / `--all` / `--force` / `--dry-run`. 장당 ~$0.07
- marvel·western_fantasy는 도도 판단으로 유지

### 장소 텍스트화 상세 (보완)
- 로그: `"location_ref: text_only|attached(768px) spec=en|ko"`
- 프론트 `handleGenerate` 성공 후 `loadLocations()` 호출하여 장소 패널 즉시 갱신
- 자동 생성 로그: `"auto-created N missing locations"`
- 콘티 편집 모달에서 `location_id` 드롭다운 변경 가능(게이트4·5 둘 다). 삭제는 콘티 참조 시 409
- ref_key 직접 노출 금지 → `utils/refNames.js` 공용 헬퍼(`locationName`, `characterName`, `locationOptionLabel`)

### 2층 완공 상세 (보완)
- 0단계: 스키마 설계 `docs/2층-스키마-설계안.md`
- 1단계: 소셜 로그인 3사 + 본계정 확정(구글 id=3, 김김준) + 프로젝트 귀속
- 2단계: 대시보드(step18, 공지 바·헤더·패킷 잔량 API·법률 페이지 3종). 구글 OAuth 앱 프로덕션 게시
- 3단계: 패킷(5지점 차감 + 402 가드 + admin_grant.py + axios 인터셉터)
- 4단계: 토스(위젯 SDK v2 + API ck 키, step19 orders, 금액 검증·멱등·패킷 지급). 상품: packet_30(6,900)/packet_100(19,900)/packet_300(54,900)
- 5단계: 랜딩(네온 다크) + 공개 뷰어(share_token UUID, step20) + 갤러리(showcase, optional auth)

### 한 컷 설명 장치 옵션 (2026-11-10)
- **onecut_device** — Gate1 "설명 장치 추가(선택)" 토글. OFF(기본)면 기존 한 컷 경로 100% 동일
- 장치 6종(zoom_inset·icon_badges·before_after·steps·size_compare·process)
- ad_brief visual_points 한 컷은 **1개**만 제안 → 프리필
- steps/process 라벨 **최대 4** 허용 (기존 3→4, 인스타툰·연재툰도 동일 확장)
- 콘티: onecut_device 있으면 kind=explain·device·labels 주입, 없으면 기존 spec
- 이미지: copy_clause + explain_clause 복합, "Render ONLY headline + subline + labels" 허용 문구
- explain_clause: `product_registered=False`면 제품 문구 제거, `allow_copy_text=True`면 글자 금지 제거
- 글자 검사: head·sub + 라벨 **개별** 검사(0패킷, 1회 재시도), copy-report에 라벨 포함
- `PUT /cuts/{id}/device` — 재생성 전 장치 변경(onecut만), PC·모바일 양쪽 지원
- 가이드 포즈 힌트: device 있으면 캐릭터 pose에 "guide gesture toward the panel" 자동 추가

### 73~77 같이 처리 (2026-11-10)
- **(73)** Gate3Assets: brand_series 형식·비율 섹션 숨김 (세로 웹툰·시리즈 비율 고정)
- **(74)** MySeriesPage: "{N+1}화 만들기" 버튼 텍스트 + 완성 화 1개 이상일 때 하단에도 같은 버튼
- **(75)** AdBriefForm: 다시 쓰기 칩별 스피너+비활성, 실패 시 alert 토스트
- **(76)** 상태 표기: 컷 생성 전="완성 단계", 전 컷 완료="완료". MyWorksPage 시리즈 카드, MySeriesPage 화 배지
- **(77)** DashboardPage: is_default·is_system 프로젝트 /projects 목록에서 숨김
