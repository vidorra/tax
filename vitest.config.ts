import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['lib/**/*.spec.ts', 'scripts/**/*.spec.ts', 'components/**/*.spec.ts'],
    environment: 'node',
  },
})
