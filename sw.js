// 버전을 바꾸면 새 SW가 설치됨 - 배포할 때마다 이 값을 변경하세요
const VERSION = '1.0.0';
const CACHE_NAME = `pastly-${VERSION}`;

// install: 캐시 없이 즉시 skipWaiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// activate: 이전 캐시 전부 삭제 후 모든 탭 즉시 제어
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// fetch: 항상 네트워크 우선, 실패 시에만 캐시
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 외부 CDN / Firebase는 통과
  if (
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('tailwindcss.com') ||
    url.hostname.includes('jsdelivr.net')
  ) {
    return;
  }

  // 로컬 파일: cache: 'no-store'로 항상 최신 파일 요청
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// index.html에서 보내는 skipWaiting 메시지 처리
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});