import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devQrPlugin } from '../../scripts/vite-plugin-dev-qr.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), devQrPlugin()],
  server: { host: true, port: 5178, strictPort: true },
  preview: { host: true, port: 4178, strictPort: true },
  build: {
    outDir: 'dist',
    target: ['es2015', 'safari11', 'chrome64', 'firefox60'],
  },
});
