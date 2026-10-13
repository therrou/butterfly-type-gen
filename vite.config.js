import { defineConfig } from 'vite';

// Self-contained: the film's butterfly modules are copied into src/film, so no files outside this folder are needed.
export default defineConfig({
  server: { port: 5178 },
  resolve: { dedupe: ['three'] },
});
