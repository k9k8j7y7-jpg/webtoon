/**
 * 상세페이지 STEP 2 — 섹션(대본)
 * 섹션 카드: 제목·본문 편집(글자 수, 60~180자 권장)·캐릭터 칩(등장/제품만)·순서 바꾸기·삭제·[섹션 추가]
 * 전체 [다시 만들기]·톤 칩 / 승인 → 준비
 */
import { useState, useCallback, useRef } from 'react';
import api from '../../../api/client';
import useGateLoad from '../../../hooks/useGateLoad';
import DetailLoad from './DetailLoad';
import { DETAIL_TONES } from './DetailBriefForm';
import { ChevronUp, ChevronDown, Trash2, Plus, RefreshCw, Loader2, User, Package, AlertTriangle, Check } from 'lucide-react';

const BODY_MIN = 60;
const BODY_MAX = 180;
const SECTION_LABELS = {
  intro: 'Intro · 공감', hero: 'Hero · 메인', point1: 'Point 1', point2: 'Point 2', point3: 'Point 3',
  how_to_use: 'How to Use', check_list: 'Check List', outro: 'Outro · 구매 유도', review: '리뷰',
};
const ADD_TYPES = [
  { key: 'point', label: '장점(Point)', character: false },
  { key: 'review', label: '리뷰', character: true },
  { key: 'custom', label: '자유 섹션', character: false },
];
const sectionLabel = (key) => SECTION_LABELS[key] || (key.startsWith('point') ? `Point ${key.replace(/\D/g, '') || ''}`.trim() : key.startsWith('review') ? '리뷰' : '섹션');

const chipCls = (on) =>
  `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${on ? 'bg-comic-orange text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'}`;

export default function DetailSections({ projectId, episodeId, onRefresh, readOnly }) {
  const [sections, setSections] = useState([]);
  const [tone, setTone] = useState('hook');
  const [busy, setBusy] = useState(''); // 'regen' | 'approve' | 'save'
  const [dirty, setDirty] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/detail/sections`);
    setSections((data.sections || []).map((s) => ({ ...s, _id: `s${seq.current++}` })));
    setTone(data.tone || data.brief?.tone || 'hook');
  }, [projectId, episodeId]);
  const { loading, error: loadError, retry } = useGateLoad(load, [load]);

  const update = (i, patch) => {
    setSections((arr) => arr.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setDirty(true); setSaved(false);
  };
  const move = (i, d) => {
    setSections((arr) => {
      const j = i + d;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true); setSaved(false);
  };
  const remove = (i) => {
    if (sections.length <= 1) return;
    setSections((arr) => arr.filter((_, j) => j !== i));
    setDirty(true); setSaved(false);
  };
  const add = (t) => {
    const n = sections.filter((s) => s.key.startsWith(t.key)).length + 1;
    const key = t.key === 'point' ? `point${sections.filter((s) => s.key.startsWith('point')).length + 1}` : `${t.key}${n}`;
    const sec = { _id: `s${seq.current++}`, key, title: '', body: '', character: t.character, visual_hint: '' };
    // Outro 앞에 추가 (없으면 맨 뒤)
    setSections((arr) => {
      const oi = arr.findIndex((s) => s.key === 'outro');
      if (oi < 0) return [...arr, sec];
      return [...arr.slice(0, oi), sec, ...arr.slice(oi)];
    });
    setShowAdd(false); setDirty(true); setSaved(false);
  };

  const payload = () => sections.map(({ _id, unverified, ...s }) => s);

  const save = async () => {
    const { data } = await api.put(`/projects/${projectId}/episodes/${episodeId}/detail/sections`, { sections: payload() });
    setSections((data.sections || []).map((s) => ({ ...s, _id: `s${seq.current++}` })));
    setDirty(false);
    return data.sections;
  };

  const handleSave = async () => {
    setBusy('save'); setError('');
    try { await save(); setSaved(true); } catch (err) { setError(err.response?.data?.detail || '저장하지 못했어요'); }
    finally { setBusy(''); }
  };

  const regenerate = async () => {
    setBusy('regen'); setError(''); setConfirmRegen(false);
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/detail/plan`, { tone });
      setSections((data.sections || []).map((s) => ({ ...s, _id: `s${seq.current++}` })));
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.detail || '다시 만들지 못했어요');
    } finally {
      setBusy('');
    }
  };

  const approve = async () => {
    const empty = sections.findIndex((s) => !s.title.trim() && !s.body.trim());
    if (empty >= 0) { setError(`${empty + 1}번 섹션이 비어 있어요 — 채우거나 지워 주세요`); return; }
    setBusy('approve'); setError('');
    try {
      if (dirty) await save();
      await api.post(`/projects/${projectId}/episodes/${episodeId}/detail/sections/approve`);
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || '승인하지 못했어요');
      setBusy('');
    }
  };

  if (loading || loadError) return <DetailLoad loading={loading} error={loadError} onRetry={retry} />;

  const charCount = sections.filter((s) => s.character).length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 상단: 요약 + 다시 만들기 */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-ink-black dark:text-white">섹션 {sections.length}개</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-keep">
              섹션 하나가 상세페이지 이미지 한 장이 돼요. 제목·본문이 그림 안에 그대로 들어가요. 캐릭터 등장 {charCount}개 · 제품만 {sections.length - charCount}개
            </p>
          </div>
        </div>
        {!readOnly && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {DETAIL_TONES.map((t) => (
              <button key={t.key} onClick={() => setTone(t.key)} className={chipCls(tone === t.key)}>{t.label}</button>
            ))}
            {!confirmRegen ? (
              <button onClick={() => setConfirmRegen(true)} disabled={!!busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 border-border dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:border-comic-orange disabled:opacity-50">
                {busy === 'regen' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} 다시 만들기
              </button>
            ) : (
              <span className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                고친 내용이 사라져요 · 무료
                <button onClick={regenerate} className="px-3 py-1.5 rounded-full bg-comic-orange text-white">다시 만들기</button>
                <button onClick={() => setConfirmRegen(false)} className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-zinc-800">취소</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 섹션 카드 */}
      {sections.map((s, i) => {
        const len = (s.body || '').replace(/\s/g, '').length;
        const lenCls = len < BODY_MIN ? 'text-amber-500' : len > BODY_MAX ? 'text-red-500' : 'text-emerald-500';
        return (
          <div key={s._id} className="glass-card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-6 h-6 rounded-full bg-comic-orange text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 truncate">{sectionLabel(s.key)}</span>
              {!readOnly && (
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 text-gray-500 dark:text-gray-400"><ChevronUp size={16} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="아래로" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 text-gray-500 dark:text-gray-400"><ChevronDown size={16} /></button>
                  <button onClick={() => remove(i)} disabled={sections.length <= 1} aria-label="삭제" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              )}
            </div>
            <input
              value={s.title}
              onChange={(e) => update(i, { title: e.target.value })}
              disabled={readOnly}
              maxLength={40}
              placeholder="제목 (그림 안 큰 글씨)"
              className="w-full px-3 py-2 border-2 border-border dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
            />
            <textarea
              value={s.body}
              onChange={(e) => update(i, { body: e.target.value })}
              disabled={readOnly}
              placeholder="본문 (줄을 바꾸면 포인트·단계로 나뉘어요)"
              className="mt-2 w-full min-h-[110px] px-3 py-2 border-2 border-border dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-xl text-sm text-ink-black dark:text-white leading-relaxed focus:outline-none focus:border-comic-orange"
            />
            <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="flex gap-1.5">
                  <button onClick={() => !readOnly && update(i, { character: true })} className={`flex items-center gap-1 ${chipCls(s.character)}`}><User size={12} /> 캐릭터 등장</button>
                  <button onClick={() => !readOnly && update(i, { character: false })} className={`flex items-center gap-1 ${chipCls(!s.character)}`}><Package size={12} /> 제품만</button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">제품은 항상 들어가요</p>
              </div>
              <span className={`text-[11px] font-bold ${lenCls}`}>{len}자 · 권장 {BODY_MIN}~{BODY_MAX}자</span>
            </div>
            {s.unverified?.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 break-keep">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> 입력하지 않은 수치·표현이 있어요: {s.unverified.join(', ')} — 사실이 아니면 고쳐 주세요
              </p>
            )}
          </div>
        );
      })}

      {/* 섹션 추가 */}
      {!readOnly && (
        <div className="glass-card p-3">
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-comic-orange">
              <Plus size={15} /> 섹션 추가
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2 py-1">
              {ADD_TYPES.map((t) => <button key={t.key} onClick={() => add(t)} className={chipCls(false)}>{t.label}</button>)}
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-bold text-gray-400">닫기</button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm font-bold text-red-500 dark:text-red-400">{error}</p>}

      {!readOnly && (
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={!!busy || !dirty}
            className="px-5 py-3 rounded-full border-2 border-border dark:border-zinc-700 text-sm font-bold text-gray-600 dark:text-gray-300 disabled:opacity-40 flex items-center gap-1.5">
            {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null} {saved ? '저장됨' : '저장'}
          </button>
          <button onClick={approve} disabled={!!busy} className="neon-btn flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
            {busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : null} 이대로 진행 → 준비
          </button>
        </div>
      )}
    </div>
  );
}
