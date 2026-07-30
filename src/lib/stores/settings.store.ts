import { createQueryStore } from "./datoms.store";
import { derived } from "svelte/store";
import { dbClient } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import { parseDatomValue } from "../db/datom-fold";
import { HLC_ORDER_ASC } from "../db/hlc";
import { DEFAULT_VISIBLE_NUTRIENTS } from "../food/nutrient-display";
import { FOOD_DISPLAY_DECIMALS } from "../food/nutrition";

// Settings values are opaque strings. They're stored JSON-encoded (db.core
// wraps every value in JSON.stringify), so read them back through the shared
// parser to strip the encoding — treating them as string attributes so a
// numeric-looking key can't coerce to a number.
const SETTINGS_STRING_ATTRS = [
  "settings/usda_api_key",
  "settings/tmdb_api_key",
  "settings/scraper_proxy_url",
];

// Reactive raw query store for settings datoms
export const settingsDatomsStore = createQueryStore<{
  attribute: string;
  value: string;
  time: number;
}>(
  `SELECT attribute, value, time FROM datoms WHERE entity = 'settings:global' ORDER BY ${HLC_ORDER_ASC}`
);

export interface SettingsState {
  usda_api_key: string;
  tmdb_api_key: string;
  scraper_proxy_url: string;
  /**
   * The nutrients the dashboard summary + staged-food pills show (ticket #29),
   * a list of {@link NutritionBreakdown} keys. Unlike the string keys above this
   * is a JSON-encoded array, so it is NOT a `SETTINGS_STRING_ATTR`: it decodes
   * through `parseDatomValue` back to an array. Absent → the Protein/Fat/Carbs/
   * Fibre default, so a brand-new user still sees a Fibre meter.
   */
  visible_nutrients: string[];
  /**
   * Whether nutrition values are displayed rounded to whole numbers instead of
   * the default {@link FOOD_DISPLAY_DECIMALS}-place precision. Display-only: the
   * frozen snapshot always keeps full precision, so this never changes stored
   * history — only how calories/macros/micronutrients read on screen. Absent →
   * `false` (exact display, the shipped default). A JSON boolean, so like
   * `visible_nutrients` it is NOT a `SETTINGS_STRING_ATTR`.
   */
  round_nutrition: boolean;
}

/**
 * Reads the visible-nutrient list off its datom, tolerating anything malformed —
 * a non-array (older/garbage value) or an array with non-string entries falls
 * back to the default so the display layer always gets a clean `string[]`.
 */
function parseVisibleNutrients(rawValue: string): string[] {
  const parsed = parseDatomValue("settings/visible_nutrients", rawValue);
  if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_NUTRIENTS;
  return parsed.filter((k): k is string => typeof k === "string");
}

// Derived store to collapse datoms to latest values and inject fallbacks
export const settingsStore = derived(settingsDatomsStore, ($datoms) => {
  const settings: SettingsState = {
    usda_api_key: (import.meta.env?.VITE_USDA_FDC_API_KEY as string) ?? "",
    tmdb_api_key: (import.meta.env?.VITE_TMDB_API_KEY as string) ?? "",
    scraper_proxy_url:
      (import.meta.env?.VITE_SCRAPER_PROXY_URL as string) ?? "",
    // Unset → the Protein/Fat/Carbs/Fibre default (ticket #29).
    visible_nutrients: DEFAULT_VISIBLE_NUTRIENTS,
    // Unset → exact display (2-dp), the shipped baseline.
    round_nutrition: false,
  };

  for (const d of $datoms) {
    // visible_nutrients is a JSON array, not an opaque string — decode it to a
    // list rather than String()-coercing it (which would flatten to "a,b").
    if (d.attribute === "settings/visible_nutrients") {
      settings.visible_nutrients = parseVisibleNutrients(d.value);
      continue;
    }
    // round_nutrition is a JSON boolean, decoded like visible_nutrients — only a
    // literal `true` enables it, so any malformed/legacy value stays exact.
    if (d.attribute === "settings/round_nutrition") {
      settings.round_nutrition =
        parseDatomValue("settings/round_nutrition", d.value) === true;
      continue;
    }
    const value = String(
      parseDatomValue(d.attribute, d.value, SETTINGS_STRING_ATTRS)
    );
    if (d.attribute === "settings/usda_api_key") {
      settings.usda_api_key = value;
    } else if (d.attribute === "settings/tmdb_api_key") {
      settings.tmdb_api_key = value;
    } else if (d.attribute === "settings/scraper_proxy_url") {
      settings.scraper_proxy_url = value;
    }
  }

  return settings;
});

// Helper to update settings in the ledger
export async function saveSettings(state: SettingsState): Promise<void> {
  const timestamp = Date.now();
  const datoms = ingestEntity(
    {
      entity: "settings:global",
      attributes: {
        "settings/usda_api_key": state.usda_api_key,
        "settings/tmdb_api_key": state.tmdb_api_key,
        "settings/scraper_proxy_url": state.scraper_proxy_url,
        // A list value — stored JSON-encoded like every datom, read back as an
        // array. Default when a caller omits it (e.g. a pre-#29 save).
        "settings/visible_nutrients":
          state.visible_nutrients ?? DEFAULT_VISIBLE_NUTRIENTS,
        // Boolean value; default off when a caller omits it (e.g. a pre-toggle
        // save path).
        "settings/round_nutrition": state.round_nutrition ?? false,
      },
    },
    timestamp
  );
  await dbClient.append(datoms);
}

/**
 * The display precision every food number obeys, resolved from the user's
 * {@link SettingsState.round_nutrition} choice: `0` places when whole-number
 * display is on, otherwise {@link FOOD_DISPLAY_DECIMALS}. Views pass this into
 * `roundFoodDisplay` / the nutrient-display builders, so the round-vs-exact
 * logic lives here once rather than in every view.
 */
export const nutritionDisplayDecimals = derived(settingsStore, ($s) =>
  $s.round_nutrition ? 0 : FOOD_DISPLAY_DECIMALS
);
