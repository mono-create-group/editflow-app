// EditFlow Service Worker
// Version: 202605171418
// Strategy: network-first for HTML (always fresh), cache-first for assets

const CACHE = 'editflow-v202605171418';
const BASE = '/editflow-app';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll([BASE + '/', BASE + '/index.html'])
        .catch(() => c.add(BASE + '/index.html'))
    )
  );
  self.skipWaiting(); // 新しいSWをすぐに有効化
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // すべてのタブを即座に制御下に
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') || url.pathname.endsWith('/');

  if (isHTML) {
    // HTMLは常にネットワーク優先 → 最新版を取得
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // その他のリソースはキャッシュ優先
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});
