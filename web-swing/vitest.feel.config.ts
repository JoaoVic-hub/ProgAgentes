import { defineConfig } from 'vitest/config';

// npm run feel  — piloto automático de medição (tools/*.feel.ts)
// npm run golden — regrava o replay dourado do L1 (tools/golden.gen.ts)
// Ambos ficam fora da suíte padrão de testes.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/**/*.feel.ts', 'tools/**/*.gen.ts'],
    testTimeout: 120_000,
  },
});
