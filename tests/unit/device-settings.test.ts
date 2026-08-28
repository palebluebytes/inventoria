import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import { DEFAULT_VISIBLE_NUTRIENTS } from "../../src/lib/food/nutrient-display";
import { FOOD_DISPLAY_DECIMALS } from "../../src/lib/food/nutrition";

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

describe("device settings (ADR-0063: localStorage, not the ledger)", () => {
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
});
