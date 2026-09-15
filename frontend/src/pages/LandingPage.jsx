import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';
const CATEGORY_MAP = { '단편': 'short', '연작': 'series', '광고·홍보': 'ad' };

function resolveUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

const faqs = [
  { q: "웹툰을 한 번도 그려본 적이 없는데 사용할 수 있나요?", a: "네, EziToon은 그림을 전혀 그리지 못해도 사진과 이야기만 있으면 AI가 알아서 컷과 말풍선을 구성해 완성해 줍니다." },
  { q: "사진은 어떤 사진을 올려야 하나요?", a: "가족, 반려동물, 친구들과 찍은 일상 사진이나, 우리 가게 사진 등 어떤 사진이든 웹툰의 훌륭한 소재가 될 수 있습니다." },
  { q: "생성된 웹툰의 저작권은 누구에게 있나요?", a: "생성된 웹툰의 저작권은 전적으로 창작자인 사용자 본인에게 있습니다." },
  { q: "패킷은 어떻게 차감되나요?", a: "AI 이미지 생성 시 1장당 1패킷이 차감됩니다. 텍스트나 말풍선 작업은 무료이며, 생성에 실패한 경우에는 패킷이 차감되지 않습니다." }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState('단편');
  const [galleryData, setGalleryData] = useState({ short: [], series: [], ad: [] });

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/api/v1/showcase/episodes`)
      .then(res => setGalleryData(res.data))
      .catch(() => {});
  }, []);

  const filteredWebtoons = galleryData[CATEGORY_MAP[activeTab]] || [];

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-white selection:bg-cyan-500/30 overflow-x-hidden" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 1. Header */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#0A0F1D]/80 backdrop-blur-md border-b border-white/10 shadow-lg shadow-black/20' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
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
          <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-full text-sm font-medium transition-colors">
            시작하기
          </button>
        </div>
      </header>

      <main>
        {/* 2. Hero Section */}
        <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 flex flex-col items-center text-center px-6">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-cyan-500/20 rounded-full blur-[100px] pointer-events-none"></div>
          
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight z-10 break-keep">
            사진 몇 장이면, <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-400">
              우리 이야기가 웹툰이 된다
            </span>
          </h2>
          <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl z-10 font-light break-keep leading-relaxed">
            가족, 반려동물, 우리 가게 — 그림을 못 그려도 괜찮아요. <br/>
            사진을 올리고 이야기를 쓰면 EziToon이 컷부터 말풍선까지 완성합니다.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 z-10 mb-8">
            <button onClick={() => navigate('/login')} className="group relative px-8 py-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(168,85,247,0.4)]">
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-purple-600 to-cyan-500 opacity-80 group-hover:opacity-100 transition-opacity"></div>
              <span className="relative text-white font-semibold text-lg tracking-wide">무료로 시작하기</span>
            </button>
            <button onClick={() => scrollToSection('gallery')} className="px-8 py-4 bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 rounded-full text-white font-semibold text-lg transition-all hover:scale-105">
              작품 구경하기
            </button>
          </div>
          <p className="text-sm text-gray-500 z-10">카카오 · 구글 · 네이버로 3초 가입</p>
        </section>

        {/* 3. Gallery Section */}
        <section id="gallery" className="max-w-7xl mx-auto px-6 py-20 relative z-10">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">갤러리</h3>
            <div className="flex justify-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {['단편', '연작', '광고·홍보'].map(tab => (
                <button 
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-2 rounded-full whitespace-nowrap transition-all duration-300 font-medium ${
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
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-lg font-bold text-white truncate leading-tight">{toon.title}</h3>
                      <span className="shrink-0 px-2 py-1 bg-white/10 rounded-md text-[10px] text-cyan-300 border border-white/10 font-semibold whitespace-nowrap">
                        {activeTab}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-400 font-medium">
                      <span className="flex items-center gap-1.5">
                        <span className="text-red-400 text-xs">❤️</span> {toon.like_count || 0}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-gray-300 text-xs">👁</span> {toon.view_count || 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 4. How it Works Section */}
        <section id="how-it-works" className="py-20 relative z-10 bg-white/5 border-y border-white/10">
          <div className="max-w-7xl mx-auto px-6">
            <h3 className="text-3xl font-bold text-center mb-16">만드는 법</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center p-8 bg-[#0A0F1D]/50 rounded-3xl border border-white/10 backdrop-blur-md">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 flex items-center justify-center text-2xl font-bold mb-6">1</div>
                <h4 className="text-xl font-bold mb-3">사진과 이야기를 올린다</h4>
                <p className="text-gray-400 break-keep">준비된 사진을 업로드하고 만들고 싶은 이야기를 텍스트로 적어보세요.</p>
              </div>
              <div className="flex flex-col items-center text-center p-8 bg-[#0A0F1D]/50 rounded-3xl border border-white/10 backdrop-blur-md">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 flex items-center justify-center text-2xl font-bold mb-6">2</div>
                <h4 className="text-xl font-bold mb-3">컷을 고치고 꾸민다</h4>
                <p className="text-gray-400 break-keep">AI가 생성한 컷을 수정하고, 말풍선과 효과음을 자유롭게 배치하세요.</p>
              </div>
              <div className="flex flex-col items-center text-center p-8 bg-[#0A0F1D]/50 rounded-3xl border border-white/10 backdrop-blur-md">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 flex items-center justify-center text-2xl font-bold mb-6">3</div>
                <h4 className="text-xl font-bold mb-3">내보내고 자랑한다</h4>
                <p className="text-gray-400 break-keep">완성된 웹툰을 이미지 파일로 내보내어 SNS나 커뮤니티에 공유해 보세요.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Pricing Section */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 py-20 relative z-10">
          <h3 className="text-3xl font-bold text-center mb-16">요금 안내</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {/* Basic */}
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10 flex flex-col items-center">
              <h4 className="text-xl text-gray-300 mb-2">베이직</h4>
              <div className="text-4xl font-bold mb-6 text-white">5,900원</div>
              <div className="w-full py-3 bg-white/5 rounded-xl text-center mb-6">
                <span className="text-cyan-400 font-bold">30</span> 패킷
              </div>
              <button className="w-full py-3 rounded-full border border-white/20 hover:bg-white/10 transition-colors font-medium">선택하기</button>
            </div>
            {/* Pro (인기) */}
            <div className="p-8 bg-gradient-to-b from-[#1a1438] to-[#0A0F1D] rounded-3xl border border-purple-500/50 flex flex-col items-center relative transform md:-translate-y-4 shadow-[0_0_40px_rgba(168,85,247,0.2)]">
              <div className="absolute -top-4 bg-gradient-to-r from-purple-500 to-cyan-500 px-4 py-1 rounded-full text-sm font-bold shadow-lg">인기</div>
              <h4 className="text-xl text-gray-300 mb-2 mt-4">프로</h4>
              <div className="text-4xl font-bold mb-6 text-white">14,900원</div>
              <div className="w-full py-3 bg-white/10 rounded-xl text-center mb-6">
                <span className="text-cyan-400 font-bold text-lg">100</span> 패킷
              </div>
              <button className="w-full py-3 rounded-full bg-gradient-to-r from-purple-600 to-cyan-500 hover:opacity-90 transition-opacity font-bold text-white">선택하기</button>
            </div>
            {/* Premium */}
            <div className="p-8 bg-white/5 rounded-3xl border border-white/10 flex flex-col items-center">
              <h4 className="text-xl text-gray-300 mb-2">프리미엄</h4>
              <div className="text-4xl font-bold mb-6 text-white">34,900원</div>
              <div className="w-full py-3 bg-white/5 rounded-xl text-center mb-6">
                <span className="text-cyan-400 font-bold">300</span> 패킷
              </div>
              <button className="w-full py-3 rounded-full border border-white/20 hover:bg-white/10 transition-colors font-medium">선택하기</button>
            </div>
          </div>
          <div className="text-center text-gray-400 bg-white/5 py-4 rounded-xl border border-white/10 inline-block px-8 mx-auto w-full md:w-auto">
            <span className="text-cyan-400">✓</span> 이미지 1장 = 1패킷 &nbsp;&nbsp;|&nbsp;&nbsp; 
            <span className="text-cyan-400">✓</span> 실패 시 차감 없음 &nbsp;&nbsp;|&nbsp;&nbsp; 
            <span className="text-cyan-400">✓</span> 글 작업 무료
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
