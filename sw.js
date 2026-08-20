/* Service Worker — cache static shell + SWR cho index; network-first cho đề thi */
const CACHE = "stu-static-v22";
const PRECACHE = [
  "./",
  "./index.html",
  "./explore.html",
  "./on-tap.html",
  "./thi.html",
  "./css/style.css",
  "./js/theme.js",
  "./js/home.js",
  "./js/explore.js",
  "./js/ontap.js",
  "./js/exam.js",
  "./js/calculator.js",
  "./js/whiteboard.js",
  "./js/translate.js",
  "./js/sw-register.js",
  "./js/security.js",
  "./js/shield.js",
  "./lich-su.html",
  "./js/history.js",
  "./ung-ho.html",
  "./data/taxonomy.json",
  "./data/stats.json",
  "./data/id-map.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isIndexData(pathname) {
  return /\/data\/(index|explore-index|topic-index|stats|id-map|taxonomy)\.json$/.test(pathname);
}

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

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (path.endsWith("/sw.js") || path.endsWith("sw.js")) return;

  if (/\.(css|js)$/.test(path)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (isIndexData(path)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (path.includes("/data/")) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (path.endsWith(".html") || path.endsWith("/") || !path.includes(".")) {
    event.respondWith(networkFirst(req));
  }
});
