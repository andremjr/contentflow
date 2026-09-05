import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/electron",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results/electron",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-electron" }]],
});
