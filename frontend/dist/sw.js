// Minimal, deliberately conservative service worker — just enough for PWA installability plus
// basic offline resilience, WITHOUT reintroducing the stale-shell caching bug already fixed
// server-side (see server.js: index.html is Cache-Control: no-store for exactly this reason).
//
// Only /assets/* (Vite's content-hashed, immutable JS/CSS bundles) get cache-first treatment —
// a new build always ships new filenames, so there's no staleness risk. Everything else
// (index.html, /api/*, /uploads/*) is network-first: always try the network, and only fall back
// to a cached copy if the request genuinely fails (offline).
const CACHE_NAME = "agw-crm-assets-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
