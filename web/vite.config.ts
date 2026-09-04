import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Horodatage du build, affiche en bas du menu : quand la direction dit "je ne
// vois pas les changements", on lit tout de suite si le navigateur affiche la
// derniere version ou une version en cache.
const BUILD_DATE = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  define: {
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
