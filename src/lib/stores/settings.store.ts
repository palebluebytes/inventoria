import { createQueryStore } from "./datoms.store";
import { derived } from "svelte/store";
import { dbClient } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import { parseDatomValue } from "../db/datom-fold";
import { HLC_ORDER_ASC } from "../db/hlc";
import { DEFAULT_VISIBLE_NUTRIENTS } from "../food/nutrient-display";
import { FOOD_DISPLAY_DECIMALS } from "../food/nutrition";
import {
  REACH_TOWARD_KEYS,
  LIMIT_KEYS,
  PERSONALIZED_TARGET_KEYS,
} from "../food/nutrition-targets";
import type {
  ActivityLevel,
  BiologicalSex,
  EnergyGoal,
} from "../food/personalized-energy-macros";

// Settings values are opaque strings. They're stored JSON-encoded (db.core
// wraps every value in JSON.stringify), so read them back through the shared
// parser to strip the encoding — treating them as string attributes so a
// numeric-looking value can't coerce to a number.
//
// Secrets are no longer here: `settings/usda_api_key` / `settings/tmdb_api_key`
// moved to `localStorage` (ADR-0034 §8, see stores/secrets.ts) — a secret must
// not live in the append-only, synced ledger. No migration (pre-release); the
// old datoms are simply never read again.
const SETTINGS_STRING_ATTRS = ["settings/scraper_proxy_url"];

// Reactive raw query store for settings datoms
export const settingsDatomsStore = createQueryStore<{
  attribute: string;
  value: string;
  time: number;
}>(
  `SELECT attribute, value, time FROM datoms WHERE entity = 'settings:global' ORDER BY ${HLC_ORDER_ASC}`
);

/**
 * The body metrics + choices the personalized calorie/macro helper (ADR-0033) was
 * last run with — an **inert** blob (`settings/food/profile`) that drives nothing
 * live: the dashboard never reads it, the resolver never sees it. It exists purely
 * to pre-fill the calculator form on re-open, so bumping a weight and re-applying
 * is painless (ADR-0033 §2). All snake_case per house convention; metric only
 * (kg/cm), as Mifflin-St Jeor is natively metric.
 */
export interface FoodProfile {
  sex: BiologicalSex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: ActivityLevel;
  goal: EnergyGoal;
}

export interface SettingsState {
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
   * Whether **calorie** figures are displayed rounded to whole numbers instead of
   * the {@link FOOD_DISPLAY_DECIMALS}-place precision. Scoped to kcal: a nutrient
   * amount (grams/mg/µg) always shows at the full display precision either way,
   * because dropping a gram figure's decimals costs real information where
   * dropping a kcal figure's does not. Display-only: the frozen snapshot always
   * keeps full precision, so this never changes stored history — only how the
   * calories read on screen (dashboard ring, staged pills, the calculator, AND
   * the target editor's own baked/override energy value).
   * Default **on**: absent → `true`, and only an explicit stored `false` turns it
   * off. A JSON boolean, so like `visible_nutrients` it is NOT a
   * `SETTINGS_STRING_ATTR`.
   */
  round_nutrition: boolean;
  /**
   * User overrides for the baked daily nutrition targets (ADR-0031 §2, #40): a
   * partial `{ breakdown_key: number }` map filtered to the reach-toward key set
   * ({@link REACH_TOWARD_KEYS}), each value in the **same canonical unit as the
   * baked map** (grams for mass, kcal for energy). Presence/absence is the model:
   * a key **absent** falls back to the baked default, **`> 0`** overrides it, and
   * **`0`** opts the nutrient out of having a target (see `resolveNutrientTargets`).
   * A JSON object, decoded through `parseDatomValue`; malformed → empty. Written
   * independently of the visibility/round datoms via {@link saveFoodTargets}.
   */
  food_targets: Partial<Record<string, number>>;
  /**
   * User overrides for the baked daily nutrient **limits** (ADR-0032, #43): the
   * stay-under twin of {@link food_targets}, a partial `{ breakdown_key: number }`
   * map filtered to the limit key set ({@link LIMIT_KEYS}: sodium, saturated fat,
   * cholesterol, trans fat), each value in grams. Same presence/absence model —
   * absent → the baked cap, `> 0` → an override cap, `0` → opts out of a limit
   * (see `resolveNutrientLimits`). Its own blob datom `settings/food/limits`,
   * written independently via {@link saveFoodLimits}.
   */
  food_limits: Partial<Record<string, number>>;
  /**
   * The personalized calorie/macro helper's frozen result (ADR-0033 §4): the
   * `{ energy, protein, fat, carbs }` set the user last accepted from "Calculate
   * from body metrics", filtered to {@link PERSONALIZED_TARGET_KEYS}, each value
   * in the canonical unit (kcal for energy, grams for the macros). This is a
   * **default** layer, not an override: it sits *between* the baked reference and
   * {@link food_targets}, so a cleared override (the editor's ↺) falls back to the
   * computed figure rather than the generic 2000-kcal reference (see
   * `defaultNutrientTargets`). Absent → the helper has never been applied; every
   * target resolves to its baked default. Its own blob datom
   * `settings/food/calculated_targets`, written atomically with the other apply
   * datoms via {@link saveCalculatorPlan}. The stored numbers are frozen, never
   * recomputed, so tweaking the helper's constants can't shift a user's defaults.
   */
  food_calculated_targets: Partial<Record<string, number>>;
  /**
   * The last-used inputs of the personalized calorie/macro helper (ADR-0033 §2),
   * or `null` when the helper has never been applied. Read-folded only to seed the
   * calculator form — **inert** everywhere else: no dashboard or resolver read path
   * touches it, so it is deliberately not part of the resolved targets/limits the
   * app renders. Its own blob datom `settings/food/profile`, written atomically
   * with the other apply datoms via {@link saveCalculatorPlan}.
   */
  food_profile: FoodProfile | null;
  /**
   * The consent MASTER toggle for contributing corrected label data back to Open
   * Food Facts (ADR-0034 §8, model C). Default **off**. It is not itself the
   * consent to submit — it merely SEEDS the always-shown-before-submit per-capture
   * checkbox in the Custom form, which must still be ticked every time. A JSON
   * boolean like {@link round_nutrition}, so it is NOT a `SETTINGS_STRING_ATTR`.
   * Not a secret (it holds no credential), so unlike the OFF login it rides the
   * ledger rather than localStorage.
   */
  off_contribute: boolean;
  /**
   * The consent MASTER toggle for exporting the local logs (ADR-0054 §4).
   * Default **off**. It is not itself the consent to export — the review sheet
   * still shows the exact payload, and the channels are chosen individually
   * there, because bundling a `personal` channel with a `technical` one behind
   * one yes is a consent surface that does not mean what it appears to.
   *
   * A preference, so it rides the ledger; the records it governs do not, and
   * cannot (`src/lib/logs/log-facility.ts`). That split is ADR-0034 §8's, made
   * for the same two reasons: the ledger is undeletable and it syncs.
   */
  log_export: boolean;
}

/**
 * Reads the visible-nutrient list off its datom, tolerating anything malformed —
 * a non-array (older/garbage value) or an array with non-string entries falls
 * back to the default so the display layer always gets a clean `string[]`.
 */
function parseVisibleNutrients(rawValue: string): string[] {
  const parsed = parseDatomValue("settings/food/visible_nutrients", rawValue);
  if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_NUTRIENTS;
  return parsed.filter((k): k is string => typeof k === "string");
}

/**
 * Reads one of the food number-map blobs off its datom, tolerating anything
 * malformed: a non-object (older/garbage value) folds to an empty map, and an
 * entry survives only when its key is in `keySet` and its value is a finite
 * number. Shared by the three reach-toward / stay-under / calculated-default
 * blobs (ADR-0031 §2, ADR-0032 §2, ADR-0033 §4) — each passes its own attribute
 * and key set, so a stored blob can never carry an out-of-set key or a
 * non-numeric value into a resolver.
 */
function parseFilteredNumberMap(
  attribute: string,
  rawValue: string,
  keySet: ReadonlySet<string>
): Partial<Record<string, number>> {
  const parsed = parseDatomValue(attribute, rawValue);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if (
      keySet.has(key) &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      out[key] = value;
    }
  }
  return out;
}

/** The two Mifflin-St Jeor sex forms a stored profile may name (ADR-0033 §6). */
const VALID_SEXES: ReadonlySet<string> = new Set(["male", "female"]);
/** The four IOM PAL activity categories a stored profile may name (ADR-0033 §3). */
const VALID_ACTIVITIES: ReadonlySet<string> = new Set([
  "sedentary",
  "low_active",
  "active",
  "very_active",
]);
/** The three goal directions a stored profile may name (ADR-0033 §3). */
const VALID_GOALS: ReadonlySet<string> = new Set(["lose", "maintain", "gain"]);

/**
 * Reads the inert food-profile blob off its datom (ADR-0033 §2), tolerating
 * anything malformed. The profile is **all-or-nothing pre-fill data**: a
 * non-object, an unknown enum value, or a non-finite metric folds the whole thing
 * back to `null` (the form simply opens blank) rather than seeding the calculator
 * with a half-valid body profile. Nothing downstream reads this, so a clean
 * `FoodProfile | null` is all the form needs.
 */
function parseFoodProfile(rawValue: string): FoodProfile | null {
  const parsed = parseDatomValue("settings/food/profile", rawValue);
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const p = parsed as Record<string, unknown>;
  const isFinite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  if (
    typeof p.sex !== "string" ||
    !VALID_SEXES.has(p.sex) ||
    typeof p.activity !== "string" ||
    !VALID_ACTIVITIES.has(p.activity) ||
    typeof p.goal !== "string" ||
    !VALID_GOALS.has(p.goal) ||
    !isFinite(p.age) ||
    !isFinite(p.height_cm) ||
    !isFinite(p.weight_kg)
  ) {
    return null;
  }
  return {
    sex: p.sex as BiologicalSex,
    age: p.age,
    height_cm: p.height_cm,
    weight_kg: p.weight_kg,
    activity: p.activity as ActivityLevel,
    goal: p.goal as EnergyGoal,
  };
}

// Derived store to collapse datoms to latest values and inject fallbacks
export const settingsStore = derived(settingsDatomsStore, ($datoms) => {
  const settings: SettingsState = {
    scraper_proxy_url:
      (import.meta.env?.VITE_SCRAPER_PROXY_URL as string) ?? "",
    // Unset → the Protein/Fat/Carbs/Fibre default (ticket #29).
    visible_nutrients: DEFAULT_VISIBLE_NUTRIENTS,
    // Unset → whole-number display on (the default); only an explicit stored
    // `false` turns it back to exact 2-dp.
    round_nutrition: true,
    // Unset → no overrides; every target resolves to its baked default.
    food_targets: {},
    // Unset → no overrides; every limit resolves to its baked cap.
    food_limits: {},
    // Unset → the helper has never been applied; every target resolves to its
    // baked default (no personalized default layer).
    food_calculated_targets: {},
    // Unset → the helper has never been applied; the form opens blank.
    food_profile: null,
    // Unset → OFF contribution consent stays off (opt-in, ADR-0034 §8).
    off_contribute: false,
    // Unset → log export stays off (opt-in, ADR-0054 §4).
    log_export: false,
  };

  for (const d of $datoms) {
    // visible_nutrients is a JSON array, not an opaque string — decode it to a
    // list rather than String()-coercing it (which would flatten to "a,b").
    if (d.attribute === "settings/food/visible_nutrients") {
      settings.visible_nutrients = parseVisibleNutrients(d.value);
      continue;
    }
    // round_nutrition is a JSON boolean, but the DEFAULT is on — so only a
    // literal `false` turns it off; a stored `true` or any malformed/legacy value
    // resolves to on, matching the unset default.
    if (d.attribute === "settings/food/round_nutrition") {
      settings.round_nutrition =
        parseDatomValue("settings/food/round_nutrition", d.value) !== false;
      continue;
    }
    // food_targets is a JSON override map, decoded and filtered to the
    // reach-toward key set — a separate datom from the two above (ADR-0031 §2).
    if (d.attribute === "settings/food/targets") {
      settings.food_targets = parseFilteredNumberMap(
        d.attribute,
        d.value,
        REACH_TOWARD_KEYS
      );
      continue;
    }
    // food_limits is the stay-under override map, decoded and filtered to the
    // limit key set — its own datom, parallel to food/targets (ADR-0032 §2).
    if (d.attribute === "settings/food/limits") {
      settings.food_limits = parseFilteredNumberMap(
        d.attribute,
        d.value,
        LIMIT_KEYS
      );
      continue;
    }
    // food_calculated_targets is the calculator's frozen result (ADR-0033 §4),
    // decoded and filtered to the four personalizable keys — its own datom, the
    // default layer under food_targets (see defaultNutrientTargets).
    if (d.attribute === "settings/food/calculated_targets") {
      settings.food_calculated_targets = parseFilteredNumberMap(
        d.attribute,
        d.value,
        PERSONALIZED_TARGET_KEYS
      );
      continue;
    }
    // food_profile is the inert helper-input blob (ADR-0033 §2), decoded and
    // fully validated — its own datom, read only to pre-fill the calculator form.
    if (d.attribute === "settings/food/profile") {
      settings.food_profile = parseFoodProfile(d.value);
      continue;
    }
    // off_contribute is a JSON boolean, decoded like round_nutrition — only a
    // literal `true` opts in; any malformed/legacy value stays off (ADR-0034 §8).
    if (d.attribute === "settings/off_contribute") {
      settings.off_contribute =
        parseDatomValue("settings/off_contribute", d.value) === true;
      continue;
    }
    // log_export is a JSON boolean, read exactly like off_contribute — only a
    // literal `true` opts in, so a malformed value can never enable an export.
    if (d.attribute === "settings/log_export") {
      settings.log_export =
        parseDatomValue("settings/log_export", d.value) === true;
      continue;
    }
    if (d.attribute === "settings/scraper_proxy_url") {
      settings.scraper_proxy_url = String(
        parseDatomValue(d.attribute, d.value, SETTINGS_STRING_ATTRS)
      );
    }
  }

  return settings;
});

// Appends one atomic settings write: every attribute in the map becomes its own
// `settings:global` datom, but they commit or roll back as a single batch
// (`appendDatoms` wraps the loop in BEGIN/COMMIT — Coding Standards §5). The one
// write primitive every saver below shares, so a saver only names the attributes
// it owns; the clock impurity (`Date.now()`) is deliberately inline here.
async function appendSettings(
  attributes: Record<string, unknown>
): Promise<void> {
  await dbClient.append(
    ingestEntity({ entity: "settings:global", attributes }, Date.now())
  );
}

// Writes the scraper proxy URL, the two Nutrition Display datoms, and the
// OFF-contribution consent toggle; the food-targets and food-limits overrides
// are separate datoms written independently via saveFoodTargets / saveFoodLimits
// (ADR-0031 §2/§3, ADR-0032 §2), so toggling visibility or rounding never touches
// a user's targets or limits and vice versa. Secrets (USDA/TMDB keys, OFF creds)
// do NOT pass through here — they go to localStorage via stores/secrets.ts
// (ADR-0034 §8).
export async function saveSettings(
  state: Omit<
    SettingsState,
    | "food_targets"
    | "food_limits"
    | "food_calculated_targets"
    | "food_profile"
    | "off_contribute"
    // The log-export consent rides `saveLogExportConsent`, so a screen that does
    // not own it cannot clobber it back to off (ADR-0054 §4).
    | "log_export"
  > & {
    // The OFF-contribution consent toggle is optional so pre-#61 callers (and the
    // store tests) still type-check; omitted → off, the opt-in default.
    off_contribute?: boolean;
  }
): Promise<void> {
  await appendSettings({
    "settings/scraper_proxy_url": state.scraper_proxy_url,
    // A list value — stored JSON-encoded like every datom, read back as an
    // array. Default when a caller omits it (e.g. a pre-#29 save).
    "settings/food/visible_nutrients":
      state.visible_nutrients ?? DEFAULT_VISIBLE_NUTRIENTS,
    // Boolean value; default on when a caller omits it (whole-number display
    // is the shipped default now).
    "settings/food/round_nutrition": state.round_nutrition ?? true,
    // OFF-contribution consent master toggle (ADR-0034 §8); default off.
    "settings/off_contribute": state.off_contribute ?? false,
  });
}

/**
 * Persists the local-log export consent as its own datom `settings/log_export`
 * (ADR-0054 §4), independent of every other settings write.
 *
 * Its own writer rather than a field on {@link saveSettings} for the reason
 * ADR-0031 §2 gives about the targets: a screen that does not own this toggle
 * must not have to remember to read it through, and three screens already call
 * `saveSettings` for settings of their own.
 */
export async function saveLogExportConsent(enabled: boolean): Promise<void> {
  await appendSettings({ "settings/log_export": enabled });
}

/**
 * Persists the user's daily-target overrides as a single blob datom
 * `settings/food/targets`, independent of the visibility/round datoms (ADR-0031
 * §2). The map is a partial `{ breakdown_key: number }` in canonical units; the
 * collapse re-filters it to the reach-toward set on read, so a caller need only
 * pass the keys the user has touched (absent → baked default, `0` → opt-out).
 */
export async function saveFoodTargets(
  targets: Partial<Record<string, number>>
): Promise<void> {
  await appendSettings({ "settings/food/targets": targets });
}

/**
 * Persists the user's daily-limit overrides as a single blob datom
 * `settings/food/limits`, independent of the targets/visibility/round datoms
 * (ADR-0032 §2). The stay-under twin of {@link saveFoodTargets}: a partial
 * `{ breakdown_key: number }` map in canonical grams; the collapse re-filters it
 * to the limit set on read, so a caller need only pass the keys the user has
 * touched (absent → baked cap, `0` → opt-out).
 */
export async function saveFoodLimits(
  limits: Partial<Record<string, number>>
): Promise<void> {
  await appendSettings({ "settings/food/limits": limits });
}

/**
 * Persists the whole result of the personalized calculator (ADR-0033 §4) as one
 * atomic append — the frozen `calculated_targets` default layer, the `targets`
 * override map (with the four personalized keys cleared so the fresh default
 * shows through), the inert pre-fill `profile`, and — only when auto-tracking
 * added a macro — the `visible_nutrients` list. Each is still its own datom, but
 * they commit or roll back together, so a mid-write failure can never leave the
 * user with new defaults over stale overrides (Coding Standards §5). Passing
 * `visible_nutrients: undefined` omits that datom entirely (nothing to track).
 */
export async function saveCalculatorPlan(plan: {
  calculated_targets: Partial<Record<string, number>>;
  targets: Partial<Record<string, number>>;
  profile: FoodProfile;
  visible_nutrients?: string[];
}): Promise<void> {
  const attributes: Record<string, unknown> = {
    "settings/food/calculated_targets": plan.calculated_targets,
    "settings/food/targets": plan.targets,
    "settings/food/profile": plan.profile,
  };
  if (plan.visible_nutrients) {
    attributes["settings/food/visible_nutrients"] = plan.visible_nutrients;
  }
  await appendSettings(attributes);
}

/**
 * The display precision **calorie** figures obey, resolved from the user's
 * {@link SettingsState.round_nutrition} choice: `0` places when whole-number
 * display is on, otherwise {@link FOOD_DISPLAY_DECIMALS}. Views pass this into
 * `roundFoodDisplay` / the `calorieDecimals` slot of the nutrient-display
 * builders, so the round-vs-exact logic lives here once rather than in every
 * view. Nutrient amounts take no precision argument at all — `formatNutrientValue`
 * fixes theirs — so this store can only ever reach a kcal number.
 */
export const calorieDisplayDecimals = derived(settingsStore, ($s) =>
  $s.round_nutrition ? 0 : FOOD_DISPLAY_DECIMALS
);
