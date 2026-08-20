# 진행 상태 추적

## 현재 작업: 지시서-Export검증-A4.md

| 단계 | 상태 | 비고 |
|------|------|------|
| 1단계 — 현행 Export 경로 조사 | **완료** | 프론트 SVG 경로 확인, Pillow 잔재 식별 |
| 2단계-수정 — 배선 (handleExport → exportRenderer) | **완료** | CORS + foreignObject taint 수정 포함 |
| 2단계 — 실출력 검증 7항목 | **완료** | 7/7 PASS (2026-08-20) |
| 3단계 — A4 내보내기 (신규 기능) | **완료** | 그리드+한컷+페이지분할 검증 PASS (2026-08-20) |
| 4단계 — 배포 + 커밋 | **배포 완료, 커밋 대기** | 2026-08-20 배포, 사용자 확인 후 커밋 |

## 수정 파일 요약 (2단계까지)

- `frontend/src/utils/exportRenderer.js` — useCORS=false, renderMode='svg-text' 전달
- `frontend/src/components/BubbleOverlay.jsx` — renderMode prop, svg-text 텍스트 렌더링
- `frontend/src/pages/BubbleTestPage.jsx` — renderMode 비교 섹션 추가
- `frontend/scripts/bubble-shot.mjs` — renderMode 비교 판정 추가
- `frontend/scripts/export-verify.mjs` — python3→python 수정
- `CLAUDE.md` — 이원 모드 규칙 3건 추가
