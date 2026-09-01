import { describe, it, expect } from "vitest";
import {
  buildLabelCapture,
  LABEL_ADAPTER_VERSION,
  buildManualEntry,
  manualEntryIsReusable,
  MANUAL_ENTRY_ADAPTER_VERSION,
  buildArrival,
  ARRIVAL_ADAPTER_VERSION,
} from "../../src/lib/food/provenance";

// The label-capture envelope (ADR-0034 §7) is a PURE, deterministic, clock-free
// value — a sibling of provenance/raw. These assert exactly that: fixed
// input → fixed output, no clock, and no photo base64 ever embedded (photos live
// once in food/label_photos[]).
describe("buildLabelCapture (food/label_capture, ADR-0034 §7)", () => {
  it("stamps the label adapter + version and passes the fields through", () => {
    const env = buildLabelCapture({
      method: "manual",
      basis: "100 g",
      fields: ["name", "nutriments", "portions"],
    });

    expect(env).toEqual({
      adapter: "label",
      adapter_version: LABEL_ADAPTER_VERSION,
      method: "manual",
      basis: "100 g",
      fields: ["name", "nutriments", "portions"],
    });
  });

  it("is deterministic and clock-free — two calls with the same input are identical", () => {
    const args = {
      method: "ai-confirmed" as const,
      basis: "1 serving",
      fields: ["name"],
    };
    expect(buildLabelCapture(args)).toEqual(buildLabelCapture(args));
  });

  it("carries the deferred ai-confirmed method and an arbitrary serving basis verbatim", () => {
    const env = buildLabelCapture({
      method: "ai-confirmed",
      basis: "30 g",
      fields: ["nutriments"],
    });
    expect(env.method).toBe("ai-confirmed");
    expect(env.basis).toBe("30 g");
  });

  it("never embeds photo base64 — photos are referenced from food/label_photos, not duplicated here", () => {
    const env = buildLabelCapture({
      method: "manual",
      basis: "100 g",
      fields: ["name", "nutriments"],
    });
    // The envelope has exactly the metadata keys and nothing that could carry a
    // base64 image blob.
    expect(Object.keys(env).sort()).toEqual([
      "adapter",
      "adapter_version",
      "basis",
      "fields",
      "method",
    ]);
    const asText = JSON.stringify(env);
    expect(asText).not.toContain("base64");
    expect(asText).not.toContain("data:image");
  });
});

// The manual-entry envelope (ADR-0035 §6) is the sibling of label_capture for the
// Custom chooser's three intents — equally pure, deterministic and clock-free.
describe("buildManualEntry (food/manual_entry, ADR-0035 §6)", () => {
  it("stamps the manual adapter + version and passes kind/fields through", () => {
    const env = buildManualEntry({
      kind: "menu",
      fields: ["name", "calories", "ingredients"],
    });

    expect(env).toEqual({
      adapter: "manual",
      adapter_version: MANUAL_ENTRY_ADAPTER_VERSION,
      kind: "menu",
      fields: ["name", "calories", "ingredients"],
    });
  });

  it("is deterministic and clock-free — two calls with the same input are identical", () => {
    const args = { kind: "quick_estimate" as const, fields: ["calories"] };
    expect(buildManualEntry(args)).toEqual(buildManualEntry(args));
  });

  it("carries each intent kind verbatim", () => {
    expect(buildManualEntry({ kind: "plate_estimate", fields: [] }).kind).toBe(
      "plate_estimate"
    );
  });

  it("never embeds photo base64 — a photo-bearing intent references its photo elsewhere", () => {
    const env = buildManualEntry({ kind: "quick_estimate", fields: ["name"] });
    const asText = JSON.stringify(env);
    expect(asText).not.toContain("base64");
    expect(asText).not.toContain("data:image");
  });
});

// The one reusability rule the whole Recent/Search filter keys off (ADR-0035 §6).
describe("manualEntryIsReusable (the single Recent/Search rule)", () => {
  it("treats only a menu dish as a reusable catalogue food", () => {
    expect(manualEntryIsReusable("menu")).toBe(true);
  });

  it("treats a quick estimate and a plate estimate as one-offs", () => {
    expect(manualEntryIsReusable("quick_estimate")).toBe(false);
    expect(manualEntryIsReusable("plate_estimate")).toBe(false);
  });
});

// The third sibling (ADR-0073 §11): the mark a food carries because somebody
// sent you a meal. Unlike the two above it is NOT clock-free — the datom's own
// `time` is the accept, and the food itself is older than this device can know —
// but the clock is still a PARAMETER, so one accept stamps every food of the
// meal with the one moment it arrived.
describe("buildArrival (food/arrival, ADR-0073 §11)", () => {
  it("stamps the send adapter, its version and the moment it arrived", () => {
    expect(buildArrival(1_756_600_000_000)).toEqual({
      adapter: "send",
      adapter_version: ARRIVAL_ADAPTER_VERSION,
      received_at: 1_756_600_000_000,
    });
  });

  it("records how the food came to be here and never who sent it", () => {
    // Sender identity exists nowhere: not in the ledger, not in the envelope,
    // not in the receiving view. The envelope is three fields and that is all.
    expect(Object.keys(buildArrival(1_756_600_000_000)).sort()).toEqual([
      "adapter",
      "adapter_version",
      "received_at",
    ]);
  });

  it("is deterministic — the same moment builds the same envelope", () => {
    expect(buildArrival(1_756_600_000_000)).toEqual(
      buildArrival(1_756_600_000_000)
    );
  });
});
