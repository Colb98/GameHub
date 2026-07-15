import { defineConfig } from 'vite';

// base './' so the bundle works from any path (/g/flappy-bird/1.0.0/...)
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
});
