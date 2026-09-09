import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: true, port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } } },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than screens; keeping them apart lets a returning browser reuse them.
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], data: ['dexie', 'dexie-react-hooks'], dates: ['date-fns'] },
      },
    },
  },
})
