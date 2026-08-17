import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testIgnore: ["**/unit/**"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    // Pin the two host settings the browser would otherwise inherit. A runner
    // is UTC/en-US and a workstation is whatever it is (this one is
    // Europe/Madrid), and the app formats through `toLocaleDateString(undefined,
    // ...)` and `toLocaleString()`. Left unpinned, the same ledger renders
    // different strings on each machine, and a day-bucketed dashboard can put
    // the same event on a different calendar day, so the visual baselines would
    // never agree.
    timezoneId: "UTC",
    locale: "en-US",
    // Launch the full Chromium binary rather than chromium-headless-shell.
    // Without this, a headless run resolves to the shell (see getExecutableName
    // in playwright-core's chromium.js) and the Nix environment does not ship
    // it: flake.nix supplies `playwright-driver.browsers-chromium`, which omits
    // the shell. Removing this line means restoring the shell in flake.nix.
    channel: "chromium",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
