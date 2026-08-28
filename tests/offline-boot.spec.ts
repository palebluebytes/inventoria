import { test, expect } from "@playwright/test";

// The regression guard for #125: with loro's WASM behind a *synchronous*
// XMLHttpRequest, the entry module threw during evaluation, so `mount(App)`
// never ran — `#app` stayed empty and every screen was unreachable offline, not
// just Notes.
//
// This is the one spec that cannot run against `pnpm dev`: the bug only exists
// in a production build, and only a service worker makes "offline" mean anything
// other than "no server". It runs under playwright.offline.config.ts, which
// serves `pnpm preview`, and playwright.config.ts ignores it for that reason.
test("the app starts with the network off", async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/");

  // Precaching runs during the worker's `install`, so `activated` is the signal
  // that every entry is in the cache and an offline load has something to serve.
  await page.waitForFunction(
    async () =>
      (await navigator.serviceWorker.ready).active?.state === "activated",
    null,
    { timeout: 120_000 }
  );

  // `registerType: "prompt"` deliberately does not claim the page that
  // registered the worker. Without this reload the page is uncontrolled, the
  // offline reload has no worker serving it, and the spec would fail for a
  // reason that has nothing to do with the bug.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 30_000,
  });

  await context.setOffline(true);
  await page.reload();

  // index.html ships a static `temp-init` title; App.svelte replaces it on
  // mount. Still reading `temp-init` is precisely the reported symptom.
  await expect(page).toHaveTitle("Inventoria — Local-first Ledger");
  await expect(page.locator(".app")).toBeVisible();

  // Notes is lazily imported, so this also asserts the bound on the damage:
  // a screen that has nothing to do with the CRDT renders regardless.
  await expect(
    page.locator(".nav-item", { hasText: "Settings" })
  ).toBeVisible();

  // Scoped to the failure mode rather than asserting an empty array, so an
  // unrelated console error in another feature cannot make this spec flap.
  expect(
    pageErrors.filter((m) => /XMLHttpRequest|\.wasm|NetworkError/i.test(m))
  ).toEqual([]);
});
