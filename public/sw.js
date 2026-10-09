// Mínimo para ser instalable. No cachea nada: nunca puede servir código o datos viejos.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
