/**
 * A session syncs more than once, and a deposit follows the data (ADR-0096 §3
 * as amended 2026-09-06 and 2026-09-12).
 *
 * The requirement every case below answers to:
 *
 * > **A user may close any device at any moment, and a device opened later
 * > picks up exactly where they left off.**
 *
 * Which rules out the obvious reading. There is no dependable end of a session,
 * so a deposit fired at _open_ goes out before that session's meals exist —
 * three meals logged at 09:13 and a laptop opened at 14:00 would converge on
 * nothing.
 *
 * Nothing here touches a store or a ledger: the two syncs are `wake.ts`'s and
 * are proved against two real ledgers over the real route in `wake.test.ts`.
 * What is under test is **when** they run, which is the whole of what this
 * ticket adds — so the work is a pair of tallies and the two signals are
 * called by hand.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  openWake,
  COLLECTION_FLOOR_MS,
  DEPOSIT_DEBOUNCE_MS,
  type OpenWake,
  type WakeRound,
} from "../../src/lib/p2p/wake-cadence";

/** A sync that found nothing, acknowledged nothing and owes nothing. */
const QUIET: WakeRound = { owed: false };

/**
 * The two syncs, the two signals, and a tally of each — stood up by hand rather
 * than mocked, because what these cases want to say is "it deposited twice".
 */
function wakeBench() {
  let grew: (() => void) | null = null;
  let hidden: (() => void) | null = null;
  let gate: Promise<void> | null = null;
  const answers: WakeRound[] = [];
  const tally = { converge: 0, deposit: 0, unsubscribed: 0 };

  return {
    tally,
    /** What the next collection reports, so a case can owe a peer a word. */
    answer: (round: WakeRound) => answers.push(round),
    /** The ledger grew: a meal was logged, or a collection imported rows. */
    grow: () => grew?.(),
    /** The app was hidden — the last moment there is, and it is best-effort. */
    hide: () => hidden?.(),
    /** Holds the next collection open, for the case about one sync at a time. */
    holdCollection: () => {
      let release = (): void => {};
      gate = new Promise<void>((open) => (release = open));
      return () => {
        gate = null;
        release();
      };
    },
    work: {
      converge: async (): Promise<WakeRound> => {
        tally.converge += 1;
        if (gate) await gate;
        return answers.shift() ?? QUIET;
      },
      deposit: async (): Promise<void> => {
        tally.deposit += 1;
      },
      onLedgerGrowth: (call: () => void) => {
        grew = call;
        return () => {
          grew = null;
          tally.unsubscribed += 1;
        };
      },
      onHide: (call: () => void) => {
        hidden = call;
        return () => {
          hidden = null;
          tally.unsubscribed += 1;
        };
      },
    },
  };
}

/** Lets every queued sync run, without moving the clock on. */
async function drain(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
}

let open: OpenWake | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  open?.close();
  open = null;
  vi.useRealTimers();
});

describe("a wake collects on the open, and that is the promise", () => {
  it("collects once, unconditionally, before anything has changed", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    expect(bench.tally).toMatchObject({ converge: 1, deposit: 0 });
  });
});

describe("a deposit is triggered by the delta growing", () => {
  it("waits out the debounce, then goes once for a burst of meals", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    bench.grow();
    bench.grow();
    await vi.advanceTimersByTimeAsync(DEPOSIT_DEBOUNCE_MS - 1);
    expect(bench.tally.deposit).toBe(0);

    bench.grow();
    await vi.advanceTimersByTimeAsync(DEPOSIT_DEBOUNCE_MS);

    // Three meals in one open are one deposit — and, because the index advances
    // on collection, a rewrite at the address the open's own deposit used.
    expect(bench.tally.deposit).toBe(1);
  });

  it("deposits nothing while nothing is logged", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await vi.advanceTimersByTimeAsync(DEPOSIT_DEBOUNCE_MS * 10);

    expect(bench.tally.deposit).toBe(0);
  });
});

describe("a meal logged and the app closed within seconds is not left behind", () => {
  it("flushes on hide, without waiting the debounce out", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    bench.grow();
    bench.hide();
    await drain();

    expect(bench.tally.deposit).toBe(1);
  });

  it("does not deposit again when the debounce would have fired", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    bench.grow();
    bench.hide();
    await vi.advanceTimersByTimeAsync(DEPOSIT_DEBOUNCE_MS * 2);

    expect(bench.tally.deposit).toBe(1);
  });

  it("spends nothing on a hide with nothing pending", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    bench.hide();
    bench.hide();
    await drain();

    expect(bench.tally.deposit).toBe(0);
  });
});

describe("a collection is a floor rather than a schedule", () => {
  it("does not collect again inside the hour, however much is logged", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    for (let minute = 0; minute < 59; minute += 1) {
      bench.grow();
      await vi.advanceTimersByTimeAsync(60_000);
    }

    expect(bench.tally.converge).toBe(1);
  });

  it("collects again on the hour once something has changed locally", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    bench.grow();
    await vi.advanceTimersByTimeAsync(COLLECTION_FLOOR_MS);

    expect(bench.tally.converge).toBe(2);
  });

  it("skips when nothing has changed locally and nothing is owed", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await vi.advanceTimersByTimeAsync(COLLECTION_FLOOR_MS * 3);

    expect(bench.tally.converge).toBe(1);
  });

  it("does not skip while a peer is owed an acknowledgement", async () => {
    const bench = wakeBench();
    bench.answer({ owed: true });
    open = openWake(bench.work);
    await drain();

    // Nothing has been logged here, so the first clause alone would skip — and
    // a take that goes unacknowledged makes no progress on the next wake
    // either, because the depositor is still rewriting at that index.
    await vi.advanceTimersByTimeAsync(COLLECTION_FLOOR_MS);

    expect(bench.tally.converge).toBe(2);
  });

  it("keeps collecting while the peer's rows keep arriving", async () => {
    const bench = wakeBench();
    open = openWake({
      ...bench.work,
      // A collection that brings rows **is** a local change, and the import is
      // what fires this signal in the app. It is what keeps the propped-open
      // tablet refreshing while the phone beside it is being used.
      converge: async () => {
        const round = await bench.work.converge();
        bench.grow();
        return round;
      },
    });
    await drain();

    await vi.advanceTimersByTimeAsync(COLLECTION_FLOOR_MS * 3);

    expect(bench.tally.converge).toBe(4);
  });
});

describe("a wake is one wake however many syncs it runs", () => {
  it("polls eight times against an absent peer and is still one wake", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    for (let hour = 0; hour < 8; hour += 1) {
      bench.grow();
      await vi.advanceTimersByTimeAsync(COLLECTION_FLOOR_MS);
    }

    // §11's counter is in wakes and never in syncs, or K = 200 quietly becomes
    // K = 25. This module's half of that is that one `openWake` is one wake
    // however many syncs run through it; `wake-counter.test.ts` holds the
    // other, which is that those nine syncs burn one wake between them.
    expect(bench.tally.converge).toBe(9);
  });
});

describe("one sync at a time, because two would race one lane", () => {
  it("holds a deposit behind the collection already running", async () => {
    const bench = wakeBench();
    const release = bench.holdCollection();
    open = openWake(bench.work);
    await drain();

    bench.grow();
    await vi.advanceTimersByTimeAsync(DEPOSIT_DEBOUNCE_MS);
    expect(bench.tally).toMatchObject({ converge: 1, deposit: 0 });

    release();
    await drain();

    expect(bench.tally.deposit).toBe(1);
  });
});

describe("closing the wake stops everything it started", () => {
  it("drops both signals and both timers", async () => {
    const bench = wakeBench();
    open = openWake(bench.work);
    await drain();

    open.close();
    bench.grow();
    await vi.advanceTimersByTimeAsync(COLLECTION_FLOOR_MS * 2);

    expect(bench.tally).toMatchObject({
      converge: 1,
      deposit: 0,
      unsubscribed: 2,
    });
  });
});
