// EditFlow Service Worker v20260918-09
const CACHE = 'editflow-20260918-09';
const APP_SHELL_URL = new URL('./editflow.html', self.registration.scope).href;
const URLS = ['./', './editflow.html', './ai-bridge-client.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      // 既存画面を強制遷移させず、次の読み込みで新しい本体を使う。
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    // 本体は常に最新を優先。通信失敗時だけ、最後に正常取得した本体へ戻す。
    const update = fetch(e.request, {cache:'no-store'}).then(r => {
      if (!r.ok) throw new Error(`navigation failed: ${r.status}`);
      caches.open(CACHE).then(cache => cache.put(APP_SHELL_URL, r.clone())).catch(() => {});
      return r;
    });
    e.waitUntil(update.catch(() => {}));
    e.respondWith(update.catch(() => caches.match(APP_SHELL_URL).then(cached => cached || new Response('オフラインです。通信を確認して再度開いてください。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
    return;
  }
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
