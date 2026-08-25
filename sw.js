/* Service Worker — 2TF529
   Phiên bản: v31 (2026-08-24)
   Chiến lược cache:
     - HTML: Network-first (luôn fresh), fallback cache khi offline
     - CSS/JS: Cache-first (versioned immutable), cực nhanh từ lần 2
     - JSON index (stats/id-map/explore-index/topic-index): SWR — tức thì từ cache, cập nhật nền
     - JSON đề thi: Cache-first, cực nhanh sau lần đầu
     - External (CDN, translate, desmos): Bỏ qua — không can thiệp
*/
const CACHE = 'stu-static-v48';

// Files được precache lúc SW install — shell tối thiểu để app chạy offline
const PRECACHE = [
  './',
  './index.html',
  './explore.html',
  './on-tap.html',
  './thi.html',
  './lich-su.html',
  './ung-ho.html',
  './tai-khoan.html',
  './dashboard.html',
  './css/style.css?v=20260825-28',
  './js/theme.js?v=20260824-12',
  './js/home.js?v=20260825-1',
  './js/explore.js?v=20260821-2',
  './js/ontap.js?v=20260821-1',
  './js/exam.js?v=20260824-22',
  './js/history.js?v=20260824-22',
  './js/calculator.js?v=20260824-12',
  './js/whiteboard.js?v=20260824-12',
  './js/periodic-table.js?v=20260824-18',
  './js/translate.js?v=20260824-12',
  './js/sw-register.js?v=20260824-12',
  './js/security.js?v=20260824-12',
  './js/shield.js?v=20260824-21',
  './js/supabase.js?v=20260825-27',
  './js/account.js?v=20260825-27',
  './data/taxonomy.json',
  './data/random-study-links.txt',
  './data/stats.json',
  './data/id-map.json',
  './data/chunks/explore-l12.json',  // Khối 12 (phổ biến nhất - 4010 đề)
  './data/chunks/topic-l12.json',    // Topic index khối 12
  './assets/donate-qr.webp',
];

// ── INSTALL: cache shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: xóa cache cũ ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Helpers ──

// JSON index thay đổi thường xuyên → SWR
function isIndexData(pathname) {
  return /\/data\/(index|explore-index|topic-index|stats|id-map|taxonomy)\.json$/.test(pathname);
}

// CSS/JS versioned → cache-first (immutable 1 năm)
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

// JSON index → stale-while-revalidate (tức thì từ cache, update nền)
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || networkPromise;
}

// HTML + JSON đề thi → network-first (fresh từ Cloudflare CDN), fallback cache
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fallback offline page
    return caches.match('./index.html');
  }
}

// ── FETCH: route theo loại tài nguyên ──
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Không can thiệp request cross-origin (CDN, translate, desmos...)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // SW tự cập nhật — không cache
  if (path.endsWith('sw.js')) return;

  // Khi phát triển trên máy: luôn lấy CSS/JS mới để tránh giao diện cũ do cache.
  // Production chỉ cache-first khi URL có version; file không version dùng network-first.
  if (/\.(css|js)(\?.*)?$/.test(path)) {
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
    event.respondWith((isLocal || !url.searchParams.has('v')) ? networkFirst(req) : cacheFirst(req));
    return;
  }

  // JSON index thay đổi sau mỗi lần thêm đề → network-first.
  // Không trả bản cũ trước vì id-map cũ có thể trỏ tới file đã đổi.
  if (isIndexData(path)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // JSON đề thi → network-first, chỉ dùng cache khi thực sự offline.
  if (path.includes('/data/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // HTML → network-first (always fresh)
  if (path.endsWith('.html') || path.endsWith('/') || !path.includes('.')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Assets (ảnh, font...) → cache-first
  if (/\.(png|jpg|jpeg|webp|avif|svg|ico|woff2?|ttf)$/.test(path)) {
    event.respondWith(cacheFirst(req));
    return;
  }
});
