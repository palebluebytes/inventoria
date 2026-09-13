/**
 * The jar-wide wipe unpairs, and the order is the argument (ADR-0096 §12).
 *
 * The claims the ticket turns on are all here: that the mark lands **before**
 * the ledger is dropped, that a clear which failed stops everything after it,
 * that exactly two `localStorage` records go and every other one stands, that
 * the withdrawal is last and best-effort, and that both sentences count.
 *
 * The seams are injected, so none of this needs a Worker or a network. What a
 * first sync then does with an emptied ledger — *re-pairing pulls it all back*
 * — is `first-sync.test.ts`'s, because the point of that claim is that it is a
 * normal first sync with no special path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  stubLocalStorage,
  freshModule,
  type FakeLocalStorage,
} from "./support/local-storage";
import { CHAIN_STATE_BYTES } from "../../src/lib/p2p/pairing-chain";

// `jar-wipe.ts` reaches the worker RPC only to build its default seams, and
// every test here injects its own.
vi.mock("../../src/lib/db/db.client", () => ({ dbClient: {} }));

type JarWipe = typeof import("../../src/lib/jar-wipe");

const PAIRINGS = "inventoria_paired_devices";
const NOTICE = "inventoria_carried_deletion";

/** One Paired Device record, in the shape the store's own guard admits. */
const pairing = (device_id: string, revoked = false) => ({
  device_id,
  name: null,
  deposit: {
    direction: "a2b",
    state: btoa("\0".repeat(CHAIN_STATE_BYTES)),
    index: 0,
  },
  collect: {
    direction: "b2a",
    state: btoa("\0".repeat(CHAIN_STATE_BYTES)),
    index: 0,
  },
  peer_vector: {},
  deposit_standing: null,
  peer_roster: null,
  unproductive_wakes: 0,
  last_met: "2026-09-13",
  revoked,
});

/**
 * Every other key on the census, so "it takes two records" is checked against
 * what actually stands rather than against a promise.
 */
const BYSTANDERS = {
  inventoria_pref_food_targets: '{"energy":2000}',
  inventoria_pref_visible_nutrients: '["energy"]',
  inventoria_secret_tmdb_api_key: '"abc"',
  inventoria_log_app: "[]",
  inventoria_log_app_counters: "{}",
  inventoria_logs_level: "9",
  inventoria_test_state: "{}",
  inventoria_habit_categories: '["Health"]',
};

let jar: FakeLocalStorage;

/** The module reads its jar at import, so the two happen in that order. */
async function opened(
  seed: Record<string, string> = {}
): Promise<[JarWipe, FakeLocalStorage]> {
  jar = stubLocalStorage({ seed: { ...BYSTANDERS, ...seed } });
  const mod = await freshModule<JarWipe>(
    () => import("../../src/lib/jar-wipe")
  );
  return [mod, jar];
}

/** Seams that record the order they were called in. */
function seams(
  over: Partial<
    Record<
      "clearLedger" | "reclaimSpace" | "withdrawLanes",
      () => Promise<void>
    >
  > = {}
) {
  const order: string[] = [];
  const step = (name: string, run?: () => Promise<void>) => async () => {
    order.push(name);
    if (run) await run();
  };
  return {
    order,
    seams: {
      clearLedger: step("clear", over.clearLedger),
      reclaimSpace: step("reclaim", over.reclaimSpace),
      withdrawLanes: step("withdraw", over.withdrawLanes),
    },
  };
}

const held = (store: FakeLocalStorage) => [...store.store.keys()].sort();

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("the order is the argument, and it inverts the Facet wipe's", () => {
  it("marks every pairing before the ledger is dropped", async () => {
    const [wipe, store] = await opened({
      [PAIRINGS]: JSON.stringify([pairing("dev_b"), pairing("dev_c")]),
    });
    const marked: string[] = [];
    const run = seams({
      // Read at the moment the clear runs: by then no lane may be served.
      clearLedger: async () => {
        for (const row of JSON.parse(store.store.get(PAIRINGS)!)) {
          if (row.revoked) marked.push(row.device_id);
        }
      },
    });

    const ended = await wipe.runJarWipe(run.seams);

    expect(marked).toEqual(["dev_b", "dev_c"]);
    expect(ended.kind).toBe("wiped");
    expect(run.order).toEqual(["clear", "reclaim", "withdraw"]);
  });

  it("counts the pairings it severed, and not the ones already pending", async () => {
    const [wipe] = await opened({
      [PAIRINGS]: JSON.stringify([
        pairing("dev_b"),
        pairing("dev_c", true),
        pairing("dev_d"),
      ]),
    });

    const ended = await wipe.runJarWipe(seams().seams);

    // `dev_c` was already a pending revocation the same sweep was going to
    // finish, so this act did not sever it.
    expect(ended.kind === "wiped" && ended.pairingsRevoked).toBe(2);
  });

  it("stops at a clear that failed, with the pairings severed and the ledger standing", async () => {
    const [wipe, store] = await opened({
      [PAIRINGS]: JSON.stringify([pairing("dev_b")]),
    });
    const run = seams({
      clearLedger: async () => {
        throw new Error("disk went away");
      },
    });

    const ended = await wipe.runJarWipe(run.seams);

    expect(ended.kind).toBe("failed");
    expect(ended.kind === "failed" && ended.message).toBe(
      "Failed to wipe database"
    );
    // Neither the reclaim nor the withdrawal ran, and the record is still here
    // carrying its marks — which is what makes pressing the button again a
    // repair rather than a second half-act.
    expect(run.order).toEqual(["clear"]);
    expect(store.store.has(PAIRINGS)).toBe(true);
  });
});

describe("what it takes outside the ledger, and what it leaves", () => {
  it("takes the pairings and the carried-deletion notice, and nothing else", async () => {
    const [wipe, store] = await opened({
      [PAIRINGS]: JSON.stringify([pairing("dev_b")]),
      [NOTICE]: JSON.stringify({ names: ["Food"], datoms: 412 }),
    });

    await wipe.runJarWipe(
      // A withdrawal that lands takes the row with it, which is the ordinary
      // sweep's third phase.
      seams({ withdrawLanes: async () => void store.store.delete(PAIRINGS) })
        .seams
    );

    expect(held(store)).toEqual(Object.keys(BYSTANDERS).sort());
  });

  it("leaves a preference, a secret, a log channel and the dial standing", async () => {
    const [wipe, store] = await opened();
    await wipe.runJarWipe(seams().seams);

    // A preference left behind is a preference, not a resurrection. Only the
    // two records that would make the wipe a lie are taken.
    expect(held(store)).toEqual(Object.keys(BYSTANDERS).sort());
  });
});

describe("the withdrawal is last, and it is best-effort", () => {
  it("reports what is still owed when it could not land", async () => {
    const [wipe] = await opened({
      [PAIRINGS]: JSON.stringify([pairing("dev_b"), pairing("dev_c")]),
    });

    // The real sweep catches per-row failures and resolves, leaving the marks.
    const ended = await wipe.runJarWipe(seams().seams);

    expect(ended.kind === "wiped" && ended.withdrawalsPending).toBe(2);
    expect(ended.kind === "wiped" && ended.message).toContain(
      "2 are still being cleared up"
    );
  });

  it("claims the whole act when every withdrawal landed", async () => {
    const [wipe, store] = await opened({
      [PAIRINGS]: JSON.stringify([pairing("dev_b")]),
    });

    const ended = await wipe.runJarWipe(
      seams({ withdrawLanes: async () => void store.store.delete(PAIRINGS) })
        .seams
    );

    expect(ended.kind === "wiped" && ended.withdrawalsPending).toBe(0);
    expect(ended.kind === "wiped" && ended.message).not.toContain("cleared up");
  });
});

describe("it leaves one mark of itself, because it destroys every other", () => {
  it("records the act on the app channel at a level the default dial keeps", async () => {
    const [wipe] = await opened({
      [PAIRINGS]: JSON.stringify([pairing("dev_b")]),
    });

    await wipe.runJarWipe(seams().seams);

    // `console.info` is `appInfo`'s half of ADR-0092 §5.3's one call site, both
    // outputs. The record itself lands in `inventoria_log_app`, which this
    // wipe deliberately does not take.
    expect(console.info).toHaveBeenCalledWith(
      "jar wipe: the ledger was emptied and 1 pairing(s) were severed"
    );
    expect(jar.store.has("inventoria_log_app")).toBe(true);
  });
});

describe("the confirmation counts before it acts", () => {
  it("reads exactly as it always did on a jar that was never paired", async () => {
    const [wipe] = await opened();
    expect(wipe.jarWipeConfirmation(0)).toBe(
      "Are you sure you want to completely wipe the database? This cannot be undone."
    );
  });

  it("names the count and what pairing again would do", async () => {
    const [wipe] = await opened();
    expect(wipe.jarWipeConfirmation(1)).toContain(
      "It will also unpair 1 device"
    );
    expect(wipe.jarWipeConfirmation(2)).toContain(
      "It will also unpair 2 devices"
    );
  });

  it("stops saying the other device where there is more than one", async () => {
    // ADR-0096 §10: past one pairing that phrase names one of several, and
    // what comes back comes back from whichever device is paired with.
    const [wipe] = await opened();
    expect(wipe.jarWipeConfirmation(2)).toContain(
      "copies everything back from whichever device you pair with"
    );
    expect(wipe.jarWipeConfirmation(2)).not.toContain("the other device");
    // The honest half: re-pairing is a first sync, and a first sync is the
    // empty-vector case.
    expect(wipe.jarWipeConfirmation(1)).toContain(
      "copies everything back from the other device"
    );
  });
});

describe("the report claims the half that succeeded and names the half that did not", () => {
  const report = (
    over: Partial<Parameters<JarWipe["jarWipeReport"]>[0]> = {}
  ) => ({
    pairingsRevoked: 0,
    withdrawalsPending: 0,
    reclaimed: true,
    ...over,
  });

  it("says nothing about pairings on a jar that had none", async () => {
    const [wipe] = await opened();
    expect(wipe.jarWipeReport(report())).toBe(
      "The ledger is empty, and the space it was using has been reclaimed."
    );
  });

  it("keeps the reclaim conditional, because only the space can fail", async () => {
    const [wipe] = await opened();
    expect(wipe.jarWipeReport(report({ reclaimed: false }))).toContain(
      "could not be reclaimed"
    );
    // The emptiness is unconditional, because it is true either way.
    expect(wipe.jarWipeReport(report({ reclaimed: false }))).toContain(
      "The ledger is empty."
    );
  });

  it("agrees with itself about one device and about several", async () => {
    const [wipe] = await opened();
    expect(wipe.jarWipeReport(report({ pairingsRevoked: 1 }))).toContain(
      "The paired device has been removed."
    );
    expect(wipe.jarWipeReport(report({ pairingsRevoked: 3 }))).toContain(
      "The paired devices have been removed."
    );
  });

  it("names a single pending withdrawal without a number", async () => {
    const [wipe] = await opened();
    expect(
      wipe.jarWipeReport(report({ pairingsRevoked: 2, withdrawalsPending: 1 }))
    ).toContain(
      "One is still being cleared up, and that finishes the next time you open the app."
    );
  });
});
