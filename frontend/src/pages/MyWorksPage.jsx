import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import api from '../api/client';
import { Sparkles, Image, Smartphone, BookOpen, Clock, FolderOpen, X, ChevronRight } from 'lucide-react';

/* ── 상수 ── */
const FILTER_CHIPS = [
  { key: 'all', label: '전체' },
  { key: 'onecut_ad', label: '한 컷' },
  { key: 'instatoon_ad', label: '인스타툰' },
  { key: 'brand_series', label: '연재툰' },
];

const PURPOSE_BADGE = {
  onecut_ad:     { label: '한 컷',    color: 'bg-comic-orange/15 text-comic-orange' },
  instatoon_ad:  { label: '인스타툰', color: 'bg-purple-500/15 text-purple-400' },
  brand_series:  { label: '연재',     color: 'bg-comic-blue/15 text-blue-400' },
};

const ENTRY_CARDS = [
  { key: 'onecut',    icon: '📸', title: '한 컷 광고',      desc: '제품 사진 한 장이면 끝',     modal: 'onecut' },
  { key: 'instatoon', icon: '📱', title: '인스타툰 광고',   desc: '4~8컷 캐러셀 + 릴스',       modal: 'instatoon' },
  { key: 'series',    icon: '📚', title: '브랜드 연재툰',   desc: '같은 캐릭터로 매주 한 편',   modal: 'series' },
];

const todayLabel = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
};

/* ── 메인 컴포넌트 ── */
export default function MyWorksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all');
  const [modal, setModal] = useState(null); // 'onecut' | 'instatoon' | 'series'

  /* URL ?new= 파라미터로 모달 자동 열기 */
  useEffect(() => {
    const newParam = searchParams.get('new');
    if (newParam === 'onecut' || newParam === 'instatoon' || newParam === 'series') {
      setModal(newParam);
      setSearchParams({}, { replace: true });
    }
  }, []);

  /* 작품 목록 로드 */
  const loadWorks = useCallback(() => {
    const params = { limit: 50 };
    if (filter !== 'all') params.filter = filter;
    api.get('/my/works', { params })
      .then(({ data }) => { setWorks(data.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => { setLoading(true); loadWorks(); }, [loadWorks]);

  /* 필터 변경 */
  const changeFilter = (key) => {
    setFilter(key);
    const next = new URLSearchParams(searchParams);
    if (key === 'all') next.delete('filter'); else next.set('filter', key);
    setSearchParams(next, { replace: true });
  };

  /* 작품 생성 완료 후 이동 */
  const onCreated = ({ project_id, episode_id }) => {
    setModal(null);
    navigate(`/projects/${project_id}/episodes/${episode_id}/workflow`);
  };

  /* 카드 클릭 */
  const handleCardClick = (item) => {
    if (item.kind === 'series') {
      navigate(`/my/series/${item.project_id}`);
    } else {
      navigate(`/projects/${item.project_id}/episodes/${item.id}/workflow`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* ── 1. 입구 카드 2×2 ── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {ENTRY_CARDS.map((c) => (
          <button
            key={c.key}
            onClick={() => setModal(c.modal)}
            className="glass-card p-4 text-left hover:-translate-y-0.5 hover:border-comic-orange transition-all group"
          >
            <span className="text-2xl">{c.icon}</span>
            <p className="mt-2 font-bold text-sm text-ink-black dark:text-white group-hover:text-comic-orange transition-colors">{c.title}</p>
            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 mt-0.5 break-keep">{c.desc}</p>
          </button>
        ))}
        {/* 4번째 빈 슬롯 */}
        <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700/50 opacity-40" />
      </div>

      {/* ── 2. 빠른 한 컷 배너 ── */}
      <button
        onClick={() => navigate('/quick')}
        className="w-full mb-6 p-4 rounded-2xl bg-gradient-to-r from-purple-600/10 to-cyan-500/10 dark:from-purple-600/20 dark:to-cyan-500/20 border border-purple-500/20 dark:border-purple-500/30 hover:scale-[1.01] transition-transform text-left flex items-center gap-4"
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-ink-black dark:text-white text-sm">빠른 한 컷</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">캐릭터 고르고 한 줄이면 끝</p>
        </div>
        <ChevronRight size={18} className="text-gray-400 dark:text-gray-500 shrink-0" />
      </button>

      {/* ── 3. 필터 칩 ── */}
      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide">
        {FILTER_CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => changeFilter(c.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
              filter === c.key
                ? 'bg-comic-orange text-white'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* ── 4. 작품 목록 ── */}
      {loading ? (
        <div className="text-center py-20 text-gray-400 font-bold">로딩 중...</div>
      ) : works.length === 0 ? (
        <div className="text-center py-20 glass-card">
          <FolderOpen size={48} className="mx-auto text-gray-300 dark:text-zinc-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-bold">아직 만든 작품이 없어요</p>
          <button
            onClick={() => setModal('onecut')}
            className="mt-3 text-comic-orange text-sm font-bold hover:underline"
          >
            첫 작품 만들어보기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {works.map((item) => (
            <WorkCard key={`${item.kind}-${item.id}`} item={item} onClick={() => handleCardClick(item)} />
          ))}
        </div>
      )}

      {/* ── 5. 생성 모달 ── */}
      {modal === 'onecut' && <OnecutModal onClose={() => setModal(null)} onCreated={onCreated} />}
      {modal === 'instatoon' && <InstatoonModal onClose={() => setModal(null)} onCreated={onCreated} />}
      {modal === 'series' && <SeriesModal onClose={() => setModal(null)} onCreated={onCreated} />}
    </div>
  );
}

/* ── 작품 카드 ── */
function WorkCard({ item, onClick }) {
  const badge = PURPOSE_BADGE[item.purpose] || PURPOSE_BADGE.onecut_ad;
  const isSeries = item.kind === 'series';

  const statusText = isSeries
    ? item.in_progress_label || `${item.completed_count || 0}화 완료`
    : item.step?.name || item.status || '';

  return (
    <button
      onClick={onClick}
      className="w-full glass-card p-4 text-left flex gap-3 items-center hover:-translate-y-0.5 hover:border-comic-orange transition-all group"
    >
      {/* 썸네일 */}
      <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-zinc-800 shrink-0 overflow-hidden flex items-center justify-center">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Image size={20} className="text-gray-300 dark:text-zinc-600" />
        )}
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          {isSeries && item.episode_count > 0 && (
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{item.episode_count}화</span>
          )}
        </div>
        <p className="font-bold text-sm text-ink-black dark:text-white truncate group-hover:text-comic-orange transition-colors">
          {item.title || '제목 없음'}
        </p>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          {statusText && <span className="font-medium">{statusText}</span>}
          {statusText && item.updated_at && <span>·</span>}
          {item.updated_at && (
            <span className="flex items-center gap-0.5">
              <Clock size={10} />
              {new Date(item.updated_at).toLocaleDateString('ko-KR')}
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={16} className="text-gray-300 dark:text-zinc-600 shrink-0 group-hover:text-comic-orange transition-colors" />
    </button>
  );
}

/* ═══════════════════════════════════════════
   모달 공통
   ═══════════════════════════════════════════ */

function ModalShell({ title, onClose, children }) {
  const shieldRef = useRef(null);
  const [shieldReady, setShieldReady] = useState(false);

  /* 350ms 투명 실드 — 고스트 클릭 방지 */
  useEffect(() => {
    const t = setTimeout(() => setShieldReady(true), 350);
    return () => clearTimeout(t);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* 배경 */}
      <div
        ref={shieldRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={shieldReady ? onClose : undefined}
      />
      {/* 본체 */}
      <div className="relative w-full max-w-md mx-auto bg-white dark:bg-night-card border border-gray-200 dark:border-white/10 rounded-t-2xl sm:rounded-2xl p-5 pb-8 sm:pb-5 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ink-black dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* 칩 공용 스타일 */
const chipCls = (active) =>
  `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
    active
      ? 'bg-comic-orange text-white'
      : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
  }`;

/* ── 한 컷 모달 ── */
function OnecutModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const placeholder = `한 컷 광고 ${todayLabel()}`;

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const params = new URLSearchParams({ type: 'onecut_ad' });
      const t = title.trim() || placeholder;
      params.set('title', t);
      const { data } = await api.post(`/my/works?${params.toString()}`);
      onCreated(data);
    } catch (err) {
      alert(err.response?.data?.detail || '만들지 못했어요. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="한 컷 광고 만들기" onClose={onClose}>
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">작품 이름 (선택)</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all"
        autoFocus
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="neon-btn w-full mt-4 disabled:opacity-50"
      >
        {submitting ? '만드는 중...' : '만들기'}
      </button>
    </ModalShell>
  );
}

/* ── 인스타툰 모달 ── */
function InstatoonModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [cutCount, setCutCount] = useState(6);
  const [customCut, setCustomCut] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const placeholder = `인스타툰 ${todayLabel()}`;
  const CUT_CHIPS = [4, 6, 8];

  const activeCut = showCustom ? (parseInt(customCut, 10) || 0) : cutCount;

  const handleSubmit = async () => {
    const c = activeCut;
    if (c < 4 || c > 10) { alert('컷 수는 4~10 사이로 입력해주세요.'); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      const params = new URLSearchParams({ type: 'instatoon_ad', cut_count: String(c) });
      params.set('title', title.trim() || placeholder);
      const { data } = await api.post(`/my/works?${params.toString()}`);
      onCreated(data);
    } catch (err) {
      alert(err.response?.data?.detail || '만들지 못했어요. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="인스타툰 광고 만들기" onClose={onClose}>
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">작품 이름 (선택)</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all mb-4"
        autoFocus
      />
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">컷 수</label>
      <div className="flex items-center gap-2 flex-wrap">
        {CUT_CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setCutCount(n); setShowCustom(false); }}
            className={chipCls(!showCustom && cutCount === n)}
          >
            {n}컷
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className={chipCls(showCustom)}
        >
          직접 입력
        </button>
        {showCustom && (
          <input
            type="number"
            min={4}
            max={10}
            value={customCut}
            onChange={(e) => setCustomCut(e.target.value)}
            placeholder="4~10"
            className="w-16 px-2 py-1.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-xs font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange transition-all text-center"
            autoFocus
          />
        )}
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting || (showCustom && (activeCut < 4 || activeCut > 10))}
        className="neon-btn w-full mt-5 disabled:opacity-50"
      >
        {submitting ? '만드는 중...' : '만들기'}
      </button>
    </ModalShell>
  );
}

/* ── 브랜드 연재툰 모달 ── */
function SeriesModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [cutCount, setCutCount] = useState(6);
  const [customCut, setCustomCut] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [ratio, setRatio] = useState('9:16');
  const [submitting, setSubmitting] = useState(false);
  const CUT_CHIPS = [6, 8, 10];
  const RATIO_OPTIONS = [
    { value: '9:16', label: '세로 9:16' },
    { value: '1:1', label: '정사각 1:1' },
  ];

  const activeCut = showCustom ? (parseInt(customCut, 10) || 0) : cutCount;

  const handleSubmit = async () => {
    if (!title.trim()) { alert('시리즈 이름을 입력해주세요.'); return; }
    const c = activeCut;
    if (c < 4 || c > 20) { alert('컷 수는 4~20 사이로 입력해주세요.'); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      const params = new URLSearchParams({
        type: 'brand_series',
        title: title.trim(),
        cut_count: String(c),
        ratio,
      });
      const { data } = await api.post(`/my/works?${params.toString()}`);
      onCreated(data);
    } catch (err) {
      alert(err.response?.data?.detail || '만들지 못했어요. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="브랜드 연재툰 만들기" onClose={onClose}>
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">시리즈 이름</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="예: 우리 빵집 이야기"
        className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange focus:ring-4 focus:ring-comic-orange/20 transition-all mb-4"
        autoFocus
      />

      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">컷 수</label>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {CUT_CHIPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setCutCount(n); setShowCustom(false); }}
            className={chipCls(!showCustom && cutCount === n)}
          >
            {n}컷
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(true)}
          className={chipCls(showCustom)}
        >
          직접 입력
        </button>
        {showCustom && (
          <input
            type="number"
            min={4}
            max={20}
            value={customCut}
            onChange={(e) => setCustomCut(e.target.value)}
            placeholder="4~20"
            className="w-16 px-2 py-1.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-lg text-xs font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange transition-all text-center"
            autoFocus
          />
        )}
      </div>

      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">비율</label>
      <div className="flex items-center gap-2 mb-5">
        {RATIO_OPTIONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRatio(r.value)}
            className={chipCls(ratio === r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !title.trim() || (showCustom && (activeCut < 4 || activeCut > 20))}
        className="neon-btn w-full disabled:opacity-50"
      >
        {submitting ? '만드는 중...' : '1화 시작하기'}
      </button>
    </ModalShell>
  );
}
