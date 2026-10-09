import { useNavigate } from 'react-router-dom';
import { BookOpen, MessageSquare, Bell } from 'lucide-react';
import api from '../api/client';
import { Avatar } from './AuthorLink';
import timeAgo from '../utils/timeAgo';

const TYPE_ICON = { new_episode: BookOpen, inquiry_answer: MessageSquare };

export const refreshUnread = () => window.dispatchEvent(new Event('notifications:refresh'));

// 알림 항목 목록 — 헤더 드롭다운과 /notifications 페이지 공용. 클릭 → 읽음 + link 이동
export default function NotificationList({ items, onItemsChange, onNavigate }) {
  const navigate = useNavigate();

  const open = async (n) => {
    if (!n.is_read) {
      onItemsChange?.(items.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      api.post(`/notifications/${n.id}/read`).then(refreshUnread).catch(() => {});
    }
    onNavigate?.();
    if (n.link) navigate(n.link);
  };

  if (!items.length) {
    return <p className="px-4 py-10 text-center text-sm text-gray-400">아직 알림이 없어요</p>;
  }

  return (
    <ul className="divide-y divide-border dark:divide-night-border">
      {items.map((n) => {
        const Icon = TYPE_ICON[n.type] || Bell;
        return (
          <li key={n.id}>
            <button
              onClick={() => open(n)}
              className={`w-full text-left flex gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${n.is_read ? '' : 'bg-cyan-50/60 dark:bg-cyan-500/5'}`}
            >
              {n.actor?.nickname ? (
                <Avatar src={n.actor.avatar} size={36} />
              ) : (
                <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-300">
                  <Icon size={16} />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="flex items-start gap-2">
                  <span className={`flex-1 text-sm break-keep ${n.is_read ? 'text-gray-600 dark:text-gray-400' : 'font-bold text-ink-black dark:text-white'}`}>
                    {n.title}
                  </span>
                  {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                </span>
                {n.body && <span className="block text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{n.body}</span>}
                <span className="block text-[11px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
