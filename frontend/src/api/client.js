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
      const path = window.location.pathname.replace(/^\/WEBTOON/, '') || '/';
      if (path !== '/' && path !== '/login') {
        sessionStorage.setItem('login_redirect', path);
      }
      window.location.href = '/WEBTOON/login';
    }
    if (err.response?.status === 402) {
      const d = err.response.data?.detail;
      if (d?.message) {
        alert(`${d.message}\n(보유 ${d.balance}패킷 / 필요 ${d.needed}패킷)`);
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// job 저장소는 서버 메모리라 재시작되면 job이 사라진다(404) — 호출부는 err.jobLost로 판별
export const JOB_LOST_MESSAGE = '서버가 재시작되어 진행 상태를 확인할 수 없어요 — 생성된 컷을 다시 불러옵니다';

// Job 폴링 헬퍼 — 안전장치 포함
export async function pollJob(jobId, onProgress, intervalMs = 2000) {
  const MAX_POLLS = 1800; // ~60분
  // 서버 재시작 대기(진행 중 작업 완료까지 수 분) 동안 연결 실패·502/503/504를 견디는 시간
  const TRANSIENT_BUDGET_MS = 5 * 60 * 1000;
  let polls = 0;
  let firstFailureAt = null;

  while (polls < MAX_POLLS) {
    try {
      const { data } = await api.get(`/jobs/${jobId}`, { timeout: 10000 });
      firstFailureAt = null; // 성공 시 리셋
      onProgress?.(data);
      if (data.status === 'completed' || data.status === 'completed_partial') return data;
      if (data.status === 'failed') throw new Error(data.error || 'Job failed');
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) throw Object.assign(new Error(JOB_LOST_MESSAGE), { jobLost: true });
      // 그 밖의 서버 응답 에러(4xx/5xx)는 즉시 전파. 게이트웨이 에러(재시작 중)는 재시도
      if (err.response && ![502, 503, 504].includes(status)) throw err;
      if (!err.response && !err.isAxiosError) throw err; // job failed 등 비네트워크 에러
      firstFailureAt ??= Date.now();
      if (Date.now() - firstFailureAt > TRANSIENT_BUDGET_MS) {
        throw new Error('네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.');
      }
    }
    polls++;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('작업 시간이 초과되었습니다. 페이지를 새로고침 후 확인해주세요.');
}
