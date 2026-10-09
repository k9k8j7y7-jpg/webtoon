import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, CornerDownRight, Flag, Trash2, Ban, X } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from './AuthorLink';
import NicknameModal from './NicknameModal';
import timeAgo from '../utils/timeAgo';

// 뷰어 하단 댓글 영역 — 뷰어처럼 항상 다크 고정 색상
const MAX_BODY = 500;
const REPORT_REASONS = [
  { value: 'spam', label: '스팸·광고' },
  { value: 'abuse', label: '욕설·비방' },
  { value: 'sexual', label: '음란·선정' },
  { value: 'other', label: '기타' },
];

function ReportModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-[#141a2e] border border-white/10 rounded-2xl shadow-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold">댓글 신고</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer ${reason === r.value ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/10'}`}>
              <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-cyan-400" />
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-full text-sm font-bold bg-white/10 text-gray-300">취소</button>
          <button
            onClick={async () => { setBusy(true); await onSubmit(reason); setBusy(false); }}
            disabled={!reason || busy}
            className="flex-1 h-10 rounded-full text-sm font-bold bg-red-500/80 text-white disabled:opacity-40"
          >
            신고하기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CommentInput({ placeholder, onSubmit, autoFocus, onCancel, compact }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(text.trim());
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_BODY))}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
        className="w-full resize-none px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-400/50"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-gray-500">{text.length}/{MAX_BODY}</span>
        {onCancel && (
          <button onClick={onCancel} className="h-8 px-4 rounded-full text-xs font-bold bg-white/10 text-gray-300">취소</button>
        )}
        <button onClick={submit} disabled={!text.trim() || busy} className="neon-btn h-8 !px-5 !rounded-full text-xs disabled:opacity-40">
          {busy ? '등록 중…' : '등록'}
        </button>
      </div>
    </div>
  );
}

export default function CommentSection({ episodeId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null); // { items, has_more, next_before, comment_count, can_write, blocked }
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({}); // 최상위 id → 답글 펼침
  const [replyTo, setReplyTo] = useState(null); // 답글 입력 중인 최상위 id
  const [reportTarget, setReportTarget] = useState(null);
  const [nicknamePending, setNicknamePending] = useState(null); // 닉네임 저장 후 다시 보낼 { body, parentId }
  const [loadingMore, setLoadingMore] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [inputKey, setInputKey] = useState(0); // 등록 성공 시 입력창 초기화(닉네임 모달 경유 포함)
  const anchorDone = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get(`/episodes/${episodeId}/comments`);
      setData(d);
      setError('');
    } catch (err) {
      setError(err.response?.data?.detail || '댓글을 불러오지 못했어요');
    }
  }, [episodeId]);

  useEffect(() => { load(); }, [load]);

  // #comment-{id} 앵커: 답글이면 원댓글을 펼친 뒤 스크롤 + 잠깐 강조
  useEffect(() => {
    if (!data || anchorDone.current) return;
    if (location.hash === '#comments') { // 로그인 후 복귀
      anchorDone.current = true;
      setTimeout(() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' }), 300);
      return;
    }
    const m = location.hash.match(/^#comment-(\d+)$/);
    if (!m) return;
    anchorDone.current = true;
    const id = Number(m[1]);
    const parent = data.items.find((c) => c.replies.some((r) => r.id === id));
    if (parent) setExpanded((e) => ({ ...e, [parent.id]: true }));
    setHighlight(id);
    const scroll = () => document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(scroll, 150);
    setTimeout(scroll, 1500); // 위쪽 컷 이미지가 늦게 로드돼 위치가 밀리는 경우 보정
    setTimeout(() => setHighlight(null), 4000);
  }, [data, location.hash]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data: d } = await api.get(`/episodes/${episodeId}/comments`, { params: { before: data.next_before } });
      setData((prev) => ({ ...d, items: [...prev.items, ...d.items] }));
    } finally {
      setLoadingMore(false);
    }
  };

  const goLogin = () => navigate('/login', { state: { from: `${location.pathname}#comments` } });

  const post = async (body, parentId = null) => {
    try {
      await api.post(`/episodes/${episodeId}/comments`, { body, parent_id: parentId });
      if (parentId) setExpanded((e) => ({ ...e, [parentId]: true }));
      setReplyTo(null);
      if (!parentId) setInputKey((k) => k + 1);
      await load();
      return true;
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail === 'NICKNAME_REQUIRED') {
        setNicknamePending({ body, parentId });
      } else if (err.response?.status !== 401) {
        alert(typeof detail === 'string' ? detail : '등록하지 못했어요');
        if (err.response?.status === 403) load();
      }
      return false;
    }
  };

  const remove = async (c) => {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
    try {
      await api.delete(`/comments/${c.id}`);
      await load();
    } catch (err) {
      alert(err.response?.data?.detail || '삭제하지 못했어요');
    }
  };

  const block = async (c) => {
    if (!window.confirm(`${c.user?.nickname || '이 사용자'}님을 차단할까요?\n내 모든 작품에 댓글을 쓸 수 없게 돼요. (설정에서 해제 가능)`)) return;
    try {
      await api.post('/authors/block', { user_id: c.user.id });
      alert('차단했어요');
    } catch (err) {
      alert(err.response?.data?.detail || '차단하지 못했어요');
    }
  };

  const report = async (reason) => {
    try {
      await api.post(`/comments/${reportTarget.id}/report`, { reason });
      setReportTarget(null);
      alert('신고했어요. 운영팀이 확인할게요.');
    } catch (err) {
      alert(err.response?.data?.detail || '신고하지 못했어요');
    }
  };

  const renderComment = (c, isReply) => {
    const gone = c.status !== 'visible';
    return (
      <div
        id={`comment-${c.id}`}
        className={`flex gap-2.5 rounded-xl transition-colors duration-700 ${isReply ? 'py-2' : 'py-3'} ${highlight === c.id ? 'bg-cyan-500/10 -mx-2 px-2' : ''}`}
      >
        {gone ? (
          <span className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
        ) : c.user?.nickname ? (
          <Link to={`/u/${encodeURIComponent(c.user.nickname)}`} className="shrink-0"><Avatar src={c.user.avatar} size={32} /></Link>
        ) : (
          <Avatar size={32} />
        )}
        <div className="flex-1 min-w-0">
          {gone ? (
            <p className="text-sm text-gray-500 py-1.5">삭제된 댓글입니다</p>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs min-w-0">
                <span className="font-bold text-gray-200 truncate">{c.user?.nickname || '독자'}</span>
                {c.is_author && <span className="shrink-0 px-1.5 py-0.5 rounded bg-gradient-to-r from-purple-500 to-cyan-500 text-[10px] font-bold text-white">작가</span>}
                <span className="shrink-0 text-gray-500">{timeAgo(c.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-gray-200 whitespace-pre-wrap break-words">{c.body}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-gray-500">
                {!isReply && data.can_write && (
                  <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="flex items-center gap-1 hover:text-cyan-300">
                    <CornerDownRight size={12} /> 답글
                  </button>
                )}
                {c.can_delete && (
                  <button onClick={() => remove(c)} className="flex items-center gap-1 hover:text-red-400"><Trash2 size={12} /> 삭제</button>
                )}
                {c.can_block && (
                  <button onClick={() => block(c)} className="flex items-center gap-1 hover:text-red-400"><Ban size={12} /> 차단</button>
                )}
                {user && !c.is_mine && (
                  <button onClick={() => setReportTarget(c)} className="flex items-center gap-1 hover:text-amber-300"><Flag size={12} /> 신고</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section id="comments" className="max-w-2xl mx-auto px-4 py-8 border-t border-white/5 scroll-mt-16">
      <h2 className="flex items-center gap-2 text-base font-bold text-white mb-4">
        <MessageCircle size={18} className="text-cyan-400" /> 댓글 <span className="text-gray-400">{data?.comment_count ?? ''}</span>
      </h2>

      {/* 입력 영역 */}
      {!user ? (
        <button onClick={goLogin} className="w-full h-12 rounded-xl border border-dashed border-white/15 text-sm text-gray-400 hover:text-white hover:border-white/30">
          댓글을 쓰려면 로그인
        </button>
      ) : data?.blocked ? (
        <p className="w-full px-4 py-3 rounded-xl bg-white/5 text-sm text-gray-400">작성할 수 없어요 — 작가가 댓글 작성을 제한했어요</p>
      ) : data?.can_write ? (
        <CommentInput key={inputKey} placeholder="따뜻한 한마디를 남겨 주세요" onSubmit={(body) => post(body)} />
      ) : null}

      {/* 목록 */}
      <div className="mt-4 divide-y divide-white/5">
        {error && <p className="py-6 text-center text-sm text-gray-500">{error} <button onClick={load} className="ml-2 text-cyan-400">다시 시도</button></p>}
        {!error && !data && <p className="py-6 text-center text-sm text-gray-500">불러오는 중…</p>}
        {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-gray-500">첫 댓글을 남겨 보세요</p>}
        {data?.items.map((c) => {
          const open = expanded[c.id];
          return (
            <div key={c.id}>
              {renderComment(c, false)}
              <div className="pl-10">
                {c.replies.length > 0 && (
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [c.id]: !open }))}
                    className="mb-1 text-xs font-bold text-cyan-400 hover:text-cyan-300"
                  >
                    {open ? '답글 접기' : `답글 ${c.replies.length}개 보기`}
                  </button>
                )}
                {open && c.replies.map((r) => <div key={r.id}>{renderComment(r, true)}</div>)}
                {replyTo === c.id && (
                  <div className="pb-3">
                    <CommentInput
                      compact
                      autoFocus
                      placeholder={`${c.user?.nickname || ''}님에게 답글`}
                      onSubmit={(body) => post(body, c.id)}
                      onCancel={() => setReplyTo(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {data?.has_more && (
        <button onClick={loadMore} disabled={loadingMore} className="mt-3 w-full h-10 rounded-full bg-white/5 text-sm font-bold text-gray-300 hover:bg-white/10 disabled:opacity-50">
          {loadingMore ? '불러오는 중…' : '댓글 더 보기'}
        </button>
      )}

      {reportTarget && <ReportModal onClose={() => setReportTarget(null)} onSubmit={report} />}
      {nicknamePending && (
        <NicknameModal
          confirmLabel="저장하고 등록"
          description="댓글에 이 이름이 보여요. 나중에 설정에서 바꿀 수 있어요."
          onClose={() => setNicknamePending(null)}
          onSaved={() => { const p = nicknamePending; setNicknamePending(null); post(p.body, p.parentId); }}
        />
      )}
    </section>
  );
}
