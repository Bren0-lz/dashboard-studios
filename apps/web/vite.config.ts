import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { "/api": "http://localhost:4000" },
  },
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    testTimeout: 20_000,
    // Deixa o teste ler o styles.css (`?raw`) para conferir regras de layout, como o `table-layout` da tabela de turmas.
    css: { include: [/styles\.css/] },
  },
});
