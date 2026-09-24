import { defineConfig } from 'vitest/config';

// npm run feel — roda só o piloto automático de medição (tools/*.feel.ts),
// que fica fora da suíte padrão de testes.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/**/*.feel.ts'],
    testTimeout: 120_000,
  },
});
