import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'capitalos_logo.png'],
      manifest: {
        name: 'Capitalos',
        short_name: 'Capitalos',
        description: 'Unified wealth management platform',
        theme_color: '#050A1A',
        background_color: '#050A1A',
        display: 'standalone',
        icons: [
          {
            src: 'capitalos_logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'capitalos_logo.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'logo.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ]
})

