const CACHE_NAME = 'pastly-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './script.js',
  './images/pastly_logo.png',
  './images/avata.png',
  './manifest.json',
];

// 설치 시 기본 파일 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // 새 SW가 즉시 활성화되도록
  self.skipWaiting();
});

// 활성화 시 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  // 열려있는 모든 탭에 즉시 적용
  self.clients.claim();
});

// 네트워크 우선 전략: 항상 최신 파일 사용, 오프라인 시 캐시 fallback
self.addEventListener('fetch', (event) => {
  // Firebase, CDN 요청은 캐시 안 함
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('jsdelivr.net')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // 네트워크 성공 시 캐시 업데이트
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // 오프라인 시 캐시에서 응답
        return caches.match(event.request);
      })
  );
});
