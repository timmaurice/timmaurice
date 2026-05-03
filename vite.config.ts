import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';
import { ViteMinifyPlugin } from 'vite-plugin-minify';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/timmaurice/',
  plugins: [
    ViteMinifyPlugin({}),
    compression(), // Gzip
    compression({ algorithm: 'brotliCompress', exclude: [/\.(br)$/, /\.(gz)$/] }), // Brotli
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'sw.js',
      manifestFilename: 'manifest.json',
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'Home Assistant App Store',
        short_name: 'HA Apps',
        description: 'Custom cards and integrations by @timmaurice',
        theme_color: '#0f1115',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    minify: 'esbuild',
    cssMinify: true,
  },
});
