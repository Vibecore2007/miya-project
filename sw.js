const CACHE = "miya-final-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./brain.js",
  "./brain.worker.js",
  "./face.js",
  "./manifest.webmanifest",
  "./mp_models/face_landmarker.task"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
