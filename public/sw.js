const BASE = new URL(self.registration.scope).pathname;
const SHELL = "recall-shell-__BUILD__";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const response = await fetch(BASE, { cache: "reload" });
      if (!response.ok) throw new Error("Cannot download app shell");
      const html = await response.clone().text();
      await cache.put(BASE, response);
      const assets = [
        ...html.matchAll(/(?:src|href)="([^\"]*\/assets\/[^\"]+)"/g),
      ].map((m) => m[1]);
      await cache.addAll([
        ...assets,
        ...[
          "manifest.webmanifest",
          "icon-192.png",
          "icon-512.png",
          "recall.svg",
        ].map((p) => BASE + p),
      ]);
      // Existing tabs continue running. They receive controllerchange and offer Save & reload.
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Do not evict files an open older tab may still need. Question data lives in IndexedDB.
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (!tabs.length)
        for (const name of await caches.keys())
          if (name.startsWith("recall-shell-") && name !== SHELL)
            await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      // Scope the shell lookup to this build; a generic caches.match(BASE) can return stale HTML.
      if (event.request.mode === "navigate")
        return (await cache.match(BASE)) ?? fetch(event.request);
      const current = await cache.match(event.request);
      if (current) return current;
      const old = await caches.match(event.request);
      if (old && /\/assets\//.test(url.pathname)) return old;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })(),
  );
});
