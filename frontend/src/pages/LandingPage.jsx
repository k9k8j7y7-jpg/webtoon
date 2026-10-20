import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Menu, Sparkles, Film, Share2 } from 'lucide-react';
import MobileDrawer from '../components/MobileDrawer';
import AuthorLink from '../components/AuthorLink';
import NotificationBell from '../components/NotificationBell';
import useHeaderCounts from '../hooks/useHeaderCounts';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_LABELS } from '../utils/resolveUrl';
import { PACKET_USAGE, REFUND_TEXT } from '../utils/packetUsage';

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';
const CATEGORY_MAP = { '단편': 'short', '연작': 'series', '광고·홍보': 'ad' };
const GALLERY_TABS = ['전체', '단편', '연작', '광고·홍보'];

function resolveUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ── 랜딩 참조 에피소드 (삭제 금지) ──
const LANDING_EPISODES = {
  ad: { id: 30, token: '65cb2832-881d-4863-8fb4-5c7044384858', useCaseCut: 4 },  // 0-based: cut#5 (제품 등장)
  pet: { id: 25, token: 'b3fac13f-aff7-11f1-a160-026fc2c9b825', useCaseCut: 0 },
  series: { id: 26, token: 'b3fac6a9-aff7-11f1-a160-026fc2c9b825', useCaseCut: 0 },
};
const LANDING_REEL = '/storage/landing/reel_hairpack_short.mp4';
const LANDING_REEL_POSTER = '/storage/landing/reel_hairpack_poster.jpg';

const PRODUCT_LABELS = { packet_15: '체험', packet_30: '시작', packet_100: '인기', packet_300: '대용량' };
const PRODUCT_DESC = {
  packet_15: '약 15컷 · 8컷 에피소드 1~2편',
  packet_30: '약 30컷 · 8컷 에피소드 3~4편',
  packet_100: '약 100컷 · 8컷 에피소드 12편 · 릴스 포함 넉넉',
  packet_300: '약 300컷 · 8컷 에피소드 37편',
};

const USE_CASES = [
  {
    tab: '가게·제품 홍보',
    text: '우리 가게 제품 사진 한 장이면 광고 웹툰이 완성됩니다. 인스타 캐러셀로 바로 올리세요.',
    tips: ['제품 사진 + 한 줄 소개로 광고 웹툰 생성', '인스타 피드·릴스용 자동 내보내기'],
    token: LANDING_EPISODES.ad.token,
  },
  {
    tab: '반려동물·가족',
    text: '반려동물, 아이, 가족 사진으로 세상에 하나뿐인 이야기를 만들어 보세요.',
    tips: ['사진 속 인물을 캐릭터로 자동 변환', '일상 에피소드를 웹툰으로 기록'],
    token: LANDING_EPISODES.pet.token,
  },
  {
    tab: '이야기 연재',
    text: '떠오른 이야기를 연재 웹툰으로. 캐릭터·장소가 회차마다 일관되게 유지됩니다.',
    tips: ['바이블→회차 대본→이미지까지 자동', '캐릭터·장소 일관성 유지'],
    token: LANDING_EPISODES.series.token,
  },
];

const faqs = [
  { q: "웹툰을 한 번도 그려본 적이 없는데 사용할 수 있나요?", a: "네, EziToon은 그림을 전혀 그리지 못해도 사진과 이야기만 있으면 AI가 알아서 컷과 말풍선을 구성해 완성해 줍니다." },
  { q: "사진은 어떤 사진을 올려야 하나요?", a: "가족, 반려동물, 친구들과 찍은 일상 사진이나, 우리 가게 사진 등 어떤 사진이든 웹툰의 훌륭한 소재가 될 수 있습니다." },
  { q: "패킷은 뭔가요?", a: "AI 이미지를 만드는 데 쓰는 단위입니다. 컷 1장 = 1패킷, 컷 영상 = 4패킷, 릴스 = 1패킷. 기획·대본·콘티·말풍선·내레이션은 무료이고, 실패하면 차감되지 않습니다." },
  { q: "한 편에 얼마 드나요?", a: "8컷짜리 에피소드 한 편이 패킷 8개입니다. 인기 팩(100패킷, 19,900원) 기준 한 편에 약 1,600원이에요." },
  { q: "생성된 웹툰의 저작권은 누구에게 있나요?", a: "서비스를 통해 생성한 웹툰 콘텐츠의 저작권은 전적으로 창작자인 사용자 본인에게 귀속됩니다." },
  { q: "환불은 어떻게 하나요?", a: "결제 후 7일 이내 사용하지 않은 패킷은 전액 환불, 사용한 패킷은 1개당 230원 공제됩니다. 1:1 문의로 요청해 주세요." },
  { q: "AI 그림을 인스타에 올려도 되나요?", a: "네, 자유롭게 올릴 수 있습니다. 인스타그램 정책에 따라 AI 생성 콘텐츠에는 'AI 생성' 라벨을 표시하는 것을 권장하며, EziToon 인스타 내보내기를 쓰면 크레딧이 자동으로 붙습니다." },
  { q: "패킷은 어떻게 차감되나요?", a: "AI 이미지 생성 시 1장당 1패킷이 차감됩니다. 텍스트나 말풍선 작업은 무료이며, 생성에 실패한 경우에는 패킷이 차감되지 않습니다." }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  // 회원도 랜딩을 공개 홈으로 쓴다 — 시작 버튼은 회원이면 내 작품(/my)으로
  const startPath = user ? '/my' : '/login';
  // 회원 ☰·🔔 — 앱 헤더와 같은 패킷·알림 카운트
  const { packets, unreadCount } = useHeaderCounts(user);
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('단편');
  const [galleryData, setGalleryData] = useState({ short: [], series: [], ad: [] });
  const [allWorks, setAllWorks] = useState(null); // '전체' 탭 = 작가 공개작 전부(scope=all), 처음 열 때 로드
  const [products, setProducts] = useState([]);
  const [useTab, setUseTab] = useState(0);
  const [useCaseImages, setUseCaseImages] = useState({});
  const reelUrl = resolveUrl(LANDING_REEL);
  const reelPoster = resolveUrl(LANDING_REEL_POSTER);
  const [adCuts, setAdCuts] = useState([]);
  const videoRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/api/v1/showcase/episodes`)
      .then(res => setGalleryData(res.data))
      .catch(() => {});
    axios.get(`${API_BASE}/api/v1/payments/products`)
      .then(res => setProducts(res.data))
      .catch(() => {});
    // 용도 탭 + 릴스 데이터
    const tokens = [LANDING_EPISODES.ad.token, LANDING_EPISODES.pet.token, LANDING_EPISODES.series.token];
    tokens.forEach(tk => {
      axios.get(`${API_BASE}/api/v1/showcase/view/${tk}`)
        .then(({ data }) => {
          // 용도 탭 이미지: 각 에피소드별 지정 컷
          const ep = Object.values(LANDING_EPISODES).find(e => e.token === tk);
          const cutIdx = ep?.useCaseCut ?? 0;
          setUseCaseImages(prev => ({ ...prev, [tk]: data.cuts?.[cutIdx]?.image_url || data.cuts?.[0]?.image_url }));
          if (tk === LANDING_EPISODES.ad.token) {
            // 광고 2×2용 첫 4컷
            const first4 = (data.cuts || []).slice(0, 4).map(c => resolveUrl(c.image_url));
            setAdCuts(first4);
          }
        })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (activeTab !== '전체' || allWorks) return;
    axios.get(`${API_BASE}/api/v1/showcase/episodes`, { params: { scope: 'all' } })
      .then(res => setAllWorks(
        Object.entries(res.data)
          .flatMap(([cat, list]) => list.map(t => ({ ...t, category: cat })))
      ))
      .catch(() => setAllWorks([]));
  }, [activeTab, allWorks]);

  // 전체 탭: 서버가 공개순으로 준 카테고리 그룹을 합친 것 (그룹 내 순서 유지)
  // ☰ "갤러리"(/#gallery)로 들어오면 갤러리로 스크롤
  useEffect(() => {
    if (location.hash === '#gallery') {
      setTimeout(() => document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [location.hash, location.key]);

  const filteredWebtoons = activeTab === '전체'
    ? (allWorks || [])
    : (galleryData[CATEGORY_MAP[activeTab]] || []).map(t => ({ ...t, category: CATEGORY_MAP[activeTab] }));

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-white selection:bg-cyan-500/30 overflow-x-hidden" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 1. Header */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#0A0F1D]/80 backdrop-blur-md border-b border-white/10 shadow-lg shadow-black/20' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <button
              onClick={() => setDrawerOpen(true)}
              className="sm:hidden p-2 -ml-2 text-gray-400 hover:text-white transition-colors"
              style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Menu size={22} />
            </button>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400 tracking-tighter cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
              EziToon
            </h1>
            <nav className="hidden md:flex gap-6 text-sm font-medium text-gray-300">
              <button onClick={() => scrollToSection('gallery')} className="hover:text-white transition-colors">갤러리</button>
              <button onClick={() => scrollToSection('how-it-works')} className="hover:text-white transition-colors">만드는 법</button>
              <button onClick={() => scrollToSection('pricing')} className="hover:text-white transition-colors">가격</button>
              <button onClick={() => scrollToSection('faq')} className="hover:text-white transition-colors">FAQ</button>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {/* 회원: 🔔 알림 (앱 헤더와 동일 — PC 드롭다운 / 모바일 /notifications) */}
            {user && <NotificationBell unreadCount={unreadCount} />}
            <button onClick={() => navigate(startPath)} className="px-5 sm:px-6 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-full text-sm font-medium transition-colors whitespace-nowrap">
              {user ? '내 작품' : '시작하기'}
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        packets={packets}
        unreadCount={unreadCount}
        onLogout={async () => { await logout(); navigate('/'); }}
      />

      <main>
        {/* 2. Hero Section */}
        <section className="relative pt-28 pb-8 lg:pt-40 lg:pb-12 flex flex-col items-center text-center px-6">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-tight z-10 break-keep">
            우리 가게 이야기, <br className="sm:hidden"/>10분이면<br className="hidden sm:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400">
              {' '}인스타툰과 릴스가 돼요
            </span>
          </h2>
          <p className="text-sm sm:text-base text-gray-400 mb-6 max-w-xl z-10 break-keep leading-relaxed">
            기획·대본·콘티는 무료, 그림 1장 = 1패킷.<br/>
            <strong className="text-gray-200">8컷 한 편이 패킷 8개(약 1,600원).</strong>
          </p>
          <button onClick={() => navigate(startPath)} className="group relative px-8 py-3.5 rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(168,85,247,0.4)] z-10 mb-2">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-cyan-500 opacity-80 group-hover:opacity-100 transition-opacity"></div>
            <span className="relative text-white font-bold text-base">{user ? '내 작품 만들기' : '무료로 시작하기 — 가입하면 3패킷'}</span>
          </button>
          {!user && <p className="text-xs text-gray-500 z-10 mb-4">카카오 · 구글 · 네이버로 3초 가입</p>}
        </section>

        {/* 2b. 결과물 먼저 섹션 */}
        <section className="max-w-5xl mx-auto px-4 pb-16 relative z-10">
          <div className="flex flex-col sm:grid sm:grid-cols-3 gap-4 sm:gap-6">
            {/* 광고툰 2×2 */}
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[4/5] rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-white/5 grid grid-cols-2 grid-rows-2 gap-0.5">
                {adCuts.map((url, i) => (
                  <img key={i} src={url} alt={`광고 컷 ${i+1}`} className="w-full h-full object-cover" loading="lazy" />
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">가게 홍보 광고툰</p>
            </div>
            {/* 릴스 영상 */}
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[4/5] rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-black relative flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={reelUrl}
                  autoPlay muted loop playsInline
                  preload="metadata"
                  poster={reelPoster}
                  className="h-full aspect-[9/16] object-cover"
                />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 px-2 py-0.5 rounded-full text-[9px] text-white/80 backdrop-blur-sm">릴스</div>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">릴스 영상</p>
            </div>
            {/* 반려동물 일상툰 */}
            <div className="flex flex-col items-center">
              <div className="w-full aspect-[4/5] rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                <img src={resolveUrl(useCaseImages[LANDING_EPISODES.pet.token] || '')} alt="반려동물 웹툰" className="w-full h-full object-cover object-top" loading="lazy" />
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">우리 아이 일상툰</p>
            </div>
          </div>
        </section>

        {/* 3. 3단계 흐름 */}
        <section id="how-it-works" className="py-16 relative z-10 bg-white/5 border-y border-white/10">
          <div className="max-w-5xl mx-auto px-6">
            <h3 className="text-2xl sm:text-3xl font-bold text-center mb-12">3단계로 완성</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { n: 1, title: '이야기 입력', desc: '제품 사진, 가족 사진, 한 줄 아이디어를 올리세요.' },
                { n: 2, title: '그림·말풍선 자동', desc: 'AI가 컷을 그리고 말풍선·효과음을 배치합니다.' },
                { n: 3, title: '인스타·릴스로 보내기', desc: '버튼 한 번으로 인스타 피드와 릴스에 공유하세요.' },
              ].map(s => (
                <div key={s.n} className="flex flex-col items-center text-center p-6 bg-[#0A0F1D]/50 rounded-2xl border border-white/10">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 flex items-center justify-center text-xl font-bold mb-4">{s.n}</div>
                  <h4 className="text-lg font-bold mb-2">{s.title}</h4>
                  <p className="text-sm text-gray-400 break-keep">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. 용도 탭 */}
        <section className="max-w-5xl mx-auto px-6 py-16 relative z-10">
          <h3 className="text-2xl sm:text-3xl font-bold text-center mb-8">이렇게 쓰세요</h3>
          <div className="flex justify-center gap-2 mb-8">
            {USE_CASES.map((uc, i) => (
              <button key={i} onClick={() => setUseTab(i)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                useTab === i ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'
              }`}>{uc.tab}</button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-6 items-center">
            <div className="w-full md:w-1/2 aspect-square max-w-sm rounded-2xl overflow-hidden border border-white/10 bg-white/5 cursor-pointer" onClick={() => navigate(`/view/${USE_CASES[useTab].token}`)}>
              <img src={resolveUrl(useCaseImages[USE_CASES[useTab].token] || '')} alt={USE_CASES[useTab].tab} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <p className="text-gray-300 mb-4 break-keep">{USE_CASES[useTab].text}</p>
              <ul className="space-y-2">
                {USE_CASES[useTab].tips.map((t, i) => (
                  <li key={i} className="text-sm text-gray-400 flex items-start gap-2"><span className="text-cyan-400 mt-0.5">✓</span>{t}</li>
                ))}
              </ul>
              <button onClick={() => navigate(`/view/${USE_CASES[useTab].token}`)} className="mt-4 text-sm text-cyan-400 hover:text-cyan-300 font-medium">예시 보기 →</button>
            </div>
          </div>
        </section>

        {/* 5. 비용 비교 */}
        <section className="max-w-3xl mx-auto px-6 py-12 relative z-10">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 text-center">
            <h3 className="text-xl sm:text-2xl font-bold mb-4">비용 비교</h3>
            <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 mb-4">
              <div className="px-6 py-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-sm text-gray-400 mb-1">일반 컷 생성기</p>
                <p className="text-2xl font-bold text-gray-300">~25,000원</p>
                <p className="text-xs text-gray-500">한 편 연재 분량 125장</p>
              </div>
              <div className="px-6 py-4 bg-gradient-to-br from-purple-900/30 to-cyan-900/30 rounded-xl border border-purple-500/30">
                <p className="text-sm text-cyan-400 mb-1">EziToon</p>
                <p className="text-2xl font-bold text-white">~1,600원</p>
                <p className="text-xs text-gray-400">8컷 한 편 = 패킷 8개</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">기획·대본·콘티가 무료라서 그림 값만 들어요</p>
            <button onClick={() => scrollToSection('pricing')} className="mt-4 text-sm text-cyan-400 hover:text-cyan-300 font-medium">가격 보기 →</button>
          </div>
        </section>

        {/* 6. 차별점 3줄 */}
        <section className="max-w-3xl mx-auto px-6 pb-12 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Sparkles, text: '컷이 움직이는 모션' },
              { icon: Film, text: '릴스 자동 제작' },
              { icon: Share2, text: '인스타 공유 버튼 한 번' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
                <Icon size={20} className="text-cyan-400 shrink-0" />
                <span className="text-sm font-medium text-gray-300">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 7. Gallery Section */}
        <section id="gallery" className="max-w-7xl mx-auto px-6 py-20 relative z-10">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">갤러리</h3>
            <div className="flex justify-start sm:justify-center gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {GALLERY_TABS.map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 sm:px-6 py-2 rounded-full whitespace-nowrap shrink-0 transition-all duration-300 font-medium ${
                    activeTab === tab 
                      ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border border-transparent' 
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWebtoons.length === 0 ? (
              <div className="col-span-full text-center py-20 text-gray-500 text-lg">
                준비 중
              </div>
            ) : (
              filteredWebtoons.map(toon => (
                <div key={toon.share_token} onClick={() => navigate(`/view/${toon.share_token}`)}
                  className="group relative rounded-2xl overflow-hidden aspect-[9/12] cursor-pointer bg-white/5 backdrop-blur-md border border-white/10 shadow-xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(168,85,247,0.2)] hover:border-purple-500/50 p-3 flex flex-col">
                  
                  {/* 썸네일 영역 */}
                  <div className="relative flex-1 rounded-xl overflow-hidden bg-[#0A0F1D]/80 mb-3">
                    {toon.thumbnail_url ? (
                      <img src={resolveUrl(toon.thumbnail_url)} alt={toon.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    ) : (
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-purple-900/50 to-cyan-900/50" />
                    )}
                  </div>
                  
                  {/* 하단 정보 영역 */}
                  <div className="flex flex-col gap-2 px-1">
                    <div className="flex justify-between items-start gap-2 min-w-0">
                      <h3 className="flex-1 min-w-0 text-lg font-bold text-white truncate leading-tight">{toon.title}</h3>
                      <span className="shrink-0 px-2 py-1 bg-white/10 rounded-md text-[10px] text-cyan-300 border border-white/10 font-semibold whitespace-nowrap">
                        {CATEGORY_LABELS[toon.category] || activeTab}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-medium min-w-0">
                      <AuthorLink author={toon.author} size={20} className="flex-1 text-gray-300" />
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-red-400 text-xs">❤️</span> {toon.like_count || 0}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-gray-300 text-xs">👁</span> {toon.view_count || 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 8. Pricing Section */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 py-20 relative z-10">
          <h3 className="text-3xl font-bold text-center mb-6">요금 안내</h3>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-gray-400 mb-10">
            <span><span className="text-cyan-400">✓</span> 1회 결제</span>
            <span><span className="text-cyan-400">✓</span> 유효기간 없음</span>
            <span><span className="text-cyan-400">✓</span> 자동결제 없음</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {products.map((p, i) => {
              const isPro = p.code === 'packet_100';
              const label = PRODUCT_LABELS[p.code] || p.name;
              const desc = PRODUCT_DESC[p.code] || '';
              return (
                <div key={p.code} className={`p-8 rounded-3xl flex flex-col items-center ${
                  isPro
                    ? 'bg-gradient-to-b from-[#1a1438] to-[#0A0F1D] border border-purple-500/50 relative transform lg:-translate-y-4 shadow-[0_0_40px_rgba(168,85,247,0.2)]'
                    : 'bg-white/5 border border-white/10'
                }`}>
                  {isPro && <div className="absolute -top-4 bg-gradient-to-r from-purple-500 to-cyan-500 px-4 py-1 rounded-full text-sm font-bold shadow-lg">인기</div>}
                  <h4 className={`text-xl text-gray-300 mb-2 ${isPro ? 'mt-4' : ''}`}>{label}</h4>
                  <div className="text-4xl font-bold mb-4 text-white">{p.amount.toLocaleString()}원</div>
                  <div className={`w-full py-3 rounded-xl text-center mb-2 ${isPro ? 'bg-white/10' : 'bg-white/5'}`}>
                    <span className={`text-cyan-400 font-bold ${isPro ? 'text-lg' : ''}`}>{p.packets}</span> 패킷
                  </div>
                  {desc && <p className="text-xs text-gray-400 text-center mb-6 leading-relaxed">{desc}</p>}
                  <button onClick={() => navigate(user ? '/packets' : '/login')} className={`w-full py-3 rounded-full font-medium transition-colors mt-auto ${
                    isPro
                      ? 'bg-gradient-to-r from-purple-600 to-cyan-500 hover:opacity-90 font-bold text-white'
                      : 'border border-white/20 hover:bg-white/10'
                  }`}>선택하기</button>
                </div>
              );
            })}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-5">
            <p className="text-sm font-semibold text-gray-300 mb-3">패킷은 어디에 쓰나요?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mb-3">
              {PACKET_USAGE.map(row => (
                <div key={row.label} className="flex justify-between text-sm text-gray-400 py-1 border-b border-white/5 last:border-0">
                  <span>{row.label}</span>
                  <span className="text-cyan-400 font-medium ml-4 shrink-0">{row.cost}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">{REFUND_TEXT}</p>
          </div>
        </section>

        {/* 6. FAQ Section */}
        <section id="faq" className="max-w-3xl mx-auto px-6 py-20 relative z-10">
          <h3 className="text-3xl font-bold text-center mb-12">자주 묻는 질문</h3>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="p-6 bg-white/5 rounded-2xl border border-white/10">
                <h4 className="text-lg font-bold mb-3 flex items-start gap-3">
                  <span className="text-cyan-400">Q.</span>
                  {faq.q}
                </h4>
                <p className="text-gray-400 leading-relaxed pl-7">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#060913] py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center md:items-start gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
            <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400">EziToon</h2>
            <p className="text-gray-500 text-sm mt-2">AI 웹툰 자동화의 새로운 표준</p>
            <p className="text-gray-600 text-xs mt-1">대표: 김정신 | 문의: k9k8j7y7@naver.com</p>
          </div>
          
          <div className="flex gap-6 text-sm font-medium text-gray-400">
            <Link to="/terms" className="hover:text-white transition-colors">이용약관</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">개인정보처리방침</Link>
            <Link to="/faq" className="hover:text-white transition-colors">FAQ</Link>
          </div>
          
          <div className="text-gray-600 text-sm">
            &copy; {new Date().getFullYear()} EziToon. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
