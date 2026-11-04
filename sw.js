/* 서비스 워커 — 앱 껍데기를 기기에 저장해 오프라인에서도 열리게 합니다.
 * ★ 파일을 고쳐 GitHub 에 올릴 때마다 아래 VERSION 숫자를 올리세요. (모든 기기가 새 버전으로 갱신됩니다)
 */
const VERSION = '4.0.1';
const CACHE = 'gagyebu-' + VERSION;
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/util.js', 'js/calc.js', 'js/smart.js', 'js/store.js', 'js/history.js', 'js/sync.js', 'js/side.js', 'js/charts.js', 'js/xlsx-io.js',
  'js/ui-core.js', 'js/ui-shell.js', 'js/ui-home.js', 'js/ui-entries.js', 'js/ui-add.js', 'js/ui-analysis.js', 'js/ui-settings.js', 'js/ui-life.js', 'js/ui-day.js', 'js/app.js',
  'assets/photo.jpg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'vendor/xlsx.full.min.js'
];

self.addEventListener('install', function (e) {
  self.skipWaiting(); // 새 버전은 바로 적용 (앱이 알아서 한 번 새로고침)
  e.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(SHELL.map(function (u) { return cache.add(new Request(u, { cache: 'reload' })); }));
    if (results[1].status !== 'fulfilled') throw new Error('index.html 을 저장하지 못했어요'); // 핵심 파일이 없으면 설치 중단(이전 버전 유지)
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k.indexOf('gagyebu-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', function (e) { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

/* 네트워크 먼저: 연결되어 있으면 항상 최신 파일(모든 파일이 같은 버전), 오프라인일 때만 저장본 */
async function swr(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return idx; }
    return new Response('오프라인이에요', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;                       // 동기화(POST)는 절대 가로채지 않음
  const url = new URL(req.url);
  if (url.origin === self.location.origin || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(swr(req));
  // script.google.com 등 그 외 외부 요청은 그대로 네트워크로
});
