import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Share2, Check } from 'lucide-react';
import BubbleOverlay from '../components/BubbleOverlay';
import SfxLayer from '../components/SfxLayer';
import EffectLayer from '../components/EffectLayer';
import ProductLayer from '../components/ProductLayer';
import PngBubbleLayer from '../components/PngBubbleLayer';
import { PAGE_FORMATS } from '../utils/pageFormats';
import AuthorLink from '../components/AuthorLink';
import SubscribeButton from '../components/SubscribeButton';
import CommentSection from '../components/CommentSection';
import PushNudgeBanner from '../components/PushNudgeBanner';

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

// 화면 뷰어 컷 사이 세로 간격 (내보내기 [세로] 간격과는 별개)
const CUT_GAP_PX = 48;
const PAGE_GAP_PX = 48;

function resolveUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function CutViewer({ cut, products }) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const mediaRef = useRef(null);
  const [videoError, setVideoError] = useState(false);

  const updateDims = useCallback(() => {
    if (mediaRef.current) {
      setDims({ w: mediaRef.current.clientWidth, h: mediaRef.current.clientHeight });
    }
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver(updateDims);
    if (mediaRef.current) obs.observe(mediaRef.current);
    return () => obs.disconnect();
  }, [updateDims]);

  // 모션 영상 URL (selected가 있고, prefers-reduced-motion이 아니면)
  const motion = cut.motion || {};
  const selectedCandidate = motion.selected && (motion.candidates || []).find(c => c.id === motion.selected);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const videoUrl = selectedCandidate?.path && !reducedMotion && !videoError ? resolveUrl(selectedCandidate.path) : null;

  return (
    <div className="relative w-full">
      {videoUrl ? (
        <video
          ref={mediaRef}
          src={videoUrl}
          poster={resolveUrl(cut.image_url)}
          autoPlay muted loop playsInline
          preload="metadata"
          className="w-full block"
          onLoadedMetadata={updateDims}
          onError={() => setVideoError(true)}
          draggable={false}
        />
      ) : (
        <img
          ref={mediaRef}
          src={resolveUrl(cut.image_url)}
          alt={`컷 ${cut.cut_number}`}
          className="w-full block"
          onLoad={updateDims}
          draggable={false}
        />
      )}
      {dims.w > 0 && (
        <>
          <ProductLayer productItems={cut.product_items || []} products={products || []} width={dims.w} height={dims.h} />
          <EffectLayer effectItems={cut.effect_items || []} width={dims.w} height={dims.h} />
          <BubbleOverlay dialogue={cut.dialogue || []} characters={cut.characters || []} width={dims.w} height={dims.h} />
          <PngBubbleLayer pngbubbleItems={cut.pngbubble_items || []} width={dims.w} height={dims.h} />
          <SfxLayer sfxItems={cut.sfx_items || []} width={dims.w} height={dims.h} />
        </>
      )}
    </div>
  );
}

function ViewerShareButton({ title, author }) {
  const [copied, setCopied] = useState(false);
  const handleShare = async () => {
    const shareTitle = `${title || '웹툰'} — ${author || '작가'} | EziToon`;
    const url = window.location.href.split('?')[0]; // ?n= 제거
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url });
      } catch { /* AbortError 등 무시 */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        window.prompt('링크를 복사하세요', url);
      }
    }
  };
  return (
    <button
      onPointerDown={handleShare}
      className="p-1.5 text-gray-400 hover:text-white rounded-full transition-colors shrink-0"
      title="공유"
    >
      {copied ? <Check size={16} className="text-emerald-400" /> : <Share2 size={16} />}
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-gray-500 shrink-0 w-20">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

export default function ViewerPage() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [likeInfo, setLikeInfo] = useState({ liked: false, like_count: 0 });
  const [fromExampleBusy, setFromExampleBusy] = useState(false);

  useEffect(() => {
    const headers = {};
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;

    axios.get(`${API_BASE}/api/v1/showcase/view/${shareToken}`, { headers })
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.status || 'error'));

    axios.get(`${API_BASE}/api/v1/showcase/like/${shareToken}`, { headers })
      .then(res => setLikeInfo({ liked: res.data.liked, like_count: res.data.like_count }))
      .catch(err => console.error(err));
  }, [shareToken]);

  const handleFromExample = async () => {
    if (fromExampleBusy) return;
    setFromExampleBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE}/api/v1/my/works/from-example?token=${shareToken}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { project_id, episode_id } = res.data;
      navigate(`/workflow/${project_id}/${episode_id}`);
    } catch (err) {
      alert(err.response?.data?.detail || '만들지 못했어요');
    } finally {
      setFromExampleBusy(false);
    }
  };

  // 로그인 후 복귀 시 자동 from-example 실행
  useEffect(() => {
    if (searchParams.get('action') === 'from-example' && localStorage.getItem('token') && data?.brief) {
      handleFromExample();
    }
  }, [data, searchParams]);

  const toggleLike = async () => {
    try {
      const headers = {};
      const token = localStorage.getItem('token');
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await axios.post(`${API_BASE}/api/v1/showcase/like/${shareToken}`, {}, { headers });
      setLikeInfo({ liked: res.data.liked, like_count: res.data.like_count });
    } catch (err) {
      if (err.response?.status === 401) {
        alert('로그인이 필요합니다.');
      } else {
        console.error(err);
      }
    }
  };

  if (error) {
    const msg = error === 404 ? '작품을 찾을 수 없습니다'
              : error === 403 ? '비공개 작품입니다'
              : '오류가 발생했습니다';
    return (
      <div className="min-h-screen bg-[#0A0F1D] text-white flex flex-col items-center justify-center gap-6"
           style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
        <p className="text-xl text-gray-400">{msg}</p>
        <Link to="/" className="px-6 py-3 bg-white/10 border border-white/10 rounded-full hover:bg-white/20 transition-colors">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0A0F1D] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-white"
         style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-50 bg-[#0A0F1D]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400">
            EziToon
          </Link>
          <div className="flex items-center gap-2 min-w-0 max-w-[65%]">
            <h1 className="text-sm font-medium text-gray-300 truncate">{data.title}</h1>
            <ViewerShareButton title={data.title} author={data.author?.nickname} />
          </div>
        </div>
      </header>

      {/* 작가 줄 — 닉네임 → 작가 페이지 + [구독] */}
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3 text-sm">
        <AuthorLink author={data.author} size={28} className="font-bold text-gray-200" />
        {data.author?.id && data.author?.nickname && !data.is_me && (
          <SubscribeButton
            authorId={data.author.id}
            subscribed={data.is_subscribed}
            onChange={(r) => setData((d) => ({ ...d, is_subscribed: r.subscribed }))}
            size="sm"
          />
        )}
      </div>

      {/* 컷 표시 — 형식에 따라 세로 스크롤 또는 페이지 단위 */}
      {(() => {
        const pf = data.page_format || 'vertical';
        const fmt = PAGE_FORMATS[pf];

        // vertical (또는 미지정): 기존 세로 스크롤
        if (!fmt || !fmt.per_page) {
          return (
            <main className="max-w-2xl mx-auto flex flex-col pb-12" style={{ gap: CUT_GAP_PX }}>
              {data.cuts.map((cut, i) => (
                <CutViewer key={i} cut={cut} products={data.products} />
              ))}
            </main>
          );
        }

        // 2x2 · 3단: 페이지 단위 CSS Grid (만화 칸 스타일)
        const { cols, rows, per_page, frame: fr } = fmt;
        const hasFixedRatio = !!fmt.cell_ratio;
        const [rw, rh] = hasFixedRatio ? fmt.cell_ratio.split(':').map(Number) : [1, 1];
        const gapPct = ((fr?.gap_ratio || 0.025) * 100).toFixed(1);
        const marginPct = ((fr?.margin_ratio || 0.03) * 100).toFixed(1);
        const borderPx = Math.max(2, Math.round((fr?.border_px || 3) * 0.8));
        const strokeColor = fr?.stroke || '#000000';
        const imageCuts = data.cuts.filter(c => c.image_url);
        const pageCount = Math.ceil(imageCuts.length / per_page);

        return (
          <main className="max-w-2xl mx-auto flex flex-col pb-12" style={{ gap: PAGE_GAP_PX }}>
            {Array.from({ length: pageCount }, (_, p) => {
              const pageCuts = imageCuts.slice(p * per_page, (p + 1) * per_page);
              return (
                <div
                  key={p}
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                    gap: `${gapPct}%`,
                    padding: `${marginPct}%`,
                    backgroundColor: fr?.bg || '#ffffff',
                    border: `${borderPx}px solid ${strokeColor}`,
                  }}
                >
                  {Array.from({ length: per_page }, (_, slot) => {
                    const cut = pageCuts[slot];
                    if (!cut) {
                      return (
                        <div
                          key={slot}
                          style={{ ...(hasFixedRatio ? { aspectRatio: `${rw} / ${rh}` } : {}), border: `${borderPx}px solid ${strokeColor}`, backgroundColor: '#fafafa' }}
                        />
                      );
                    }
                    return (
                      <div
                        key={slot}
                        className="relative overflow-hidden"
                        style={{ ...(hasFixedRatio ? { aspectRatio: `${rw} / ${rh}` } : {}), border: `${borderPx}px solid ${strokeColor}` }}
                      >
                        <CutViewer cut={cut} products={data.products} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </main>
        );
      })()}

      {/* "이렇게 만들었어요" — brief 카드 */}
      {data.brief && (
        <section className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">📋 이렇게 만들었어요</h3>

          {/* 뭘 말했나 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
            <h4 className="text-sm font-bold text-cyan-400 mb-2">뭘 말했나</h4>
            {data.brief.ad_purpose && <Row label="광고 목적" value={data.brief.ad_purpose} />}
            {data.brief.message && <Row label="전달 내용" value={data.brief.message} />}
            {data.brief.product_name && <Row label="제품명" value={data.brief.product_name} />}
            {data.brief.product_info && (
              <details className="text-sm">
                <summary className="text-gray-400 cursor-pointer hover:text-gray-300">특징/활용법</summary>
                <p className="text-gray-300 mt-1 pl-2 border-l-2 border-white/10">{data.brief.product_info}</p>
              </details>
            )}
            {data.brief.mood && <Row label="분위기" value={data.brief.mood} />}
            {data.brief.copy_selected && (
              <div>
                <span className="text-xs text-gray-500">카피</span>
                <p className="text-white font-bold text-base">{data.brief.copy_selected.head}</p>
                {data.brief.copy_selected.sub && <p className="text-gray-400 text-sm">{data.brief.copy_selected.sub}</p>}
              </div>
            )}
            {data.brief.copy_design && (
              <Row label="카피 디자인" value={`${data.brief.copy_design.font === 'bold_gothic' ? '굵은 고딕' : data.brief.copy_design.font === 'handwritten' ? '손글씨' : data.brief.copy_design.font || ''} · ${data.brief.copy_design.position === 'top' ? '상단' : data.brief.copy_design.position === 'bottom' ? '하단' : data.brief.copy_design.position || '자동'}`} />
            )}
            {data.brief.onecut_device && (
              <Row label="설명 장치" value={`${data.brief.onecut_device.device === 'steps' ? '단계' : data.brief.onecut_device.device === 'process' ? '작용 과정' : data.brief.onecut_device.device}${data.brief.onecut_device.labels?.length ? ' · ' + data.brief.onecut_device.labels.join(', ') : ''}`} />
            )}
            {data.brief.visual_points_selected?.length > 0 && (
              <Row label="보여줄 특징" value={data.brief.visual_points_selected.map(v => v.label || v).join(', ')} />
            )}
            {data.brief.target_cuts && <Row label="컷 수" value={`${data.brief.target_cuts}컷`} />}
            {data.brief.episode_topic && <Row label="이번 화 소재" value={data.brief.episode_topic} />}
          </div>

          {/* 어떻게 그렸나 */}
          {data.how && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-purple-400 mb-2">어떻게 그렸나</h4>
              {data.how.style && <Row label="그림 스타일" value={data.how.style.name_ko} />}
              {data.how.characters?.length > 0 && <Row label="캐릭터" value={data.how.characters.join(' / ')} />}
              {data.how.product && <Row label="제품 사진" value={`사용${data.how.product.has_label_text ? ' · 라벨 글자 있음' : ''}`} />}
              {data.how.reference_ads && <Row label="참고 광고" value={`사용${data.how.reference_ads.follow_layout ? ' · 구도 따라가기 ON' : ''}`} />}
            </div>
          )}

          {/* [이 설정으로 만들기] */}
          <button
            onClick={() => {
              const token = localStorage.getItem('token');
              if (!token) {
                // 비로그인 → 로그인 후 복귀
                const returnUrl = `/view/${shareToken}?action=from-example`;
                window.location.href = `/WEBTOON/login?redirect=${encodeURIComponent(returnUrl)}`;
                return;
              }
              handleFromExample();
            }}
            className="w-full py-3.5 rounded-2xl text-sm font-bold bg-gradient-to-r from-purple-600 to-cyan-500 hover:opacity-90 transition-opacity text-white"
          >
            이 설정으로 만들기
          </button>
        </section>
      )}

      {/* 좋아요 & 조회수 영역 */}
      <div className="max-w-2xl mx-auto py-12 flex flex-col items-center border-t border-white/5">
        <div className="flex items-center gap-4 sm:gap-6">
          <span className="flex items-center gap-2 text-gray-400">
            <span className="text-lg sm:text-xl">👁</span>
            <span className="font-semibold text-base sm:text-lg">{data.view_count || 0}</span>
          </span>
          <button
            onClick={toggleLike}
            className={`flex items-center gap-2 h-10 sm:h-auto px-5 sm:px-6 py-2 sm:py-3 rounded-full border transition-all duration-300 transform hover:scale-105 ${
              likeInfo.liked
                ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20 hover:text-white'
            }`}
          >
            <span className="text-lg sm:text-xl">{likeInfo.liked ? '❤️' : '🤍'}</span>
            <span className="font-semibold text-base sm:text-lg">{likeInfo.like_count || 0}</span>
          </button>
        </div>
      </div>

      {/* 댓글 */}
      {data.episode_id && <CommentSection episodeId={data.episode_id} />}

      {/* CTA 푸터 */}
      <footer className="py-12 sm:py-16 text-center border-t border-white/10">
        <p className="text-gray-400 mb-6">나만의 웹툰을 만들어보세요</p>
        <Link to="/login"
          className="neon-btn inline-flex items-center justify-center !px-8 !py-3 sm:!py-4 !rounded-full text-lg">
          나도 만들어보기
        </Link>
        <p className="text-gray-600 text-sm mt-4">카카오 · 구글 · 네이버로 3초 가입</p>
      </footer>
      <PushNudgeBanner />
    </div>
  );
}
