const SHELL='recall-shell-__BUILD__';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);const response=await fetch('/',{cache:'reload'});if(!response.ok)throw new Error('Cannot download app shell');const html=await response.clone().text();await cache.put('/',response);
  const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1]);await cache.addAll([...assets,'/manifest.webmanifest','/icon-192.png','/icon-512.png','/recall.svg']);await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('recall-shell-')&&name!==SHELL)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){event.respondWith(caches.match('/').then(cached=>cached??fetch(event.request)));return;}
  event.respondWith((async()=>{const cache=await caches.open(SHELL);const cached=await cache.match(event.request);if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;})());
});
