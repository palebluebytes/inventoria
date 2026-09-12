import { describe, it, expect } from "vitest";
import {
  storeRequest,
  DEPOSIT_CEILING_BYTES,
  type StoreBucket,
} from "../../worker/src/store";
import { fakeBucket } from "./support/store-bucket";

/**
 * The route's decisions, against a bucket that behaves the way R2 documents
 * (ADR-0096 §1 and §5). `tests/store-route.spec.ts` proves the same claims
 * against the real thing under workerd, which is where the conditional write
 * has to be believed rather than assumed — this file is where the route's own
 * refusals live, and it can reach the ones a live bucket makes expensive.
 */

const ADDRESS = "a".repeat(64);

const url = (key: string | null) =>
  key === null
    ? "https://app.example/api/store"
    : `https://app.example/api/store?key=${encodeURIComponent(key)}`;

/** The key the route was handed, which the caller reads off the query. */
const keyOf = (target: string) => new URL(target).searchParams.get("key");

const call = (request: Request, bucket: StoreBucket) =>
  storeRequest(request, bucket, keyOf(request.url));

const deposit = (
  bytes: Uint8Array<ArrayBuffer>,
  init: { key?: string; ifMatch?: string } = {}
) =>
  new Request(url(init.key ?? ADDRESS), {
    method: "PUT",
    body: bytes,
    headers: init.ifMatch ? { "If-Match": init.ifMatch } : undefined,
  });

describe("a deposit round-trips at a client-supplied key", () => {
  it("puts, gets back the same bytes, and deletes", async () => {
    const { bucket } = fakeBucket();
    const sealed = new Uint8Array([1, 2, 3, 4, 5]);

    const put = await call(deposit(sealed), bucket);
    expect(put.status).toBe(204);
    expect(put.headers.get("ETag")).toBe('"etag-1"');

    const got = await call(new Request(url(ADDRESS)), bucket);
    expect(got.status).toBe(200);
    expect(got.headers.get("ETag")).toBe('"etag-1"');
    expect(got.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(sealed);

    const gone = await call(
      new Request(url(ADDRESS), { method: "DELETE" }),
      bucket
    );
    expect(gone.status).toBe(204);

    const after = await call(new Request(url(ADDRESS)), bucket);
    expect(after.status).toBe(404);
  });

  it("answers 404 for an address nothing was ever written to", async () => {
    const { bucket } = fakeBucket();
    const missing = await call(new Request(url("b".repeat(64))), bucket);
    expect(missing.status).toBe(404);
  });

  it("deletes an address that holds nothing without complaining", async () => {
    const { bucket } = fakeBucket();
    const gone = await call(
      new Request(url(ADDRESS), { method: "DELETE" }),
      bucket
    );
    expect(gone.status).toBe(204);
  });
});

describe("the conditional rewrite", () => {
  it("supersedes in place when the etag still matches", async () => {
    const { bucket, held } = fakeBucket();
    const first = await call(deposit(new Uint8Array([1])), bucket);
    const etag = first.headers.get("ETag")!;

    const second = await call(
      deposit(new Uint8Array([2, 2]), { ifMatch: etag }),
      bucket
    );

    expect(second.status).toBe(204);
    expect(held.get(ADDRESS)!.bytes).toEqual(new Uint8Array([2, 2]));
    expect(held.size).toBe(1);
  });

  it("refuses a stale etag and leaves the object alone", async () => {
    const { bucket, held } = fakeBucket();
    await call(deposit(new Uint8Array([1])), bucket);

    const refused = await call(
      deposit(new Uint8Array([9]), { ifMatch: '"etag-nope"' }),
      bucket
    );

    expect(refused.status).toBe(412);
    expect(held.get(ADDRESS)!.bytes).toEqual(new Uint8Array([1]));
  });

  // ADR-0096 §5: this is the clause that removes the permanently orphaned
  // object. A collector's DELETE takes the etag with it, so the depositor's
  // next rewrite is refused rather than recreating what was collected.
  it("does not recreate an object its collector deleted", async () => {
    const { bucket, held } = fakeBucket();
    const first = await call(deposit(new Uint8Array([1])), bucket);
    const etag = first.headers.get("ETag")!;
    await call(new Request(url(ADDRESS), { method: "DELETE" }), bucket);

    const refused = await call(
      deposit(new Uint8Array([2]), { ifMatch: etag }),
      bucket
    );

    expect(refused.status).toBe(412);
    expect(held.has(ADDRESS)).toBe(false);
  });

  it("takes an unquoted etag, since a client may send either", async () => {
    const { bucket } = fakeBucket();
    await call(deposit(new Uint8Array([1])), bucket);

    const rewritten = await call(
      deposit(new Uint8Array([2]), { ifMatch: "etag-1" }),
      bucket
    );

    expect(rewritten.status).toBe(204);
  });
});

describe("the ceiling", () => {
  it("takes a deposit of exactly 16 MiB", async () => {
    const { bucket } = fakeBucket();
    const full = new Uint8Array(DEPOSIT_CEILING_BYTES);
    const put = await call(deposit(full), bucket);
    expect(put.status).toBe(204);
  });

  it("refuses one byte more, and stores nothing", async () => {
    const { bucket, held } = fakeBucket();
    const over = new Uint8Array(DEPOSIT_CEILING_BYTES + 1);

    const refused = await call(deposit(over), bucket);

    expect(refused.status).toBe(413);
    expect(held.size).toBe(0);
  });

  // A declared length is a claim, not a measurement: a chunked body carries no
  // content-length at all, so the count has to happen while reading.
  it("refuses an oversized body that declares no length", async () => {
    const { bucket, held } = fakeBucket();
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (
          let sent = 0;
          sent <= DEPOSIT_CEILING_BYTES;
          sent += chunk.length
        ) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const refused = await call(
      new Request(url(ADDRESS), {
        method: "PUT",
        body,
        // @ts-expect-error `duplex` is required for a streaming request body
        // and is not yet in the DOM lib this project types tests against.
        duplex: "half",
      }),
      bucket
    );

    expect(refused.status).toBe(413);
    expect(held.size).toBe(0);
  });

  it("refuses a lying content-length before reading a byte", async () => {
    const { bucket } = fakeBucket();
    const request = new Request(url(ADDRESS), {
      method: "PUT",
      body: new Uint8Array([1]),
      headers: { "Content-Length": String(DEPOSIT_CEILING_BYTES + 1) },
    });

    expect((await call(request, bucket)).status).toBe(413);
  });
});

describe("what the route refuses before it reaches the bucket", () => {
  it("refuses a request with no key", async () => {
    const { bucket } = fakeBucket();
    expect((await call(new Request(url(null)), bucket)).status).toBe(400);
  });

  it("refuses an empty key", async () => {
    const { bucket } = fakeBucket();
    expect((await call(new Request(url("")), bucket)).status).toBe(400);
  });

  // ADR-0096 §16: "no listing and no directory of any kind". A key carrying a
  // separator would put a shape in the namespace the addresses do not have.
  it("refuses a key that would build a directory", async () => {
    const { bucket } = fakeBucket();
    expect((await call(new Request(url("lane/0001")), bucket)).status).toBe(
      400
    );
  });

  it("refuses a key longer than the address shape allows", async () => {
    const { bucket } = fakeBucket();
    const long = "c".repeat(257);
    expect((await call(new Request(url(long)), bucket)).status).toBe(400);
  });

  it("refuses a verb the store does not have", async () => {
    const { bucket } = fakeBucket();
    const posted = await call(
      new Request(url(ADDRESS), { method: "POST", body: "x" }),
      bucket
    );
    expect(posted.status).toBe(405);
    expect(posted.headers.get("Allow")).toBe("GET, PUT, DELETE");
  });
});
