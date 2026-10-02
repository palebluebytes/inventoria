import { describe, it, expect, vi, afterEach } from "vitest";
import {
  askModel,
  modelRequestBody,
  modelRequestBytes,
  modelRequestRefusal,
  MAX_IMAGES,
  MAX_REQUEST_BYTES,
  MODEL_PATH,
  MODEL_STATUS,
  MODEL_TASKS,
  ModelExhaustedError,
  ModelRefusedError,
  ModelUnreachableError,
  ModelUnusableError,
} from "../../src/lib/food/model-route";
import * as worker from "../../worker/src/model";
import { MODEL_FAULT, MODEL_REQUEST_FAULT } from "../../worker/src/model-label";
import { MODEL_PATH as WORKER_MODEL_PATH } from "../../worker/src/index";
import { WIRE_KEYS } from "../../src/lib/food/ai-autofill";
import { LABEL_KEYS } from "../../worker/src/model-label";
import { setSecret } from "../../src/lib/stores/secrets";
import { stubLocalStorage } from "./support/local-storage";
import { sealedAs, stubPhotoSurface } from "./support/photo-surface";

/**
 * A photograph as the capture array holds it: a **data URL**, which is what
 * `FileReader` answers and what an `<img src>` needs. Every fixture here was
 * bare base64 before, which is precisely why nothing noticed that the wire
 * carried a double prefix — see "sends the sealed photographs" below.
 */
const PHOTO = "data:image/png;base64,QUFBQQ==";
const PHOTO_2 = "data:image/png;base64,QkJCQg==";

/** A well-formed answer, for the tests that are about the request. */
const OK_BODY = JSON.stringify({
  name: null,
  brand: null,
  basis: "per_100g",
  nutrition: {},
});

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
    // Against the Worker's own constant, not a literal. Both sides said
    // "/api/model" and neither could see the other, so a rename on one would
    // have left the test passing and the route 404ing.
    expect(MODEL_PATH).toBe(WORKER_MODEL_PATH);
  });

  it("asks for exactly the keys the prompt asks the model for", () => {
    // **The restatement that nothing held.** `WIRE_TO_PANEL` was a
    // `Record<string, …>` read through `?.()`, so renaming `fiber_g` on the
    // Worker compiled, passed every test, and silently stopped writing the
    // fibre row — absent-not-zero turned into a row the panel just lost.
    expect([...WIRE_KEYS]).toEqual([...LABEL_KEYS]);
  });

  it("branches on the statuses the Worker answers with", () => {
    expect(MODEL_STATUS.unusable).toBe(MODEL_FAULT.unusable);
    expect(MODEL_STATUS.exhausted).toBe(MODEL_FAULT.exhausted);
    expect(MODEL_STATUS.refused).toBe(MODEL_FAULT.refused);
    expect(MODEL_STATUS.badKey).toBe(MODEL_REQUEST_FAULT.badKey);
    expect(MODEL_STATUS.overCeiling).toBe(MODEL_REQUEST_FAULT.overCeiling);
    // `503` is the Worker's unreachable and the client's fallthrough, so it is
    // deliberately not in the client's table: every unrecognised status has to
    // end the same way, and naming one of them would invite a branch.
    expect(Object.values(MODEL_STATUS)).not.toContain(MODEL_FAULT.unreachable);
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

  const read = () => askModel("label", [PHOTO], stubPhotoSurface());

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

/**
 * The boundary, guarded once (`CODING_STANDARDS.md` §3.2).
 *
 * It replaced `(await response.json()) as LabelReading` — a cast that asserted
 * the shape here and left `ai-autofill.ts` re-guarding every field against a
 * type already claiming to be certain. One of the two had to go, and a cast is
 * the half with no run-time effect.
 *
 * It checks **the shape, not the content**: a basis the app cannot express and
 * a panel of eight rows are both well-formed answers that later code is written
 * for. What it refuses is a body that is not a reading at all.
 */
describe("a 200 is read as a reading or refused as one", () => {
  const answering = (body: unknown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    );
    return askModel("label", [PHOTO], stubPhotoSurface());
  };

  it("refuses a body that is not an object", async () => {
    await expect(answering("a string")).rejects.toBeInstanceOf(
      ModelUnusableError
    );
    await expect(answering([1, 2])).rejects.toBeInstanceOf(ModelUnusableError);
    await expect(answering(null)).rejects.toBeInstanceOf(ModelUnusableError);
  });

  it("refuses a reading with no nutrition object", async () => {
    await expect(
      answering({ name: null, brand: null, basis: "per_100g" })
    ).rejects.toBeInstanceOf(ModelUnusableError);
  });

  it("refuses a name or basis that is not a string or null", async () => {
    await expect(
      answering({ name: 7, brand: null, basis: "per_100g", nutrition: {} })
    ).rejects.toBeInstanceOf(ModelUnusableError);
    await expect(
      answering({ name: null, brand: null, basis: {}, nutrition: {} })
    ).rejects.toBeInstanceOf(ModelUnusableError);
  });

  /**
   * The **whole** reading, not the one row. A response shaped unlike the
   * contract is not a response with one bad row in it, and dropping the row
   * would be the sparse-answer mistake §9.1 names: eight of twenty-one rows is
   * a correct answer, so "fewer rows than I expected" can never be the signal.
   */
  it("refuses the whole reading for one unreadable row", async () => {
    await expect(
      answering({
        name: null,
        brand: null,
        basis: "per_100g",
        nutrition: { energy_kcal: 899, fat_g: "99 g" },
      })
    ).rejects.toBeInstanceOf(ModelUnusableError);
  });

  it("takes a basis it cannot express, leaving the refusal to the normaliser", async () => {
    // The transport's job ends at the shape. `per_serving` is a well-formed
    // answer and `ai-autofill.ts` is what refuses it, which is the seam that
    // keeps the Worker from ever learning what a `Basis` is.
    const reading = await answering({
      name: null,
      brand: null,
      basis: "per_serving",
      nutrition: {},
    });
    expect(reading.basis).toBe("per_serving");
  });

  it("keeps both spellings of absence as they arrived", async () => {
    const reading = await answering({
      name: null,
      brand: null,
      basis: "per_100g",
      nutrition: { energy_kcal: 899, fiber_g: null },
    });
    expect(reading.nutrition).toEqual({ energy_kcal: 899, fiber_g: null });
  });
});

describe("the ask carries the operator's key and the closed body", () => {
  it("sends Bearer plus exactly the two keys, and nothing else", async () => {
    stubLocalStorage();
    setSecret("model_route_key", "operator-secret");
    const fetchMock = vi.fn(async () => new Response(OK_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await askModel("label", [PHOTO, PHOTO_2], stubPhotoSurface());

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
      images: [sealedAs(0), sealedAs(1)],
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
    const fetchMock = vi.fn(async () => new Response(OK_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await askModel("label", [PHOTO], stubPhotoSurface());
    setSecret("model_route_key", "second");
    await askModel("label", [PHOTO], stubPhotoSurface());

    const keyOf = (i: number) =>
      (
        (fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1]
          .headers as Record<string, string>
      ).Authorization;
    expect(keyOf(0)).toBe("Bearer first");
    expect(keyOf(1)).toBe("Bearer second");
  });

  it("never reaches the network for a request it would refuse", async () => {
    const fetchMock = vi.fn(async () => new Response(OK_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      askModel("label", [], stubPhotoSurface())
    ).rejects.toBeInstanceOf(ModelUnusableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * **The regression that was live for a release.**
   *
   * The capture array holds data URLs; the Worker re-attaches a preamble of its
   * own (`data:image/jpeg;base64,${image}`). Nothing stripped the first one, so
   * every real read sent `data:image/jpeg;base64,data:image/png;base64,…` and
   * the model saw no image at all. Every fixture on both sides was bare base64,
   * so the whole suite stayed green.
   *
   * Two assertions, because either alone would have passed at the time: that
   * what goes on the wire is bare base64, and that the Worker's own parser
   * accepts it — the parser now refuses a data URL outright.
   */
  it("sends the sealed photographs as bare base64, not as data URLs", async () => {
    stubLocalStorage();
    setSecret("model_route_key", "operator-secret");
    const fetchMock = vi.fn(async () => new Response(OK_BODY, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await askModel("label", [PHOTO, PHOTO_2], stubPhotoSurface());

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string
    );
    for (const image of body.images as string[]) {
      expect(image.startsWith("data:")).toBe(false);
    }
    expect(worker.parseModelRequest(body)).toEqual({
      ok: true,
      task: "label",
      images: [sealedAs(0), sealedAs(1)],
    });
  });

  it("refuses a question whose images are still data URLs", async () => {
    // The gate that would have caught the above. It is the Worker's, because
    // that is the side that re-attaches a preamble.
    expect(
      worker.parseModelRequest({ task: "label", images: [PHOTO] })
    ).toEqual({
      ok: false,
      status: 400,
      message: "Images carry base64, not a data URL",
    });
  });
});
