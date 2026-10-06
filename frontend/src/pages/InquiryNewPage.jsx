import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Paperclip, X, Send, RefreshCw } from 'lucide-react';
import api from '../api/client';

const CATEGORIES = [
  { key: 'bug', label: '버그·오류' },
  { key: 'howto', label: '사용법' },
  { key: 'payment', label: '결제·패킷' },
  { key: 'feature', label: '기능 제안' },
  { key: 'other', label: '기타' },
];

export default function InquiryNewPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  const [files, setFiles] = useState([]);  // File[]
  const [previews, setPreviews] = useState([]);
  const [episodes, setEpisodes] = useState([]); // [{id, title, projectName}]
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 내 에피소드 목록 가져오기
  useEffect(() => {
    (async () => {
      try {
        const { data: projects } = await api.get('/projects');
        const eps = [];
        for (const p of projects) {
          const { data: epList } = await api.get(`/projects/${p.id}/episodes`);
          for (const ep of epList) {
            eps.push({ id: ep.id, title: ep.title || `에피소드 ${ep.ep_no}`, projectName: p.name });
          }
        }
        setEpisodes(eps);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleFileAdd = (e) => {
    const newFiles = Array.from(e.target.files);
    const combined = [...files, ...newFiles].slice(0, 3);
    setFiles(combined);
    setPreviews(combined.map(f => URL.createObjectURL(f)));
    e.target.value = '';
  };

  const removeFile = (idx) => {
    URL.revokeObjectURL(previews[idx]);
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    setPreviews(next.map(f => URL.createObjectURL(f)));
  };

  const handleSubmit = async () => {
    if (!category) { setError('카테고리를 선택해 주세요.'); return; }
    if (!title.trim()) { setError('제목을 입력해 주세요.'); return; }
    if (!content.trim()) { setError('내용을 입력해 주세요.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('title', title.trim());
      fd.append('content', content.trim());
      if (episodeId) fd.append('episode_id', episodeId);
      fd.append('device_ua', navigator.userAgent);
      fd.append('device_type', window.innerWidth < 640 ? 'mobile' : 'pc');
      fd.append('screen_width', String(window.innerWidth));
      for (const f of files) fd.append('files', f);

      await api.post('/inquiries', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate('/inquiries');
    } catch (err) {
      setError(err.response?.data?.detail || '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link to="/inquiries" className="inline-flex items-center gap-1 text-sm font-bold text-gray-400 hover:text-comic-orange transition-colors mb-6 no-underline">
          <ArrowLeft size={16} /> 내 문의
        </Link>
        <h1 className="text-2xl font-bold font-serif text-ink-black dark:text-white mb-6">문의하기</h1>

        <div className="glass-card p-6 space-y-5">
          {/* 카테고리 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">카테고리</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all ${
                    category === c.key
                      ? 'border-comic-orange bg-comic-orange text-white'
                      : 'border-border dark:border-zinc-700 text-gray-600 dark:text-gray-400 hover:border-comic-orange/50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">제목</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="문의 제목을 입력하세요"
              maxLength={200}
              className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">내용</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="불편하신 점이나 궁금한 점을 자세히 적어 주세요"
              rows={6}
              className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange resize-none"
            />
          </div>

          {/* 스크린샷 */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
              스크린샷 <span className="font-normal text-gray-400">(최대 3장)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {previews.map((src, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-border dark:border-zinc-700">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
              {files.length < 3 && (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-border dark:border-zinc-700 flex items-center justify-center cursor-pointer hover:border-comic-orange/50 transition-colors">
                  <Paperclip size={18} className="text-gray-400" />
                  <input type="file" accept="image/*" onChange={handleFileAdd} className="hidden" />
                </label>
              )}
            </div>
          </div>

          {/* 관련 에피소드 */}
          {episodes.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                관련 에피소드 <span className="font-normal text-gray-400">(선택)</span>
              </label>
              <select
                value={episodeId}
                onChange={e => setEpisodeId(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-border dark:border-zinc-700 bg-transparent rounded-xl text-sm font-bold text-ink-black dark:text-white focus:outline-none focus:border-comic-orange"
              >
                <option value="">선택 안 함</option>
                {episodes.map(ep => (
                  <option key={ep.id} value={ep.id}>{ep.projectName} — {ep.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* 기기 정보 안내 */}
          <p className="text-[11px] text-gray-400 dark:text-zinc-500">
            문제 해결을 위해 기기 정보(브라우저·화면 크기)가 함께 전송돼요.
          </p>

          {error && <p className="text-sm font-bold text-red-500">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-ink-black text-white dark:bg-white dark:text-ink-black rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50"
          >
            {submitting ? <><RefreshCw size={14} className="animate-spin" /> 등록 중...</> : <><Send size={14} /> 등록하기</>}
          </button>
        </div>
      </div>
    </div>
  );
}
