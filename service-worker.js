const CACHE_NAME = "cbt-cache-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/script.js",
  "/style.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});