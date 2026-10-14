const CACHE_NAME = 'account-book-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './사진.jpg',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// 설치 단계: 필요한 자산 캐싱
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// 활성화 단계: 이전 버전의 캐시 삭제
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 가져오기 단계: 오프라인 우선 전략 적용
self.addEventListener('fetch', event => {
  // 구글 시트 연동(API 통신)은 캐시하지 않고 무조건 네트워크로 보냄
  if (event.request.url.includes('script.google.com')) {
      return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 캐시가 있으면 캐시 반환, 없으면 네트워크 요청
        return response || fetch(event.request);
      })
  );
});