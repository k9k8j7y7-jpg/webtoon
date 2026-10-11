import api from '../api/client';

// 웹푸시 공용 — 서비스워커 등록·환경 판별·구독/해제 (sw.js는 public/, 백엔드 app/push/)
const BASE = import.meta.env.BASE_URL; // '/WEBTOON/'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
      .catch((err) => console.warn('서비스워커 등록 실패', err));
  });
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+는 Mac으로 표시됨 → 터치 포인트로 구분
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iOS는 홈 화면에 추가한 앱(standalone)에서만 웹푸시 가능(16.4+)
export function needsIOSInstall() {
  return isIOS() && !isStandalone();
}

async function readyRegistration() {
  // 등록이 실패했으면 ready가 영원히 안 끝남 → 8초 제한
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new PushError('sw')), 8000)),
  ]);
}

export class PushError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // denied | disabled | sw | unsupported | server
  }
}

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function getSubscription() {
  if (!pushSupported()) return null;
  const reg = await readyRegistration();
  return reg.pushManager.getSubscription();
}

export async function subscribePush() {
  if (!pushSupported()) throw new PushError('unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('denied');

  const { data } = await api.get('/push/public-key');
  if (!data.enabled || !data.public_key) throw new PushError('disabled');

  const reg = await readyRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(data.public_key),
    });
  }
  try {
    await api.post('/push/subscribe', sub.toJSON());
  } catch {
    throw new PushError('server');
  }
  return sub;
}

export async function unsubscribePush() {
  const sub = await getSubscription();
  if (!sub) return;
  await api.delete('/push/subscribe', { data: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// 로그아웃 시 이 기기 구독 삭제(서버+브라우저) — 토큰을 지우기 전에 await할 것(DELETE에 인증 필요)
// ready 대기 없이 getRegistration으로 바로 확인, 전체 3초 제한(로그아웃이 막히지 않게)
export async function unsubscribeOnLogout() {
  if (!pushSupported()) return;
  const work = (async () => {
    const reg = await navigator.serviceWorker.getRegistration(BASE);
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await api.delete('/push/subscribe', { data: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  })();
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {});
}

export const PUSH_ERROR_MESSAGES = {
  denied: '알림이 차단돼 있어요. 브라우저(또는 휴대폰) 설정 → 사이트 설정 → 알림에서 EziToon을 허용해 주세요.',
  disabled: '지금은 알림 서버가 준비되지 않았어요. 잠시 후 다시 시도해 주세요.',
  sw: '알림 준비에 실패했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  unsupported: '이 브라우저는 알림을 지원하지 않아요.',
  server: '알림 등록에 실패했어요. 잠시 후 다시 시도해 주세요.',
};
