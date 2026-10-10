import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
