import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The service worker serves stale builds during development. Leave it off
      // in dev; it is only ever enabled for real builds.
      devOptions: { enabled: false },
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      manifest: {
        name: 'Keyway',
        short_name: 'Keyway',
        description: 'Play-along piano practice with a MIDI keyboard.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0f13',
        theme_color: '#0e0f13',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true },
})
