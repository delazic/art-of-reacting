import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The app only ever calls relative /api/* paths; each environment resolves
    // them with its own proxy. In dev, that resolver is this one.
    // See docs/architecture.md#same-origin-routing-design-rule
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Vitest's default 'forks' pool spawns a process per test file, which on
    // Windows costs more than the worker start timeout allows once jsdom is
    // loaded. Threads share the process and start fast.
    pool: 'threads',
  },
})
