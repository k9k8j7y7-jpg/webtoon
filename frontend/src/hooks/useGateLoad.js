import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 게이트 초기 데이터 로딩 훅 — 로딩 상태 + 자동 재시도 1회(1.5초) + 실패 UI + 언마운트 안전
 *
 * @param {() => Promise<void>} loader  데이터를 불러오는 async 함수 (내부에서 setState 직접 호출)
 * @param {any[]} deps                  loader를 재실행할 의존성 배열 (기본 [])
 * @returns {{ loading, error, retry }}
 *   loading: true이면 스켈레톤 표시
 *   error: string이면 "불러오지 못했어요" 카드 표시
 *   retry: 수동 재시도 함수
 */
export default function useGateLoad(loader, deps = []) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const retryTimerRef = useRef(null);

  const run = useCallback(async (isRetry = false) => {
    if (cancelledRef.current) return;
    setLoading(true);
    setError(null);
    try {
      await loader();
      if (!cancelledRef.current) setLoading(false);
    } catch (err) {
      console.error('[GateLoad] 데이터 로딩 실패:', err);
      if (cancelledRef.current) return;
      if (!isRetry) {
        // 자동 재시도 1회 (1.5초 후)
        retryTimerRef.current = setTimeout(() => {
          if (!cancelledRef.current) run(true);
        }, 1500);
      } else {
        // 2회째 실패 — 에러 표시
        setError(err.message || '데이터를 불러오지 못했습니다');
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    cancelledRef.current = false;
    run(false);
    return () => {
      cancelledRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [run]);

  const retry = useCallback(() => {
    cancelledRef.current = false;
    run(false);
  }, [run]);

  return { loading, error, retry };
}
