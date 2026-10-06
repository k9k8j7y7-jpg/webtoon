import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  received: 'bg-gray-200 text-gray-700 dark:bg-zinc-700 dark:text-zinc-300',
  checking: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  answered: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  closed: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
};

function resolveUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/storage')) return `/WEBTOON${url}`;
  return url;
}

export default function InquiryDetailPage() {
  const { inquiryId } = useParams();
  const { user } = useAuth();
  const [inquiry, setInquiry] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [satSending, setSatSending] = useState(false);
  const endRef = useRef(null);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/inquiries/${inquiryId}`);
      setInquiry(data);
      setMessages(data.messages || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchDetail(); }, [inquiryId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const formatDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const handleSend = async () => {
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/inquiries/${inquiryId}/messages`, { body: newMsg.trim() });
      setMessages(prev => [...prev, data]);
      setNewMsg('');
    } catch { /* ignore */ }
    setSending(false);
  };

  const handleSatisfaction = async (value) => {
    if (satSending || inquiry?.satisfaction != null) return;
    setSatSending(true);
    try {
      await api.post(`/inquiries/${inquiryId}/satisfaction`, { satisfaction: value });
      setInquiry(prev => ({ ...prev, satisfaction: value }));
    } catch { /* ignore */ }
    setSatSending(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-zinc-500 text-sm">로딩 중…</div>;
  if (!inquiry) return <div className="min-h-screen flex items-center justify-center text-gray-400 dark:text-zinc-500 text-sm">문의를 찾을 수 없습니다.</div>;

  const isAnswered = inquiry.status === 'answered';
  const isClosed = inquiry.status === 'closed';

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link to="/inquiries" className="inline-flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-comic-orange transition-colors mb-6 no-underline">
          <ArrowLeft size={16} /> 내 문의
        </Link>

        {/* 문의 원문 */}
        <div className="glass-card p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${STATUS_COLORS[inquiry.status] || ''}`}>
              {inquiry.status_label}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-zinc-500">{inquiry.category_label}</span>
            <span className="text-[10px] text-gray-400 dark:text-zinc-500">{formatDateTime(inquiry.created_at)}</span>
          </div>
          <h1 className="text-lg font-bold font-serif text-ink-black dark:text-white mb-3">{inquiry.title}</h1>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{inquiry.content}</p>
          {inquiry.attachments?.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {inquiry.attachments.map((url, i) => (
                <a key={i} href={resolveUrl(url)} target="_blank" rel="noopener noreferrer">
                  <img src={resolveUrl(url)} alt="" className="w-20 h-20 object-cover rounded-lg border-2 border-border dark:border-zinc-700" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 대화 메시지 */}
        <div className="space-y-3 mb-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.is_admin ? 'justify-start' : 'justify-end'}`}
            >
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.is_admin
                  ? 'bg-comic-blue/10 dark:bg-comic-blue/20 border border-comic-blue/20'
                  : 'bg-gray-100 dark:bg-zinc-800 border border-border dark:border-zinc-700'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold ${msg.is_admin ? 'text-comic-blue' : 'text-gray-500 dark:text-gray-400'}`}>
                    {msg.is_admin ? '관리자' : '나'}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-zinc-500">{formatDateTime(msg.created_at)}</span>
                </div>
                <p className="text-sm text-ink-black dark:text-white whitespace-pre-wrap">{msg.body}</p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* 만족도 (답변 완료 상태일 때) */}
        {isAnswered && inquiry.satisfaction == null && (
          <div className="glass-card p-4 mb-4 text-center">
            <p className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-3">답변이 도움이 되었나요?</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => handleSatisfaction(1)}
                disabled={satSending}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-green-600 border-2 border-green-300 dark:border-green-700 rounded-full hover:bg-green-50 dark:hover:bg-green-900/20 transition-all disabled:opacity-50"
              >
                <ThumbsUp size={16} /> 도움 됐어요
              </button>
              <button
                onClick={() => handleSatisfaction(-1)}
                disabled={satSending}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-red-500 border-2 border-red-300 dark:border-red-700 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all disabled:opacity-50"
              >
                <ThumbsDown size={16} /> 아쉬워요
              </button>
            </div>
          </div>
        )}
        {inquiry.satisfaction != null && (
          <div className="text-center mb-4">
            <span className={`text-xs font-bold ${inquiry.satisfaction === 1 ? 'text-green-600' : 'text-red-500'}`}>
              {inquiry.satisfaction === 1 ? '👍 도움이 되었다고 평가하셨어요' : '👎 아쉽다고 평가하셨어요'}
            </span>
          </div>
        )}

        {/* 추가 댓글 입력 */}
        {!isClosed && (
          <div className="flex items-end gap-2">
            <textarea
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="추가 내용을 입력하세요"
              rows={2}
              className="flex-1 px-4 py-2.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange resize-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !newMsg.trim()}
              className="px-4 py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-xl text-sm font-bold hover:-translate-y-0.5 transition-all disabled:opacity-50 shrink-0"
            >
              {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
