import { defineConfig, devices } from "@playwright/test";
import { CAPTURE_EXPECT } from "./playwright.config";

// A second Playwright config for the one spec that needs a production build
// behind a real service worker (#125). The main suite runs `pnpm dev`, which
// registers no worker at all, so "offline" there would only mean "no server" and
// the bug this guards would be invisible.
//
// Kept separate rather than added as a second `webServer` to playwright.config
// so the main suite pays nothing: a production build costs ~15s and this spec is
// the only thing that needs one.
export default defineConfig({
  testDir: "./tests",
  testMatch: ["offline-boot.spec.ts"],
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // The same block the main suite runs at, imported rather than restated
  // (ADR-0099 §2). This config matches one spec and that spec takes no picture
  // today, which is why it declared nothing and why that was invisible: the
  // silence was a fact about the spec, not a decision about the config. A
  // capture added here now compares at the derived tolerance instead of at
  // Playwright's 0.2.
  expect: CAPTURE_EXPECT,
  // Precaching ~13.5 MB over 37 entries dominates this spec; the default 30s is
  // not enough on a cold runner.
  timeout: 180_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    timezoneId: "UTC",
    locale: "en-US",
    // Same reason as playwright.config.ts: the Nix environment ships the full
    // Chromium and not the headless shell.
    channel: "chromium",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The build is part of the command because `preview` serves dist/ as it
    // finds it — a stale dist would silently pass this spec against old code.
    // Note that `reuseExistingServer` skips the build too, so kill any preview
    // already on 4173 before trusting a local run.
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
