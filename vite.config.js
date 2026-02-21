import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['branding/favicon.ico', 'branding/apple-touch-icon.png'],
      manifest: {
        name: 'Capitalos',
        short_name: 'Capitalos',
        description: 'Unified wealth management platform',
        theme_color: '#050A1A',
        background_color: '#050A1A',
        display: 'standalone',
        icons: [
          {
            src: 'branding/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'branding/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'branding/icon-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'branding/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
})

