import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import resolveUrl from '../utils/resolveUrl';

export function Avatar({ src, size = 24, className = '' }) {
  return src ? (
    <img
      src={resolveUrl(src)}
      alt=""
      className={`rounded-full object-cover shrink-0 bg-white/10 ${className}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-cyan-500/40 text-white/80 ${className}`}
      style={{ width: size, height: size }}
    >
      <User size={Math.round(size * 0.6)} />
    </span>
  );
}

// 작가 표시 — 닉네임이 있으면 /u/:nickname 링크, 없으면 "작가"(링크 없음).
// 카드 안(부모가 클릭 → 뷰어)에서도 쓰이므로 이벤트 전파를 막는다.
export default function AuthorLink({ author, size = 20, className = '' }) {
  const nickname = author?.nickname;
  const inner = (
    <>
      <Avatar src={author?.avatar} size={size} />
      <span className="truncate">{nickname || '작가'}</span>
    </>
  );
  if (!nickname) {
    return <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>{inner}</span>;
  }
  return (
    <Link
      to={`/u/${encodeURIComponent(nickname)}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 min-w-0 no-underline hover:text-cyan-300 transition-colors ${className}`}
    >
      {inner}
    </Link>
  );
}
