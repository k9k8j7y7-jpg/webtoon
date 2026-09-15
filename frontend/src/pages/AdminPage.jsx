import { useState, useEffect } from 'react';
import { useNavigate, NavLink, Routes, Route } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

/* ── 통계 카드 ────────────────────────────────── */
function StatCard({ label, value, unit }) {
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 flex flex-col gap-2">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-3xl font-bold text-white">
        {value?.toLocaleString() ?? '—'}
        {unit && <span className="text-lg text-gray-400 ml-1">{unit}</span>}
      </span>
    </div>
  );
}

/* ── 대시보드 ─────────────────────────────────── */
function DashboardTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats')
      .then(({ data }) => setStats(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 py-12 text-center">로딩 중...</div>;
  if (!stats) return <div className="text-red-400 py-12 text-center">통계 로드 실패</div>;

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">운영 대시보드</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="전체 회원" value={stats.total_users} unit="명" />
        <StatCard label="오늘 가입" value={stats.today_signups} unit="명" />
        <StatCard label="오늘 이미지 생성" value={stats.today_generations} unit="건" />
        <StatCard label="패킷 판매 누계" value={stats.total_revenue} unit="원" />
        <StatCard label="갤러리 조회수 (전체)" value={stats.today_gallery_views} unit="회" />
      </div>
    </div>
  );
}

/* ── 준비 중 탭 ───────────────────────────────── */
function ComingSoon({ name }) {
  return (
    <div className="text-gray-500 py-20 text-center">
      {name} — 다음 단계에서 구현 예정
    </div>
  );
}

/* ── 메뉴 항목 ────────────────────────────────── */
const NAV_ITEMS = [
  { to: '/admin', label: '대시보드', end: true },
  { to: '/admin/gallery', label: '갤러리' },
  { to: '/admin/packets', label: '패킷' },
  { to: '/admin/notices', label: '공지' },
  { to: '/admin/products', label: '상품' },
];

/* ── 메인 레이아웃 ────────────────────────────── */
export default function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !user.is_admin)) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) return null;
  if (!user || !user.is_admin) return null;

  return (
    <div className="min-h-screen bg-[#0f0f23] flex">
      {/* 왼쪽 사이드바 */}
      <aside className="w-56 shrink-0 bg-[#12122a] border-r border-white/10 p-4 flex flex-col gap-1">
        <div className="text-lg font-bold text-cyan-400 mb-6 px-3">EziToon Admin</div>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto pt-4 border-t border-white/10">
          <button
            onClick={() => navigate('/')}
            className="w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-white/5 text-left transition-colors"
          >
            ← 서비스로 돌아가기
          </button>
        </div>
      </aside>

      {/* 콘텐츠 영역 */}
      <main className="flex-1 p-8 overflow-auto">
        <Routes>
          <Route index element={<DashboardTab />} />
          <Route path="gallery" element={<ComingSoon name="갤러리 관리" />} />
          <Route path="packets" element={<ComingSoon name="패킷 운영" />} />
          <Route path="notices" element={<ComingSoon name="공지 관리" />} />
          <Route path="products" element={<ComingSoon name="상품 관리" />} />
        </Routes>
      </main>
    </div>
  );
}
