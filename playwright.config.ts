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
  // What a capture is allowed to claim, in one place rather than at the call
  // sites: "one rule for both helpers" is a claim about this project, and a
  // third capture helper written next month inherits it here without anyone
  // remembering (ADR-0099 §2).
  expect: {
    // The assertion budget the tightened threshold below makes load-bearing.
    // `expectScreenshot` polls for *stability* — the first iteration against
    // the baseline, every later one against the previous screenshot — so a
    // stable-but-moved capture converges in about two screenshots (~0.8s
    // measured) and fails as a diff; only a page that cannot produce two
    // consecutive agreeing shots spends this. Tightening `threshold` tightens
    // that loop, so the number is named rather than inherited.
    //
    // It sits at this level rather than inside `toHaveScreenshot` because
    // Playwright will not read it there: `toMatchSnapshot.js:44-49` lists
    // `timeout` among `NonConfigProperties` and deletes it from the config
    // options before merging them, so the key ADR-0099 §3 names is accepted by
    // nothing and silently does nothing. This is the key the matcher actually
    // falls back to (`expect.js:123`), and what it replaces is **5000 ms** —
    // `expect`'s own default, not the 30s test timeout §3 quotes. The price of
    // naming it here is that it is every auto-retrying matcher's budget, so a
    // genuinely broken assertion takes 15s to fail rather than 5s; a passing
    // one costs nothing, and e2e is CI-only (AGENTS.md §1).
    timeout: 15_000,
    toHaveScreenshot: {
      // pixelmatch's per-pixel colour tolerance in YIQ space, which admits a
      // pixel when its delta exceeds `35215 x threshold^2`. 0.05 is derived,
      // not picked: `--border` (#e4e4e7) losing itself into `--bg-base`
      // (#fafafa) — delta 237.4 — must fail, and `--ink` (#000) against
      // `--text-primary` (#09090b) — delta 43.2 — must pass, which brackets it
      // at 0.0351 < t < 0.0821. `tests/unit/screenshot-tolerance.test.ts`
      // holds that bracket by asking the installed comparator, so a later
      // value may move inside it but nothing can quietly leave it.
      // Playwright's inherited 0.2 admitted a delta of 1408, wide enough to
      // pass `--green-bg` rendering as `--amber-bg`.
      //
      // The three knobs beside it are refused in writing rather than by
      // silence: `maxDiffPixels` is deleted and a count can never replace it,
      // `maxDiffPixelRatio` waits for a measurement that demands one, and
      // `comparator` stays pixelmatch because the bracket above is expressed
      // in YIQ delta and would have to be re-derived in ΔE94 to mean anything
      // (ADR-0099 §4, §5). There is a fifth control this repo cannot reach —
      // `pixelmatch.js:29` sets `includeAA: false` and Playwright never
      // overrides it — so an over-threshold pixel is re-tested by the
      // antialiasing detector and dropped if either image reads as an edge.
      threshold: 0.05,
    },
  },
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
  // Two processes, because the relay is the real one (#298). `pnpm dev` serves
  // the app and proxies `/api/relay` to the second (see vite.config.ts), so the
  // socket a spec opens leaves from the app's own origin and is answered by the
  // actual Durable Object under workerd — not by a stand-in the suite would then
  // be testing instead.
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm dev:relay",
      // The route rather than the port: `/api/relay` with no room answers 400
      // "Missing room id", and Playwright reads anything under 404 as up. So
      // this waits for the Worker to be *routing*, which is the thing a socket
      // needs, rather than for a socket to be accepted somewhere on 8787.
      url: "http://127.0.0.1:8787/api/relay",
      // Locally this adopts whatever already holds 8787, which on a machine
      // running several worktrees can be a peer's Worker rather than this
      // tree's. That is the same bargain the dev server above strikes on 5173;
      // check what is on the port before trusting a red run.
      reuseExistingServer: !process.env.CI,
      // workerd is downloaded with wrangler but still cold-starts a runtime; the
      // default 60s is thin on a runner already building the Vite dev server.
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
