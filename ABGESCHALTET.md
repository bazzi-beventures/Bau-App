# app.beventures.ch ist abgeschaltet (2026-10-07)

Die App liegt seit dem Domainwechsel unter **app.werkora.ch** (Repo
`bazzi-beventures/Werkora-App`). Dieses Repo baut nicht mehr: das
`deploy.yml` ist entfernt, und `werkora-backend` synchronisiert nicht mehr
hierher.

Im `gh-pages`-Branch liegt nur noch der Killer aus
`werkora-backend/scripts/old-origin-killer/`: ein Service Worker, der den alten
Workbox-SW ersetzt, Caches löscht und sich abmeldet, plus eine Fallback-Seite
(`index.html` = `404.html`), die auf app.werkora.ch weiterleitet — oder, falls
auf dem Gerät noch nicht übertragene Stempel liegen, diese anzeigt.

**Nicht wieder deployen.** Ein Build hier ersetzte den Killer durch die alte
App. Hintergrund: `werkora-backend/docs/specs/werkora-domain-app-einstieg.md`, P6.
