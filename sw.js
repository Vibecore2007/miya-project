const CACHE = "miya-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./brain.js",
  "./brain.worker.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
