import { defineConfig } from 'vite';
import { devQrPlugin } from '../../scripts/vite-plugin-dev-qr.mjs';

// Distinct fixed ports from flappy-bird so both games can run at once.
export default defineConfig({
  base: './',
  plugins: [devQrPlugin()],
  server: { host: true, port: 5174, strictPort: true },
  preview: { host: true, port: 4174, strictPort: true },
  build: {
    outDir: 'dist',
    // Down-level to a broad baseline so the minified bundle parses on older
    // mobile engines / in-app WebViews (Vite's default targets Safari 16+).
    target: ['es2015', 'safari11', 'chrome64', 'firefox60'],
  },
});
