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
      // A custom service worker, because the share target needs to intercept a
      // POST — generateSW cannot express that.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },
      manifest: {
        name: 'PianoPardus',
        short_name: 'PianoPardus',
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
        // Android matches on MIME type and on extension, and MIDI MIME types are
        // inconsistent between apps — the extensions do most of the work here.
        share_target: {
          action: '/import',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'file',
                accept: [
                  '.mid',
                  '.midi',
                  '.musicxml',
                  '.xml',
                  '.mxl',
                  'audio/midi',
                  'audio/x-midi',
                  'application/vnd.recordare.musicxml+xml',
                ],
              },
            ],
          },
        },
      },
    }),
  ],
  server: { host: true },
})
