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

// ADR-0083 §9's second arm, and the only place ADR-0077 §1's per-scope
// registration is observed rather than reasoned about. It runs here rather than
// in the main suite for the same reason the test above does: a service worker is
// what makes "offline" mean anything, and `pnpm dev` registers none.
//
// Both Facets are installed in one context on purpose, in the order a person
// meets them: Inventoria, then the food app at a URL inside it. Two
// registrations at two scopes is the claim — `/food/` resolves to Rations'
// worker and `/` to the root's, by longest scope prefix — and both precaches
// surviving each other is the other half of it.
//
// It does **not** prove the root's `cleanupOutdatedCaches: false` (ADR-0077 §1),
// and saying so is the point. That option only bites when the root activates
// *after* Rations' precache is populated, which is an accident of test ordering
// rather than a property of this test (ADR-0083 §7). `pnpm check:facets` asserts
// it off the emitted `sw.js`, where it is a property of the artifact.
test("Rations starts with the network off, beside an installed root", async ({
  page,
  context,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const activated = () =>
    page.waitForFunction(
      async () =>
        (await navigator.serviceWorker.ready).active?.state === "activated",
      null,
      { timeout: 120_000 }
    );

  // The root first, so Rations' precache has to survive an installed
  // Inventoria rather than being the only thing in the jar.
  await page.goto("/");
  await activated();

  await page.goto("/food/");
  await activated();

  // `registerType: "prompt"` deliberately does not claim the page that
  // registered the worker, so without this reload the offline load has nothing
  // serving it and the spec would fail for a reason unrelated to the claim.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 30_000,
  });

  await context.setOffline(true);
  await page.reload();

  await expect(page).toHaveTitle("Rations");
  await expect(page.locator(".rations")).toBeVisible();
  // ADR-0078 §2 offline as well as online: the shell has no tab bar to fall back
  // to, so a food screen that did not render is a blank install.
  await expect(page.locator(".nav-item")).toHaveCount(0);

  // The page is served by **Rations'** worker, not by the root's. Longest scope
  // prefix wins per client, and this is the assertion that says so.
  const controller = await page.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL ?? ""
  );
  expect(new URL(controller).pathname).toBe("/food/sw.js");

  // Both precaches are there, named after the scope each was registered at. The
  // cost ADR-0077 §1 accepted rather than mitigated is visible here: every byte
  // the two share is stored twice, because no workbox option changes that
  // suffix.
  const caches = await page.evaluate(() => globalThis.caches.keys());
  const precaches = caches.filter((name) => name.includes("workbox-precache"));
  expect(precaches.some((name) => name.endsWith("/food/"))).toBe(true);
  expect(precaches.some((name) => !name.endsWith("/food/"))).toBe(true);

  expect(
    pageErrors.filter((m) => /XMLHttpRequest|\.wasm|NetworkError/i.test(m))
  ).toEqual([]);
});
