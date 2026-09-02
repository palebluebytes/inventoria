/// <reference types="node" />
import { test, expect } from "@playwright/test";

// Receiving has no door of its own (ADR-0074 §4): the link IS the door, and it
// is a fragment read at boot on `/food/` rather than a route.
//
// **It is `/food/` rather than `/` because a meal is Rations'** (ADR-0084 §5):
// a hand-off belongs to the Facet that owns the entities it carries, and the
// root reads no receive link at all now. `tests/unit/root-reads-no-link.test.ts`
// holds that deletion; what is here is the arrival working where it lands.
//
// The property no unit test can reach is the one this spec exists for: the read
// happens on a real load of the real app, and **the URL is clean afterwards, so
// a reload is not a second use of a single-use code** (§8). `takeReceiveLink`
// proves the read and the clean; only a browser proves that the app wires them
// to a page that has actually mounted.
//
// Nothing here asserts a meal crossing: the surface waits in a room nobody
// else joins, which is the surface being open and is what is under test. A
// meal crossing a real room is `meal-relay.spec.ts`'s, since #298 put a real
// relay behind `pnpm dev`.

/** A fresh room per run, so two projects never wait in the same one. */
const room = () =>
  Buffer.from(
    Array.from({ length: 9 }, () => Math.floor(Math.random() * 256))
  ).toString("base64url");

/** A key of the width ADR-0072 §3 requires, which is the only width read. */
const KEY = Buffer.alloc(32, 7).toString("base64url");

test.describe("a receive link", () => {
  test("lands on the meal, and takes itself off the URL", async ({ page }) => {
    await page.goto(`/food/?mem=1#r=${room()}&k=${KEY}`);

    await expect(page.getByTestId("received-meal")).toBeVisible();
    // The whole secret was in the fragment; the fragment is gone.
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
    // …and the query the app does read is untouched.
    expect(await page.evaluate(() => window.location.search)).toBe("?mem=1");
  });

  test("is not read a second time by a reload", async ({ page }) => {
    await page.goto(`/food/?mem=1#r=${room()}&k=${KEY}`);
    await expect(page.getByTestId("received-meal")).toBeVisible();

    await page.reload();

    await expect(page.locator(".rations")).toBeVisible();
    await expect(page.getByTestId("received-meal")).toHaveCount(0);
  });

  test("says a damaged code is damaged, rather than opening nothing", async ({
    page,
  }) => {
    // A key that is not 256 bits is not a Send code at all — the width IS the
    // bar — so this never reaches the relay and the answer is deterministic.
    await page.goto(`/food/?mem=1#r=${room()}&k=AAAA`);

    await expect(page.getByTestId("received-meal")).toBeVisible();
    await expect(page.getByText("This code is damaged.")).toBeVisible();
  });

  test("an ordinary boot opens no receiving surface at all", async ({
    page,
  }) => {
    await page.goto("/food/?mem=1");

    await expect(page.locator(".rations")).toBeVisible();
    await expect(page.getByTestId("received-meal")).toHaveCount(0);
  });
});

// ── A Safari tab on iOS, which hands the code over (ADR-0082 §2) ────────────
//
// **A stubbed `navigator` proves the branch and not the platform**, which is
// the same hole ADR-0074 §9 flagged about the asset router and which ADR-0082's
// Consequences restate. Chromium is not WebKit and this fixture is not a web
// clip; what these hold is that the app takes the handover branch when the two
// signals say so, and what it does and does not do once it is on it. That a
// real web clip reports `navigator.standalone === true` is #287's, and no suite
// can reach it.
//
// This is where the two rules a unit test cannot see are checked: the page
// **opens no socket** and **makes no persistence request**, both of which live
// in an `onMount` that only a browser runs.

/** Answers §6's two tests the way an iOS Safari tab does, before any app code. */
const asIosSafariTab = `
  Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
  Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
  Object.defineProperty(navigator, "standalone", { get: () => false });
`;

// Records the two things the handover page is forbidden from doing. The socket
// list is filtered to the relay's own path, because `pnpm dev` serves these and
// Vite's HMR client opens a WebSocket of its own on every load.
const watchForbiddenErrands = `
  window.__relaySockets = [];
  const RealWebSocket = window.WebSocket;
  window.WebSocket = new Proxy(RealWebSocket, {
    construct(target, args) {
      if (String(args[0]).includes("/api/relay"))
        window.__relaySockets.push(String(args[0]));
      return new target(...args);
    },
  });
  window.__persistRequests = 0;
  const realPersist = navigator.storage.persist.bind(navigator.storage);
  navigator.storage.persist = () => {
    window.__persistRequests++;
    return realPersist();
  };
`;

/**
 * What `watchForbiddenErrands` leaves on the page for a test to read back, plus
 * the client each Facet's shell puts there for the e2e suite. None of it exists on a
 * `Window` type, which is why the reads below name this shape.
 */
interface WatchedWindow {
  __relaySockets: string[];
  __persistRequests: number;
  dbClient?: { worker?: unknown };
}

test.describe("a receive link in an iOS Safari tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(asIosSafariTab + watchForbiddenErrands);
  });

  test("shows the code and says where to put it, instead of the meal", async ({
    page,
  }) => {
    const code = `#r=${room()}&k=${KEY}`;
    await page.goto(`/food/?mem=1${code}`);

    await expect(page.getByTestId("code-handover")).toBeVisible();
    // The Receiving surface is the one thing this page must not be.
    await expect(page.getByTestId("received-meal")).toHaveCount(0);
    // The code is shown as the whole link, because that is what the field on
    // the other end takes (ADR-0082 §12).
    await expect(page.getByTestId("handover-code")).toContainText(`k=${KEY}`);
    await expect(
      page.getByText("Open Rations and paste this into Scan.")
    ).toBeVisible();
  });

  test("joins no room and asks for no persistence", async ({ page }) => {
    await page.goto(`/food/?mem=1#r=${room()}&k=${KEY}`);
    await expect(page.getByTestId("code-handover")).toBeVisible();

    // Nothing on the receive path may touch the relay before the platform test
    // has run: a socket here would burn one of ADR-0072 §11.1's two and fail
    // the send for a reason the sender cannot see.
    expect(
      await page.evaluate(
        () => (window as unknown as WatchedWindow).__relaySockets
      )
    ).toEqual([]);
    // > The page must not ask the browser to durably keep a jar it is in the
    // > middle of telling you is not yours. (§8)
    expect(
      await page.evaluate(
        () => (window as unknown as WatchedWindow).__persistRequests
      )
    ).toBe(0);
  });

  test("opens no database, and cleans the URL anyway", async ({ page }) => {
    await page.goto(`/food/?mem=1#r=${room()}&k=${KEY}`);
    await expect(page.getByTestId("code-handover")).toBeVisible();

    // §8's boot-order change: `dbClient.init` is skipped ahead of the tests, so
    // the client never got a worker at all.
    expect(
      await page.evaluate(() =>
        Boolean((window as unknown as WatchedWindow).dbClient?.worker)
      )
    ).toBe(false);
    // §9: nothing is retried here, and it cleans the URL on the rule rather
    // than on a branch in it.
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
    expect(await page.evaluate(() => window.location.search)).toBe("?mem=1");
  });

  test("refuses a damaged code where it was read, before anyone carries it", async ({
    page,
  }) => {
    await page.goto(`/food/?mem=1#r=${room()}&k=AAAA`);

    await expect(page.getByTestId("code-handover")).toBeVisible();
    await expect(page.getByText("This code is damaged.")).toBeVisible();
  });

  test("an ordinary boot on the same device opens the app as usual", async ({
    page,
  }) => {
    // The gate is a receive link *and* the platform, never the platform alone.
    await page.goto("/food/?mem=1");

    await expect(page.locator(".rations")).toBeVisible();
    await expect(page.getByTestId("code-handover")).toHaveCount(0);
  });
});
