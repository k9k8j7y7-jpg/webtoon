import { useState, useEffect, useCallback } from 'react';
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

/* ── 갤러리 관리 ──────────────────────────────── */
const CATEGORY_OPTIONS = [
  { value: 'short', label: '단편' },
  { value: 'series', label: '연작' },
  { value: 'ad', label: '광고' },
];

const GATE_LABELS = { gate1: 'G1', gate2: 'G2', gate3: 'G3', gate4: 'G4', gate5: 'G5' };

function GateStatusBadges({ gateStatus }) {
  if (!gateStatus) return <span className="text-gray-600">—</span>;
  return (
    <div className="flex gap-1">
      {Object.entries(GATE_LABELS).map(([key, label]) => {
        const status = gateStatus[key];
        const color = status === 'completed' ? 'bg-green-500/20 text-green-400'
          : status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400'
          : 'bg-gray-700/30 text-gray-600';
        return (
          <span key={key} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${color}`}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

function GalleryTab() {
  const [episodes, setEpisodes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const fetchEpisodes = useCallback(() => {
    const params = filterProjectId ? { project_id: filterProjectId } : {};
    api.get('/admin/episodes', { params })
      .then(({ data }) => setEpisodes(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [filterProjectId]);

  useEffect(() => {
    api.get('/admin/projects')
      .then(({ data }) => setProjects(data))
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchEpisodes();
  }, [fetchEpisodes]);

  const handleToggle = async (ep) => {
    const newShowcase = !ep.showcase;
    try {
      const { data } = await api.patch(`/admin/episodes/${ep.id}/showcase`, {
        showcase: newShowcase,
        showcase_category: newShowcase ? (ep.showcase_category || 'short') : ep.showcase_category,
      });
      setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, ...data } : e));
    } catch (err) {
      alert('변경 실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleCategoryChange = async (ep, category) => {
    try {
      const { data } = await api.patch(`/admin/episodes/${ep.id}/showcase`, {
        showcase: ep.showcase,
        showcase_category: category,
      });
      setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, ...data } : e));
    } catch (err) {
      alert('변경 실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  const copyUrl = (shareToken) => {
    const url = `${window.location.origin}/WEBTOON/view/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(shareToken);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (loading) return <div className="text-gray-400 py-12 text-center">로딩 중...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">갤러리 노출 관리</h2>
        <select
          value={filterProjectId}
          onChange={e => setFilterProjectId(e.target.value)}
          className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="">전체 프로젝트</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">제목</th>
              <th className="text-left px-4 py-3 font-medium">프로젝트</th>
              <th className="text-left px-4 py-3 font-medium">게이트</th>
              <th className="text-center px-4 py-3 font-medium">노출</th>
              <th className="text-left px-4 py-3 font-medium">카테고리</th>
              <th className="text-right px-4 py-3 font-medium">조회</th>
              <th className="text-right px-4 py-3 font-medium">좋아요</th>
              <th className="text-center px-4 py-3 font-medium">URL</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map(ep => (
              <tr key={ep.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{ep.id}</td>
                <td className="px-4 py-3 text-white max-w-[200px] truncate">{ep.title}</td>
                <td className="px-4 py-3 text-gray-400 max-w-[150px] truncate">{ep.project_title}</td>
                <td className="px-4 py-3"><GateStatusBadges gateStatus={ep.gate_status} /></td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggle(ep)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${
                      ep.showcase ? 'bg-cyan-500' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      ep.showcase ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={ep.showcase_category || 'short'}
                    onChange={e => handleCategoryChange(ep, e.target.value)}
                    disabled={!ep.showcase}
                    className={`bg-transparent border rounded px-2 py-1 text-xs focus:outline-none ${
                      ep.showcase
                        ? 'border-white/20 text-gray-300 hover:border-cyan-500/50'
                        : 'border-white/5 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right text-gray-400 font-mono">{ep.view_count}</td>
                <td className="px-4 py-3 text-right text-gray-400 font-mono">{ep.like_count}</td>
                <td className="px-4 py-3 text-center">
                  {ep.share_token ? (
                    <button
                      onClick={() => copyUrl(ep.share_token)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      {copiedId === ep.share_token ? '복사됨!' : '복사'}
                    </button>
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
            {episodes.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                  에피소드가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
          <Route path="gallery" element={<GalleryTab />} />
          <Route path="packets" element={<ComingSoon name="패킷 운영" />} />
          <Route path="notices" element={<ComingSoon name="공지 관리" />} />
          <Route path="products" element={<ComingSoon name="상품 관리" />} />
        </Routes>
      </main>
    </div>
  );
}
