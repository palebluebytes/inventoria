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

// **The point of the whole arc, end to end** (#396): a fact written on one
// device reaches the other **without the two ever being open at the same
// time**.
//
// `wake.test.ts` puts two real ledgers either side of the real store route over
// a bucket that honours `onlyIf.etagMatches`, which is the whole protocol and
// none of the app: not `fetch` leaving the app's origin, not `wrangler dev`'s
// R2 simulation, not the worker RPC every row travels over, and not the wake
// firing on an open of the root Facet. This is the ticket's last criterion and
// the only place that sentence is true from end to end.
//
// **No `?mem=1` here, unlike `pairing-sync.spec.ts`.** A wake happens on an
// *open*, so both devices have to survive a reload holding what they held —
// which means the OPFS ledger rather than a fresh in-memory one. Two contexts
// are two storage profiles, so they are still two devices.
//
// **A device is "shut" by closing its page.** Nothing runs while the app is
// closed (ADR-0096 §14), so a page that is gone is a device that cannot
// contribute — which is the claim being tested rather than a convenience.
//
// What it does not buy: `wrangler dev` simulates R2 rather than being it, and
// the 30-day backstop expiry is the bucket's lifecycle rule, which no test in
// this repo can wait out.

test.describe("a sleeping peer converges", () => {
  // A pairing act, a first sync, then two whole app boots each running a wake
  // against a store. The protocol's own numbers are untouched; this is only how
  // long Playwright waits before calling the run a failure.
  test.setTimeout(120_000);

  test("a fact written on one device is there when the other opens, with the first shut", async ({
    browser,
  }) => {
    const options = projectContextOptions();
    const firstContext = await browser.newContext(options);
    const secondContext = await browser.newContext(options);

    try {
      // ── Two devices, paired ──────────────────────────────────────────────
      const first = await firstContext.newPage();
      await first.goto("/");
      await waitForDbReady(first);

      let second = await secondContext.newPage();
      await second.goto("/");
      await waitForDbReady(second);

      await pairDevices(first, second);

      // ── The second device is shut. Nothing of it is running ──────────────
      await second.close();

      // ── The first writes a fact the second has never seen ────────────────
      const habit = `Stretch_${Date.now()}`;
      await addHabit(first, habit);

      // ── And is opened again, which is the wake that deposits it ──────────
      //
      // A deposit fired at *this* open carries what the last session wrote,
      // which is exactly the promise: your data reaches your other device the
      // first time you open the app on each of them.
      const deposits: string[] = [];
      first.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname === "/api/store") {
          deposits.push(`${request.method()} ${url.searchParams.get("key")}`);
        }
      });
      await first.reload();
      await waitForDbReady(first);
      await expect
        .poll(() => deposits.filter((call) => call.startsWith("PUT")).length, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);

      // The address is a ratchet output, so it is nothing anybody could have
      // guessed and nothing the app put in a URL anywhere else.
      expect(deposits[0]).toMatch(/^(GET|PUT) [A-Za-z0-9_-]{40,}$/);

      // ── The first device is shut, and now both have been ─────────────────
      await first.close();

      // ── The second opens, alone, and finds it ────────────────────────────
      second = await secondContext.newPage();
      await second.goto("/");
      await waitForDbReady(second);

      await second.locator(".nav-item", { hasText: "Agenda" }).click();
      await expect(habitShows(second, habit)).toBeVisible({ timeout: 60_000 });

      // ── And the pairing is still one pairing, not a broken one ───────────
      //
      // A collection that finds nothing is normal and a refused rewrite is the
      // orphan design working, so neither may reach a screen: the section
      // shows the row it has always shown.
      await openSettings(second);
      await expect(
        second.locator("button", { hasText: "Unpair" })
      ).toBeVisible();

      // ── And the deposit said what the first device is paired with ────────
      //
      // #398: the roster rides every deposit, and this is the only place it
      // crosses a real store and lands on a real screen. A household of two
      // states an empty one, which is a sentence rather than a silence — and
      // it is a list you go and look at, so it is here and nowhere else.
      await expect(
        second.getByText("Paired with no other device.")
      ).toBeVisible();
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });
});
