// EditFlow Service Worker v20260517-3
const CACHE = 'editflow-20260517-3';
const BASE = '/editflow-app';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.add(BASE + '/index.html').catch(()=>{})
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isPage = e.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') || url.pathname === BASE + '/';

  if (isPage) {
    // HTMLは常にネットワーク優先 → 最新版を確実に取得
    e.respondWith(
      fetch(e.request, {cache: 'no-store'})
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
