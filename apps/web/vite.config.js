import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `@toppfinance/shared` re-exports server-only modules (security.ts uses
// `@node-rs/argon2`; csv.ts uses `node:crypto`). The web app never calls any
// of those exports, so they are tree-shaken away — but rolldown still tries to
// RESOLVE argon2's browser entry (which imports a wasm subpath) during the
// module-graph scan, before tree-shaking runs, and that fails in this
// environment. Marking the argon2 family external lets resolution succeed;
// tree-shaking (the shared package sets `sideEffects: false`) then drops the
// unused module so no external import remains in the browser bundle.
const serverOnlyExternals = [/^@node-rs\/argon2/]

export default defineConfig({
  plugins: [react()],
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
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
    globals: true
  }
})
