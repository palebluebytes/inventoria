/// <reference types="node" />
import { test, expect } from "@playwright/test";
import {
  addHabit,
  habitShows,
  openSettings,
  pairDevices,
  projectContextOptions,
  waitForDbReady,
} from "./support/two-devices";

// **Two devices, one real room, and one ledger afterwards** (#395).
//
// The unit suites put two real sqlite ledgers either side of the real Durable
// Object through an injected `dial` (`first-sync.test.ts`), which is most of
// the protocol but none of the app: not `openRelaySocket`, not the 101 upgrade,
// not the worker RPC the version vector and every chunk actually travel over,
// and not the Settings section that starts the act and writes the record. This
// is the ticket's last acceptance criterion — *two browser profiles pair and
// the second holds the first's ledger* — and it is the only place that sentence
// is true end to end.
//
// It is `meal-relay.spec.ts`'s shape, and for its reasons: two contexts are two
// devices rather than two tabs on one ledger, `?mem=1` gives each its own fresh
// in-memory database, and the relay under it is the one that ships rather than
// a second room stood up in the dev server.
//
// The act itself is `support/two-devices.ts`'s, because #396's demo needs the
// same pairing before it can begin; what is here is what is particular to a
// **live** convergence.
//
// What it does not buy: an emulated handset is not a handset, and a dev server
// is `http:`, so `openRelaySocket`'s `wss:` arm is still uncovered.

test.describe("a first sync across two devices", () => {
  // Two app boots, two ledgers, a live handshake and a whole transfer. The
  // protocol's own numbers are untouched; this is only how long Playwright
  // waits before calling the run a failure.
  test.setTimeout(90_000);

  test("pairs, and the second device holds the first's ledger", async ({
    browser,
  }) => {
    const options = projectContextOptions();
    const firstContext = await browser.newContext(options);
    const secondContext = await browser.newContext(options);

    try {
      // ── The first device, holding a fact the second has never seen ───────
      const first = await firstContext.newPage();
      await first.goto("/?mem=1");
      await waitForDbReady(first);

      const habit = `Meditate_${Date.now()}`;
      await addHabit(first, habit);

      // ── The second device, empty, reads its code ─────────────────────────
      const second = await secondContext.newPage();
      await second.goto("/?mem=1");
      await waitForDbReady(second);

      // Its ledger really is empty of this fact before the act.
      await second.locator(".nav-item", { hasText: "Agenda" }).click();
      await expect(habitShows(second, habit)).toHaveCount(0);

      await pairDevices(first, second, {
        onCode: (code) => {
          // ADR-0096 §8: the code is a labelled token that must not parse as a
          // URL, read off the carrier the other device is about to be handed.
          expect(code.startsWith("inventoria-pair ")).toBe(true);
          expect(() => new URL(code)).toThrow();
        },
      });

      // ── The ledger crossed ───────────────────────────────────────────────
      await second.locator(".nav-item", { hasText: "Agenda" }).click();
      await expect(habitShows(second, habit)).toBeVisible({ timeout: 30_000 });

      // ── And a row exists on both, which is what completing writes ────────
      //
      // "Done" is what closes the ending and puts the list back up; the section
      // expands in place, so there is no second surface to go to.
      for (const device of [first, second]) {
        // The card is mounted under every tab and merely hidden, so the second
        // device has to come back to Settings before its ending is reachable.
        await openSettings(device);
        await device.locator("button", { hasText: "Done" }).click();
        await expect(device.getByText("No devices are paired.")).toHaveCount(0);
        await expect(
          device.locator("button", { hasText: "Unpair" })
        ).toBeVisible();
      }
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test("an abandoned attempt leaves no row on either side", async ({
    browser,
  }) => {
    // Guard 1's other half: *an incomplete pairing deposits nothing and
    // collects nothing* (ADR-0096 §2). A code shown and then stopped never
    // reached a first sync, so there is nothing on either side to clean up.
    const options = projectContextOptions();
    const context = await browser.newContext(options);

    try {
      const page = await context.newPage();
      await page.goto("/?mem=1");
      await waitForDbReady(page);
      await openSettings(page);

      await page.locator("#pair-show-btn").click();
      await expect(page.getByTestId("pairing-code")).toBeVisible();
      await page.locator("button", { hasText: "Stop" }).click();

      await expect(page.getByText("No devices are paired.")).toBeVisible();
      // Nothing was written down, so nothing survives a reload either.
      await page.reload();
      await waitForDbReady(page);
      await openSettings(page);
      await expect(page.getByText("No devices are paired.")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
