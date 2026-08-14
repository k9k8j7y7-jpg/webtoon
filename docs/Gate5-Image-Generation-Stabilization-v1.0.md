# Project T — 게이트 5 이미지 생성 안정화 수정 지시서

> **버전:** v1.0
> **작성일:** 2026-07-31
> **대상:** Claude Code
> **참조 문서:** docs/ 의 API-Spec-v1.0(9장 폴링), Tech-Stack-Decision-v1.0, Cut-Spec-Schema-v1.0
> **범위:** 게이트 5 이미지 일괄 생성의 Network Error 해결. 배치 처리 + 진행률.

---

## 배경 및 근본 원인

**증상:** 게이트 5에서 "40컷 생성" 클릭 시 `Network Error` 발생.

**근본 원인:** 현재 구현이 **한 요청에서 40컷을 순차 생성**(20~40분)하는 구조. 요청이 너무 오래 걸려 서버 부하·타임아웃으로 연결이 끊김.

**핵심 방향:** 타임아웃을 늘려 "버티게" 하는 것은 증상 완화일 뿐. **원인은 "한 번에 다 처리"하는 구조**이므로, 이를 **배치 처리 + 비동기 백그라운드 + 폴링 진행률**로 바꾼다. (이것이 API-Spec 9장의 원래 폴링 설계다. 현재 그 설계대로 구현되지 않아 문제 발생.)

---

## A. 백그라운드 비동기 처리 (BackgroundTasks)

> 지금 단계는 FastAPI `BackgroundTasks`로 가볍게 구현한다. Celery+Redis 큐는 프로덕션 시 도입(로드맵).

### A-1. 즉시 응답 (202)
- `POST /episodes/{id}/generate` 는 **즉시 202 반환** + `job_id`.
- 실제 이미지 생성은 `BackgroundTasks`로 뒤에서 처리.
- 이것만으로 Network Error(요청이 40분 대기하다 끊김)가 해결됨.

### A-2. job 상태 관리
- job 레코드에 진행 상태 기록:
  ```
  { job_id, status, total, done, failed: [cut_id...], created_at, updated_at }
  status: queued | processing | completed | completed_partial | failed
  ```
- 배치가 진행될 때마다 `done` 갱신.

---

## B. 배치 처리 (5컷씩)

### B-1. 배치 생성
- 전체 컷을 **5컷씩 나눠** 순차 생성. (배치 크기는 상수/설정값으로 빼서 나중에 조정 가능하게, 기본 5)
- 각 배치 완료 시 `job.done += 배치 성공 수`.
- 예: 40컷 → 8배치. 배치1 완료 → done=5, 배치2 → done=10 ...

### B-2. 배치 크기를 설정값으로
```python
# 예시
BATCH_SIZE = 5  # 나중에 안정성 확인 후 조정 가능 (5 → 10 등)
```

### B-3. 컷 이미지 생성 시 레퍼런스 주입 유지
- 각 컷 생성 시 캐릭터·장소 레퍼런스 주입은 현행 유지 (일관성).

---

## C. 진행률 표시 (프로그레스 바 + 텍스트)

### C-1. 폴링 (프론트엔드)
- `GET /jobs/{job_id}` 를 **2~3초 간격**으로 폴링.
- 응답의 `done`/`total`로 진행률 계산.

### C-2. UI
- **프로그레스 바** + 텍스트: `"이미지 생성 중... 15/40 (37%)"`
- 완료 시(`completed`): 결과(컷 이미지 그리드) 표시.
- 부분 실패 시(`completed_partial`): `"38/40 완료 (2컷 실패)"` + **실패한 컷만 재시도** 버튼.
  - 재시도는 기존 부분 재생성(`POST /cuts/{cut_id}/regenerate`) 활용.

### C-3. 폴링 안전장치
- 폴링 요청에 timeout 10초.
- 폴링 중 일시적 네트워크 에러 시 즉시 실패하지 말고 **재시도(최대 5회)** 후 실패 처리.
- 최대 폴링 횟수 제한(예: 1800회 ≈ 60분) — 무한 루프 방지.

---

## D. 타임아웃 안전망 (배치와 함께)

배치 처리가 메인 해결책이고, 아래는 **안전망**으로 함께 적용.

### D-1. Gemini API 타임아웃
- `backend/app/adapters/gemini_image.py`: `generate_content()` 에 `request_options={"timeout": 120}` (120초).
- 타임아웃 시 명확한 에러 반환 → 해당 컷을 `failed`로 기록하고 다음 컷 진행.

### D-2. httpx 타임아웃
- `backend/app/images/service.py`: 외부 이미지 로드 `httpx.get(url, timeout=30.0)`.

### D-3. 개별 컷 에러 격리
- 컷 하나 실패가 전체를 중단시키지 않도록 try-except로 격리(현행 유지/강화).
- Gemini 타임아웃 에러도 명시적 처리.
- **연속 5회 실패 시** 나머지 건너뛰고 job을 `completed_partial` 처리(실패 목록 포함).

### D-4. 에러 메시지 개선
- `Gate5Review.jsx`: `"Network Error"` 대신 `"일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요."` + 재시도 안내.

---

## 처리 흐름 요약

```
사용자 "40컷 생성" 클릭
   ↓
POST /generate → job 생성(total=40, done=0) → 즉시 202 + job_id
   ↓ (BackgroundTasks 백그라운드)
5컷씩 배치 생성:
   배치1(1~5) → done=5
   배치2(6~10) → done=10
   ... (컷 실패 시 job.failed에 기록, 연속 5회 실패 시 조기 종료)
   ↓
프론트: GET /jobs/{id} 폴링 (2~3초)
   → 프로그레스 바 "15/40 (37%)"
   → 완료: 결과 표시 / 부분실패: "N컷 실패 + 재시도" 버튼
```

---

## 검증

1. 프론트 빌드(`npx vite build`) 성공.
2. 백엔드 배포 후 서버 정상 기동.
3. **소수 컷(2~3컷) 생성** → 정상 완료 + 진행률 표시 확인.
4. **다수 컷(40컷) 생성** → Network Error 없이 배치로 진행, 프로그레스 바 갱신 확인.
5. 중간에 일부 컷 실패 시 → `completed_partial` + 재시도 버튼 동작 확인.

---

## 이번 범위 아님 (로드맵)

- **Celery + Redis 큐** — 프로덕션 정식 큐. 지금은 BackgroundTasks로, 정식 출시 시 Celery로 전환. (Tech-Stack-Decision의 원래 설계)

---

*문서 끝 — Gate5 Image Generation Stabilization v1.0*
