import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, MessageSquare } from 'lucide-react';
import api from '../api/client';

const PERIOD_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: '1w', label: '1주' },
  { key: '1m', label: '1달' },
  { key: '3m', label: '3달' },
];

const CATEGORY_OPTIONS = [
  { key: '', label: '전체' },
  { key: 'bug', label: '버그·오류' },
  { key: 'howto', label: '사용법' },
  { key: 'payment', label: '결제·패킷' },
  { key: 'feature', label: '기능 제안' },
  { key: 'other', label: '기타' },
];

const STATUS_OPTIONS = [
  { key: '', label: '전체' },
  { key: 'received', label: '접수' },
  { key: 'checking', label: '확인 중' },
  { key: 'answered', label: '답변 완료' },
  { key: 'closed', label: '종료' },
];

const STATUS_COLORS = {
  received: 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-300',
  checking: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  answered: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  closed: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
};

export default function InquiryListPage() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (category) params.category = category;
      if (status) params.status = status;
      const { data } = await api.get('/inquiries', { params });
      setInquiries(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, [period, category, status]);

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-comic-orange transition-colors mb-6 no-underline">
          <ArrowLeft size={16} /> 홈
        </Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-serif text-ink-black dark:text-white">내 문의</h1>
          <Link
            to="/inquiries/new"
            className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-white bg-comic-orange rounded-full hover:-translate-y-0.5 transition-all shadow-sm no-underline"
          >
            <Plus size={14} /> 문의하기
          </Link>
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {/* 기간 */}
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => setPeriod(o.key)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-full border transition-all ${
                  period === o.key
                    ? 'border-comic-orange bg-comic-orange/10 text-comic-orange'
                    : 'border-border dark:border-zinc-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {/* 카테고리 */}
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-2.5 py-1 text-[11px] font-bold border border-border dark:border-zinc-700 rounded-full bg-transparent text-gray-600 dark:text-gray-400 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {/* 상태 */}
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="px-2.5 py-1 text-[11px] font-bold border border-border dark:border-zinc-700 rounded-full bg-transparent text-gray-600 dark:text-gray-400 focus:outline-none"
          >
            {STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 dark:text-zinc-500 text-sm">로딩 중…</div>
        ) : inquiries.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare size={40} className="mx-auto text-gray-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-gray-400 dark:text-zinc-500">문의 내역이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {inquiries.map(inq => (
              <Link
                key={inq.id}
                to={`/inquiries/${inq.id}`}
                className="glass-card p-4 flex items-center gap-3 hover:border-comic-orange/30 transition-colors no-underline group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${STATUS_COLORS[inq.status] || ''}`}>
                      {inq.status_label}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500">{inq.category_label}</span>
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500">{formatDate(inq.created_at)}</span>
                  </div>
                  <p className="text-sm font-bold text-ink-black dark:text-white truncate group-hover:text-comic-orange transition-colors">
                    {inq.title}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
