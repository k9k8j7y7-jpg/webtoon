import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/WEBTOON';

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/WEBTOON/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Job 폴링 헬퍼 — 안전장치 포함
export async function pollJob(jobId, onProgress, intervalMs = 2000) {
  const MAX_POLLS = 1800; // ~60분
  const MAX_NETWORK_RETRIES = 5;
  let polls = 0;
  let networkRetries = 0;

  while (polls < MAX_POLLS) {
    try {
      const { data } = await api.get(`/jobs/${jobId}`, { timeout: 10000 });
      networkRetries = 0; // 성공 시 리셋
      onProgress?.(data);
      if (data.status === 'completed' || data.status === 'completed_partial') return data;
      if (data.status === 'failed') throw new Error(data.error || 'Job failed');
    } catch (err) {
      // 서버 응답이 있는 에러(4xx/5xx)는 즉시 전파
      if (err.response) throw err;
      // 네트워크 에러(연결 끊김/타임아웃)는 재시도
      networkRetries++;
      if (networkRetries >= MAX_NETWORK_RETRIES) {
        throw new Error('네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.');
      }
    }
    polls++;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('작업 시간이 초과되었습니다. 페이지를 새로고침 후 확인해주세요.');
}
