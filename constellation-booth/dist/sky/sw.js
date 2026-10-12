/* 별자리 부스 서비스 워커 (빌드 시 생성). 자기 앱 범위만 관리한다. */
const CACHE_NAME = "sky-v1.0.0+20261012-dbc7bcaead";
const CACHE_PREFIX = "sky-v";
const BASE = "/sky/";
const PRECACHE = ["/sky/assets/GowunBatang-Bold.subset-DV4VzIHC.woff2","/sky/assets/GowunBatang-Regular.subset-DDL4HcVx.woff2","/sky/assets/NotoSansKR-Bold.subset-25Rfu__e.woff2","/sky/assets/NotoSansKR-Regular.subset-DVUY0z-S.woff2","/sky/assets/index-B1PTShpK.css","/sky/assets/index-NFnJOeB2.js","/sky/icons/apple-touch-icon.png","/sky/icons/icon-192.png","/sky/icons/icon-512.png","/sky/icons/icon-maskable-512.png","/sky/","/sky/manifest.webmanifest","/sky/precache-manifest.json"];

self.addEventListener("install", (event) => {
  // 전체 필수 자산을 한 번에 내려받는다. 하나라도 실패하면 설치가 실패하고 '준비 완료'가 되지 않는다.
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })));
      // 첫 설치(기존 워커 없음)일 때만 즉시 활성화. 갱신은 운영자가 적용한다.
      const existing = await self.registration.active;
      if (!existing) await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const key = req.mode === "navigate" ? BASE : url.pathname;
      const hit = (await cache.match(key)) || (await cache.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        const fallback = await cache.match(BASE);
        if (req.mode === "navigate" && fallback) return fallback;
        throw err;
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (data.type === "GET_STATUS") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const missing = [];
        for (const u of PRECACHE) {
          if (!(await cache.match(u))) missing.push(u);
        }
        const reply = { type: "STATUS", cacheName: CACHE_NAME, total: PRECACHE.length, missing };
        if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
        else if (event.source) event.source.postMessage(reply);
      })(),
    );
  }
});
