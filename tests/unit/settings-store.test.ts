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
  settingsStore,
  saveSettings,
  saveFoodTargets,
  nutritionDisplayDecimals,
} from "../../src/lib/stores/settings.store";
import { FOOD_DISPLAY_DECIMALS } from "../../src/lib/food/nutrition";

beforeEach(() => {
  datomsWritable.set([]);
  appendMock.mockClear();
});

describe("settingsStore (latest-datom-wins collapse)", () => {
  it("exposes the three settings keys as strings when empty", () => {
    const s = get(settingsStore);
    expect(typeof s.usda_api_key).toBe("string");
    expect(typeof s.tmdb_api_key).toBe("string");
    expect(typeof s.scraper_proxy_url).toBe("string");
  });

  it("collapses datoms to the latest value per attribute", () => {
    datomsWritable.set([
      { attribute: "settings/usda_api_key", value: "old", time: 1 },
      { attribute: "settings/usda_api_key", value: "new", time: 2 },
      {
        attribute: "settings/scraper_proxy_url",
        value: "https://p/?url=",
        time: 3,
      },
    ]);
    const s = get(settingsStore);
    expect(s.usda_api_key).toBe("new");
    expect(s.scraper_proxy_url).toBe("https://p/?url=");
  });

  it("strips the JSON encoding the ledger stores values with", () => {
    // db.core persists every value as JSON.stringify(value), so the raw column
    // holds a quote-wrapped string. The store must decode it, or the key gets
    // sent to USDA/TMDB as `"key"` (with quotes) and the request 403s.
    datomsWritable.set([
      {
        attribute: "settings/usda_api_key",
        value: JSON.stringify("c5VBKl3eEuiPmtgaJfpcDS60QMBZ7t7gGDNspXt2"),
        time: 1,
      },
      {
        attribute: "settings/scraper_proxy_url",
        value: JSON.stringify("/api/proxy?url="),
        time: 2,
      },
    ]);
    const s = get(settingsStore);
    expect(s.usda_api_key).toBe("c5VBKl3eEuiPmtgaJfpcDS60QMBZ7t7gGDNspXt2");
    expect(s.scraper_proxy_url).toBe("/api/proxy?url=");
  });

  it("keeps an all-digit key as a string rather than coercing to a number", () => {
    datomsWritable.set([
      {
        attribute: "settings/tmdb_api_key",
        value: JSON.stringify("0123456789"),
        time: 1,
      },
    ]);
    const s = get(settingsStore);
    expect(s.tmdb_api_key).toBe("0123456789");
  });

  it("defaults visible_nutrients to Protein/Fat/Carbs/Fibre when unset", () => {
    // A brand-new user (no datom) must still see a Fibre meter alongside the
    // three macros — the default is baked into the collapse, not the view.
    const s = get(settingsStore);
    expect(s.visible_nutrients).toEqual([
      "protein",
      "fat",
      "carbs",
      "fiber_content",
    ]);
  });

  it("decodes a stored visible_nutrients list back to an array", () => {
    // The list is a JSON-encoded array (not an opaque string), so it must decode
    // to the array rather than String()-flatten to "protein,fiber_content".
    datomsWritable.set([
      {
        attribute: "settings/food/visible_nutrients",
        value: JSON.stringify(["protein", "fiber_content", "calcium"]),
        time: 1,
      },
    ]);
    const s = get(settingsStore);
    expect(s.visible_nutrients).toEqual([
      "protein",
      "fiber_content",
      "calcium",
    ]);
  });

  it("honours an explicitly empty visible_nutrients list", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/visible_nutrients",
        value: JSON.stringify([]),
        time: 1,
      },
    ]);
    expect(get(settingsStore).visible_nutrients).toEqual([]);
  });

  it("falls back to the default when visible_nutrients is malformed", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/visible_nutrients",
        value: JSON.stringify("not-an-array"),
        time: 1,
      },
    ]);
    expect(get(settingsStore).visible_nutrients).toEqual([
      "protein",
      "fat",
      "carbs",
      "fiber_content",
    ]);
  });

  it("defaults round_nutrition to false (exact display) when unset", () => {
    expect(get(settingsStore).round_nutrition).toBe(false);
  });

  it("decodes a stored round_nutrition boolean", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/round_nutrition",
        value: JSON.stringify(true),
        time: 1,
      },
    ]);
    expect(get(settingsStore).round_nutrition).toBe(true);
    datomsWritable.set([
      {
        attribute: "settings/food/round_nutrition",
        value: JSON.stringify(false),
        time: 2,
      },
    ]);
    expect(get(settingsStore).round_nutrition).toBe(false);
  });

  it("treats a malformed round_nutrition value as false (stays exact)", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/round_nutrition",
        value: JSON.stringify("yes"),
        time: 1,
      },
    ]);
    expect(get(settingsStore).round_nutrition).toBe(false);
  });

  it("defaults food_targets to an empty override map when unset", () => {
    // No datom → no overrides; every target resolves to its baked default.
    expect(get(settingsStore).food_targets).toEqual({});
  });

  it("folds a stored food/targets blob back to the override map", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/targets",
        value: JSON.stringify({ protein: 160, calcium: 0, energy: 2200 }),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_targets).toEqual({
      protein: 160,
      calcium: 0,
      energy: 2200,
    });
  });

  it("filters a food/targets blob to reach-toward keys and numeric values", () => {
    // A stray limit-nutrient key or a non-numeric value must never reach the
    // resolver — the collapse drops both.
    datomsWritable.set([
      {
        attribute: "settings/food/targets",
        value: JSON.stringify({
          protein: 160,
          sodium_content: 100, // limit nutrient — not targetable
          calcium: "lots", // non-numeric — dropped
        }),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_targets).toEqual({ protein: 160 });
  });

  it("tolerates a malformed food/targets value (folds to empty)", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/targets",
        value: JSON.stringify("not-an-object"),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_targets).toEqual({});
  });

  it("reflects reactive updates to the underlying datoms", () => {
    datomsWritable.set([
      { attribute: "settings/tmdb_api_key", value: "k1", time: 1 },
    ]);
    expect(get(settingsStore).tmdb_api_key).toBe("k1");
    datomsWritable.set([
      { attribute: "settings/tmdb_api_key", value: "k2", time: 2 },
    ]);
    expect(get(settingsStore).tmdb_api_key).toBe("k2");
  });
});

describe("nutritionDisplayDecimals (derived display precision)", () => {
  it("is the full display precision by default (exact mode)", () => {
    expect(get(nutritionDisplayDecimals)).toBe(FOOD_DISPLAY_DECIMALS);
  });

  it("drops to 0 places when whole-number display is enabled", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/round_nutrition",
        value: JSON.stringify(true),
        time: 1,
      },
    ]);
    expect(get(nutritionDisplayDecimals)).toBe(0);
  });
});

describe("saveSettings", () => {
  it("appends one datom per settings attribute to settings:global", async () => {
    await saveSettings({
      usda_api_key: "U",
      tmdb_api_key: "T",
      scraper_proxy_url: "P",
      visible_nutrients: ["protein", "fat", "carbs", "fiber_content"],
      round_nutrition: false,
    });
    expect(appendMock).toHaveBeenCalledTimes(1);
    const datoms = appendMock.mock.calls[0][0] as any[];
    expect(datoms.every((d) => d.entity === "settings:global")).toBe(true);
    const byAttr = Object.fromEntries(
      datoms.map((d) => [d.attribute, d.value])
    );
    expect(byAttr["settings/usda_api_key"]).toBe("U");
    expect(byAttr["settings/tmdb_api_key"]).toBe("T");
    expect(byAttr["settings/scraper_proxy_url"]).toBe("P");
  });

  it("persists the chosen nutrient list as an array datom", async () => {
    await saveSettings({
      usda_api_key: "U",
      tmdb_api_key: "T",
      scraper_proxy_url: "P",
      visible_nutrients: ["protein", "calcium"],
      round_nutrition: false,
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const byAttr = Object.fromEntries(
      datoms.map((d) => [d.attribute, d.value])
    );
    // The value is the array itself (ingest/db.core JSON-encode on write); the
    // collapse decodes it back, so the round trip returns the same list.
    expect(byAttr["settings/food/visible_nutrients"]).toEqual([
      "protein",
      "calcium",
    ]);
  });

  it("persists the round_nutrition boolean", async () => {
    await saveSettings({
      usda_api_key: "U",
      tmdb_api_key: "T",
      scraper_proxy_url: "P",
      visible_nutrients: ["protein"],
      round_nutrition: true,
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const byAttr = Object.fromEntries(
      datoms.map((d) => [d.attribute, d.value])
    );
    expect(byAttr["settings/food/round_nutrition"]).toBe(true);
  });

  it("does not write the food/targets datom (targets ride their own writer)", async () => {
    // Toggling visibility/rounding must never touch a user's targets (ADR-0031
    // §2): saveSettings writes only the credentials + the two display datoms.
    await saveSettings({
      usda_api_key: "U",
      tmdb_api_key: "T",
      scraper_proxy_url: "P",
      visible_nutrients: ["protein"],
      round_nutrition: false,
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const attrs = datoms.map((d) => d.attribute);
    expect(attrs).not.toContain("settings/food/targets");
  });
});

describe("saveFoodTargets", () => {
  it("appends only the food/targets datom, independent of the other settings", async () => {
    await saveFoodTargets({ protein: 160, calcium: 0 });
    expect(appendMock).toHaveBeenCalledTimes(1);
    const datoms = appendMock.mock.calls[0][0] as any[];
    expect(datoms).toHaveLength(1);
    const [datom] = datoms;
    expect(datom.entity).toBe("settings:global");
    expect(datom.attribute).toBe("settings/food/targets");
    // The value is the map itself (ingest/db.core JSON-encode on write); the
    // collapse decodes and re-filters it back on read.
    expect(datom.value).toEqual({ protein: 160, calcium: 0 });
  });
});
