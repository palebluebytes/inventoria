import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import { DEFAULT_VISIBLE_NUTRIENTS } from "../../src/lib/food/nutrient-display";
import { FOOD_DISPLAY_DECIMALS } from "../../src/lib/food/nutrition";
import { storagePrefixesOf } from "../../src/lib/facets/registry";

// The same in-memory localStorage the secrets suite uses, so the Node unit
// runner (which has none) exercises the real read/write path. `.store` lets a
// test assert exactly which keys were persisted.
function makeFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

// The module snapshots localStorage at import time — that is the whole point of
// it, since the first paint reads these — so each test re-imports it fresh after
// stubbing the global it will read.
async function loadPrefs() {
  vi.resetModules();
  return import("../../src/lib/stores/device-settings");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("device settings (ADR-0085: a setting is never a datom)", () => {
  it("reads its values at import, with no ledger and no await", async () => {
    // The defining property. Nothing here is asynchronous, so a caller reading
    // these during its first render gets the stored value rather than a default
    // that corrects itself seconds later.
    const ls = makeFakeLocalStorage();
    ls.store.set("inventoria_pref_nutrition_panel_open", "false");
    ls.store.set("inventoria_pref_round_nutrition", "false");
    ls.store.set(
      "inventoria_pref_visible_nutrients",
      JSON.stringify(["protein", "iron"])
    );
    vi.stubGlobal("localStorage", ls);

    const prefs = await loadPrefs();
    expect(get(prefs.nutritionPanelOpen)).toBe(false);
    expect(get(prefs.roundNutritionPref)).toBe(false);
    expect(get(prefs.visibleNutrients)).toEqual(["protein", "iron"]);
  });

  it("survives with no localStorage at all (the Node runner, a locked browser)", async () => {
    vi.stubGlobal("localStorage", undefined);
    const prefs = await loadPrefs();
    expect(get(prefs.nutritionPanelOpen)).toBe(true);
    expect(get(prefs.visibleNutrients)).toEqual(DEFAULT_VISIBLE_NUTRIENTS);
    // Writes are no-ops rather than throwing.
    expect(() => prefs.setNutritionPanelOpen(false)).not.toThrow();
  });

  describe("the nutrition panel's fold", () => {
    it("defaults to open, and only an explicit false shuts it", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      expect(get(prefs.nutritionPanelOpen)).toBe(true);

      prefs.setNutritionPanelOpen(false);
      expect(get(prefs.nutritionPanelOpen)).toBe(false);
      expect(ls.store.get("inventoria_pref_nutrition_panel_open")).toBe(
        "false"
      );

      prefs.setNutritionPanelOpen(true);
      expect(get(prefs.nutritionPanelOpen)).toBe(true);
    });
  });

  describe("the visible-nutrient selection", () => {
    it("defaults to Protein/Fat/Carbs/Fibre when unset", async () => {
      vi.stubGlobal("localStorage", makeFakeLocalStorage());
      const prefs = await loadPrefs();
      expect(get(prefs.visibleNutrients)).toEqual(DEFAULT_VISIBLE_NUTRIENTS);
    });

    it("honours an explicitly empty list (show only calories)", async () => {
      const ls = makeFakeLocalStorage();
      ls.store.set("inventoria_pref_visible_nutrients", JSON.stringify([]));
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      expect(get(prefs.visibleNutrients)).toEqual([]);
    });

    it("falls back to the default when the stored value is malformed", async () => {
      const ls = makeFakeLocalStorage();
      ls.store.set("inventoria_pref_visible_nutrients", "not json");
      vi.stubGlobal("localStorage", ls);
      expect(get((await loadPrefs()).visibleNutrients)).toEqual(
        DEFAULT_VISIBLE_NUTRIENTS
      );

      // A well-formed value of the wrong shape is treated as absent too, rather
      // than handed to the display layer as a list of non-strings.
      ls.store.set("inventoria_pref_visible_nutrients", JSON.stringify([1, 2]));
      expect(get((await loadPrefs()).visibleNutrients)).toEqual(
        DEFAULT_VISIBLE_NUTRIENTS
      );
      ls.store.set(
        "inventoria_pref_visible_nutrients",
        JSON.stringify({ protein: true })
      );
      expect(get((await loadPrefs()).visibleNutrients)).toEqual(
        DEFAULT_VISIBLE_NUTRIENTS
      );
    });

    it("round-trips a chosen list", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      prefs.setVisibleNutrients(["protein", "fiber_content", "calcium"]);
      expect(get(prefs.visibleNutrients)).toEqual([
        "protein",
        "fiber_content",
        "calcium",
      ]);
      expect(
        JSON.parse(ls.store.get("inventoria_pref_visible_nutrients")!)
      ).toEqual(["protein", "fiber_content", "calcium"]);
    });

    it("writes only its own key, so one preference cannot clobber another", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      prefs.setNutritionPanelOpen(false);
      prefs.setRoundNutrition(false);
      prefs.setVisibleNutrients(["protein"]);
      expect(get(prefs.nutritionPanelOpen)).toBe(false);
      expect(get(prefs.roundNutritionPref)).toBe(false);
      expect([...ls.store.keys()].sort()).toEqual([
        "inventoria_pref_nutrition_panel_open",
        "inventoria_pref_round_nutrition",
        "inventoria_pref_visible_nutrients",
      ]);
    });
  });

  describe("the scraper proxy URL", () => {
    it("reads the stored value, and an env fallback when unset", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      vi.stubEnv("VITE_SCRAPER_PROXY_URL", "https://env-proxy/?url=");
      expect(get((await loadPrefs()).scraperProxyUrl)).toBe(
        "https://env-proxy/?url="
      );

      ls.store.set("inventoria_device_scraper_proxy_url", "https://mine/?url=");
      expect(get((await loadPrefs()).scraperProxyUrl)).toBe(
        "https://mine/?url="
      );
    });

    it("falls back to the app's own proxy when neither is set", async () => {
      // The third layer, and the one that makes a fresh install work: the app
      // serves /api/proxy itself in both environments (ADR-0070), so an
      // unconfigured device gets a working scrape rather than the fetcher's
      // "not configured" throw.
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      vi.stubEnv("VITE_SCRAPER_PROXY_URL", undefined as unknown as string);

      expect(get((await loadPrefs()).scraperProxyUrl)).toBe("/api/proxy?url=");
    });

    it("lets an explicit clear override the env fallback", async () => {
      // A stored empty string counts as SET, exactly as a blank datom used to:
      // clearing the field must mean "no proxy", not "fall back to the env var".
      const ls = makeFakeLocalStorage();
      ls.store.set("inventoria_device_scraper_proxy_url", "");
      vi.stubGlobal("localStorage", ls);
      vi.stubEnv("VITE_SCRAPER_PROXY_URL", "https://env-proxy/?url=");
      expect(get((await loadPrefs()).scraperProxyUrl)).toBe("");
    });

    it("round-trips a value through its setter", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      prefs.setScraperProxyUrl("https://p/?url=");
      expect(get(prefs.scraperProxyUrl)).toBe("https://p/?url=");
      expect(ls.store.get("inventoria_device_scraper_proxy_url")).toBe(
        "https://p/?url="
      );
    });
  });

  describe("calorie display precision", () => {
    it("is 0 places by default (whole-number display is the default)", async () => {
      vi.stubGlobal("localStorage", makeFakeLocalStorage());
      const prefs = await loadPrefs();
      expect(get(prefs.calorieDisplayDecimals)).toBe(0);
    });

    it("rises to the full display precision when rounding is turned off", async () => {
      vi.stubGlobal("localStorage", makeFakeLocalStorage());
      const prefs = await loadPrefs();
      prefs.setRoundNutrition(false);
      expect(get(prefs.calorieDisplayDecimals)).toBe(FOOD_DISPLAY_DECIMALS);
      prefs.setRoundNutrition(true);
      expect(get(prefs.calorieDisplayDecimals)).toBe(0);
    });
  });

  describe("the food targets (ADR-0085 §5: moved out of the ledger)", () => {
    const KEYS = {
      targets: "inventoria_pref_food_targets",
      limits: "inventoria_pref_food_limits",
      calculated: "inventoria_pref_food_calculated_targets",
      profile: "inventoria_pref_food_profile",
    };
    const PROFILE = {
      sex: "female" as const,
      age: 35,
      height_cm: 170,
      weight_kg: 70,
      activity: "active" as const,
      goal: "maintain" as const,
    };

    it("reads all four at import, with no ledger and no await", async () => {
      // The defining property, and the one the editor's seeding $effect existed
      // to work around: these are right in the first frame now.
      const ls = makeFakeLocalStorage();
      ls.store.set(KEYS.targets, JSON.stringify({ protein: 160 }));
      ls.store.set(KEYS.limits, JSON.stringify({ sodium_content: 1.5 }));
      ls.store.set(KEYS.calculated, JSON.stringify({ energy: 2200 }));
      ls.store.set(KEYS.profile, JSON.stringify(PROFILE));
      vi.stubGlobal("localStorage", ls);

      const prefs = await loadPrefs();
      expect(get(prefs.foodTargets)).toEqual({ protein: 160 });
      expect(get(prefs.foodLimits)).toEqual({ sodium_content: 1.5 });
      expect(get(prefs.foodCalculatedTargets)).toEqual({ energy: 2200 });
      expect(get(prefs.foodProfile)).toEqual(PROFILE);
    });

    it("defaults to no overrides and no profile when nothing is stored", async () => {
      vi.stubGlobal("localStorage", makeFakeLocalStorage());
      const prefs = await loadPrefs();
      expect(get(prefs.foodTargets)).toEqual({});
      expect(get(prefs.foodLimits)).toEqual({});
      expect(get(prefs.foodCalculatedTargets)).toEqual({});
      expect(get(prefs.foodProfile)).toBeNull();
    });

    it("filters targets to reach-toward keys and finite numbers", async () => {
      // A stray limit key or a non-numeric value must never reach the resolver.
      const ls = makeFakeLocalStorage();
      ls.store.set(
        KEYS.targets,
        JSON.stringify({
          protein: 160,
          sodium_content: 100, // a limit nutrient, not targetable
          calcium: "lots", // non-numeric
        })
      );
      vi.stubGlobal("localStorage", ls);
      expect(get((await loadPrefs()).foodTargets)).toEqual({ protein: 160 });
    });

    it("filters limits to limit keys and finite numbers", async () => {
      const ls = makeFakeLocalStorage();
      ls.store.set(
        KEYS.limits,
        JSON.stringify({
          sodium_content: 1.5,
          protein: 160, // reach-toward, not a limit
          saturated_fat_content: "lots",
        })
      );
      vi.stubGlobal("localStorage", ls);
      expect(get((await loadPrefs()).foodLimits)).toEqual({
        sodium_content: 1.5,
      });
    });

    it("filters the calculated set to the personalizable keys", async () => {
      const ls = makeFakeLocalStorage();
      ls.store.set(
        KEYS.calculated,
        JSON.stringify({
          energy: 2200,
          protein: 130,
          fiber_content: 40, // energy-scaled, kept
          calcium: 1.5, // a micronutrient
          sodium_content: 1.5, // a limit
          fat: "lots",
        })
      );
      vi.stubGlobal("localStorage", ls);
      expect(get((await loadPrefs()).foodCalculatedTargets)).toEqual({
        energy: 2200,
        protein: 130,
        fiber_content: 40,
      });
    });

    it("tolerates a malformed blob in each of the four", async () => {
      const ls = makeFakeLocalStorage();
      ls.store.set(KEYS.targets, "not json at all");
      ls.store.set(KEYS.limits, JSON.stringify("not-an-object"));
      ls.store.set(KEYS.calculated, JSON.stringify([1, 2, 3]));
      ls.store.set(KEYS.profile, JSON.stringify({ sex: "unknown", age: 35 }));
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      expect(get(prefs.foodTargets)).toEqual({});
      expect(get(prefs.foodLimits)).toEqual({});
      expect(get(prefs.foodCalculatedTargets)).toEqual({});
      expect(get(prefs.foodProfile)).toBeNull();
    });

    it("reads a profile back all-or-nothing, never half-seeded", async () => {
      // A form pre-filled from a half-valid body profile is worse than a blank
      // one, so one bad field discards the lot (ADR-0033 §2).
      const ls = makeFakeLocalStorage();
      ls.store.set(
        KEYS.profile,
        JSON.stringify({ ...PROFILE, weight_kg: "heavy" })
      );
      vi.stubGlobal("localStorage", ls);
      expect(get((await loadPrefs()).foodProfile)).toBeNull();
    });

    it("keeps targets and limits on separate keys, so neither clobbers the other", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      prefs.setFoodTargets({ protein: 160 });
      prefs.setFoodLimits({ sodium_content: 1.5 });
      expect(get(prefs.foodTargets)).toEqual({ protein: 160 });
      expect(get(prefs.foodLimits)).toEqual({ sodium_content: 1.5 });
      expect(ls.store.get(KEYS.targets)).toBe(JSON.stringify({ protein: 160 }));
      expect(ls.store.get(KEYS.limits)).toBe(
        JSON.stringify({ sodium_content: 1.5 })
      );
    });

    it("applies a calculator plan to all three keys at once", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      prefs.applyCalculatorPlan({
        calculated_targets: { energy: 2143.75, protein: 112 },
        targets: { calcium: 1200 },
        profile: PROFILE,
      });
      expect(get(prefs.foodCalculatedTargets)).toEqual({
        energy: 2143.75,
        protein: 112,
      });
      expect(get(prefs.foodTargets)).toEqual({ calcium: 1200 });
      expect(get(prefs.foodProfile)).toEqual(PROFILE);
      expect(ls.store.get(KEYS.limits)).toBeUndefined();
    });
  });

  // ADR-0086 §2: these two were `consent:food_off_contribute` and
  // `consent:log_export`, datoms on their own entities, until it was noticed
  // that neither records an act — each only seeds a control that is shown and
  // answered again every time.
  describe("the opt-ins (ADR-0086 §2: a default is not a consent)", () => {
    const OFF = "inventoria_pref_food_off_contribute";
    const ROOT_LOG = "inventoria_pref_log_export";
    const FOOD_LOG = "inventoria_pref_food_log_export";

    it("defaults all of them to off when nothing is stored", async () => {
      vi.stubGlobal("localStorage", makeFakeLocalStorage());
      const prefs = await loadPrefs();
      expect(get(prefs.offContributeDefault)).toBe(false);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(false);
      expect(get(prefs.logExportEnabledFor("food"))).toBe(false);
    });

    it("defaults them to off when there is no localStorage at all", async () => {
      // A privacy-locked browser reads every key as absent. These must fail
      // closed there, which is the one direction the read is allowed to be
      // wrong in: an opt-in that defaulted on would offer a submission nobody
      // agreed to. This is why they do not share `readBoolPref`, which defaults
      // its booleans **on**.
      vi.stubGlobal("localStorage", undefined);
      const prefs = await loadPrefs();
      expect(get(prefs.offContributeDefault)).toBe(false);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(false);
      expect(get(prefs.logExportEnabledFor("food"))).toBe(false);
    });

    it('turns on only for a literal "true", never for another truthy value', async () => {
      const ls = makeFakeLocalStorage();
      ls.store.set(OFF, "1");
      ls.store.set(ROOT_LOG, "yes");
      ls.store.set(FOOD_LOG, "1");
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      expect(get(prefs.offContributeDefault)).toBe(false);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(false);
      expect(get(prefs.logExportEnabledFor("food"))).toBe(false);
    });

    it("reads a stored grant at import, with no ledger and no await", async () => {
      const ls = makeFakeLocalStorage();
      ls.store.set(OFF, "true");
      ls.store.set(ROOT_LOG, "true");
      ls.store.set(FOOD_LOG, "true");
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      expect(get(prefs.offContributeDefault)).toBe(true);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(true);
      expect(get(prefs.logExportEnabledFor("food"))).toBe(true);
    });

    it("keeps the contribution default off the log keys, so neither writer speaks for the other", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();

      prefs.setOffContributeDefault(true);
      expect(get(prefs.offContributeDefault)).toBe(true);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(false);
      expect(ls.store.get(OFF)).toBe("true");
      expect(ls.store.get(ROOT_LOG)).toBeUndefined();

      prefs.setLogExportEnabledFor("root", true);
      prefs.setOffContributeDefault(false);
      expect(get(prefs.offContributeDefault)).toBe(false);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(true);
    });

    // ADR-0080 §5: one export opt-in per Facet, because it governs an egress
    // door and each Facet has its own. Until this shipped, the root's switch
    // gated food's only channel from a screen a Rations user cannot reach.
    it("gives each Facet its own log-export door, on its own key", async () => {
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();

      prefs.setLogExportEnabledFor("food", true);
      expect(get(prefs.logExportEnabledFor("food"))).toBe(true);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(false);
      expect(ls.store.get(FOOD_LOG)).toBe("true");
      expect(ls.store.get(ROOT_LOG)).toBeUndefined();

      prefs.setLogExportEnabledFor("root", true);
      prefs.setLogExportEnabledFor("food", false);
      expect(get(prefs.logExportEnabledFor("root"))).toBe(true);
      expect(get(prefs.logExportEnabledFor("food"))).toBe(false);
    });

    it("names the two doors as ADR-0085 §4 named them, and no third way", async () => {
      // The root's is unqualified because it belongs to no Tracked Domain — the
      // log facility is machinery, not a tracked area of anyone's life — and
      // Rations' is named for the domain that registers the only channel there
      // is. Both names are pinned by that record, so they are asserted rather
      // than derived from the Facet id.
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      prefs.setLogExportEnabledFor("root", true);
      prefs.setLogExportEnabledFor("food", true);
      expect([...ls.store.keys()].sort()).toEqual([FOOD_LOG, ROOT_LOG].sort());
    });

    it("gives every key a Facet-scoped wipe can find its owner for", async () => {
      // ADR-0079 §2 takes every `localStorage` record under the Facet's own
      // namespaces, so which prefix a key falls under decides who clears it.
      // Food's two carry the `food_` segment; the root's log door does not, so
      // a food wipe leaves it alone.
      const ls = makeFakeLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const prefs = await loadPrefs();
      prefs.setOffContributeDefault(true);
      prefs.setLogExportEnabledFor("root", true);
      prefs.setLogExportEnabledFor("food", true);

      const foodOwned = storagePrefixesOf("food");
      const takenByAFoodWipe = [...ls.store.keys()]
        .filter((key) => foodOwned.some((prefix) => key.startsWith(prefix)))
        .sort();
      expect(takenByAFoodWipe).toEqual([FOOD_LOG, OFF].sort());
    });
  });
});
