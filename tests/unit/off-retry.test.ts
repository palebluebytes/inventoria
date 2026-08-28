import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookupBarcodeWithRetry } from "../../src/lib/food/off-retry";
import {
  ProductNotFoundError,
  OffUnreachableError,
} from "../../src/lib/food/open-food-facts";
import {
  offAnswering,
  offFailingWith,
  offHoldingTestFood,
  TEST_BARCODE,
} from "./support/off-responses";

// The one retry over a barcode lookup Open Food Facts did not answer (#206).
// #204 stopped a blip lying about the product; this stops the user seeing the
// blip. The whole question is WHICH failures are asked again, so every test
// below counts the calls: a settled answer asked twice is the defect, exactly as
// much as an outage asked once.

describe("lookupBarcodeWithRetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A clock the test owns, so the suite pays no real backoff and can read back
   * the wait the retry asked for rather than serving it. `spend` is what a slow
   * first attempt burns; `waited` is only what the retry itself paused for.
   */
  function fakeClock() {
    let ms = 0;
    const waited: number[] = [];
    return {
      waited,
      elapsed: () => ms,
      spend: (by: number) => {
        ms += by;
      },
      now: () => ms,
      sleep: async (by: number) => {
        waited.push(by);
        ms += by;
      },
    };
  }

  /** A fetch answering each call from `answers`, in order. */
  function offAnswers(...answers: (Response | Error)[]) {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const answer of answers) {
      if (answer instanceof Error) fetchSpy.mockRejectedValueOnce(answer);
      else fetchSpy.mockResolvedValueOnce(answer);
    }
    return fetchSpy;
  }

  it("shows the product when the second ask lands, with no failure in between", async () => {
    // The common case the ticket is for: OFF hiccups, the retry succeeds, and
    // the scan simply works. The caller is never handed the 503 to render.
    const clock = fakeClock();
    const fetchSpy = offAnswers(offFailingWith(503), offHoldingTestFood());

    const payload = await lookupBarcodeWithRetry(TEST_BARCODE, clock);

    expect(payload.entity).toBe(`gtin:${TEST_BARCODE}`);
    expect(payload.attributes["food/name"]).toBe("Test Food");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("pauses once before asking again, for well under a second", async () => {
    // The wait this adds is the wait it is allowed to bound: both fetches here
    // answer instantly, so `elapsed` is the pause and nothing else. It has to
    // read as the same wait as the scan rather than a second one.
    const clock = fakeClock();
    offAnswers(offFailingWith(429), offHoldingTestFood());

    await lookupBarcodeWithRetry(TEST_BARCODE, clock);

    expect(clock.waited).toHaveLength(1);
    expect(clock.waited[0]).toBeGreaterThan(0);
    expect(clock.elapsed()).toBeLessThanOrEqual(1000);
  });

  it("gives up after one retry and still says the service did not answer", async () => {
    // One retry, not a loop — a second failure is the answer, and #204's
    // unreachable state is where the user decides whether to wait longer. The
    // status is the SECOND one, because that is the one that survived.
    const clock = fakeClock();
    const fetchSpy = offAnswers(offFailingWith(503), offFailingWith(502));

    const survived = lookupBarcodeWithRetry(TEST_BARCODE, clock);
    await expect(survived).rejects.toBeInstanceOf(OffUnreachableError);
    await expect(survived).rejects.toMatchObject({ status: 502 });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not ask a 404 twice — the missing door opens as promptly as ever", async () => {
    // A settled answer. Asking again cannot change it, costs the user the
    // backoff before the capture form appears, and spends OFF's rate limit on a
    // question already answered.
    const clock = fakeClock();
    const fetchSpy = offAnswers(offFailingWith(404), offHoldingTestFood());

    await expect(
      lookupBarcodeWithRetry("9999999", clock)
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(clock.waited).toEqual([]);
  });

  it("does not ask v3's `status: failure` twice either", async () => {
    // The same settled answer wearing a 200. It reaches the caller by the same
    // route the 404 does, so it must not be retried by a different one.
    const clock = fakeClock();
    const fetchSpy = offAnswers(
      offAnswering({ status: "failure" }),
      offHoldingTestFood()
    );

    await expect(lookupBarcodeWithRetry("000", clock)).rejects.toBeInstanceOf(
      ProductNotFoundError
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(clock.waited).toEqual([]);
  });

  it.each([400, 403])(
    "does not ask a fault it cannot name (%i) twice",
    async (status) => {
      // #204 kept this class out of "the service failed to answer" precisely
      // because nothing about it says a second identical request answers
      // differently.
      const clock = fakeClock();
      const fetchSpy = offAnswers(offFailingWith(status), offHoldingTestFood());

      await expect(
        lookupBarcodeWithRetry(TEST_BARCODE, clock)
      ).rejects.not.toBeInstanceOf(OffUnreachableError);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(clock.waited).toEqual([]);
    }
  );

  it("does not ask again when nothing was asked in the first place", async () => {
    // A transport-level rejection: the offline scan. There is no answer to
    // re-ask for, and offline does not clear inside a backoff — it would only
    // delay the same banner.
    const clock = fakeClock();
    const offline = new TypeError("Failed to fetch");
    const fetchSpy = offAnswers(offline, offHoldingTestFood());

    await expect(lookupBarcodeWithRetry(TEST_BARCODE, clock)).rejects.toBe(
      offline
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(clock.waited).toEqual([]);
  });

  it("does not start a second attempt once the first has eaten the deadline", async () => {
    // A first attempt slow enough to have used the window has already spent the
    // patience a scan has. Waiting more here would read as a hang, so the
    // unreachable state goes up and the next wait is the user's to choose.
    const clock = fakeClock();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        clock.spend(60_000);
        return offFailingWith(503);
      });
    fetchSpy.mockResolvedValueOnce(offHoldingTestFood());

    await expect(
      lookupBarcodeWithRetry(TEST_BARCODE, clock)
    ).rejects.toBeInstanceOf(OffUnreachableError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(clock.waited).toEqual([]);
  });
});
