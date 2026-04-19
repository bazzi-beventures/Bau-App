import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves at https://<user>.github.io/bau-app/
// Update BASE_PATH if the repo name is different.
const BASE_PATH = '/Bau-App/'

// Build-ID wird beim Build injiziert (index.html Platzhalter __BUILD_ID__).
// Dient als Nuclear-Kill-Switch: Wenn localStorage eine andere ID hält als
// das frisch geladene HTML, wird SW + Cache hart zurückgesetzt.
const BUILD_ID = new Date().toISOString()

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    {
      name: 'inject-build-id',
      transformIndexHtml(html) {
        return html.replace(/__BUILD_ID__/g, BUILD_ID)
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
})
