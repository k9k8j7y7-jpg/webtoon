import { GateSkeleton, GateLoadError } from '../../GateLoadFallback';

/** 상세페이지 게이트 공용 — 로딩 스켈레톤 / 실패 카드 */
export default function DetailLoad({ loading, error, onRetry }) {
  if (loading) return <GateSkeleton lines={4} />;
  return <GateLoadError message={error} onRetry={onRetry} />;
}
