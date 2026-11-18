/**
 * 상세페이지 STEP 4 — 완성
 * 섹션 카드(제목·본문 요약·캐릭터 배지) [이 섹션 생성 · 1패킷] / [전부 생성 · N패킷] (인라인 확인)
 * 결과 아래 "확인 필요한 문구" 경고 배지(warning_claims) · 빠진 문장 · [다시 그리기] 시트(메모·캐릭터 칩)
 * 보기 전환: 섹션 / 세로 스택 미리보기 · 내보내기: 세로 1장(1024·860) / 섹션 zip / 공개(PublishBar)
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api, { pollJob } from '../../../api/client';
import resolveUrl from '../../../utils/resolveUrl';
import useGateLoad from '../../../hooks/useGateLoad';
import DetailLoad from './DetailLoad';
import PublishBar from '../../PublishBar';
import { Loader2, User, Package, AlertTriangle, RefreshCw, Download, LayoutList, Rows3, X, ImageOff, Check } from 'lucide-react';

const chipCls = (on) =>
  `px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${on ? 'bg-comic-orange text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'}`;

export default function DetailComplete({ projectId, episodeId, readOnly }) {
  const [cuts, setCuts] = useState([]);
  const [view, setView] = useState('sections'); // sections | stack
  const [working, setWorking] = useState({}); // cut_id → true
  const [allJob, setAllJob] = useState(null); // {done,total}
  const [confirm, setConfirm] = useState(null); // cut_id | 'all'
  const [sheet, setSheet] = useState(null); // cut
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  const loadCuts = useCallback(async () => {
    const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/cuts`);
    setCuts(data.filter((c) => c.kind === 'detail_section'));
  }, [projectId, episodeId]);
  const { loading, error: loadError, retry } = useGateLoad(loadCuts, [loadCuts]);

  const pending = cuts.filter((c) => !c.image_url || ['pending', 'invalidated'].includes(c.status));
  const done = cuts.filter((c) => c.image_url);

  const generateOne = async (cut, body = {}) => {
    setConfirm(null); setError('');
    setWorking((w) => ({ ...w, [cut.cut_id]: true }));
    try {
      const { data } = await api.post(`/cuts/${cut.cut_id}/regenerate`, body);
      await pollJob(data.job_id);
      await loadCuts();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '그리지 못했어요 — 패킷은 차감되지 않았어요');
    } finally {
      setWorking((w) => { const n = { ...w }; delete n[cut.cut_id]; return n; });
    }
  };

  const generateAll = async () => {
    setConfirm(null); setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/generate`);
      setAllJob({ done: 0, total: data.total_cuts });
      await pollJob(data.job_id, (j) => { if (j.progress) setAllJob(j.progress); loadCuts().catch(() => {}); });
      await loadCuts();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '생성 중 문제가 생겼어요 — 실패한 섹션은 차감되지 않았어요');
      await loadCuts().catch(() => {});
    } finally {
      setAllJob(null);
    }
  };

  const doExport = async (format, width) => {
    const key = `${format}:${width || ''}`;
    setExporting(key); setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/export`, { format, width });
      const job = await pollJob(data.job_id);
      const url = job?.result?.download_url;
      if (!url) throw new Error(job?.result?.error || '파일을 만들지 못했어요');
      window.open(resolveUrl(url), '_blank');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '내보내지 못했어요');
    } finally { setExporting(''); }
  };

  const reportCopy = async (cut) => {
    try {
      const { data } = await api.post(`/cuts/${cut.cut_id}/copy-report`);
      if (data.ok) { alert(data.message); return; }
      setWorking((w) => ({ ...w, [cut.cut_id]: true }));
      await pollJob(data.job_id);
      await loadCuts();
    } catch (err) {
      alert(err.response?.data?.detail || '신고를 처리하지 못했어요');
    } finally {
      setWorking((w) => { const n = { ...w }; delete n[cut.cut_id]; return n; });
    }
  };

  if (loading || loadError) return <DetailLoad loading={loading} error={loadError} onRetry={retry} />;

  const busyAny = !!allJob || Object.keys(working).length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {done.length > 0 && !readOnly && <PublishBar projectId={projectId} episodeId={episodeId} />}

      {/* 상단 바: 전부 생성 + 보기 전환 */}
      <div className="glass-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-bold text-ink-black dark:text-white">섹션 {cuts.length}개 · 완성 {done.length}개</p>
          <div className="flex gap-1.5">
            <button onClick={() => setView('sections')} className={`flex items-center gap-1 ${chipCls(view === 'sections')}`}><LayoutList size={12} /> 섹션</button>
            <button onClick={() => setView('stack')} className={`flex items-center gap-1 ${chipCls(view === 'stack')}`} disabled={!done.length}><Rows3 size={12} /> 세로 스택</button>
          </div>
        </div>
        {!readOnly && pending.length > 0 && (
          confirm === 'all' ? (
            <div className="neon-btn w-full !cursor-default flex items-center justify-center gap-2 text-xs font-bold">
              <span>{pending.length * 2}패킷을 써서 그릴까요?</span>
              <button onClick={generateAll} className="px-3 py-1 rounded-full bg-white text-comic-orange">그리기</button>
              <button onClick={() => setConfirm(null)} className="px-3 py-1 rounded-full bg-white/20 text-white">취소</button>
            </div>
          ) : (
            <button onClick={() => setConfirm('all')} disabled={busyAny} className="neon-btn w-full disabled:opacity-50 flex items-center justify-center gap-2">
              {`전부 생성 · ${pending.length * 2}패킷`}
            </button>
          )
        )}
        {allJob && (
          <div className="bg-comic-orange/5 dark:bg-comic-orange/10 border-2 border-comic-orange/30 rounded-2xl p-4 flex items-center gap-3">
            <Loader2 size={22} className="animate-spin text-comic-orange shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink-black dark:text-white">그리는 중 {allJob.done}/{allJob.total}</p>
              <div className="mt-1.5 h-2 rounded-full bg-comic-orange/20 overflow-hidden">
                <div className="h-full bg-comic-orange rounded-full transition-all" style={{ width: `${allJob.total > 0 ? Math.round((allJob.done / allJob.total) * 100) : 0}%` }} />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">섹션당 40초쯤 · 실패한 섹션은 차감 안 돼요</p>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm font-bold text-red-500 dark:text-red-400">{error}</p>}

      {view === 'stack' ? (
        <StackPreview cuts={done} />
      ) : (
        cuts.map((c, i) => (
          <SectionCard key={c.cut_id} cut={c} index={i} readOnly={readOnly}
            working={!!working[c.cut_id] || (!!allJob && !c.image_url)}
            confirming={confirm === c.cut_id}
            onAskGenerate={() => setConfirm(c.cut_id)}
            onCancel={() => setConfirm(null)}
            onGenerate={() => generateOne(c)}
            onRedraw={() => setSheet(c)}
            onReport={() => reportCopy(c)}
            disabled={busyAny} />
        ))
      )}

      {/* 내보내기 */}
      {done.length > 0 && (
        <div className="glass-card p-4 sm:p-5">
          <h3 className="font-bold text-ink-black dark:text-white mb-1">내보내기</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 break-keep">완성된 섹션 {done.length}개를 순서대로 이어 붙여요. 쇼핑몰 상세페이지에는 세로 1장을 올리면 돼요.</p>
          <div className="flex flex-wrap gap-2">
            {[[1024, '세로 1장 · 폭 1024'], [860, '세로 1장 · 폭 860 (스마트스토어)']].map(([w, label]) => (
              <button key={w} onClick={() => doExport('vertical_stack', w)} disabled={!!exporting}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-comic-orange text-white disabled:opacity-50">
                {exporting === `vertical_stack:${w}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {label}
              </button>
            ))}
            <button onClick={() => doExport('png_cuts')} disabled={!!exporting}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border-2 border-border dark:border-zinc-700 text-gray-600 dark:text-gray-300 disabled:opacity-50">
              {exporting === 'png_cuts:' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 섹션별 PNG (zip)
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <RedrawSheet
          cut={sheet}
          onClose={() => setSheet(null)}
          onSubmit={async ({ note, character }) => {
            const c = sheet;
            setSheet(null);
            if (character !== !!c.section?.character) {
              await api.put(`/cuts/${c.cut_id}/detail-section`, { character }).catch(() => {});
            }
            await generateOne(c, note ? { user_note: note } : {});
          }}
        />
      )}
    </div>
  );
}

function SectionCard({ cut, index, readOnly, working, confirming, onAskGenerate, onCancel, onGenerate, onRedraw, onReport, disabled }) {
  const s = cut.section || {};
  const chk = cut.detail_check || null;
  const warn = chk?.warning_claims || [];
  const labelWarn = chk?.label_claims || [];
  const miss = chk?.body_miss || [];
  const others = (chk?.extra_lines || []).filter((l) => !warn.includes(l));
  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 rounded-full bg-comic-orange text-white text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
        <p className="font-bold text-sm text-ink-black dark:text-white truncate flex-1">{s.title || '제목 없음'}</p>
        <span className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${s.character ? 'bg-purple-500/15 text-purple-500 dark:text-purple-300' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}`}>
          {s.character ? <><User size={10} /> 캐릭터 등장</> : <><Package size={10} /> 제품만</>}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 whitespace-pre-line mb-3">{s.body}</p>

      <div className="relative rounded-xl overflow-hidden bg-gray-50 dark:bg-zinc-900 border border-border dark:border-zinc-800 aspect-[2/3] max-w-xs mx-auto">
        {cut.image_url ? (
          <img src={resolveUrl(cut.image_url)} alt={s.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 dark:text-zinc-600">
            <ImageOff size={28} />
            <span className="text-xs font-bold mt-1.5">아직 안 그렸어요</span>
          </div>
        )}
        {working && (
          <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center text-white text-xs font-bold gap-2">
            <Loader2 size={22} className="animate-spin" /> 그리는 중… (40초쯤)
          </div>
        )}
      </div>

      {chk && (
        <div className="mt-3 space-y-1.5">
          {warn.length > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-[11px] font-bold text-red-600 dark:text-red-300 break-keep">
              <p className="flex items-center gap-1"><AlertTriangle size={12} /> 확인 필요한 문구 — 원문에 없는 효능·수치 표현이에요 (광고 심의 주의, 다시 그리기 권장)</p>
              <ul className="mt-1 list-disc pl-4 font-normal">{warn.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          {labelWarn.length > 0 && (
            <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-3 py-2 text-[11px] font-bold text-orange-600 dark:text-orange-300 break-keep">
              <p className="flex items-center gap-1"><AlertTriangle size={12} /> 라벨에 작은 글씨가 있어요 — 확대 시 보일 수 있어요</p>
              <ul className="mt-1 list-disc pl-4 font-normal">{labelWarn.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          {others.length > 0 && (
            <details className="rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-border dark:border-zinc-800 px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
              <summary className="font-bold cursor-pointer select-none">원문에 없는 글자 {others.length}줄 (라벨·꾸밈 글자 — 보통 괜찮아요)</summary>
              <ul className="mt-1 list-disc pl-4">{others.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
          {miss.length > 0 && (
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 break-keep">본문 {chk.body_exact} 문장이 그대로 들어갔어요 · 빠지거나 바뀐 문장 {miss.length}개</p>
          )}
          {!warn.length && !miss.length && !others.length && chk.title_ok && (
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Check size={12} /> 제목·본문이 그대로 들어갔어요</p>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {confirming ? (
            <>
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300">2패킷 · 실패하면 차감 안 돼요</span>
              <button onClick={onGenerate} className="px-3 py-1.5 rounded-full text-xs font-bold bg-comic-orange text-white">그리기</button>
              <button onClick={onCancel} className="px-3 py-1.5 rounded-full text-xs font-bold bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">취소</button>
            </>
          ) : cut.image_url ? (
            <>
              <button onClick={onRedraw} disabled={disabled} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 border-border dark:border-zinc-700 text-gray-600 dark:text-gray-300 disabled:opacity-50">
                <RefreshCw size={12} /> 다시 그리기
              </button>
              <button onClick={onReport} disabled={disabled} className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 underline disabled:opacity-50">글자가 틀렸나요?</button>
            </>
          ) : (
            <button onClick={onAskGenerate} disabled={disabled} className="px-3.5 py-2 rounded-full text-xs font-bold bg-comic-orange text-white disabled:opacity-50">이 섹션 생성 · 2패킷</button>
          )}
        </div>
      )}
    </div>
  );
}

function StackPreview({ cuts }) {
  return (
    <div className="glass-card p-3 sm:p-4">
      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">세로 스택 미리보기 · 완성 {cuts.length}개 (섹션 사이 여백 없음)</p>
      <div className="max-w-sm mx-auto rounded-lg overflow-hidden border border-border dark:border-zinc-800">
        {cuts.map((c) => <img key={c.cut_id} src={resolveUrl(c.image_url)} alt={c.section?.title || ''} className="block w-full" />)}
      </div>
    </div>
  );
}

function RedrawSheet({ cut, onClose, onSubmit }) {
  const [note, setNote] = useState('');
  const [character, setCharacter] = useState(!!cut.section?.character);
  const [step, setStep] = useState('edit'); // edit | confirm
  const [shield, setShield] = useState(true);
  const t = useRef(null);
  useEffect(() => { t.current = setTimeout(() => setShield(false), 350); return () => clearTimeout(t.current); }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={shield ? undefined : onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-night-card border border-gray-200 dark:border-white/10 rounded-t-2xl sm:rounded-2xl p-5 pb-8 sm:pb-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-ink-black dark:text-white">다시 그리기</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10"><X size={18} className="text-gray-400" /></button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 truncate">{cut.section?.title}</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder="원하는 점을 적어 주세요 (예: 제품을 더 크게, 배경을 욕실로)"
          className="w-full min-h-[84px] px-3 py-2 border-2 border-border dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-xl text-sm text-ink-black dark:text-white focus:outline-none focus:border-comic-orange" />
        <div className="flex gap-1.5 mt-2.5">
          <button onClick={() => setCharacter(true)} className={`flex items-center gap-1 ${chipCls(character)}`}><User size={12} /> 캐릭터 등장</button>
          <button onClick={() => setCharacter(false)} className={`flex items-center gap-1 ${chipCls(!character)}`}><Package size={12} /> 제품만</button>
        </div>
        {step === 'edit' ? (
          <button onClick={() => setStep('confirm')} className="neon-btn w-full mt-4">다시 그리기 · 2패킷</button>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 flex-1">2패킷이 차감돼요 (실패하면 차감 안 돼요)</span>
            <button onClick={() => onSubmit({ note: note.trim(), character })} className="px-4 py-2 rounded-full text-xs font-bold bg-comic-orange text-white">그리기</button>
            <button onClick={() => setStep('edit')} className="px-3 py-2 rounded-full text-xs font-bold bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">취소</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
