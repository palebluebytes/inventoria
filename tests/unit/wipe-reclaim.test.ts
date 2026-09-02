import { describe, it, expect } from "vitest";
import { readCode } from "./support/source";

/**
 * The wiring behind #290, claimed structurally.
 *
 * The behaviour itself is split across three places that cannot be rendered
 * here. `StorageStatus` reads `navigator.storage`, which the Node runner does
 * not have; the Settings screen's wipe goes through `confirm`/`alert`; and the
 * figure only moves against a real OPFS file. What each of those *is* — a
 * vacuum attempted after the delete has committed, a message that claims the
 * half that cannot fail, and a readout told when its screen is being looked at
 * — is visible in the source, and that is what is pinned. The engine-level
 * claim (page and freelist collapse) lives in `db-append-only.test.ts`, and the
 * worker message in `db-client.test.ts`.
 *
 * Comments are stripped before matching, so a sentence in a doc comment cannot
 * satisfy a claim about code.
 */

const APP = readCode("src/App.svelte");
const SETTINGS = readCode("src/lib/views/SettingsView.svelte");
const STORAGE = readCode("src/lib/views/storage/StorageStatus.svelte");
const STORAGE_MODULE = readCode("src/lib/storage/persistent-storage.ts");
const CORE = readCode("src/lib/db/db.core.ts");
const WORKER = readCode("src/lib/db/db.worker.ts");

const handler = SETTINGS.slice(
  SETTINGS.indexOf("async function wipeDatabase"),
  SETTINGS.indexOf("let showLedger")
);

describe("the reclaim is its own operation (ADR-0079 §4)", () => {
  it("is a ledger-core function beside the reset, not a tail on it", () => {
    expect(CORE).toMatch(/export function vacuumLedger\(db: LedgerDb\): void/);
    // Separate, because #311's Facet-scoped wipe reclaims after a different
    // delete and both must reach one function.
    const reset = CORE.slice(
      CORE.indexOf("export function resetLedgerSchema"),
      CORE.indexOf("export function vacuumLedger")
    );
    expect(reset).not.toMatch(/vacuumLedger|VACUUM/);
  });

  it("crosses the worker boundary as a message of its own", () => {
    expect(WORKER).toMatch(/type === "vacuum"/);
    expect(WORKER).toMatch(/vacuumLedger\(db\)/);
    // A vacuum changes no fact, so no projection has a different answer and
    // nothing is invalidated by it.
    const branch = WORKER.slice(WORKER.indexOf('type === "vacuum"'));
    expect(branch.slice(0, branch.indexOf("} else"))).not.toMatch(
      /broadcast_invalidation/
    );
  });
});

describe("the wipe attempts the reclaim and reports what happened", () => {
  it("commits the delete first, then attempts the vacuum", () => {
    expect(handler.indexOf("dbClient.clear()")).toBeGreaterThan(-1);
    expect(handler.indexOf("dbClient.vacuum()")).toBeGreaterThan(
      handler.indexOf("dbClient.clear()")
    );
  });

  it("lets a failed vacuum leave the rows gone rather than throwing", () => {
    // Its own try/catch: the delete has already committed, so a vacuum that
    // fails is reported, not rolled back and not raised as a failed wipe.
    // Whitespace-flattened, because what is claimed is the shape and not the
    // formatter's opinion of it.
    const flat = handler.replace(/\s+/g, " ");
    expect(flat).toMatch(
      /try \{ await dbClient\.vacuum\(\); \} catch \([^)]*\) \{[^}]*reclaimed = false;/
    );
  });

  it("says the ledger is empty unconditionally and the space conditionally", () => {
    // Both branches open on the half that is true either way, and they differ
    // only on the half that can fail. The spelling is not the claim; that there
    // are two of them, and that only one asserts the space came back, is.
    const messages = [...handler.matchAll(/"(The ledger is empty[^"]*)"/g)].map(
      (m) => m[1]
    );
    expect(messages).toHaveLength(2);
    expect(
      messages.filter((m) => /\bhas been reclaimed\b/.test(m))
    ).toHaveLength(1);
    expect(
      messages.filter((m) => /\bcould not be reclaimed\b/.test(m))
    ).toHaveLength(1);
    // The old message claimed an intention rather than an outcome.
    expect(handler).not.toMatch(/wiped successfully/);
  });
});

describe("the storage readout is told when its screen is looked at", () => {
  it("takes the root's active tab, threaded through Settings", () => {
    expect(APP).toMatch(/<SettingsView[^>]*shown=\{activeTab === "settings"\}/);
    expect(SETTINGS).toMatch(/<StorageStatus[^>]*\{shown\}/);
  });

  it("re-reads on that prop rather than on a mount that happens once", () => {
    expect(STORAGE).toMatch(
      /let \{ shown \}: \{ shown: boolean \} = \$props\(\)/
    );
    expect(STORAGE.replace(/\s+/g, " ")).toMatch(
      /\$effect\(\(\) => \{ if \(!shown\) return; read\(\); \}\)/
    );
    // Both halves are in the one reading: ADR-0065 §2 wants the reading fresh,
    // and the request it waits on is memoised so re-running it asks the browser
    // nothing. The request now sits inside `refreshPersistenceState`, which is
    // where Rations' own badge reaches it too (#335), so the claim follows it
    // into `storage/persistent-storage.ts` rather than being dropped.
    const read = STORAGE.slice(STORAGE.indexOf("export function read()"));
    expect(read).toMatch(/refreshPersistenceState\(\)/);
    expect(read).toMatch(/readStorageEstimate\(\)/);
    const refresh = STORAGE_MODULE.slice(
      STORAGE_MODULE.indexOf("export function refreshPersistenceState")
    );
    expect(refresh.slice(0, refresh.indexOf("}"))).toMatch(
      /ensurePersistentStorage\(\)[\s.]*then\(\(\) => readPersistenceState\(\)\)/
    );
  });

  it("can also be asked directly, because a wipe never changes that prop", () => {
    // The button is on this same card, so `shown` is `true` before the wipe and
    // `true` after it, and the effect above never re-runs. Without this the
    // ticket's own case — wipe, dismiss, look at the figure — stays frozen.
    expect(STORAGE).toMatch(/export function read\(\)/);
    expect(SETTINGS).toMatch(/<StorageStatus[^>]*bind:this=\{storage\}/);
    expect(handler).toMatch(/storage\?\.read\(\)/);
  });

  it("is not driven by the worker's invalidation broadcast", () => {
    // Every append broadcasts, and the readout must not churn while it is being
    // read.
    expect(STORAGE).not.toMatch(/onInvalidate|dbClient/);
  });
});
