// Network-first service worker: always try fresh data, fall back to cache offline.
const CACHE = "gum-guild-wars-v6";
const SHELL = ["./", "index.html", "css/styles.css", "js/data.js", "js/app.js", "manifest.json", "images/logo.webp", "images/logo-mark.webp", "images/ggw2-logo.webp"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle this site's own files; league data (from the admin's API) is never cached.
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && new URL(event.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
