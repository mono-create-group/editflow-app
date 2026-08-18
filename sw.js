// EditFlow Service Worker v20260819-17
const CACHE = 'editflow-20260819-17';
const LATEST_APP_URL = new URL('./editflow.html?app=20260819-17', self.registration.scope).href;
const URLS = ['./', './editflow.html', './ai-bridge-client.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      // 旧画面を開いたままでも、新しいアプリ本体へ自動的に切り替える。
      .then(() => self.clients.matchAll({type:'window',includeUncontrolled:true}))
      .then(clients => Promise.all(clients.map(client => client.navigate(LATEST_APP_URL).catch(() => null))))
  );
});
// ネットワーク優先: 常に最新を取得し、取得できた内容をキャッシュへ保存。
// オフライン時のみキャッシュにフォールバックする。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
