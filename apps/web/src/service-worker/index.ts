/* Offline: the build, the static files and the prerendered pages are kept in a cache named for the version, so the
   app opens with no network. A new version waits until the page asks it to take over (after the user agrees). */
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';

// Paths in the manifest are relative to where the app is served from, which is the worker's scope
const at = (p: string) => new URL(p, self.registration.scope).pathname;
const CACHE = `logout-${version}`;
const SHELL = at('app');
const ASSETS = new Set([...immutable, ...assets, ...prerendered].map(a => at(a.path)));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...ASSETS])));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', event => {
  if ((event.data as { type?: string } | null)?.type === 'skip-waiting') void self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only this site's own files; the sync server and analytics go to the network as usual
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (ASSETS.has(url.pathname)) {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
      }
      try {
        const res = await fetch(req);
        if (res.status === 200 && res.type === 'basic' && !res.headers.get('cache-control')?.includes('no-store'))
          void cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req);
        if (hit) return hit;
        // A page that wasn't cached: the app's shell can open any of the app's routes
        if (req.mode === 'navigate' && url.pathname.startsWith(SHELL)) {
          const shell = await cache.match(SHELL);
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
