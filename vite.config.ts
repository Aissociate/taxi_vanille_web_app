import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Horodatage du build, affiche en bas du menu (meme define que web/vite.config.ts :
// les deux configurations servent le meme code, il doit exister dans les deux).
const BUILD_DATE = new Date().toISOString();

export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  envDir: path.resolve(__dirname),
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
