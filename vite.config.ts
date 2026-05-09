import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createHash } from 'node:crypto'

// Custom-Domain-Setup (app.beventures.ch / app-staging.beventures.ch) → App auf Root.
// Falls je wieder ein Build ohne Custom Domain gefahren wird, --base im CI-Workflow setzen.
const BASE_PATH = '/'

// Build-ID wird beim Build injiziert (index.html Platzhalter __BUILD_ID__).
// Dient als Nuclear-Kill-Switch: Wenn localStorage eine andere ID hält als
// das frisch geladene HTML, wird SW + Cache hart zurückgesetzt.
const BUILD_ID = new Date().toISOString()

// Inline Kill-Switch — wird inline in index.html gerendert. Pfad-unabhängig
// (kein /Bau-App/-Prefix-Problem) und mit SHA-256-Hash in CSP whitelisted.
// Bewusst KEINE Referenz auf das __BUILD_ID__-Token, damit /g-Substitution den
// Skript-Body nicht verändert und der CSP-Hash stabil bleibt.
const BOOT_SCRIPT_BODY = `(function(){try{var m=document.querySelector('meta[name="app-build-id"]');var c=m&&m.getAttribute('content');if(!c||c.indexOf('_'+'_')===0)return;var K='app_build_id';var l=localStorage.getItem(K);if(l===c)return;localStorage.setItem(K,c);if(l!==null&&'caches'in window){caches.keys().then(function(n){n.forEach(function(x){caches.delete(x);});});}}catch(e){}})();`
const BOOT_SCRIPT_HTML = `<script>${BOOT_SCRIPT_BODY}</script>`
const BOOT_SCRIPT_HASH = createHash('sha256').update(BOOT_SCRIPT_BODY).digest('base64')

// Strikte CSP nur im Production-Build — in Dev braucht Vite-HMR Inline-Scripts
// und 'unsafe-eval'. script-src whitelistet nur 'self' + den SHA-256-Hash des
// Inline-Boot-Skripts. Google Fonts werden in style-src/font-src zugelassen.
// frame-ancestors wird via X-Frame-Options im Backend gesetzt — im <meta>-Tag
// wird die Direktive vom Browser ignoriert.
const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-${BOOT_SCRIPT_HASH}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https:; base-uri 'self'; form-action 'self'; object-src 'none'" />`

export default defineConfig(({ command }) => ({
  base: BASE_PATH,
  plugins: [
    {
      name: 'inject-build-meta',
      transformIndexHtml(html) {
        return html
          .replace(/__BUILD_ID__/g, BUILD_ID)
          .replace(/__CSP_META__/g, command === 'build' ? CSP_META : '')
          .replace(/__BOOT_SCRIPT__/g, BOOT_SCRIPT_HTML)
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We manage manifest.json ourselves in public/
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache API responses with network-first strategy
            urlPattern: ({ url }) => url.pathname.startsWith('/pwa/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Proxy API calls to Railway backend during local dev
    proxy: {
      '/pwa': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}))
