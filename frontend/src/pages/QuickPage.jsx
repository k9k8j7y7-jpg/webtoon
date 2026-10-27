import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api, { pollJob } from '../api/client';
import resolveUrl from '../utils/resolveUrl';
import { Sparkles, Download, RefreshCw, ArrowRight, Share2, PenLine, ChevronLeft, Bell, Package } from 'lucide-react';
import InstaShareModal from '../components/InstaShareModal';
import CutEditor from '../components/CutEditor';

// ── 프리셋 데이터 ──
const PRESETS = [
  { ref: 'preset_woman', name: '여성', thumb: '/storage/presets/preset_woman/front_v1.png' },
  { ref: 'preset_man', name: '남성', thumb: '/storage/presets/preset_man/front_v1.png' },
  { ref: 'preset_pomeranian', name: '강아지', thumb: '/storage/presets/preset_pomeranian/front_v1.png' },
  { ref: 'preset_cat', name: '고양이', thumb: '/storage/presets/preset_cat/front_v1.png' },
  { ref: 'preset_child', name: '아이', thumb: '/storage/presets/preset_child/front_v1.png' },
  { ref: 'preset_grandma', name: '할머니', thumb: '/storage/presets/preset_grandma/front_v1.png' },
];

const STYLES = [
  { key: 'korean_webtoon', label: '한국 웹툰체' },
  { key: 'anime', label: '애니' },
  { key: 'emotional_romance', label: '감성 로맨스' },
];

const RATIOS = [
  { key: '1:1', label: '1:1' },
  { key: '4:5', label: '4:5' },
  { key: '9:16', label: '9:16' },
];

const SHOTS = [
  { key: '', label: '자동' },
  { key: 'close_up', label: '클로즈업' },
  { key: 'bust', label: '상반신' },
  { key: 'full', label: '전신' },
];

const PLACEHOLDERS = [
  '카페 창가에서 꾸벅 존다',
  '비 오는 골목을 걸어간다',
  '놀이터에서 뛰어논다',
  '크리스마스 트리 앞에서 웃는다',
  '소파에서 뒹굴며 낮잠 잔다',
  '벚꽃 아래에서 산책한다',
];

// ── 공통 헤더 (② Layout 밖이라 자체 헤더) ──
function QuickHeader({ balance }) {
  return (
    <header className="sticky top-0 z-50 bg-night-bg/80 backdrop-blur border-b border-white/10">
      <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white">
          <ChevronLeft size={18} />
          <span className="font-bold text-sm bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">EziToon</span>
        </Link>
        <div className="flex items-center gap-3">
          {balance != null && (
            <Link to="/packets" className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition">
              <Package size={13} /> {balance}
            </Link>
          )}
          <Link to="/notifications" className="text-gray-400 hover:text-white transition">
            <Bell size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function QuickPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── 폼 상태 ──
  const [presetRef, setPresetRef] = useState('');
  const [prompt, setPrompt] = useState('');
  const [dialogue, setDialogue] = useState('');
  const [shot, setShot] = useState('');
  const [style, setStyle] = useState('korean_webtoon');
  const [ratio, setRatio] = useState('1:1');
  const [productPhoto, setProductPhoto] = useState(null); // File
  const [productPreview, setProductPreview] = useState('');

  // ── 생성 상태 ──
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [cutData, setCutData] = useState(null);
  const [error, setError] = useState('');

  // ── 모달 상태 ──
  const [instaOpen, setInstaOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // 모달 닫기 후 300ms 투명 오버레이 유지 (ghost click 차단)
  const [modalShield, setModalShield] = useState(false);
  const closeInstaModal = () => {
    setInstaOpen(false);
    setModalShield(true);
    setTimeout(() => setModalShield(false), 350);
  };

  // ── 다시 그리기 확인 단계 ──
  const [regenConfirm, setRegenConfirm] = useState(false);

  // ── 패킷 ──
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    api.get('/me/packets').then(r => setBalance(r.data.balance)).catch(() => {});
  }, [result]);

  // ── 컷 데이터 로드 (④ 말풍선 표시용) ──
  const loadCutData = async (projectId, episodeId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/episodes/${episodeId}/cuts`);
      if (data?.length) setCutData(data[0]);
    } catch { /* 결과 표시에는 영향 없음 */ }
  };

  // ── 플레이스홀더 로테이션 ──
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(t);
  }, []);

  // ── CSS 비율 ──
  const cssAspect = useMemo(() => {
    const [w, h] = (result ? ratio : '1:1').split(':').map(Number);
    return `${w}/${h}`;
  }, [ratio, result]);

  // ── 표시할 이미지 URL (④ composed_image_url 우선 = 말풍선 포함) ──
  const displayImageUrl = useMemo(() => {
    if (cutData?.composed_image_url) return resolveUrl(cutData.composed_image_url);
    if (result?.image_url) return resolveUrl(result.image_url);
    return '';
  }, [cutData, result]);

  // ── 만들기 ──
  const handleGenerate = async () => {
    if (!presetRef || !prompt.trim()) return;
    setGenerating(true);
    setError('');
    setResult(null);
    setCutData(null);
    try {
      let data;
      if (productPhoto) {
        const form = new FormData();
        form.append('prompt', prompt.trim());
        form.append('preset_ref', presetRef);
        form.append('style', style);
        form.append('aspect_ratio', ratio);
        if (shot) form.append('shot', shot);
        if (dialogue.trim()) form.append('dialogue', dialogue.trim());
        form.append('product_photo', productPhoto);
        ({ data } = await api.post('/quick', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
      } else {
        const body = { prompt: prompt.trim(), preset_ref: presetRef, style, aspect_ratio: ratio };
        if (shot) body.shot = shot;
        if (dialogue.trim()) body.dialogue = dialogue.trim();
        ({ data } = await api.post('/quick', body));
      }
      const job = await pollJob(data.job_id, null, 1500);
      const r = {
        ...job.result,
        episode_id: data.episode_id,
        project_id: data.project_id,
      };
      setResult(r);
      await loadCutData(r.project_id, r.episode_id);
      window.dispatchEvent(new Event('packets:refresh'));
    } catch (err) {
      if (err.response?.status === 402) {
        // 402 인터셉터가 alert 처리
      } else if (err.response?.status === 409) {
        setError('이미 생성 중입니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError(err.message || '생성에 실패했어요. 다시 시도해주세요.');
      }
    } finally {
      setGenerating(false);
    }
  };

  // ── 다시 그리기 ──
  const handleRegenerate = async () => {
    if (!result?.cut_id) return;
    setGenerating(true);
    setError('');
    try {
      const { data } = await api.post(`/cuts/${result.cut_id}/regenerate`, {});
      const job = await pollJob(data.job_id, null, 1500);
      const updated = { ...result, ...job.result };
      setResult(updated);
      await loadCutData(updated.project_id, updated.episode_id);
      window.dispatchEvent(new Event('packets:refresh'));
    } catch (err) {
      if (err.response?.status !== 402) {
        setError(err.message || '재생성에 실패했어요.');
      }
    } finally {
      setGenerating(false);
    }
  };

  // ── PNG 저장 (④ composed 이미지 = 말풍선 포함) ──
  const handleDownload = () => {
    if (!displayImageUrl) return;
    const a = document.createElement('a');
    a.href = displayImageUrl;
    a.download = `quick_${result.cut_id}.png`;
    a.click();
  };

  // ── 이야기 만들기 (B안: 새 프로젝트 + 에피소드 생성, 원본 불변) ──
  const [expanding, setExpanding] = useState(false);
  const [toast, setToast] = useState('');
  const handleExpandStory = async () => {
    if (!result || expanding) return;
    setExpanding(true);
    setError('');
    setToast('새 프로젝트에 1화를 만들어요');
    try {
      const { data } = await api.post(`/quick/${result.episode_id}/expand`);
      setTimeout(() => {
        navigate(`/projects/${data.project_id}/episodes/${data.episode_id}/workflow`);
      }, 1000);
    } catch (err) {
      setToast('');
      setExpanding(false);
      setError(err.response?.data?.detail || err.message || '확장 실패');
    }
  };

  // ── 결과 화면 ──
  if (result && !generating) {
    const hasDialogue = cutData?.dialogue?.length > 0;
    return (
      <>
      <div className="min-h-screen bg-night-bg text-white">
        <QuickHeader balance={balance} />
        <div className="max-w-lg mx-auto px-4 py-6">
          {/* 결과 이미지 (④ composed_image_url = 말풍선 포함) */}
          <div className="rounded-2xl overflow-hidden border border-white/10 mb-6 bg-black/20" style={{ aspectRatio: cssAspect }}>
            <img
              src={displayImageUrl}
              alt="생성된 컷"
              className="w-full h-full object-contain"
            />
          </div>

          {/* 액션 버튼 — 모달 열려 있으면 pointer-events 차단 (③ ghost click 방지) */}
          <div className={`grid ${hasDialogue ? 'grid-cols-2' : 'grid-cols-3'} gap-2 mb-4`} style={(instaOpen || modalShield) ? { pointerEvents: 'none' } : undefined}>
            <button type="button" onClick={() => setInstaOpen(true)} className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition text-xs font-bold">
              <Share2 size={14} /> 인스타 공유
            </button>
            <button type="button" onClick={handleDownload} className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition text-xs font-bold">
              <Download size={14} /> PNG 저장
            </button>
            {hasDialogue && (
              <button type="button" onClick={() => setEditOpen(true)} className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition text-xs font-bold">
                <PenLine size={14} /> 말풍선 고치기
              </button>
            )}
            {/* ② 다시 그리기 — 확인 단계 */}
            {!regenConfirm ? (
              <button type="button" onClick={() => setRegenConfirm(true)} className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition text-xs font-bold">
                <RefreshCw size={14} /> 다시 그리기 · 1패킷
              </button>
            ) : (
              <div className="col-span-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-900/30 border border-amber-600/40 text-xs">
                <span className="flex-1 text-amber-200">1패킷을 써서 다시 그릴까요?</span>
                <button type="button" onClick={() => { setRegenConfirm(false); handleRegenerate(); }} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-500 transition text-xs">다시 그리기</button>
                <button type="button" onClick={() => setRegenConfirm(false)} className="px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 font-bold hover:bg-white/20 transition text-xs">취소</button>
              </div>
            )}
          </div>

          {/* 이야기 만들기 CTA */}
          <button
            type="button"
            onClick={handleExpandStory}
            disabled={expanding}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:scale-[1.02] transition-transform text-base font-bold mb-4 disabled:opacity-60"
            style={(instaOpen || modalShield) ? { pointerEvents: 'none' } : undefined}
          >
            이 컷으로 이야기 만들기 <ArrowRight size={18} />
          </button>

          <div className="text-center">
            <button type="button" onClick={() => navigate(`/projects/${result.project_id}`)} className="text-sm text-gray-400 hover:text-white transition underline">
              내 작품에서 보기
            </button>
          </div>

          {toast && (
            <div className="mt-4 text-center text-sm text-purple-300 animate-pulse">{toast}</div>
          )}
          {error && <p className="mt-4 text-center text-red-400 text-sm">{error}</p>}
        </div>
      </div>

      {/* 인스타 공유 모달 — portal + ghost click 차단 */}
      {cutData && createPortal(
        <InstaShareModal
          open={instaOpen}
          onClose={closeInstaModal}
          cuts={[cutData]}
          characters={[]}
          getImageUrl={(c) => resolveUrl(c.image_url)}
          products={[]}
          pageFormat={null}
          episodeTitle={prompt}
          nickname={user?.nickname || ''}
          shareUrl=""
          isPublic={false}
          onZipDownload={closeInstaModal}
          motionVideoUrls={[]}
          reelPath={null}
        />,
        document.body
      )}

      {/* ① 모달 닫기 후 투명 실드 — 300ms 동안 ghost click 흡수 */}
      {modalShield && createPortal(
        <div className="fixed inset-0 z-50" style={{ background: 'transparent' }} />,
        document.body
      )}

      {/* 말풍선 편집기 — portal */}
      {editOpen && cutData && createPortal(
        <CutEditor
          cut={{ ...cutData, dialogue: cutData.dialogue || [], sfx_items: cutData.sfx_items || [], effect_items: cutData.effect_items || [], product_items: cutData.product_items || [], pngbubble_items: cutData.pngbubble_items || [] }}
          products={[]}
          imageUrl={resolveUrl(cutData.image_url || result.image_url)}
          characters={cutData.characters || []}
          charNameMap={{}}
          initialMode="edit"
          initialTool="bubble"
          onClose={() => setEditOpen(false)}
          onSave={async () => {
            await loadCutData(result.project_id, result.episode_id);
            setEditOpen(false);
          }}
          onPrev={null}
          onNext={null}
          cutIndex={1}
          totalCuts={1}
        />,
        document.body
      )}
      </>
    );
  }

  // ── 폼 화면 ──
  return (
    <div className="min-h-screen bg-night-bg text-white">
      <QuickHeader balance={balance} />
      <div className="max-w-lg mx-auto px-4 py-6 pb-32">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">빠른 한 컷</h1>
          <p className="text-sm text-gray-400">캐릭터 고르고 한 줄이면 끝</p>
        </div>

        {/* ③ 캐릭터 선택 */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-gray-400 mb-3">캐릭터 선택</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PRESETS.map(p => (
              <button
                key={p.ref}
                onClick={() => setPresetRef(p.ref)}
                disabled={generating}
                className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                  presetRef === p.ref
                    ? 'border-purple-500 ring-2 ring-purple-500/30 scale-[1.02]'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <img src={resolveUrl(p.thumb)} alt={p.name} className="w-full aspect-square object-cover" loading="lazy" />
                <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-xs font-bold text-center">
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ③ 장면 입력 */}
        <section className="mb-6">
          <h2 className="text-sm font-bold text-gray-400 mb-3">장면 입력</h2>
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={productPhoto ? '제품을 들고 웃는다' : PLACEHOLDERS[phIdx]}
            disabled={generating}
            maxLength={200}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 text-sm transition"
          />
          {/* 샷 칩 */}
          <div className="flex gap-2 flex-wrap mt-2">
            {SHOTS.map(s => (
              <button
                key={s.key}
                onClick={() => setShot(s.key)}
                disabled={generating}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                  shot === s.key ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        {/* ③ 대사 입력 (별도 섹션) */}
        <section className="mb-6">
          <h2 className="text-sm font-bold text-gray-400 mb-3">대사 입력 <span className="text-gray-600 font-normal">(선택)</span></h2>
          <input
            type="text"
            value={dialogue}
            onChange={e => setDialogue(e.target.value)}
            placeholder="으음~ 맛있다!"
            disabled={generating}
            maxLength={100}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 text-sm transition"
          />
        </section>

        {/* ③ 제품 사진 (선택) */}
        <section className="mb-6">
          <h2 className="text-sm font-bold text-gray-400 mb-1">제품 사진 <span className="text-gray-600 font-normal">(선택)</span></h2>
          <p className="text-[11px] text-gray-600 mb-3">모델이 들고 있게 그려요</p>
          <div className="flex items-center gap-3">
            {productPreview ? (
              <div className="relative">
                <img src={productPreview} alt="제품" className="w-16 h-16 object-contain rounded-lg border border-white/10 bg-white/5" />
                <button
                  onClick={() => { setProductPhoto(null); setProductPreview(''); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold hover:bg-red-600"
                >×</button>
              </div>
            ) : (
              <label className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-xs font-bold hover:bg-white/10 transition">
                📦 사진 선택
                <input type="file" accept="image/*" className="hidden" disabled={generating} onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setProductPhoto(f); setProductPreview(URL.createObjectURL(f)); }
                }} />
              </label>
            )}
          </div>
        </section>

        {/* ③ 스타일 선택 (비율 포함) */}
        <section className="mb-8">
          <h2 className="text-sm font-bold text-gray-400 mb-3">스타일 선택</h2>
          <div className="flex gap-2 mb-3">
            {STYLES.map(s => (
              <button
                key={s.key}
                onClick={() => setStyle(s.key)}
                disabled={generating}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold transition ${
                  style === s.key ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {RATIOS.map(r => (
              <button
                key={r.key}
                onClick={() => setRatio(r.key)}
                disabled={generating}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  ratio === r.key ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </section>

        {/* 생성 중 스켈레톤 */}
        {generating && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 mb-8 flex flex-col items-center justify-center" style={{ aspectRatio: cssAspect, maxHeight: 400 }}>
            <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-400 animate-pulse">그리는 중… 보통 20초</p>
          </div>
        )}

        {error && <p className="text-center text-red-400 text-sm mb-4">{error}</p>}
      </div>

      {/* 하단 sticky CTA */}
      {!generating && !result && (
        <div className="fixed bottom-0 inset-x-0 bg-night-bg/90 backdrop-blur border-t border-white/10 p-4 z-40">
          <div className="max-w-lg mx-auto">
            {balance === 0 ? (
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">환영 패킷을 다 썼어요</p>
                <button onClick={() => navigate('/packets')} className="px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-sm hover:scale-105 transition-transform">
                  체험 팩 3,900원
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!presetRef || !prompt.trim()}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
              >
                <Sparkles size={18} />
                만들기 · 1패킷
                {balance != null && <span className="text-white/60 text-sm ml-1">/ 잔량 {balance}</span>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
