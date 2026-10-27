/**
 * AdBriefForm — 광고 브리프 입력 + 기획안 결과 + 카피 다시 쓰기
 * purpose = onecut_ad | instatoon_ad | brand_series 일 때 Gate1 에서 렌더.
 */
import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Sparkles, RefreshCw, Check, ChevronDown, ChevronUp, X } from 'lucide-react';

const AD_PURPOSES = [
  { key: 'product_ad', label: '상품 광고', desc: '제품 판매·인지도' },
  { key: 'brand_promo', label: '브랜드 홍보', desc: '브랜드 이미지' },
  { key: 'sns_content', label: 'SNS 콘텐츠', desc: '팔로워 참여·공유' },
  { key: 'event_promo', label: '이벤트 홍보', desc: '할인·시즌·오프닝' },
  { key: 'info_delivery', label: '정보 전달', desc: '사용법·후기·비교' },
  { key: 'meme_parody', label: '밈·패러디', desc: '유머·트렌드·바이럴' },
];

const AD_MOODS = [
  { key: 'premium', label: '프리미엄', desc: '고급스럽고 깔끔한' },
  { key: 'webtoon', label: '웹툰·캐릭터', desc: '친근하고 캐릭터 중심' },
  { key: 'humor', label: '유머·병맛', desc: '웃기고 파격적인' },
  { key: 'emotional', label: '감성·무드', desc: '따뜻하고 분위기 있는' },
  { key: 'photo_real', label: '실사 광고', desc: '실제 사진 같은' },
  { key: 'ai_pick', label: 'AI 추천', desc: '자동으로 골라요' },
];

const COPY_DIRECTIONS = [
  { key: 'shorter', label: '더 짧게' },
  { key: 'impact', label: '임팩트' },
  { key: 'emotional', label: '감성' },
  { key: 'humor', label: '유머' },
  { key: 'trust', label: '신뢰' },
];

const MSG_PLACEHOLDERS = [
  '우리 가게 시그니처 메뉴를 알리고 싶어요',
  '두피 케어 오일, 산뜻하고 가볍게',
  '겨울 한정 딸기라떼 출시!',
  '반려동물 전용 영양제, 건강하게',
];

export default function AdBriefForm({ projectId, episodeId, gateStatus, onBriefDone }) {
  const [adPurpose, setAdPurpose] = useState('product_ad');
  const [keyMessage, setKeyMessage] = useState('');
  const [mood, setMood] = useState('ai_pick');
  const [showExtras, setShowExtras] = useState(false);
  const [target, setTarget] = useState('');
  const [cta, setCta] = useState('');
  const [brandColors, setBrandColors] = useState('');
  const [avoid, setAvoid] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // 기획안 결과
  const [briefResult, setBriefResult] = useState(null);
  const [selectedCopy, setSelectedCopy] = useState(0);
  const [selectedScene, setSelectedScene] = useState(0);
  const [rewriting, setRewriting] = useState(false);

  // placeholder 로테이션
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhIdx(i => (i + 1) % MSG_PLACEHOLDERS.length), 3000);
    return () => clearInterval(t);
  }, []);

  // 기존 브리프 복원
  useEffect(() => {
    const ib = gateStatus?.idea_brief;
    if (ib?.ad_purpose) {
      setAdPurpose(ib.ad_purpose);
      setKeyMessage(ib.key_message || '');
      setMood(ib.mood || 'ai_pick');
      setTarget(ib.target_audience || '');
      setCta(ib.cta || '');
      if (ib.extras) {
        setBrandColors(ib.extras.brand_colors || '');
        setAvoid(ib.extras.avoid || '');
        if (ib.extras.brand_colors || ib.extras.avoid) setShowExtras(true);
      }
      if (ib.copy_candidates?.length) {
        setBriefResult({
          key_message: ib.ad_brief_result?.key_message || '',
          target_summary: ib.ad_brief_result?.target_summary || '',
          copy_candidates: ib.copy_candidates,
          scene_ideas: ib.scene_ideas || [],
          recommended_style: ib.recommended_style || 'korean_webtoon',
        });
        setSelectedCopy(ib.copy_selected ?? 0);
        setSelectedScene(ib.scene_selected ?? 0);
      }
    }
  }, [episodeId]);

  const handleGenerate = async () => {
    if (!keyMessage.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/ad-brief`, {
        ad_purpose: adPurpose,
        key_message: keyMessage.trim(),
        mood,
        target_audience: target.trim(),
        cta: cta.trim(),
        extras: (brandColors || avoid) ? { brand_colors: brandColors, avoid } : null,
      });
      setBriefResult(data);
      setSelectedCopy(0);
      setSelectedScene(0);
    } catch (err) {
      setError(err.response?.data?.detail || '기획안 생성에 실패했어요');
    } finally {
      setGenerating(false);
    }
  };

  const handleRewrite = async (direction) => {
    if (!briefResult?.copy_candidates?.[selectedCopy]) return;
    setRewriting(true);
    try {
      const c = briefResult.copy_candidates[selectedCopy];
      const { data } = await api.post(`/projects/${projectId}/episodes/${episodeId}/ad-brief/rewrite-copy`, {
        head: c.head, sub: c.sub, direction, key_message: keyMessage,
      });
      const newCandidates = [...briefResult.copy_candidates];
      newCandidates[selectedCopy] = data;
      setBriefResult(prev => ({ ...prev, copy_candidates: newCandidates }));
    } catch { /* ignore */ }
    finally { setRewriting(false); }
  };

  const handleProceed = () => {
    // copy_selected, scene_selected 저장 후 진행
    onBriefDone?.({
      selectedCopy,
      selectedScene,
      briefResult,
      adPurpose, keyMessage, mood,
    });
  };

  return (
    <div className="space-y-4">
      {/* ── 브리프 입력 ── */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-base font-bold font-serif text-ink-black dark:text-white flex items-center gap-2">
          <Sparkles size={18} className="text-amber-500" /> 광고 브리프
        </h3>

        {/* 목적 칩 */}
        <div>
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 block">광고 목적</label>
          <div className="flex flex-wrap gap-2">
            {AD_PURPOSES.map(p => (
              <button key={p.key} onClick={() => setAdPurpose(p.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  adPurpose === p.key
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                }`}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {/* 전달 내용 */}
        <div>
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">어떤 내용을 전달하고 싶나요?</label>
          <textarea
            value={keyMessage} onChange={e => setKeyMessage(e.target.value)}
            placeholder={MSG_PLACEHOLDERS[phIdx]}
            rows={2}
            className="w-full px-3 py-2.5 border-2 border-border dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-sm text-ink-black dark:text-white placeholder-gray-400 focus:border-amber-500 focus:outline-none resize-none"
          />
        </div>

        {/* 분위기 */}
        <div>
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 block">분위기</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AD_MOODS.map(m => (
              <button key={m.key} onClick={() => setMood(m.key)}
                className={`flex flex-col items-start px-3 py-2 rounded-xl border-2 text-left transition-all ${
                  mood === m.key
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-border dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                }`}
              >
                <span className={`text-xs font-bold ${mood === m.key ? 'text-amber-700 dark:text-amber-400' : 'text-ink-black dark:text-white'}`}>{m.label}</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 추가 설정 (접힘) */}
        <button onClick={() => setShowExtras(!showExtras)}
          className="flex items-center gap-1 text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          추가 설정 {showExtras ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showExtras && (
          <div className="space-y-3 pl-2 border-l-2 border-border dark:border-zinc-700">
            <div>
              <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 block">타깃</label>
              <input type="text" value={target} onChange={e => setTarget(e.target.value)}
                placeholder="예: 2030 여성, 반려동물 주인"
                className="w-full px-3 py-2 border border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-xs text-ink-black dark:text-white" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 block">CTA 문구</label>
              <input type="text" value={cta} onChange={e => setCta(e.target.value)}
                placeholder="예: 지금 주문하기, 매장 방문"
                className="w-full px-3 py-2 border border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-xs text-ink-black dark:text-white" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 block">브랜드 색</label>
              <input type="text" value={brandColors} onChange={e => setBrandColors(e.target.value)}
                placeholder="예: #FF6B00, 주황+흰"
                className="w-full px-3 py-2 border border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-xs text-ink-black dark:text-white" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1 block">넣지 말 것</label>
              <input type="text" value={avoid} onChange={e => setAvoid(e.target.value)}
                placeholder="예: 일본풍, 만화체"
                className="w-full px-3 py-2 border border-border dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-xs text-ink-black dark:text-white" />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-500 dark:text-red-400 font-bold">{error}</p>}

        <button onClick={handleGenerate} disabled={generating || !keyMessage.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {generating ? <><RefreshCw size={14} className="animate-spin" /> 기획안 만드는 중...</> : <><Sparkles size={14} /> 광고 기획안 만들기</>}
        </button>
      </div>

      {/* ── 기획안 결과 ── */}
      {briefResult && (
        <div className="glass-card p-5 space-y-4">
          <h3 className="text-base font-bold font-serif text-ink-black dark:text-white">기획안</h3>

          {/* 핵심 메시지 + 타깃 */}
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{briefResult.key_message}</p>
            {briefResult.target_summary && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">타깃: {briefResult.target_summary}</p>
            )}
          </div>

          {/* 카피 후보 3 */}
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 block">카피 후보 — 하나를 골라주세요</label>
            <div className="space-y-2">
              {briefResult.copy_candidates?.map((c, i) => (
                <button key={i} onClick={() => setSelectedCopy(i)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    selectedCopy === i
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-border dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <p className="text-sm font-bold text-ink-black dark:text-white">{c.head}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.sub}</p>
                </button>
              ))}
            </div>
            {/* 다시 쓰기 칩 */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 self-center mr-1">✨ 다시 쓰기:</span>
              {COPY_DIRECTIONS.map(d => (
                <button key={d.key} onClick={() => handleRewrite(d.key)} disabled={rewriting}
                  className="px-2 py-1 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                >{d.label}</button>
              ))}
            </div>
          </div>

          {/* 장면 아이디어 3 */}
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 block">장면 아이디어 — 하나를 골라주세요</label>
            <div className="space-y-2">
              {briefResult.scene_ideas?.map((s, i) => (
                <button key={i} onClick={() => setSelectedScene(i)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    selectedScene === i
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-border dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <p className="text-xs text-ink-black dark:text-white">{s.scene}</p>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{s.shot}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 추천 스타일 */}
          {briefResult.recommended_style && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              추천 스타일: <span className="font-bold text-gray-600 dark:text-gray-300">{briefResult.recommended_style}</span>
              <span className="ml-1">(자산 단계에서 바꿀 수 있어요)</span>
            </p>
          )}

          {/* 진행 버튼 */}
          <button onClick={handleProceed}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors"
          >
            <Check size={14} /> 이대로 진행
          </button>
        </div>
      )}
    </div>
  );
}
