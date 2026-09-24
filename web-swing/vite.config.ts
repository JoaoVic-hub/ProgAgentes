import { defineConfig } from 'vitest/config';

export default defineConfig({
  // caminhos relativos: o build roda em qualquer subpasta (ex.: GitHub Pages)
  base: './',
  build: {
    target: 'es2020',
    // o three sozinho tem ~520 kB minificado; o orçamento que acompanhamos é
    // o tamanho gzip (< 250 kB, ver CHANGELOG.md)
    chunkSizeWarningLimit: 800,
  },
  test: {
    // logic/ e app/ são puros — os testes rodam em Node, sem DOM
    environment: 'node',
  },
});
