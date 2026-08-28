import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // Unit tests belong to Vitest. offline-boot.spec.ts belongs to
  // playwright.offline.config.ts: it needs a production build behind a service
  // worker, and `pnpm dev` registers no worker, so collecting it here would fail
  // it for the wrong reason (#125).
  testIgnore: ["**/unit/**", "**/offline-boot.spec.ts"],
  // Tests are independent by construction, so they may run concurrently: every
  // spec but persistence.spec.ts loads `?mem=1`, which forces a fresh in-memory
  // database per page (see db.client.ts), and Playwright hands each test its own
  // context. Nothing declares `describe.serial`, a `beforeAll`, or module state.
  //
  // File-level parallelism alone would barely help: food-ui.spec.ts is 34 of the
  // 50 tests and 72% of the runtime, so the suite is only as fast as that one
  // file unless its tests can split across workers.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Half the runner's 4 vCPUs, which is Playwright's own default ratio: each
  // worker is a browser, and they share the box with the Vite dev server that
  // serves them. Retries cost 3x, so buying wall-clock with contention is a bad
  // trade — raise this only against measured run times, not by intuition.
  workers: process.env.CI ? 2 : 1,
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
