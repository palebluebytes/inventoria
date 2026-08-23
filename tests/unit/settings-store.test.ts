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
  saveFoodLimits,
  saveCalculatorPlan,
  saveLogExportConsent,
  calorieDisplayDecimals,
} from "../../src/lib/stores/settings.store";
import { FOOD_DISPLAY_DECIMALS } from "../../src/lib/food/nutrition";

beforeEach(() => {
  datomsWritable.set([]);
  appendMock.mockClear();
});

describe("settingsStore (latest-datom-wins collapse)", () => {
  it("exposes the non-secret scraper proxy key as a string when empty", () => {
    const s = get(settingsStore);
    expect(typeof s.scraper_proxy_url).toBe("string");
  });

  it("no longer exposes the moved secret keys (they live in localStorage now)", () => {
    // Secrets left the ledger for localStorage (ADR-0034 §8); the settings store
    // must not carry usda/tmdb keys on its shape at all.
    const s = get(settingsStore) as unknown as Record<string, unknown>;
    expect("usda_api_key" in s).toBe(false);
    expect("tmdb_api_key" in s).toBe(false);
  });

  it("collapses datoms to the latest value per attribute", () => {
    datomsWritable.set([
      {
        attribute: "settings/scraper_proxy_url",
        value: "https://old/?url=",
        time: 1,
      },
      {
        attribute: "settings/scraper_proxy_url",
        value: "https://p/?url=",
        time: 3,
      },
    ]);
    const s = get(settingsStore);
    expect(s.scraper_proxy_url).toBe("https://p/?url=");
  });

  it("strips the JSON encoding the ledger stores values with", () => {
    // db.core persists every value as JSON.stringify(value), so the raw column
    // holds a quote-wrapped string. The store must decode it, or the proxy URL
    // is read back with literal quotes.
    datomsWritable.set([
      {
        attribute: "settings/scraper_proxy_url",
        value: JSON.stringify("/api/proxy?url="),
        time: 2,
      },
    ]);
    const s = get(settingsStore);
    expect(s.scraper_proxy_url).toBe("/api/proxy?url=");
  });

  it("ignores an abandoned secret datom, never surfacing it on the state", () => {
    // Pre-release, the old usda/tmdb datoms can still sit in the ledger (an
    // append-only log can't delete them). The collapse must simply never read
    // them again — they don't reappear as a stray property.
    datomsWritable.set([
      {
        attribute: "settings/usda_api_key",
        value: JSON.stringify("abandoned-key"),
        time: 1,
      },
      {
        attribute: "settings/tmdb_api_key",
        value: JSON.stringify("abandoned-key"),
        time: 2,
      },
    ]);
    const s = get(settingsStore) as unknown as Record<string, unknown>;
    expect(s.usda_api_key).toBeUndefined();
    expect(s.tmdb_api_key).toBeUndefined();
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

  it("defaults round_nutrition to true (whole-number display) when unset", () => {
    expect(get(settingsStore).round_nutrition).toBe(true);
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

  it("treats a malformed round_nutrition value as on (the default; only explicit false is off)", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/round_nutrition",
        value: JSON.stringify("yes"),
        time: 1,
      },
    ]);
    expect(get(settingsStore).round_nutrition).toBe(true);
  });

  it("defaults off_contribute to false (opt-in) when unset", () => {
    // No datom → OFF contribution consent stays off (ADR-0034 §8, model C).
    expect(get(settingsStore).off_contribute).toBe(false);
  });

  it("decodes a stored off_contribute boolean", () => {
    datomsWritable.set([
      {
        attribute: "settings/off_contribute",
        value: JSON.stringify(true),
        time: 1,
      },
    ]);
    expect(get(settingsStore).off_contribute).toBe(true);
    datomsWritable.set([
      {
        attribute: "settings/off_contribute",
        value: JSON.stringify(false),
        time: 2,
      },
    ]);
    expect(get(settingsStore).off_contribute).toBe(false);
  });

  it("treats a malformed off_contribute value as false (stays opt-out)", () => {
    // Only a literal `true` opts in; anything else keeps contribution off.
    datomsWritable.set([
      {
        attribute: "settings/off_contribute",
        value: JSON.stringify("on"),
        time: 1,
      },
    ]);
    expect(get(settingsStore).off_contribute).toBe(false);
  });

  it("defaults log_export to false (opt-in) when unset", () => {
    // No datom → the local logs stay un-exportable (ADR-0054 §4).
    expect(get(settingsStore).log_export).toBe(false);
  });

  it("decodes a stored log_export boolean, and only a literal true", () => {
    datomsWritable.set([
      {
        attribute: "settings/log_export",
        value: JSON.stringify(true),
        time: 1,
      },
    ]);
    expect(get(settingsStore).log_export).toBe(true);
    datomsWritable.set([
      {
        attribute: "settings/log_export",
        value: JSON.stringify("yes"),
        time: 2,
      },
    ]);
    expect(get(settingsStore).log_export).toBe(false);
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

  it("defaults food_limits to an empty override map when unset", () => {
    // No datom → no overrides; every limit resolves to its baked cap.
    expect(get(settingsStore).food_limits).toEqual({});
  });

  it("folds a stored food/limits blob back to the override map", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/limits",
        value: JSON.stringify({ sodium_content: 1.5, cholesterol_content: 0 }),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_limits).toEqual({
      sodium_content: 1.5,
      cholesterol_content: 0,
    });
  });

  it("filters a food/limits blob to limit keys and numeric values", () => {
    // A stray reach-toward key or a non-numeric value must never reach the
    // limits resolver — the collapse drops both.
    datomsWritable.set([
      {
        attribute: "settings/food/limits",
        value: JSON.stringify({
          sodium_content: 1.5,
          protein: 160, // reach-toward nutrient — not a limit
          saturated_fat_content: "lots", // non-numeric — dropped
        }),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_limits).toEqual({ sodium_content: 1.5 });
  });

  it("keeps food/targets and food/limits as independent datoms", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/targets",
        value: JSON.stringify({ protein: 160 }),
        time: 1,
      },
      {
        attribute: "settings/food/limits",
        value: JSON.stringify({ sodium_content: 1.5 }),
        time: 2,
      },
    ]);
    const s = get(settingsStore);
    expect(s.food_targets).toEqual({ protein: 160 });
    expect(s.food_limits).toEqual({ sodium_content: 1.5 });
  });

  it("tolerates a malformed food/limits value (folds to empty)", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/limits",
        value: JSON.stringify("not-an-object"),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_limits).toEqual({});
  });

  it("defaults food_calculated_targets to empty when the helper has never run", () => {
    expect(get(settingsStore).food_calculated_targets).toEqual({});
  });

  it("folds a stored food/calculated_targets blob back to the default set", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/calculated_targets",
        value: JSON.stringify({
          energy: 2143.75,
          protein: 112,
          fat: 71.5,
          carbs: 240,
        }),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_calculated_targets).toEqual({
      energy: 2143.75,
      protein: 112,
      fat: 71.5,
      carbs: 240,
    });
  });

  it("filters a food/calculated_targets blob to the five personalizable keys", () => {
    // Only energy + the three macros + fibre are personalizable; a stray micro,
    // limit, or non-numeric value must never reach the default resolver.
    datomsWritable.set([
      {
        attribute: "settings/food/calculated_targets",
        value: JSON.stringify({
          energy: 2200,
          protein: 130,
          fiber_content: 40, // personalizable (energy-scaled) — kept
          calcium: 1.5, // a micronutrient — dropped
          sodium_content: 1.5, // a limit — dropped
          fat: "lots", // non-numeric — dropped
        }),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_calculated_targets).toEqual({
      energy: 2200,
      protein: 130,
      fiber_content: 40,
    });
  });

  it("tolerates a malformed food/calculated_targets value (folds to empty)", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/calculated_targets",
        value: JSON.stringify("not-an-object"),
        time: 1,
      },
    ]);
    expect(get(settingsStore).food_calculated_targets).toEqual({});
  });

  it("keeps food/targets and food/calculated_targets as independent datoms", () => {
    // The override layer and the default layer are separate blobs: applying the
    // calculator writes the default set without disturbing an untouched override.
    datomsWritable.set([
      {
        attribute: "settings/food/targets",
        value: JSON.stringify({ calcium: 1.5 }),
        time: 1,
      },
      {
        attribute: "settings/food/calculated_targets",
        value: JSON.stringify({ energy: 2200, protein: 130 }),
        time: 2,
      },
    ]);
    const s = get(settingsStore);
    expect(s.food_targets).toEqual({ calcium: 1.5 });
    expect(s.food_calculated_targets).toEqual({ energy: 2200, protein: 130 });
  });

  it("reflects reactive updates to the underlying datoms", () => {
    datomsWritable.set([
      {
        attribute: "settings/scraper_proxy_url",
        value: "https://k1/?url=",
        time: 1,
      },
    ]);
    expect(get(settingsStore).scraper_proxy_url).toBe("https://k1/?url=");
    datomsWritable.set([
      {
        attribute: "settings/scraper_proxy_url",
        value: "https://k2/?url=",
        time: 2,
      },
    ]);
    expect(get(settingsStore).scraper_proxy_url).toBe("https://k2/?url=");
  });
});

describe("calorieDisplayDecimals (derived display precision)", () => {
  it("is 0 places by default (whole-number display is the default now)", () => {
    expect(get(calorieDisplayDecimals)).toBe(0);
  });

  it("rises to the full display precision when whole-number display is turned off", () => {
    datomsWritable.set([
      {
        attribute: "settings/food/round_nutrition",
        value: JSON.stringify(false),
        time: 1,
      },
    ]);
    expect(get(calorieDisplayDecimals)).toBe(FOOD_DISPLAY_DECIMALS);
  });
});

describe("saveSettings", () => {
  it("appends one datom per non-secret settings attribute to settings:global", async () => {
    await saveSettings({
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
    expect(byAttr["settings/scraper_proxy_url"]).toBe("P");
  });

  it("never appends a secret datom (secrets live in localStorage now)", async () => {
    // ADR-0034 §8: no secret ever enters the append-only ledger. saveSettings is
    // the ledger writer, so it must not emit the moved usda/tmdb key attributes.
    await saveSettings({
      scraper_proxy_url: "P",
      visible_nutrients: ["protein"],
      round_nutrition: false,
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const attrs = datoms.map((d) => d.attribute);
    expect(attrs).not.toContain("settings/usda_api_key");
    expect(attrs).not.toContain("settings/tmdb_api_key");
  });

  it("persists the chosen nutrient list as an array datom", async () => {
    await saveSettings({
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

  it("persists the off_contribute consent toggle", async () => {
    await saveSettings({
      scraper_proxy_url: "P",
      visible_nutrients: ["protein"],
      round_nutrition: false,
      off_contribute: true,
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const byAttr = Object.fromEntries(
      datoms.map((d) => [d.attribute, d.value])
    );
    expect(byAttr["settings/off_contribute"]).toBe(true);
  });

  it("defaults off_contribute to false when a caller omits it", async () => {
    // Pre-#61 callers pass no off_contribute; the write must still be off, never
    // undefined, so consent never silently flips on.
    await saveSettings({
      scraper_proxy_url: "P",
      visible_nutrients: ["protein"],
      round_nutrition: false,
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const byAttr = Object.fromEntries(
      datoms.map((d) => [d.attribute, d.value])
    );
    expect(byAttr["settings/off_contribute"]).toBe(false);
  });

  it("does not write the food/targets datom (targets ride their own writer)", async () => {
    // Toggling visibility/rounding must never touch a user's targets (ADR-0031
    // §2): saveSettings writes only the proxy URL + the two display datoms.
    await saveSettings({
      scraper_proxy_url: "P",
      visible_nutrients: ["protein"],
      round_nutrition: false,
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const attrs = datoms.map((d) => d.attribute);
    expect(attrs).not.toContain("settings/food/targets");
    expect(attrs).not.toContain("settings/food/calculated_targets");
  });
});

describe("saveLogExportConsent", () => {
  it("writes its own datom and touches nothing else", async () => {
    // Its own writer, so a screen that does not own this toggle cannot clobber
    // it — three screens already call saveSettings for settings of their own.
    await saveLogExportConsent(true);
    const datoms = appendMock.mock.calls[0][0] as {
      entity: string;
      attribute: string;
      value: unknown;
    }[];
    expect(datoms.map((d) => d.attribute)).toEqual(["settings/log_export"]);
    expect(datoms[0].value).toBe(true);
    expect(datoms[0].entity).toBe("settings:global");
  });
});

describe("saveCalculatorPlan", () => {
  const plan = {
    calculated_targets: {
      energy: 2143.75,
      protein: 112,
      fat: 71.5,
      carbs: 240,
    },
    targets: { calcium: 1200 },
    profile: {
      sex: "female" as const,
      age: 35,
      height_cm: 170,
      weight_kg: 70,
      activity: "active" as const,
      goal: "maintain" as const,
    },
  };

  it("writes calculated_targets, targets and profile as one atomic append", async () => {
    await saveCalculatorPlan(plan);
    // One append call — the whole plan commits or rolls back together (§5),
    // even though each attribute is still its own datom.
    expect(appendMock).toHaveBeenCalledTimes(1);
    const datoms = appendMock.mock.calls[0][0] as any[];
    const byAttr = Object.fromEntries(
      datoms.map((d) => [d.attribute, d.value])
    );
    expect(datoms.every((d) => d.entity === "settings:global")).toBe(true);
    expect(byAttr["settings/food/calculated_targets"]).toEqual(
      plan.calculated_targets
    );
    expect(byAttr["settings/food/targets"]).toEqual(plan.targets);
    expect(byAttr["settings/food/profile"]).toEqual(plan.profile);
    // No visibility datom when the caller omits the list (nothing auto-tracked).
    expect(byAttr["settings/food/visible_nutrients"]).toBeUndefined();
  });

  it("includes the visible_nutrients datom when auto-track added a macro", async () => {
    await saveCalculatorPlan({
      ...plan,
      visible_nutrients: ["protein", "fat"],
    });
    const datoms = appendMock.mock.calls[0][0] as any[];
    const visible = datoms.find(
      (d) => d.attribute === "settings/food/visible_nutrients"
    );
    expect(visible?.value).toEqual(["protein", "fat"]);
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

describe("saveFoodLimits", () => {
  it("appends only the food/limits datom, independent of the other settings", async () => {
    await saveFoodLimits({ sodium_content: 1.5, cholesterol_content: 0 });
    expect(appendMock).toHaveBeenCalledTimes(1);
    const datoms = appendMock.mock.calls[0][0] as any[];
    expect(datoms).toHaveLength(1);
    const [datom] = datoms;
    expect(datom.entity).toBe("settings:global");
    expect(datom.attribute).toBe("settings/food/limits");
    // The value is the map itself (ingest/db.core JSON-encode on write); the
    // collapse decodes and re-filters it back on read.
    expect(datom.value).toEqual({
      sodium_content: 1.5,
      cholesterol_content: 0,
    });
  });
});
