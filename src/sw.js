// 奇迹课程 Service Worker：安装时全量预缓存（tmp/filelist.json 由 gen-index.mjs 生成，全站 ~2.7MB），
// 运行时网络优先（内容更新即时生效），离线回退缓存。
const VER = "acim-v17";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "vendor/marked.min.js",
  "vendor/minisearch.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "tmp/books.json",
  "tmp/search.json",
  "tmp/filelist.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(VER);
      await cache.addAll(SHELL);
      const list = await (await fetch("tmp/filelist.json")).json();
      for (let i = 0; i < list.length; i += 50) {
        await cache.addAll(list.slice(i, i + 50).map((p) => encodeURI(p)));
      }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VER).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Response.error())),
  );
});
