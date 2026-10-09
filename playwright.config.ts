import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// En local, las claves de Supabase están en .env.local (el setup crea usuarios de prueba).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const isCI = !!process.env.CI;
const port = 3100;
const baseURL = `http://localhost:${port}`;

// Opcional: ruta a un Chromium ya instalado (entornos sin descarga de navegadores).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

const ADMIN_STATE = "playwright/.auth/admin.json";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "es-ES",
    timezoneId: "Atlantic/Canary",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    // Crea los usuarios de prueba e inicia sesión como admin una vez para el resto de proyectos.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "movil",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, storageState: ADMIN_STATE },
    },
    {
      name: "tablet",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, storageState: ADMIN_STATE },
    },
    {
      name: "escritorio",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: ADMIN_STATE },
    },
  ],
  webServer: {
    command: isCI ? `npm run start -- -p ${port}` : `npm run dev -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
