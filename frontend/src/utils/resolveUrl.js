// 저장소 상대 경로(/storage/...) → 서브 경로 포함 URL. http(s)는 그대로
const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

export default function resolveUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const CATEGORY_LABELS = { short: '단편', series: '연작', ad: '광고·홍보' };
