/// <reference types="node" />
import { test, expect } from "@playwright/test";

// Receiving has no door of its own (ADR-0074 §4): the link IS the door, and it
// is a fragment read at boot on `/` rather than a route.
//
// The property no unit test can reach is the one this spec exists for: the read
// happens on a real load of the real app, and **the URL is clean afterwards, so
// a reload is not a second use of a single-use code** (§8). `takeReceiveLink`
// proves the read and the clean; only a browser proves that the app wires them
// to a page that has actually mounted.
//
// The relay is not running behind `pnpm dev`, so the surface either waits or
// reports that there was no route. Both are the surface being open, which is
// what is under test — nothing here asserts a meal crossing.

/** A fresh room per run, so two projects never wait in the same one. */
const room = () =>
  Buffer.from(
    Array.from({ length: 9 }, () => Math.floor(Math.random() * 256))
  ).toString("base64url");

/** A key of the width ADR-0072 §3 requires, which is the only width read. */
const KEY = Buffer.alloc(32, 7).toString("base64url");

test.describe("a receive link", () => {
  test("lands on the meal, and takes itself off the URL", async ({ page }) => {
    await page.goto(`/?mem=1#r=${room()}&k=${KEY}`);

    await expect(page.getByTestId("received-meal")).toBeVisible();
    // The whole secret was in the fragment; the fragment is gone.
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
    // …and the query the app does read is untouched.
    expect(await page.evaluate(() => window.location.search)).toBe("?mem=1");
  });

  test("is not read a second time by a reload", async ({ page }) => {
    await page.goto(`/?mem=1#r=${room()}&k=${KEY}`);
    await expect(page.getByTestId("received-meal")).toBeVisible();

    await page.reload();

    await expect(page.locator(".app")).toBeVisible();
    await expect(page.getByTestId("received-meal")).toHaveCount(0);
  });

  test("says a damaged code is damaged, rather than opening nothing", async ({
    page,
  }) => {
    // A key that is not 256 bits is not a Send code at all — the width IS the
    // bar — so this never reaches the relay and the answer is deterministic.
    await page.goto(`/?mem=1#r=${room()}&k=AAAA`);

    await expect(page.getByTestId("received-meal")).toBeVisible();
    await expect(page.getByText("This code is damaged.")).toBeVisible();
  });

  test("an ordinary boot opens no receiving surface at all", async ({
    page,
  }) => {
    await page.goto("/?mem=1");

    await expect(page.locator(".app")).toBeVisible();
    await expect(page.getByTestId("received-meal")).toHaveCount(0);
  });
});
