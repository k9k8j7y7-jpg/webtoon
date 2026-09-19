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
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

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
      const { data } = await api.post(`/admin/episodes/${ep.id}/showcase`, {
        showcase: newShowcase,
        showcase_category: newShowcase ? (ep.showcase_category || null) : ep.showcase_category,
      });
      setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, ...data } : e));
    } catch (err) {
      alert('변경 실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleCategoryChange = async (ep, category) => {
    try {
      const { data } = await api.post(`/admin/episodes/${ep.id}/showcase`, {
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

  const startEditTitle = (ep) => {
    setEditingTitleId(ep.id);
    setEditingTitleValue(ep.title);
  };

  const saveTitle = async (epId) => {
    const title = editingTitleValue.trim();
    if (!title || title.length > 100) {
      alert(!title ? '제목을 입력하세요' : '제목은 100자 이내로 입력하세요');
      return;
    }
    try {
      const { data } = await api.post(`/admin/episodes/${epId}/title`, { title });
      setEpisodes(prev => prev.map(e => e.id === epId ? { ...e, title: data.title } : e));
      setEditingTitleId(null);
    } catch (err) {
      alert('변경 실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  const cancelEditTitle = () => setEditingTitleId(null);

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
                <td className="px-4 py-3 max-w-[200px]">
                  {editingTitleId === ep.id ? (
                    <input
                      autoFocus
                      value={editingTitleValue}
                      onChange={e => setEditingTitleValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveTitle(ep.id); if (e.key === 'Escape') cancelEditTitle(); }}
                      onBlur={() => saveTitle(ep.id)}
                      maxLength={100}
                      className="w-full bg-[#0d0d1a] border border-cyan-500/50 rounded px-2 py-0.5 text-white text-sm focus:outline-none"
                    />
                  ) : (
                    <span onClick={() => startEditTitle(ep)} className="text-white truncate block cursor-pointer hover:text-cyan-300 transition-colors" title="클릭하여 편집">
                      {ep.title}
                      {ep.is_ad && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-400 font-medium">AD</span>}
                    </span>
                  )}
                </td>
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

/* ── 패킷 운영 ────────────────────────────────── */
function PacketsTab() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [grantAmount, setGrantAmount] = useState('');
  const [grantMemo, setGrantMemo] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);

  // 주문 관련
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [tab, setTab] = useState('users'); // 'users' | 'orders'

  const fetchUsers = useCallback(() => {
    const params = search ? { search } : {};
    api.get('/admin/users', { params })
      .then(({ data }) => setUsers(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [search]);

  const fetchOrders = useCallback(() => {
    const params = orderFilter ? { status_filter: orderFilter } : {};
    api.get('/admin/orders', { params })
      .then(({ data }) => {
        setOrders(data.orders);
        setPendingCount(data.pending_count);
      })
      .catch(err => console.error(err))
      .finally(() => setOrdersLoading(false));
  }, [orderFilter]);

  useEffect(() => { setLoading(true); fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setOrdersLoading(true); fetchOrders(); }, [fetchOrders]);

  const handleGrant = async () => {
    const amount = parseInt(grantAmount);
    if (!amount || !selectedUser) return;
    setGrantBusy(true);
    try {
      const { data } = await api.post('/admin/packets/grant', {
        user_id: selectedUser.id,
        amount,
        memo: grantMemo,
      });
      alert(`${amount > 0 ? '지급' : '차감'} 완료. 잔량: ${data.balance}`);
      setGrantAmount('');
      setGrantMemo('');
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      alert('실패: ' + (err.response?.data?.detail || err.message));
    } finally {
      setGrantBusy(false);
    }
  };

  const handleExpirePending = async () => {
    if (!confirm(`오늘 이전 pending 주문 ${pendingCount}건을 만료 처리합니다.`)) return;
    try {
      const { data } = await api.post('/admin/orders/expire-pending');
      alert(`${data.expired_count}건 만료 처리됨`);
      fetchOrders();
    } catch (err) {
      alert('실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  const STATUS_LABELS = { pending: '대기', paid: '완료', failed: '실패', cancelled: '취소' };
  const STATUS_COLORS = {
    pending: 'text-yellow-400',
    paid: 'text-green-400',
    failed: 'text-red-400',
    cancelled: 'text-gray-500',
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">패킷 운영</h2>

      {/* 탭 전환 */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'users' ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-white/5'}`}>
          회원 관리
        </button>
        <button onClick={() => setTab('orders')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'orders' ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-white/5'}`}>
          주문 목록 {pendingCount > 0 && <span className="ml-1 text-yellow-400">({pendingCount})</span>}
        </button>
      </div>

      {tab === 'users' && (
        <>
          {/* 패킷 지급/차감 모달 */}
          {selectedUser && (
            <div className="bg-[#1e1e3a] border border-cyan-500/30 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">
                  {selectedUser.display_name} ({selectedUser.email}) — 잔량 {selectedUser.balance}
                </h3>
                <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-white">✕</button>
              </div>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">수량 (양수=지급, 음수=차감)</label>
                  <input type="number" value={grantAmount} onChange={e => setGrantAmount(e.target.value)}
                    className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-32 focus:outline-none focus:border-cyan-500/50"
                    placeholder="예: 100" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">사유</label>
                  <input type="text" value={grantMemo} onChange={e => setGrantMemo(e.target.value)}
                    className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-cyan-500/50"
                    placeholder="사유 입력" />
                </div>
                <button onClick={handleGrant} disabled={grantBusy || !grantAmount}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors">
                  {grantBusy ? '처리 중...' : '적용'}
                </button>
              </div>
            </div>
          )}

          {/* 검색 */}
          <div className="mb-4">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="닉네임 또는 이메일 검색..."
              className="bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-300 w-64 focus:outline-none focus:border-cyan-500/50" />
          </div>

          {/* 회원 테이블 */}
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
            {loading ? <div className="text-gray-400 py-12 text-center">로딩 중...</div> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400">
                    <th className="text-left px-4 py-3 font-medium">ID</th>
                    <th className="text-left px-4 py-3 font-medium">닉네임</th>
                    <th className="text-left px-4 py-3 font-medium">이메일</th>
                    <th className="text-left px-4 py-3 font-medium">로그인</th>
                    <th className="text-left px-4 py-3 font-medium">가입일</th>
                    <th className="text-right px-4 py-3 font-medium">잔량</th>
                    <th className="text-center px-4 py-3 font-medium">패킷</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.id}</td>
                      <td className="px-4 py-3 text-white">{u.display_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{u.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{u.provider}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.created_at?.split('T')[0]}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{u.balance}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setSelectedUser(u)}
                          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                          지급/차감
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'orders' && (
        <>
          <div className="flex items-center gap-4 mb-4">
            <select value={orderFilter} onChange={e => setOrderFilter(e.target.value)}
              className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50">
              <option value="">전체</option>
              <option value="pending">대기</option>
              <option value="paid">완료</option>
              <option value="failed">실패</option>
              <option value="cancelled">취소</option>
            </select>
            {pendingCount > 0 && (
              <button onClick={handleExpirePending}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm border border-red-500/30 transition-colors">
                오래된 pending 만료 ({pendingCount}건)
              </button>
            )}
          </div>

          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
            {ordersLoading ? <div className="text-gray-400 py-12 text-center">로딩 중...</div> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400">
                    <th className="text-left px-4 py-3 font-medium">주문ID</th>
                    <th className="text-left px-4 py-3 font-medium">회원</th>
                    <th className="text-left px-4 py-3 font-medium">상품</th>
                    <th className="text-right px-4 py-3 font-medium">금액</th>
                    <th className="text-right px-4 py-3 font-medium">패킷</th>
                    <th className="text-center px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">일시</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">{o.order_id}</td>
                      <td className="px-4 py-3 text-gray-300 text-xs">{o.user_name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{o.product_code}</td>
                      <td className="px-4 py-3 text-right text-white font-mono">{o.amount?.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-400 font-mono">{o.packet_delta}</td>
                      <td className={`px-4 py-3 text-center text-xs font-semibold ${STATUS_COLORS[o.status]}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {(o.paid_at || o.created_at)?.replace('T', ' ').slice(0, 16)}
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">주문 없음</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── 공지 관리 ────────────────────────────────── */
const NOTICE_TYPES = [
  { value: 'info', label: '안내', color: 'text-blue-400' },
  { value: 'warning', label: '경고', color: 'text-amber-400' },
  { value: 'maintenance', label: '점검', color: 'text-purple-400' },
  { value: 'update', label: '업데이트', color: 'text-emerald-400' },
];

const EMPTY_FORM = { title: '', body: '', notice_type: 'info', is_active: true, starts_at: '', ends_at: '' };

// datetime-local(로컬) → UTC ISO string
function localToUtc(localStr) {
  if (!localStr) return null;
  return new Date(localStr).toISOString();
}
// UTC ISO string → datetime-local(로컬) 형식
function utcToLocal(utcStr) {
  if (!utcStr) return '';
  const d = new Date(utcStr.endsWith('Z') ? utcStr : utcStr + 'Z');
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}
// UTC ISO string → 로컬 날짜 표시
function utcToLocalDate(utcStr) {
  if (!utcStr) return '—';
  const d = new Date(utcStr.endsWith('Z') ? utcStr : utcStr + 'Z');
  return d.toLocaleDateString('ko-KR');
}

function NoticesTab() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null=목록, 'new'=등록, 숫자=수정
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const fetchNotices = useCallback(() => {
    api.get('/admin/notices')
      .then(({ data }) => setNotices(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };

  const openEdit = (n) => {
    setForm({
      title: n.title,
      body: n.body || '',
      notice_type: n.notice_type,
      is_active: n.is_active,
      starts_at: utcToLocal(n.starts_at),
      ends_at: utcToLocal(n.ends_at),
    });
    setEditingId(n.id);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { alert('제목을 입력하세요'); return; }
    setBusy(true);
    try {
      const payload = {
        ...form,
        starts_at: localToUtc(form.starts_at),
        ends_at: localToUtc(form.ends_at),
      };
      if (editingId === 'new') {
        await api.post('/admin/notices', payload);
      } else {
        await api.post(`/admin/notices/${editingId}`, payload);
      }
      setEditingId(null);
      fetchNotices();
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (n) => {
    const newActive = !n.is_active;
    if (newActive) {
      if (!confirm('이 공지를 활성화하면 기존 활성 공지는 자동 비활성됩니다.')) return;
    }
    try {
      await api.post(`/admin/notices/${n.id}`, { is_active: newActive });
      fetchNotices();
    } catch (err) {
      alert('변경 실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) return <div className="text-gray-400 py-12 text-center">로딩 중...</div>;

  // 등록/수정 폼
  if (editingId !== null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {editingId === 'new' ? '공지 등록' : '공지 수정'}
          </h2>
          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white text-sm">← 목록으로</button>
        </div>
        <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 max-w-2xl space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">제목 *</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-cyan-500/50" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">본문</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={3}
              className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-cyan-500/50 resize-y" />
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">유형</label>
              <select value={form.notice_type} onChange={e => setForm(f => ({ ...f, notice_type: e.target.value }))}
                className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50">
                {NOTICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded" />
                활성
              </label>
              {form.is_active && (
                <span className="text-xs text-yellow-400">* 기존 활성 공지 자동 비활성</span>
              )}
            </div>
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">시작일시</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">종료일시 (비워두면 무기한)</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50" />
            </div>
          </div>
          <div className="pt-2">
            <button onClick={handleSave} disabled={busy}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors">
              {busy ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 목록
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">공지 관리</h2>
        <button onClick={openCreate}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm transition-colors">
          + 새 공지
        </button>
      </div>

      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">제목</th>
              <th className="text-center px-4 py-3 font-medium">유형</th>
              <th className="text-center px-4 py-3 font-medium">활성</th>
              <th className="text-left px-4 py-3 font-medium">기간</th>
              <th className="text-center px-4 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {notices.map(n => {
              const typeInfo = NOTICE_TYPES.find(t => t.value === n.notice_type) || NOTICE_TYPES[0];
              return (
                <tr key={n.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{n.id}</td>
                  <td className="px-4 py-3 text-white max-w-[300px]">
                    <div className="truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-gray-500 truncate">{n.body}</div>}
                  </td>
                  <td className={`px-4 py-3 text-center text-xs font-semibold ${typeInfo.color}`}>
                    {typeInfo.label}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggleActive(n)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        n.is_active ? 'bg-cyan-500' : 'bg-gray-700'
                      }`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        n.is_active ? 'left-5' : 'left-0.5'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {utcToLocalDate(n.starts_at)}
                    {n.ends_at ? ` ~ ${utcToLocalDate(n.ends_at)}` : ' ~ 무기한'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openEdit(n)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                      수정
                    </button>
                  </td>
                </tr>
              );
            })}
            {notices.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">등록된 공지 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 상품 관리 ────────────────────────────────── */
function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const fetchProducts = useCallback(() => {
    api.get('/admin/products')
      .then(({ data }) => setProducts(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const openEdit = (p) => {
    setForm({ name: p.name, packets: p.packets, price: p.price, is_visible: p.is_visible, sort_order: p.sort_order });
    setEditingId(p.id);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/products/${editingId}`, form);
      setEditingId(null);
      fetchProducts();
    } catch (err) {
      alert('저장 실패: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVisible = async (p) => {
    try {
      await api.post(`/admin/products/${p.id}`, { is_visible: !p.is_visible });
      fetchProducts();
    } catch (err) {
      alert('변경 실패: ' + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) return <div className="text-gray-400 py-12 text-center">로딩 중...</div>;

  // 수정 폼
  if (editingId !== null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">상품 수정</h2>
          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white text-sm">← 목록으로</button>
        </div>
        <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 max-w-lg space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">상품명</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-cyan-500/50" />
          </div>
          <div className="flex gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">패킷 수</label>
              <input type="number" value={form.packets} onChange={e => setForm(f => ({ ...f, packets: parseInt(e.target.value) || 0 }))}
                className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-32 focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">가격 (원)</label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-32 focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">정렬</label>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                className="bg-[#12122a] border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-20 focus:outline-none focus:border-cyan-500/50" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.is_visible} onChange={e => setForm(f => ({ ...f, is_visible: e.target.checked }))}
                className="rounded" />
              결제 페이지 노출
            </label>
          </div>
          <div className="pt-2">
            <button onClick={handleSave} disabled={busy}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors">
              {busy ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 목록
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">상품·가격 관리</h2>
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="text-left px-4 py-3 font-medium">코드</th>
              <th className="text-left px-4 py-3 font-medium">상품명</th>
              <th className="text-right px-4 py-3 font-medium">패킷</th>
              <th className="text-right px-4 py-3 font-medium">가격</th>
              <th className="text-center px-4 py-3 font-medium">노출</th>
              <th className="text-center px-4 py-3 font-medium">정렬</th>
              <th className="text-center px-4 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-3 text-white">{p.name}</td>
                <td className="px-4 py-3 text-right text-white font-mono">{p.packets}</td>
                <td className="px-4 py-3 text-right text-white font-mono">{p.price?.toLocaleString()}원</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => handleToggleVisible(p)}
                    className={`w-10 h-5 rounded-full relative transition-colors ${
                      p.is_visible ? 'bg-cyan-500' : 'bg-gray-700'
                    }`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      p.is_visible ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                </td>
                <td className="px-4 py-3 text-center text-gray-400 font-mono">{p.sort_order}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => openEdit(p)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">수정</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          <Route path="packets" element={<PacketsTab />} />
          <Route path="notices" element={<NoticesTab />} />
          <Route path="products" element={<ProductsTab />} />
        </Routes>
      </main>
    </div>
  );
}
