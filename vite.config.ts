import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const supabaseUrl = env.VITE_SUPABASE_URL || '';

  return {
    root: path.resolve(__dirname, 'web'),
    envDir: path.resolve(__dirname),
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      proxy: supabaseUrl
        ? {
            '/supabase-proxy': {
              target: supabaseUrl,
              changeOrigin: true,
              rewrite: (p: string) => p.replace(/^\/supabase-proxy/, ''),
              secure: true,
            },
          }
        : undefined,
    },
  };
});
