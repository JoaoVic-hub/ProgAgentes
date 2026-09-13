import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'truco-rules',
          include: ['packages/truco-rules/tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          include: ['apps/server/tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          include: ['apps/client/tests/**/*.test.ts'],
        },
      },
    ],
  },
})