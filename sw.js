// Killer-Service-Worker fuer eine abgeschaltete PWA-Origin.
//
// Aktuell: app.beventures.ch → app.werkora.ch (P6 in
// docs/specs/werkora-domain-app-einstieg.md, abgeschaltet 2026-10-07).
// Davor schon einmal eingesetzt fuer bazzi-beventures.github.io/Bau-App/ →
// app.beventures.ch: dort hingen installierte PWAs auf der alten Origin fest —
// ihr alter Workbox-SW lieferte weiter den gecachten App-Shell mit alter
// VITE_API_URL. Folge: 50% der Nutzer in der Offline-Queue, weil das Backend
// ihren alten Origin per CORS blockte.
//
// Dieser SW ersetzt den alten Workbox-SW (beide unter /sw.js) und tut drei Dinge:
//   1) alle Caches loeschen (damit nichts mehr die alte App-Shell ausliefert),
//   2) sich selbst abmelden,
//   3) jedes offene Fenster neu laden — auf DIESER Origin, nicht direkt auf der
//      neuen. Der Reload holt die Fallback-index.html (Nachbardatei) vom Netz,
//      und erst die leitet weiter. Grund: ein Service Worker kann localStorage
//      nicht lesen, die Seite schon. Liegen noch nicht uebertragene Stempel in
//      der Offline-Queue, zeigt die Seite sie an, statt sie mit einem
//      Origin-Wechsel unsichtbar zu machen (Spec §4.3).
//
// Bewusst KEIN fetch-Handler: nach dem Abmelden geht jede Anfrage ans Netz, und
// dort liegt fuer jeden Pfad die Fallback-Seite (index.html + 404.html).
//
// Deploy: in den gh-pages-Branch des alten Pages-Repos (heute
// bazzi-beventures/Bau-App) als /sw.js, dazu index.html, dieselbe Datei als
// 404.html, CNAME und .nojekyll — sonst nichts. Der alte Workbox-SW hat
// skipWaiting + clientsClaim, und die App ruft bei jeder Rueckkehr
// registration.update() — dieser hier zieht also beim naechsten App-Start nach.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (_) { /* ignore */ }
    try { await self.registration.unregister(); } catch (_) { /* ignore */ }
    try {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        try { await client.navigate(self.registration.scope); } catch (_) { /* ignore */ }
      }
    } catch (_) { /* ignore */ }
  })());
});
