import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['lib/**/*.spec.ts', 'scripts/**/*.spec.ts', 'components/**/*.spec.ts'],
    environment: 'node',
    // Vangnet: DATABASE_PATH wijst per testbestand naar een tijdelijk pad, nooit naar ./data/ibcalculator.db.
    setupFiles: ['./vitest.setup.ts'],
  },
})
