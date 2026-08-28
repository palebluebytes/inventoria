import { writable, derived, type Readable } from "svelte/store";
import { DEFAULT_VISIBLE_NUTRIENTS } from "../food/nutrient-display";
import { FOOD_DISPLAY_DECIMALS } from "../food/nutrition";

/**
 * Device settings: everything that belongs to this device rather than to the
 * user's history. They live in `localStorage`, not in the EAVT ledger
 * (ADR-0061).
 *
 * Two families sit here, and they fail the ledger's test for the same reason.
 * **View preferences** are how this device draws the app: which nutrients a
 * meter row shows, how many decimals a kcal figure reads at, whether a panel is
 * folded. **Device configuration** is what this device needs in order to reach
 * the outside world: the scraper proxy a browser must route an HTML fetch
 * through.
 *
 * The line the ADR draws is **whether a setting's past values mean anything**.
 * A nutrition target does: "in March I was reaching toward 2,400 kcal" is a fact
 * about the user, and the ledger is a record of facts. A consent does, twice
 * over — what was agreed, and when. Neither of those is true of the nutrients a
 * meter row happens to show, the number of decimal places a kcal figure reads
 * at, or whether a panel is folded. "The panel was shut on Tuesday" is not
 * history; it is noise appended forever to an immutable log.
 *
 * The second half of the argument is timing, and it is what made this concrete
 * rather than tidy. Every ledger-backed store is asynchronous by construction:
 * `createQueryStore` holds an empty array until its first `dbClient.query`
 * resolves, and that query waits on the worker spawning, SQLite WASM loading and
 * OPFS opening. Until then a settings read returns the *unset default*. For a
 * value the first paint depends on — which meters exist, whether a block of the
 * page is shown — that means seconds of a visibly wrong screen before the ledger
 * catches up. `localStorage` is synchronous, so a value read here is right in
 * the first frame.
 *
 * What stays in the ledger, and why, is in ADR-0061. The short version: targets,
 * limits, the calculator's frozen plan and profile, and the two consents.
 *
 * Secrets keep their own module (`stores/secrets.ts`). They are also per-device
 * `localStorage`, but for their own reason — a credential must not sit in an
 * undeletable, syncing log (ADR-0034 §8) — and they carry env fallbacks and a
 * retirement sweep that nothing here needs.
 */

// Namespaced like the secrets module, so a preference cannot collide with other
// app state (e.g. `inventoria_test_state`).
const LS_KEYS = {
  nutrition_panel_open: "inventoria_pref_nutrition_panel_open",
  visible_nutrients: "inventoria_pref_visible_nutrients",
  round_nutrition: "inventoria_pref_round_nutrition",
  scraper_proxy_url: "inventoria_device_scraper_proxy_url",
} as const;

// `localStorage` is absent under the Node unit runner (and can throw in a
// privacy-locked browser), so every access is guarded — a missing store reads as
// unset and writes are no-ops.
function safeGet(lsKey: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(lsKey);
  } catch {
    return null;
  }
}

function safeSet(lsKey: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(lsKey, value);
  } catch {
    /* privacy-locked / quota-exceeded — the preference just doesn't persist */
  }
}

/**
 * Both booleans here default **on** when absent, and only a stored `"false"`
 * turns one off — the shape their datoms used, kept so an upgrade meets the user
 * where they were rather than flipping a default under them.
 */
function readBoolPref(lsKey: string): boolean {
  return safeGet(lsKey) !== "false";
}

function readVisibleNutrients(): string[] {
  const raw = safeGet(LS_KEYS.visible_nutrients);
  if (raw === null) return DEFAULT_VISIBLE_NUTRIENTS;
  try {
    const parsed = JSON.parse(raw);
    // An explicit empty array is honoured ("show only calories"); anything that
    // is not a list of strings is treated as absent rather than trusted.
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
      return parsed;
    }
  } catch {
    /* malformed — fall through to the default */
  }
  return DEFAULT_VISIBLE_NUTRIENTS;
}

/**
 * The CORS proxy a browser routes an HTML scrape through, as a URL prefix the
 * target is appended to. Unset falls back to `VITE_SCRAPER_PROXY_URL`, so a dev
 * with a `.env` gets a working proxy without typing one in — the same
 * env-fallback shape the secrets module uses, and the reason this reads through
 * a function rather than straight off the key.
 *
 * A stored empty string counts as set: an explicit clear overrides the env var,
 * exactly as a blank datom used to.
 */
function readScraperProxyUrl(): string {
  const stored = safeGet(LS_KEYS.scraper_proxy_url);
  if (stored !== null) return stored;
  return (import.meta.env?.VITE_SCRAPER_PROXY_URL as string) ?? "";
}

const panelOpen = writable<boolean>(readBoolPref(LS_KEYS.nutrition_panel_open));
const scraperProxy = writable<string>(readScraperProxyUrl());
const roundNutrition = writable<boolean>(readBoolPref(LS_KEYS.round_nutrition));
const visible = writable<string[]>(readVisibleNutrients());

/** Reactive fold state for the dashboard's nutrition panel. */
export const nutritionPanelOpen: Readable<boolean> = {
  subscribe: panelOpen.subscribe,
};

/**
 * The nutrients the dashboard meters and the staged-food pills show, a list of
 * `NutritionBreakdown` keys. Absent → the Protein/Fat/Carbs/Fibre default, so a
 * brand-new user still sees a Fibre meter; an explicit empty array is honoured
 * as "show only calories".
 */
export const visibleNutrients: Readable<string[]> = {
  subscribe: visible.subscribe,
};

/**
 * Whether **calorie** figures read rounded to whole numbers. Scoped to kcal: a
 * nutrient amount (grams/mg/µg) always shows at the full display precision
 * either way, because dropping a gram figure's decimals costs real information
 * where dropping a kcal figure's does not. Display-only — the frozen snapshot
 * keeps full precision, so this never changes stored history.
 */
export const roundNutritionPref: Readable<boolean> = {
  subscribe: roundNutrition.subscribe,
};

/**
 * The decimal places a **calorie** figure is displayed at, resolved from
 * {@link roundNutritionPref}: `0` in whole-number mode, else
 * {@link FOOD_DISPLAY_DECIMALS}. Every surface that prints kcal reads this
 * rather than the raw toggle, so the two can never disagree.
 */
export const calorieDisplayDecimals: Readable<number> = derived(
  roundNutrition,
  ($round) => ($round ? 0 : FOOD_DISPLAY_DECIMALS)
);

/**
 * Records the panel's fold. Appends **no datom**: this is view state whose only
 * job is to be correct before the ledger is awake.
 */
export function setNutritionPanelOpen(open: boolean): void {
  safeSet(LS_KEYS.nutrition_panel_open, String(open));
  panelOpen.set(open);
}

/** Records the meter selection. Each writer touches only its own key, so saving
 *  one preference can never clobber another — the reason the datom writers were
 *  split too (ADR-0031 §2). */
export function setVisibleNutrients(keys: string[]): void {
  safeSet(LS_KEYS.visible_nutrients, JSON.stringify(keys));
  visible.set([...keys]);
}

/** Records the whole-number calorie display toggle. */
export function setRoundNutrition(round: boolean): void {
  safeSet(LS_KEYS.round_nutrition, String(round));
  roundNutrition.set(round);
}

/** The scraper proxy URL prefix (localStorage, else the env fallback, else ""). */
export const scraperProxyUrl: Readable<string> = {
  subscribe: scraperProxy.subscribe,
};

/** Records the scraper proxy URL for this device. */
export function setScraperProxyUrl(url: string): void {
  safeSet(LS_KEYS.scraper_proxy_url, url);
  scraperProxy.set(url);
}
