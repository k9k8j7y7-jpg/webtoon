// EziToon 서비스워커 — 웹푸시 수신·클릭만 담당 (캐시 없음: fetch 핸들러를 두지 않는다)
// 페이로드(백엔드 app/push/service.py): { title, body, icon, link, tag } — link는 /WEBTOON 포함 경로
// tag는 쓰지 않는다(같은 종류 알림이 서로 덮어쓰지 않고 쌓이도록)

const DEFAULT_ICON = '/WEBTOON/icons/icon-192.png';
const DEFAULT_LINK = '/WEBTOON/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'EziToon';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || DEFAULT_ICON,
      badge: DEFAULT_ICON,
      data: { link: data.link || DEFAULT_LINK },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.link || DEFAULT_LINK, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 같은 주소의 창이 있으면 포커스, 아니면 앱 창 하나를 그 주소로 이동, 없으면 새 창
    const exact = windows.find((w) => w.url === target);
    if (exact) return exact.focus();
    const app = windows.find((w) => new URL(w.url).pathname.startsWith('/WEBTOON'));
    if (app) {
      await app.focus();
      return app.navigate(target).catch(() => self.clients.openWindow(target));
    }
    return self.clients.openWindow(target);
  })());
});
