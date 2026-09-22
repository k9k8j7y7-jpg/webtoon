import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import BubbleOverlay from '../components/BubbleOverlay';
import SfxLayer from '../components/SfxLayer';
import EffectLayer from '../components/EffectLayer';
import ProductLayer from '../components/ProductLayer';
import PngBubbleLayer from '../components/PngBubbleLayer';

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

function resolveUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function CutViewer({ cut, products }) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const imgRef = useRef(null);

  const updateDims = useCallback(() => {
    if (imgRef.current) {
      setDims({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
    }
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver(updateDims);
    if (imgRef.current) obs.observe(imgRef.current);
    return () => obs.disconnect();
  }, [updateDims]);

  return (
    <div className="relative w-full">
      <img
        ref={imgRef}
        src={resolveUrl(cut.image_url)}
        alt={`컷 ${cut.cut_number}`}
        className="w-full block"
        onLoad={updateDims}
        draggable={false}
      />
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

export default function ViewerPage() {
  const { shareToken } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [likeInfo, setLikeInfo] = useState({ liked: false, like_count: 0 });

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
          <h1 className="text-sm font-medium text-gray-300 truncate max-w-[60%]">{data.title}</h1>
        </div>
      </header>

      {/* 컷 세로 스크롤 */}
      <main className="max-w-2xl mx-auto flex flex-col gap-6 pb-12">
        {data.cuts.map((cut, i) => (
          <CutViewer key={i} cut={cut} products={data.products} />
        ))}
      </main>

      {/* 좋아요 & 조회수 영역 */}
      <div className="max-w-2xl mx-auto py-12 flex flex-col items-center border-t border-white/5">
        <div className="flex items-center gap-6 mb-4">
          <span className="flex items-center gap-2 text-gray-400">
            <span className="text-xl">👁</span>
            <span className="font-semibold text-lg">{data.view_count || 0}</span>
          </span>
          <button 
            onClick={toggleLike}
            className={`flex items-center gap-2 px-6 py-3 rounded-full border transition-all duration-300 transform hover:scale-105 ${
              likeInfo.liked 
                ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:border-white/20 hover:text-white'
            }`}
          >
            <span className="text-xl">{likeInfo.liked ? '❤️' : '🤍'}</span>
            <span className="font-semibold text-lg">{likeInfo.like_count || 0}</span>
          </button>
        </div>
      </div>

      {/* CTA 푸터 */}
      <footer className="py-16 text-center border-t border-white/10">
        <p className="text-gray-400 mb-6">나만의 웹툰을 만들어보세요</p>
        <Link to="/login"
          className="inline-block px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-full text-white font-semibold text-lg hover:opacity-90 transition-opacity hover:scale-105 transform transition-transform">
          나도 만들어보기
        </Link>
        <p className="text-gray-600 text-sm mt-4">카카오 · 구글 · 네이버로 3초 가입</p>
      </footer>
    </div>
  );
}
