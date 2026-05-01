import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';
import { ViteMinifyPlugin } from 'vite-plugin-minify';

export default defineConfig({
  base: './',
  plugins: [
    ViteMinifyPlugin({}),
    compression(), // Gzip
    compression({ algorithm: 'brotliCompress', exclude: [/\.(br)$/, /\.(gz)$/] }), // Brotli
  ],
  build: {
    minify: 'esbuild',
    cssMinify: true,
  },
});
