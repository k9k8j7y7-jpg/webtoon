# scratch 2차 — 상세페이지: 섹션 타입 3종 + 본문 A/B + 완성 스택 (코드 변경 없음)

> 목적: 1차(8장, 전부 캐릭터 구도로 단조) 결론을 바탕으로 ① **캐릭터
> 없는 섹션 타입 2종**이 상세페이지답게 나오는지 ② **본문 텍스트를 GPT가
> 직접 그리는 것(A) vs 우리가 합성하는 것(B)** 중 뭐가 맞는지 ③ B안으로
> 기획안 본문 전부 담은 **완성 스택**이 상세페이지로 보이는지 확인.
> 운영 코드·DB 불변, scratch/detail2/ 아래, API 직접. 1차 스크립트
> (scratch/detail/)·설명 컷 템플릿·제품 clause 재사용, 바꿀 문장은
> 스크립트 안에서만.
> [근거] 도도 11-13 — "캐릭터 없이 제품으로만 들어가야 설명이 될 것들이
> 있는데 전부 모델이 들어가니 너무 단조롭다" / "첨부한 텍스트 내용이
> 어느 정도 들어가야 상세페이지에 가까워진다" / "모델이 텍스트를 직접
> 그리는 것과 아닌 것 두 가지를 만들어 보자".

## 입력 (1차와 동일)
- 제품: 도도툰 "AROMA Herb Pack Green Tea Spa"(SELECT만). **label_text는
  스크립트에서 "Herb Pack · GREEN TEA SPA"로 축약**(1차 잔글자 원인)
- 캐릭터: 김정신 정면 시트(캐릭터 컷에만)
- 스타일 korean_webtoon, GPT, **4:5**
- 기획안 8섹션(1차 JSON) + 각 섹션 **본문 전문**(도도 기획안 그대로, 이모지
  제거)

## 섹션 타입 3종 (템플릿)
- **char**(캐릭터 컷): 1차 템플릿 그대로 — 1·4·6·7·8
- **product_hero**(제품 단독): 캐릭터 금지. 병을 화면 60% 이상 크게,
  연출 소품(얼음·녹차잎·수건·욕실 선반)만, 헤드 상단 여백. 문구 "NO
  people, no hands, no faces — product only" — 2번
- **product_mech**(제품+원리): 캐릭터 금지. 병은 한쪽에 40%, 나머지에
  장치(zoom_inset / icon_badges / before_after 중 섹션 지정)가 **주인공**.
  "NO people, no hands, no faces; the diagram is the focal element" —
  3번(zoom_inset 두피 단면), 5번(icon_badges + 펌프)
- 공통: 헤드 한글 렌더 + 라벨, 이모지 금지, "no other text", 제품 참조
  + 타 포장 금지, palette 강조색, 4:5 상단 25% 헤드 여백

## 생성 목록 (총 11장)
1. **타입 재생성 3장**: s02 product_hero / s03 product_mech(zoom_inset) /
   s05 product_mech(icon_badges) → 1차 s01·s04·s06·s07·s08과 합쳐 8장
2. **본문 A/B 4장**: 긴 섹션 3(Point 1)·6(How to Use)
   - **A안**(GPT 직접): 그림 안에 헤드 + 본문 전문(3번 본문 약 120자 +
     불릿 2 / 6번 5단계 각 설명 약 30자×5)을 "render this Korean body
     text exactly, in a clean text block area" 로 렌더. 글자 검사는
     본문을 문장 단위로 쪼개 각각 포함 여부 → 정확 문장 수 / 전체
   - **B안**(합성): 1번 타입 재생성 결과(3번 product_mech, 6번 char)
     그대로 쓰고 본문은 아래 합성
3. **B안 완성 스택 1장**(+ 섹션별 "그림+본문 블록" 8장): 각 섹션 아래
   본문 블록을 **우리가 PIL로 합성** — 블록 배경은 그림 하단 색 샘플링해
   이어받기, 폭 1024 기준 본문 폰트 34~38px(Pretendard/Noto Sans KR
   Bold·Regular, 없으면 나눔고딕), 줄간격 1.6, 좌우 여백 80, 소제목(섹션
   제목) 44px 굵게, **강조 단어**(기획안의 따옴표·숫자: "-5도", "1000g",
   "물미역")는 제품 palette 색, 불릿·체크(☑)·단계 번호 ①~⑤ 렌더, 블록
   높이는 본문 길이에 맞춤. Hero(2)는 본문 짧게, Outro(8)는 CTA 한 줄 +
   여백. 8쌍을 세로로 이어 **stack_B.png**(폭 1024). 참고로 1차처럼 띠만
   얹은 stack 아님 — 상세페이지 완성본 수준
4. 비교용: **stack_A.png** — 3·6만 A안으로 바꿔 끼운 스택(나머지 B)

## 검사·보고
- results.json: 장별 헤드·라벨 정확, A안 본문 문장 정확률, 손 검사(steps
  는 패널당 2손 기준 ok로 예외), 시간·비용
- 출력 경로: scratch/detail2/out/ s02_hero.png·s03_mech.png·s05_mech.png·
  s03_A.png·s06_A.png·block_01~08.png·stack_B.png·stack_A.png·grid_
  types.png(1차 2·3·5 vs 2차 2·3·5 가로 비교)
- 보고: 경로 + 표 + "타입별 읽히는지"·"A안 본문 오타 몇 문장 중 몇" 한
  줄씩. **Read로 열지 말 것** — 도도가 로컬에서 열어 올림

## 도도가 볼 것
- grid_types: 캐릭터 없는 2·3·5가 1차보다 상세페이지다운가
- stack_A vs stack_B: 본문을 GPT가 그린 것(A)과 합성(B) 중 어느 쪽이
  읽히고 깨끗한가, A의 오타 수
- stack_B 전체: 8섹션 쌓았을 때 리듬(캐릭터→제품→원리→캐릭터…)이 생기나,
  본문 블록 글자 크기·배경 이어받기가 자연스러운가