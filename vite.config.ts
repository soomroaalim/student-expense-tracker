import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        // Keep chunks small for reliable deployment.
        manualChunks(id: string) {
          if (id.includes('src/views/tools') || id.includes('src/core/games')
            || id.includes('src/core/calc') || id.includes('src/core/moneyTools')) {
            return 'tools';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cache everything the app needs so it works fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        name: 'Student Expense Tracker',
        short_name: 'ExpenseTrack',
        description: 'Simple offline-first expense tracker for students.',
        start_url: '.',
        display: 'standalone',
        background_color: '#121214',
        theme_color: '#e11d48',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
