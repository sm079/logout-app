/* The installable, offline app: registers the service worker and says when a new version is ready.
   A new version only takes over when the user agrees, so an open log is never reloaded under them. */

export const pwa = $state<{ waiting: ServiceWorker | null }>({ waiting: null });

let requested = false;

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker
    .register('/service-worker.js', { type: 'module' })
    .then(reg => {
      const watch = (w: ServiceWorker | null) =>
        w?.addEventListener('statechange', () => {
          // Installed while another version runs this page: it waits for the user
          if (w.state === 'installed' && navigator.serviceWorker.controller) pwa.waiting = w;
        });
      if (reg.waiting && navigator.serviceWorker.controller) pwa.waiting = reg.waiting;
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // Look for a new version now and then, and whenever the app comes back to the front
      setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    })
    .catch(err => console.warn('Service worker not registered', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (requested) location.reload();
  });
}

/** Lets the waiting version take over; the page reloads into it */
export function applyUpdate(): void {
  if (!pwa.waiting) return;
  requested = true;
  pwa.waiting.postMessage({ type: 'skip-waiting' });
}
