// EditFlow Service Worker v20260819-23
const CACHE = 'editflow-20260819-23';
const LATEST_APP_URL = new URL('./editflow.html?app=20260819-23', self.registration.scope).href;
const APP_SHELL_URL = new URL('./editflow.html', self.registration.scope).href;
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
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    const update = fetch(APP_SHELL_URL, {cache:'no-cache'}).then(r => {
      if (r.ok) caches.open(CACHE).then(cache => cache.put(APP_SHELL_URL, r.clone())).catch(() => {});
      return r;
    }).catch(() => new Response('オフラインです。通信を確認して再度開いてください。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}));
    e.waitUntil(update.then(() => {}));
    e.respondWith(caches.match(APP_SHELL_URL).then(cached => cached || update));
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
