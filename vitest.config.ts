import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Zona del proceso fija: el código debe usar Atlantic/Canary de forma explícita (@date-fns/tz).
    env: { TZ: "UTC" },
  },
});
