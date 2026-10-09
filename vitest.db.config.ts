import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests contra Supabase local (npm run db:start). Comprueban RLS y funciones SQL de verdad.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    env: { TZ: "UTC" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Comparten base de datos: en serie para que no se pisen.
    fileParallelism: false,
  },
});
