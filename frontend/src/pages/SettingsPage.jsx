import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ExternalLink, Save } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/AuthorLink';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }
  const fileRef = useRef(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { data } = await api.put('/me/profile', { nickname, bio });
      updateUser(data);
      setNickname(data.nickname || '');
      setBio(data.bio || '');
      setMessage({ type: 'ok', text: '저장했어요' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || '저장하지 못했어요' });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser(data);
      setMessage({ type: 'ok', text: '프로필 이미지를 바꿨어요' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || '이미지를 올리지 못했어요' });
    } finally {
      setUploading(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-border dark:border-night-border bg-white dark:bg-night-bg text-sm text-ink-black dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold font-serif text-ink-black dark:text-white">설정</h1>

      <section className="glass-card p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">작가 프로필</h2>
          {user?.nickname && (
            <Link to={`/u/${encodeURIComponent(user.nickname)}`} className="flex items-center gap-1 text-xs font-bold text-cyan-600 dark:text-cyan-400 no-underline">
              내 작가 페이지 <ExternalLink size={12} />
            </Link>
          )}
        </div>

        {!user?.nickname && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2 break-keep">
            작품을 공개하려면 작가 이름(닉네임)이 필요해요.
          </p>
        )}

        {/* 아바타 */}
        <div className="flex items-center gap-4">
          <Avatar src={user?.avatar} size={72} />
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 h-9 px-4 rounded-full text-xs font-bold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-transparent dark:border-white/10 disabled:opacity-50"
            >
              <Camera size={14} /> {uploading ? '올리는 중…' : '이미지 바꾸기'}
            </button>
            <p className="mt-1 text-[11px] text-gray-400">JPG·PNG·WEBP, 가운데를 정사각으로 잘라요</p>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatar} />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">닉네임 (작가 이름)</label>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="예: 도도툰" className={inputCls} />
          <p className="mt-1 text-[11px] text-gray-400">2~20자 · 한글·영문·숫자·밑줄(_) · 다른 작가와 겹칠 수 없어요</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">한 줄 소개</label>
          <input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={100} placeholder="예: 우리 집 강아지 이야기를 그려요" className={inputCls} />
          <p className="mt-1 text-[11px] text-gray-400 text-right">{bio.length}/100</p>
        </div>

        {message && (
          <p className={`text-xs font-bold ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{message.text}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !nickname.trim()}
          className="neon-btn w-full flex items-center justify-center gap-1 h-11 !rounded-full text-sm disabled:opacity-50"
        >
          <Save size={14} /> {saving ? '저장 중…' : user?.nickname ? '변경 저장' : '저장'}
        </button>
      </section>

      <section className="glass-card p-4 sm:p-6">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">로그인 계정</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 break-all">
          {user?.provider} · {user?.email || user?.display_name}
        </p>
        <p className="mt-1 text-[11px] text-gray-400">로그인 계정 이름·이메일은 다른 사람에게 보이지 않아요.</p>
      </section>
    </div>
  );
}
