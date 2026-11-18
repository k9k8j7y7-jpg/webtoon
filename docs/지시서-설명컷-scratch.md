# scratch — 설명 컷(인포그래픽 컷) 가능성 테스트 (코드 변경 없음)

> 목적: 광고 트랙에 "장면 컷" 외에 **설명 컷**(캐릭터가 가이드가 되어
> 제품 특징을 시각 장치로 보여주는 컷)을 넣을 수 있는지 GPT로 확인.
> 결과 10장을 도도가 보고 장치별 채택 여부 결정 → 6차 지시서.
> [근거] 도도 11-03 — 8컷 대본이 사용법은 담았지만 특징(쿨링·각질 제거·
> 그린티·1000g)은 대사 단어로만, 그림엔 없음. GPT 상세페이지(코팅막
> 01→03, 단면 확대, 아이콘 3개)처럼 "보여주는 장치"가 필요.
> 운영 코드·DB 건드리지 않음. scratch/explain/ 아래에서만. 비용은 API
> 직접 호출(패킷 아님).

## 입력
- 제품: scratch/product/in/ 의 자연바람 아로마 허브팩(그린티) 사진 1장
  (products 테이블 분석값 label_text·shape 있으면 clause에 사용)
- 캐릭터: 프리셋 여성(is_preset id 53) 정면 시트 1장
- 스타일: korean_webtoon 프리셋 문구 그대로
- 제품 특징(도도 입력 그대로): 즉각 쿨링·진정 / 그린티·허브 각질·피지
  제거 / 모발 보습 / 1000g 대용량
- 모델: gpt-image(운영과 같은 어댑터·사이즈 1:1 1024)

## 장치 5종 × 2장 = 10장 (scratch/explain/out/{장치}_{n}.png)
공통 프롬프트 머리: 캐릭터 참조 + 제품 참조 + 스타일 + "advertising
explainer panel in the same webtoon style; the character is the guide
(holding or pointing at the product), the infographic element is drawn
in the same line-and-color style, not photo; all text in Korean, spell
exactly; no other text" + 카피 렌더와 같은 글자 규칙.

1. **확대 단면(zoom_inset)**: 캐릭터가 두피를 가리키고, 원형 인셋에
   두피 단면 — 파란 쿨링 입자와 떨어지는 각질, 라벨 "쿨링 · 각질 제거"
2. **아이콘 배지(icon_badges)**: 캐릭터가 제품을 들고, 옆에 배지 3개
   (잎/물방울/눈송이 아이콘) 라벨 "그린티 · 보습 · 쿨링"
3. **전·후 반반(before_after)**: 한 컷을 세로로 반 — 왼쪽 답답한 표정+
   붉은 두피 인셋, 오른쪽 개운한 표정+맑은 두피 인셋, 라벨 "BEFORE /
   AFTER"는 한글 "사용 전 / 사용 후"
4. **단계 미니 패널(steps)**: 캐릭터가 제품을 들고, 아래 작은 패널 3개
   "① 도포 ② 마사지 3분 ③ 헹굼"
5. **크기 비교(size_compare)**: 캐릭터가 1000g 병을 양손으로 들고, 옆에
   일반 300g 병 실루엣, 라벨 "1000g 대용량"

각 장치 2장은 같은 프롬프트로 2회(편차 보기). 생성 후 기존
check_copy_text로 라벨 글자 정확 여부 기록, 손·팔 개수도 기록.

## 보고
- 10장 경로 + 장치별 "라벨 정확/오류, 장치가 읽히는지(한 줄), 손 이상"
  표 + 격자 몽타주 1장(scratch/explain/out/grid.png) 경로
- 걸린 시간·비용 합계
- 도도가 보고 결정. **캡처는 Read로 열지 말 것.**