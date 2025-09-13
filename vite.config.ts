import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'url'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { compression } from  'vite-plugin-compression2'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages: set base to repo name, e.g., '/motia/'
  // You can override via BASE_PATH env var in CI if needed
  base: process.env.BASE_PATH || '/motia/',
  define: {
    'import.meta.env.BASE_URL': JSON.stringify(process.env.BASE_PATH || '/motia/'),
  },
  plugins: [
    react(),
    tailwindcss(),
    compression({
      algorithms: [
        'brotliCompress'
      ]
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      { find: '@components', replacement: fileURLToPath(new URL('./src/components', import.meta.url)) },
      { find: '@utils', replacement: fileURLToPath(new URL('./src/utils', import.meta.url)) },
      { find: '@types', replacement: fileURLToPath(new URL('./src/types/index', import.meta.url)) },
      { find: '@assets', replacement: fileURLToPath(new URL('./src/assets', import.meta.url)) },
      { find: '@contexts', replacement: fileURLToPath(new URL('./src/contexts', import.meta.url)) },
    ],
  },
  build: {
    outDir: 'build',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        }
      }
    },
  }
})
