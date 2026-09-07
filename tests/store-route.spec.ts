/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { DEPOSIT_CEILING_BYTES } from "../worker/src/store";

// **The store's route, against a real bucket** (#393).
//
// `tests/unit/store.test.ts` proves the same claims against `storeRequest` with
// a fake bucket, which is where the route's refusals live. What it cannot reach
// is the one property ADR-0096 §16 calls _the one genuinely load-bearing_ and
// _recent enough that it must be checked rather than assumed_: **conditional
// write on a caller-supplied etag**. A fake that mints its own etags proves
// only that the fake agrees with itself, so §5's orphan design — the rewrite
// that is refused rather than recreating a collected object — has to cross a
// real implementation to mean anything.
//
// `pnpm dev:relay` runs `wrangler dev`, which simulates R2 locally, so this
// needs no account and no network. The request leaves from the app's own origin
// and Vite proxies `/api/store` to that Worker (ADR-0096 §16: the client speaks
// our protocol and never names the provider, so the route is the whole surface
// there is to test).
//
// **A fresh address per run**, because `fullyParallel` runs these files against
// one bucket and one lane holds exactly one object: two runs sharing an address
// would supersede each other and fail on a bound rather than on a defect. The
// addresses here are drawn from `randomUUID` rather than derived, which the
// route cannot tell apart from a real one and is not supposed to be able to
// (§16).

const STORE = "/api/store";

/** A fresh address, in the shape the route accepts and nothing narrower. */
const address = () => `spec${crypto.randomUUID().replaceAll("-", "")}`;

const at = (key: string) => `${STORE}?key=${key}`;

test.describe("the store's route", () => {
  test("round-trips a sealed object at a client-supplied address", async ({
    request,
  }) => {
    const key = address();
    const sealed = crypto.getRandomValues(new Uint8Array(4096));

    const put = await request.put(at(key), { data: Buffer.from(sealed) });
    expect(put.status()).toBe(204);
    expect(put.headers().etag).toBeTruthy();

    const got = await request.get(at(key));
    expect(got.status()).toBe(200);
    expect(new Uint8Array(await got.body())).toEqual(sealed);
    expect(got.headers()["cache-control"]).toBe("no-store");

    const deleted = await request.delete(at(key));
    expect(deleted.status()).toBe(204);

    expect((await request.get(at(key))).status()).toBe(404);
  });

  test("answers 404 at an address nothing was written to", async ({
    request,
  }) => {
    expect((await request.get(at(address()))).status()).toBe(404);
  });

  // ADR-0096 §5, and the whole reason this spec exists. The etag is the real
  // bucket's, the delete is the collector's, and the refusal has to come from
  // the provider rather than from anything this repo wrote.
  test("refuses a rewrite against an object its collector deleted", async ({
    request,
  }) => {
    const key = address();

    const put = await request.put(at(key), { data: Buffer.from("first") });
    const etag = put.headers().etag;
    expect(etag).toBeTruthy();

    // The collector takes it, which takes the etag with it.
    expect((await request.delete(at(key))).status()).toBe(204);

    const rewrite = await request.put(at(key), {
      data: Buffer.from("second"),
      headers: { "If-Match": etag },
    });

    // Refused, and — the half that matters — the object is not recreated.
    expect(rewrite.status()).toBe(412);
    expect((await request.get(at(key))).status()).toBe(404);
  });

  test("supersedes in place while the etag still matches", async ({
    request,
  }) => {
    const key = address();

    const first = await request.put(at(key), { data: Buffer.from("one") });
    const rewrite = await request.put(at(key), {
      data: Buffer.from("two"),
      headers: { "If-Match": first.headers().etag },
    });
    expect(rewrite.status()).toBe(204);

    const got = await request.get(at(key));
    expect(await got.text()).toBe("two");

    // And the etag moved, so the superseded one is spent.
    const stale = await request.put(at(key), {
      data: Buffer.from("three"),
      headers: { "If-Match": first.headers().etag },
    });
    expect(stale.status()).toBe(412);
    expect(await (await request.get(at(key))).text()).toBe("two");

    await request.delete(at(key));
  });

  test("takes a deposit at the ceiling and refuses one past it", async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const key = address();

    const full = await request.put(at(key), {
      data: Buffer.alloc(DEPOSIT_CEILING_BYTES),
      headers: { "Content-Type": "application/octet-stream" },
    });
    expect(full.status()).toBe(204);

    const over = await request.put(at(address()), {
      data: Buffer.alloc(DEPOSIT_CEILING_BYTES + 1),
      headers: { "Content-Type": "application/octet-stream" },
    });
    expect(over.status()).toBe(413);

    await request.delete(at(key));
  });

  test("refuses an address it was not handed, and a verb it does not have", async ({
    request,
  }) => {
    expect((await request.get(STORE)).status()).toBe(400);
    expect((await request.get(at("lane/0001"))).status()).toBe(400);

    const posted = await request.post(at(address()), {
      data: Buffer.from("x"),
    });
    expect(posted.status()).toBe(405);
    expect(posted.headers().allow).toBe("GET, PUT, DELETE");
  });
});
