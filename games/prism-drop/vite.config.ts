import { defineConfig } from 'vite';
import { devQrPlugin } from '../../scripts/vite-plugin-dev-qr.mjs';

export default defineConfig({
  base: './',
  plugins: [devQrPlugin()],
  server: { host: true, port: 5177, strictPort: true },
  preview: { host: true, port: 4177, strictPort: true },
  build: {
    outDir: 'dist',
    target: ['es2015', 'safari11', 'chrome64', 'firefox60'],
  },
});
