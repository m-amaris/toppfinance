import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const serverOnlyExternals = [/^@node-rs\/argon2/]

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      external: serverOnlyExternals,
    },
  },
})