import { defineConfig } from 'vite';
import { devQrPlugin } from '../../scripts/vite-plugin-dev-qr.mjs';

// base './' so the bundle works from any path (/g/flappy-bird/1.0.0/...)
export default defineConfig({
  base: './',
  plugins: [devQrPlugin()],
  // Fixed ports + host:true so a phone on the same Wi-Fi can reach the dev/preview
  // server; strictPort fails loudly instead of silently drifting to another port.
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
  build: {
    outDir: 'dist',
    // Down-level to a broad baseline so the minified bundle parses on older
    // mobile engines / in-app WebViews (Vite's default targets Safari 16+).
    target: ['es2015', 'safari11', 'chrome64', 'firefox60'],
  },
});
