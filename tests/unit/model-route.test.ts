import { describe, it, expect, vi, afterEach } from "vitest";
import {
  askModel,
  modelRequestBody,
  modelRequestBytes,
  modelRequestRefusal,
  MAX_IMAGES,
  MAX_REQUEST_BYTES,
  MODEL_PATH,
  MODEL_TASKS,
  ModelExhaustedError,
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
} from "../../src/lib/food/model-route";
import * as worker from "../../worker/src/model";
import { setSecret } from "../../src/lib/stores/secrets";
import { stubLocalStorage } from "./support/local-storage";

/**
 * The client half of the route (ADR-0115 §5.1, §5.4, §5.5).
 *
 * The first block is the one that earns its place: the wire is **restated**
 * rather than imported across `scripts/worker-closure-check.mjs`'s boundary, and
 * the price of restating is that something has to hold the two in step. That is
 * this file — `relay-wire.ts` and `deposit-store.ts` each pay the same price the
 * same way.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("one shape, declared twice", () => {
  it("asks for the same tasks the route answers", () => {
    expect([...MODEL_TASKS]).toEqual([...worker.MODEL_TASKS]);
  });

  it("keeps both ceilings equal to the Worker's", () => {
    expect(MAX_IMAGES).toBe(worker.MAX_IMAGES);
    expect(MAX_REQUEST_BYTES).toBe(worker.MAX_REQUEST_BYTES);
  });

  it("builds the body the route parses, key for key", () => {
    const images = ["AAAA", "BBBB"];
    expect(modelRequestBody("label", images)).toEqual(
      worker.modelRequestBody("label", images)
    );
    // And the route accepts what this side builds, which is the half an
    // equality of literals would not catch.
    expect(worker.parseModelRequest(modelRequestBody("label", images))).toEqual(
      { ok: true, task: "label", images }
    );
  });

  it("posts to the path the Worker routes", () => {
    expect(MODEL_PATH).toBe("/api/model");
  });
});

describe("the client refuses before it sends, and says why", () => {
  it("takes a request inside both ceilings", () => {
    expect(modelRequestRefusal("label", ["AAAA"])).toBeNull();
    expect(
      modelRequestRefusal("label", Array(MAX_IMAGES).fill("AAAA"))
    ).toBeNull();
  });

  // Not "send the first four": the disclosure the user reads interpolates the
  // count, so a request the route would refuse must never be offered with that
  // count on the button.
  it("refuses more photographs than the cost ceiling allows", () => {
    const refusal = modelRequestRefusal(
      "label",
      Array(MAX_IMAGES + 1).fill("AAAA")
    );
    expect(refusal).toMatch(/At most 4 photos/);
  });

  it("refuses a set that is too heavy for the transport ceiling", () => {
    const refusal = modelRequestRefusal("label", [
      "A".repeat(MAX_REQUEST_BYTES),
    ]);
    expect(refusal).toMatch(/too large/);
  });

  it("refuses an empty capture array", () => {
    expect(modelRequestRefusal("label", [])).toMatch(/no photos/);
  });

  it("weighs the body it would send, not the images alone", () => {
    const images = ["AAAA", "BBBB"];
    expect(modelRequestBytes("label", images)).toBe(
      JSON.stringify(modelRequestBody("label", images)).length
    );
  });
});

/**
 * §5.4's set, read in exactly one place on this side — #204's lesson, which is
 * that the log and the screen cannot come to disagree about what happened when
 * one function decides.
 */
describe("every status becomes one of four classes", () => {
  const answering = (init: ResponseInit, body = "") => {
    const fetchMock = vi.fn(async () => new Response(body, init));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  const read = () => askModel("label", ["AAAA"]);

  it("reads a 200 into the wire shape", async () => {
    const reading = {
      name: "La Chinata",
      brand: null,
      basis: "per_100ml",
      nutrition: { energy_kcal: 899, fiber_g: null },
    };
    answering({ status: 200 }, JSON.stringify(reading));
    await expect(read()).resolves.toEqual(reading);
  });

  it("reads 429 as today's allowance", async () => {
    answering({ status: 429 });
    await expect(read()).rejects.toBeInstanceOf(ModelExhaustedError);
  });

  it("reads 422 as an answer that was not a panel", async () => {
    answering({ status: 422 });
    await expect(read()).rejects.toBeInstanceOf(ModelUnusableError);
  });

  // Both are the operator's to fix and neither is actionable by the person
  // holding the phone, so they collapse into one class and one line on screen.
  it("reads 401 and 403 as a refusal", async () => {
    answering({ status: 401 });
    await expect(read()).rejects.toBeInstanceOf(ModelRefusedError);
    answering({ status: 403 });
    await expect(read()).rejects.toBeInstanceOf(ModelRefusedError);
  });

  it("reads 503 and every other status as unreachable", async () => {
    for (const status of [503, 500, 502, 418]) {
      answering({ status });
      await expect(read()).rejects.toBeInstanceOf(ModelUnreachableError);
    }
  });

  // Offline, DNS, a connection reset: nothing was asked, which reads to the
  // user exactly as an unreachable route does.
  it("reads a transport rejection as unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    await expect(read()).rejects.toBeInstanceOf(ModelUnreachableError);
  });

  it("reads a 200 that is not JSON as unusable", async () => {
    answering({ status: 200 }, "<html>a login page</html>");
    await expect(read()).rejects.toBeInstanceOf(ModelUnusableError);
  });

  // The two restatements drifting is the only way this arrives, so it reads as
  // unusable rather than as something waiting would fix.
  it("reads the route's own 413 as unusable", async () => {
    answering({ status: 413 });
    await expect(read()).rejects.toBeInstanceOf(ModelUnusableError);
  });
});

describe("the ask carries the operator's key and the closed body", () => {
  it("sends Bearer plus exactly the two keys, and nothing else", async () => {
    stubLocalStorage();
    setSecret("model_route_key", "operator-secret");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await askModel("label", ["AAAA", "BBBB"]);

    const [path, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(path).toBe(MODEL_PATH);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer operator-secret"
    );
    expect(JSON.parse(init.body as string)).toEqual({
      task: "label",
      images: ["AAAA", "BBBB"],
    });
    expect(Object.keys(JSON.parse(init.body as string))).toEqual([
      "task",
      "images",
    ]);
  });

  // It may be pasted into Settings between one tap and the next, so it is read
  // at call time rather than captured.
  it("reads the key at call time", async () => {
    stubLocalStorage();
    setSecret("model_route_key", "first");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await askModel("label", ["AAAA"]);
    setSecret("model_route_key", "second");
    await askModel("label", ["AAAA"]);

    const keyOf = (i: number) =>
      (
        (fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1]
          .headers as Record<string, string>
      ).Authorization;
    expect(keyOf(0)).toBe("Bearer first");
    expect(keyOf(1)).toBe("Bearer second");
  });

  it("never reaches the network for a request it would refuse", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(askModel("label", [])).rejects.toBeInstanceOf(
      ModelUnusableError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
