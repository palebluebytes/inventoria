import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// Declared via vi.hoisted so the hoisted vi.mock factories can reference them.
const { datomsWritable, appendMock } = vi.hoisted(() => {
  const { writable } = require("svelte/store");
  return {
    datomsWritable: writable([] as any[]),
    appendMock: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/lib/stores/datoms.store", () => ({
  createQueryStore: () => datomsWritable,
}));

vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: { append: appendMock },
}));

import {
  consentStore,
  saveOffContribute,
  saveLogExportConsent,
} from "../../src/lib/stores/consent.store";

const OFF_CONTRIBUTE = "consent:food_off_contribute";
const LOG_EXPORT = "consent:log_export";

/** One consent datom in the shape the query store hands the collapse. */
function granted(entity: string, value: unknown, time = 1) {
  return {
    entity,
    attribute: "consent/granted",
    value: JSON.stringify(value),
    time,
  };
}

beforeEach(() => {
  datomsWritable.set([]);
  appendMock.mockClear();
});

describe("consentStore (ADR-0085: one entity per consent)", () => {
  it("carries the consents and nothing else", () => {
    // A setting is never a datom, so nothing that was on `settings:global`
    // survives on this state — not the targets, not the profile, not a secret.
    const c = get(consentStore) as unknown as Record<string, unknown>;
    expect(Object.keys(c).sort()).toEqual(["log_export", "off_contribute"]);
  });

  it("defaults both consents to false (opt-in) when nothing is recorded", () => {
    // Absent means not granted: ADR-0034 §8 model C and ADR-0054 §4 both promise
    // off by default, and an unwritten consent is the commonest case there is.
    expect(get(consentStore).off_contribute).toBe(false);
    expect(get(consentStore).log_export).toBe(false);
  });

  it("keeps the two consents on separate entities, so neither reads the other", () => {
    // The whole point of one entity each: no entity in the jar has two owners,
    // which is the predicate ADR-0079 §3's scoped wipe is derived from.
    datomsWritable.set([granted(OFF_CONTRIBUTE, true, 1)]);
    expect(get(consentStore).off_contribute).toBe(true);
    expect(get(consentStore).log_export).toBe(false);

    datomsWritable.set([granted(LOG_EXPORT, true, 1)]);
    expect(get(consentStore).off_contribute).toBe(false);
    expect(get(consentStore).log_export).toBe(true);
  });

  it("strips the JSON encoding the ledger stores values with", () => {
    // db.core persists every value as JSON.stringify(value), so the raw column
    // holds an encoded value rather than the value. A boolean is the sharpest
    // case: undecoded, the string "false" is truthy and the consent reads granted.
    datomsWritable.set([granted(OFF_CONTRIBUTE, false)]);
    expect(get(consentStore).off_contribute).toBe(false);
  });

  it("treats a malformed value as not granted, in both consents", () => {
    // Only a literal `true` grants. This is the one direction the fold is
    // allowed to be wrong in: a garbled row can never enable a submission or an
    // export.
    datomsWritable.set([
      granted(OFF_CONTRIBUTE, "on", 1),
      granted(LOG_EXPORT, "yes", 2),
    ]);
    expect(get(consentStore).off_contribute).toBe(false);
    expect(get(consentStore).log_export).toBe(false);
  });

  it("takes the latest datom for an entity, so a withdrawal wins", () => {
    // Rows arrive in HLC order, so the collapse is last-one-wins. A consent
    // withdrawn after it was given must read as withdrawn.
    datomsWritable.set([
      granted(OFF_CONTRIBUTE, true, 1),
      granted(OFF_CONTRIBUTE, false, 2),
    ]);
    expect(get(consentStore).off_contribute).toBe(false);
  });

  it("ignores an abandoned settings datom, never surfacing it on the state", () => {
    // Pre-release, the old `settings:global` rows can still sit in the ledger
    // (an append-only log cannot delete them) and ADR-0085 §7 abandons rather
    // than migrates them. They must simply never be read again.
    datomsWritable.set([
      {
        entity: "settings:global",
        attribute: "settings/off_contribute",
        value: JSON.stringify(true),
        time: 1,
      },
      {
        entity: "settings:global",
        attribute: "settings/log_export",
        value: JSON.stringify(true),
        time: 2,
      },
    ]);
    expect(get(consentStore).off_contribute).toBe(false);
    expect(get(consentStore).log_export).toBe(false);
  });

  it("ignores a consent entity carrying some other attribute", () => {
    // `consent/granted` is the only attribute a consent entity has. A row with
    // another one is not a half-granted consent; it is not a consent at all.
    datomsWritable.set([
      {
        entity: OFF_CONTRIBUTE,
        attribute: "consent/note",
        value: JSON.stringify(true),
        time: 1,
      },
    ]);
    expect(get(consentStore).off_contribute).toBe(false);
  });

  it("reflects reactive updates to the underlying datoms", () => {
    datomsWritable.set([granted(LOG_EXPORT, true, 1)]);
    expect(get(consentStore).log_export).toBe(true);
    datomsWritable.set([granted(LOG_EXPORT, false, 2)]);
    expect(get(consentStore).log_export).toBe(false);
  });
});

describe("recording a consent", () => {
  it("writes saveOffContribute to food's own entity", async () => {
    await saveOffContribute(true);
    expect(appendMock).toHaveBeenCalledTimes(1);
    const datoms = appendMock.mock.calls[0][0] as any[];
    expect(datoms).toHaveLength(1);
    expect(datoms[0].entity).toBe(OFF_CONTRIBUTE);
    expect(datoms[0].attribute).toBe("consent/granted");
    expect(datoms[0].value).toBe(true);
  });

  it("writes saveLogExportConsent to the root's own entity", async () => {
    // The root's door. Rations' export consent is a separate entity
    // (`consent:food_log_export`, ADR-0080 §5) and this writer never speaks for
    // it, which is what stops one Facet granting the other's egress.
    await saveLogExportConsent(true);
    const datoms = appendMock.mock.calls[0][0] as any[];
    expect(datoms).toHaveLength(1);
    expect(datoms[0].entity).toBe(LOG_EXPORT);
    expect(datoms[0].entity).not.toBe("consent:food_log_export");
    expect(datoms[0].attribute).toBe("consent/granted");
  });

  it("records a withdrawal as its own datom rather than deleting one", async () => {
    // The ledger is append-only, and a consent is a recorded act: withdrawing
    // one is another act, at another moment, not the erasure of the first.
    await saveOffContribute(false);
    const datoms = appendMock.mock.calls[0][0] as any[];
    expect(datoms[0].value).toBe(false);
    expect(datoms[0].entity).toBe(OFF_CONTRIBUTE);
  });

  it("touches no entity but its own", async () => {
    await saveOffContribute(true);
    await saveLogExportConsent(true);
    const written = appendMock.mock.calls.flatMap((call: any[]) =>
      (call[0] as any[]).map((d) => d.entity)
    );
    expect(written).toEqual([OFF_CONTRIBUTE, LOG_EXPORT]);
  });
});
