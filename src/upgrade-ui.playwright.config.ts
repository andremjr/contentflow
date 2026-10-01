import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const external = process.env.CONTENTFLOW_UPGRADE_UI_URL;
export default defineConfig({
  testDir: "./tests",
  testMatch: "user-data-upgrade.spec.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  outputDir: "../test-results/upgrade-ui",
  use: { baseURL: external ?? "http://127.0.0.1:8096", headless: true },
  webServer: external
    ? undefined
    : {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8096 --strictPort",
        url: "http://127.0.0.1:8096",
        timeout: 120_000,
        reuseExistingServer: false,
      },
});
