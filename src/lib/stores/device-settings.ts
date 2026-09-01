import {
  writable,
  readable,
  derived,
  type Readable,
  type Writable,
} from "svelte/store";
import type { FacetId } from "../facets/registry";
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

/**
 * Device settings: **every** application setting, because a setting is never a
 * datom (ADR-0085). They live in `localStorage`, not in the EAVT ledger.
 *
 * The ledger records facts about the world you tracked. How the app is
 * configured is not one of them, whatever its past values would read like in a
 * sentence, so the whole family sits here: view preferences (which nutrients a
 * meter row shows, how many decimals a kcal figure reads at, whether a panel is
 * folded), device configuration (the scraper proxy a browser routes an HTML
 * fetch through), and the food targets, limits, frozen calculator plan and inert
 * body profile that ADR-0063 kept in the ledger on the strength of a test this
 * module's record replaced.
 *
 * Timing is a consequence rather than the reason, and it is the visible one.
 * Every ledger-backed store is asynchronous by construction: `createQueryStore`
 * holds an empty array until its first `dbClient.query` resolves, and that query
 * waits on the worker spawning, SQLite WASM loading and OPFS opening. Until then
 * a settings read returns the *unset default*, so a target the first paint
 * depends on is wrong on screen for the whole of boot. `localStorage` is
 * synchronous, so a value read here is right in the first frame.
 *
 * What is still a datom is what actually happened: a logged meal, an engagement,
 * an acquisition. ADR-0085 §2 exempted two **consents** from that rule as
 * recorded acts; ADR-0086 §2 found that neither is one. Both only ever seeded a
 * checkbox that is shown and ticked again every time — the per-capture box in the
 * Custom form, and the per-payload review sheet — so what the ledger held was a
 * default, which is configuration by §1's own test. They live here now, and the
 * `consent:` entity prefix is gone.
 *
 * Secrets keep their own module (`stores/secrets.ts`). They are also per-device
 * `localStorage`, but for their own reason — a credential must not sit in an
 * undeletable, syncing log (ADR-0034 §8) — and they carry env fallbacks and a
 * retirement sweep that nothing here needs.
 *
 * **Each setting keeps its own key and its own setter** (ADR-0031 §2's rule): a
 * screen that does not own a value must not be able to overwrite it. The
 * scraper proxy is the one exception and it is a deletion rather than a gap —
 * ADR-0080 §4 removed the field that wrote it, so it is read and never set.
 */
// Namespaced like the secrets module, so a preference cannot collide with other
// app state (e.g. `inventoria_test_state`).
const LS_KEYS = {
  nutrition_panel_open: "inventoria_pref_nutrition_panel_open",
  visible_nutrients: "inventoria_pref_visible_nutrients",
  round_nutrition: "inventoria_pref_round_nutrition",
  calories_tracked: "inventoria_pref_calories_tracked",
  scraper_proxy_url: "inventoria_device_scraper_proxy_url",
  food_targets: "inventoria_pref_food_targets",
  food_limits: "inventoria_pref_food_limits",
  food_calculated_targets: "inventoria_pref_food_calculated_targets",
  food_profile: "inventoria_pref_food_profile",
  // The contribution default, a `consent:` entity until ADR-0086 §2. It carries
  // the `food_` segment ADR-0079 §2's scoped wipe matches on. The log-export
  // doors are one per Facet and keep their own table below.
  food_off_contribute: "inventoria_pref_food_off_contribute",
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

/**
 * The mirror of {@link readBoolPref} for the two opt-ins: absent means **off**,
 * and only a stored `"true"` turns one on. Kept separate rather than
 * parameterised, because which way a boolean fails when its store is missing is
 * the whole safety property here — a privacy-locked browser reads every key as
 * absent, and an opt-in that defaulted on there would offer a submission nobody
 * agreed to.
 */
function readOptIn(lsKey: string): boolean {
  return safeGet(lsKey) === "true";
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
 * The proxy this app serves itself, at the path its own Worker answers
 * (ADR-0070). It is the default rather than a suggestion in `.env.example`
 * because it is correct in both environments without anyone configuring it:
 * `vite.config.ts` serves `/api/proxy` in development and the deployed Worker
 * serves it in production. Being same-origin, it also satisfies the app's
 * `COEP: require-corp` without a cross-origin resource policy, which is the
 * reason proxied images render at all.
 */
const BUILT_IN_PROXY_URL = "/api/proxy?url=";

/**
 * The CORS proxy a browser routes an HTML scrape through, as a URL prefix the
 * target is appended to. Three layers, most specific first.
 *
 * A stored value wins. `VITE_SCRAPER_PROXY_URL` comes next, so a dev can point a
 * build at some other proxy without touching code — the same env-fallback shape
 * the secrets module uses, and the reason this reads through a function rather
 * than straight off the key. Failing both, the app uses its own.
 *
 * **Nothing in the app writes the first layer any more.** ADR-0080 §4 deleted
 * the Settings field that did: the app has served its own proxy since ADR-0070,
 * so the field overrode a working default for a reader who did not exist. The
 * layer is still read, because a device that was given a proxy keeps using it.
 *
 * **A stored empty string no longer counts as set**, and that changed with the
 * field. It used to mean "no proxy", the way a blank datom did, because the
 * field could say it and could take it back. It can do neither now, so
 * honouring it would hold a device to a choice it can no longer revise and
 * leave every scrape dead with nothing on any screen saying why. An empty
 * stored value falls through to the default that works.
 */
function readScraperProxyUrl(): string {
  const stored = safeGet(LS_KEYS.scraper_proxy_url);
  if (stored) return stored;
  return (
    (import.meta.env?.VITE_SCRAPER_PROXY_URL as string) ?? BUILT_IN_PROXY_URL
  );
}

const panelOpen = writable<boolean>(readBoolPref(LS_KEYS.nutrition_panel_open));
const roundNutrition = writable<boolean>(readBoolPref(LS_KEYS.round_nutrition));
const caloriesTrackedPref = writable<boolean>(
  readBoolPref(LS_KEYS.calories_tracked)
);
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
 * Whether the **calorie** meter is one of the day's tracked bars. Calories used
 * to be unconditional — `buildNutrientMeters` prepended the bar whatever the
 * selection said, and the Calories card in the target editor had no toggle —
 * which left someone tracking protein alone with a bar they could not put away.
 *
 * It is a preference of its own rather than a member of {@link
 * visibleNutrients}, and deliberately: that list is already stored, and every
 * existing one predates this and holds no `calories` entry. Reading membership
 * would have read every one of them as "calories off" and silently taken the bar
 * away from everybody. A separate key defaults to on and cannot be confused with
 * a list that never mentioned it.
 */
export const caloriesTracked: Readable<boolean> = {
  subscribe: caloriesTrackedPref.subscribe,
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
export function setCaloriesTracked(tracked: boolean): void {
  caloriesTrackedPref.set(tracked);
  safeSet(LS_KEYS.calories_tracked, String(tracked));
}

export function setVisibleNutrients(keys: string[]): void {
  safeSet(LS_KEYS.visible_nutrients, JSON.stringify(keys));
  visible.set([...keys]);
}

/** Records the whole-number calorie display toggle. */
export function setRoundNutrition(round: boolean): void {
  safeSet(LS_KEYS.round_nutrition, String(round));
  roundNutrition.set(round);
}

// ---------------------------------------------------------------------------
// The opt-ins (ADR-0086 §2)
//
// These were `consent:food_off_contribute` and `consent:log_export`, datoms on
// their own entities under ADR-0085 §2. Neither recorded an act. Each only
// SEEDS a control that is shown again every time and must be answered again
// every time — the per-capture contribution checkbox (ADR-0034 §8, model C) and
// the log review sheet, which still displays the exact payload and takes the
// channels one at a time. A default for a checkbox is configuration.
//
// Every one of them defaults **off** and stays opt-in. Nothing about moving
// stores changes that or is allowed to: the ledger read collapsed to `true`
// only on a literal `true`, and {@link readOptIn} keeps the same one-way
// failure.
//
// The cost is ADR-0085's, taken again knowingly: an opt-in set on your phone
// does not reach your laptop, and a jar-wide wipe of `localStorage` clears it.
// Both are the safe direction — the user is asked again.
//
// The contribution default is **one** across the app, because it governs an act
// on the world and contributing to Open Food Facts is the same act whichever
// screen offers it (ADR-0085 §4). The log-export opt-in is one **per Facet**,
// because it governs a door; its table is below.
// ---------------------------------------------------------------------------

const offContribute = writable<boolean>(readOptIn(LS_KEYS.food_off_contribute));

/**
 * Whether the per-capture "contribute this back to Open Food Facts" checkbox is
 * offered pre-ticked (ADR-0034 §8, model C). **Not** the consent to submit: the
 * checkbox is always shown before a submit and must be ticked every time, and
 * that tick is the whole of the agreement.
 */
export const offContributeDefault: Readable<boolean> = {
  subscribe: offContribute.subscribe,
};

/** Records the OFF-contribution default. Its own writer, so a screen that does
 *  not own it cannot clobber it (ADR-0031 §2). */
export function setOffContributeDefault(enabled: boolean): void {
  safeSet(LS_KEYS.food_off_contribute, String(enabled));
  offContribute.set(enabled);
}

// ---------------------------------------------------------------------------
// The log-export doors, one per Facet (ADR-0080 §5)
//
// A log-export opt-in governs an **egress door**, and each Facet has its own —
// which is clause (b) of ADR-0080 §1 exactly: Rations writes the only channel
// there is, so Rations governs its egress. Until this existed the root's switch
// gated food's channel from a screen ADR-0078 §7 leaves a Rations user no way
// to reach, so it was permanently off there with no surface saying why.
//
// **The two names are pinned by ADR-0085 §4, not derived from the Facet id**,
// and the asymmetry is the record's own: the root's is unqualified because it
// belongs to no Tracked Domain — the log facility is machinery, not a tracked
// area of anyone's life — while Rations' is named for the *domain* that
// registers the channel, which is also what puts it under the
// `inventoria_pref_food_` namespace ADR-0079 §2's scoped wipe takes.
//
// A table rather than two exported pairs, so the Local Logs card is one
// component taking a Facet id rather than a component taking a store and a
// setter from each call site. It records where a value lives and nothing about
// which controls a Facet carries — the thing ADR-0080 §8 keeps out of the
// registry — and a third Facet is a compile error here until someone names its
// door.
// ---------------------------------------------------------------------------

/** One Facet's export opt-in: the key it persists under, and its live value. */
interface LogExportDoor {
  readonly key: string;
  readonly enabled: Writable<boolean>;
}

function logExportDoor(key: string): LogExportDoor {
  return { key, enabled: writable<boolean>(readOptIn(key)) };
}

const LOG_EXPORT_DOORS = {
  root: logExportDoor("inventoria_pref_log_export"),
  food: logExportDoor("inventoria_pref_food_log_export"),
} as const satisfies Record<FacetId, LogExportDoor>;

/**
 * Whether one Facet's local-log export is offered at all (ADR-0054 §4).
 * **Not** the consent to export: the review sheet still shows the exact payload
 * and the channels are chosen individually there, because bundling a `personal`
 * channel with a `technical` one behind one yes is a consent surface that does
 * not mean what it appears to.
 */
export function logExportEnabledFor(facetId: FacetId): Readable<boolean> {
  return { subscribe: LOG_EXPORT_DOORS[facetId].enabled.subscribe };
}

/** Records whether one Facet's log export is offered. Its own key, so no
 *  Facet's switch can ever speak for another's door (ADR-0080 §5). */
export function setLogExportEnabledFor(
  facetId: FacetId,
  enabled: boolean
): void {
  const door = LOG_EXPORT_DOORS[facetId];
  safeSet(door.key, String(enabled));
  door.enabled.set(enabled);
}

/**
 * The scraper proxy URL prefix (localStorage, else the env fallback, else the
 * app's own). Read once at module load and never written — it is the one
 * setting here with no setter, because ADR-0080 §4 deleted the field that wrote
 * it rather than moving it.
 */
export const scraperProxyUrl: Readable<string> = readable(
  readScraperProxyUrl()
);

// ---------------------------------------------------------------------------
// The food targets (ADR-0085 §5)
//
// These four were datoms on `settings:global` until ADR-0085. They configure
// what the dashboard draws as your line; nothing was measured when they were
// set, so they are settings and they are kept here with the rest. The cost is
// named in that record rather than left to be discovered: a target set on your
// phone never reaches your laptop, and it is no longer in the Ledger export.
// If cross-device targets turn out to matter, the answer is a *recorded goal*
// with its own entity, never a setting readmitted to the ledger.
//
// Each reader tolerates anything malformed, because a stored blob is whatever
// the last version of the app (or a hand-edited store) left behind and a
// resolver must never be handed an out-of-set key or a non-numeric value.
// ---------------------------------------------------------------------------

/**
 * The body metrics + choices the personalized calorie/macro helper (ADR-0033) was
 * last run with — an **inert** blob that drives nothing live: the dashboard never
 * reads it, the resolver never sees it. It exists purely to pre-fill the
 * calculator form on re-open, so bumping a weight and re-applying is painless
 * (ADR-0033 §2). All snake_case per house convention; metric only (kg/cm), as
 * Mifflin-St Jeor is natively metric.
 */
export interface FoodProfile {
  sex: BiologicalSex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity: ActivityLevel;
  goal: EnergyGoal;
}

/**
 * Reads one of the food number-map blobs off its key: a non-object (older or
 * garbage value) reads as an empty map, and an entry survives only when its key
 * is in `keySet` and its value is a finite number. Shared by the three
 * reach-toward / stay-under / calculated-default blobs (ADR-0031 §2, ADR-0032
 * §2, ADR-0033 §4) — each passes its own key and key set.
 */
function readFilteredNumberMap(
  lsKey: string,
  keySet: ReadonlySet<string>
): Partial<Record<string, number>> {
  const raw = safeGet(lsKey);
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
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
 * Reads the inert food-profile blob (ADR-0033 §2). The profile is
 * **all-or-nothing pre-fill data**: a non-object, an unknown enum value or a
 * non-finite metric reads back as `null` (the form simply opens blank) rather
 * than seeding the calculator with a half-valid body profile.
 */
function readFoodProfile(): FoodProfile | null {
  const raw = safeGet(LS_KEYS.food_profile);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
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

const targets = writable<Partial<Record<string, number>>>(
  readFilteredNumberMap(LS_KEYS.food_targets, REACH_TOWARD_KEYS)
);
const limits = writable<Partial<Record<string, number>>>(
  readFilteredNumberMap(LS_KEYS.food_limits, LIMIT_KEYS)
);
const calculatedTargets = writable<Partial<Record<string, number>>>(
  readFilteredNumberMap(
    LS_KEYS.food_calculated_targets,
    PERSONALIZED_TARGET_KEYS
  )
);
const profile = writable<FoodProfile | null>(readFoodProfile());

/**
 * User overrides for the baked daily nutrition targets (ADR-0031 §2, #40): a
 * partial `{ breakdown_key: number }` map filtered to the reach-toward key set
 * ({@link REACH_TOWARD_KEYS}), each value in the **same canonical unit as the
 * baked map** (grams for mass, kcal for energy). Presence/absence is the model:
 * a key **absent** falls back to the baked default, **`> 0`** overrides it, and
 * **`0`** opts the nutrient out of having a target (see `resolveNutrientTargets`).
 */
export const foodTargets: Readable<Partial<Record<string, number>>> = {
  subscribe: targets.subscribe,
};

/**
 * User overrides for the baked daily nutrient **limits** (ADR-0032, #43): the
 * stay-under twin of {@link foodTargets}, filtered to the limit key set
 * ({@link LIMIT_KEYS}: sodium, saturated fat, cholesterol, trans fat), each value
 * in grams. Same presence/absence model — absent → the baked cap, `> 0` → an
 * override cap, `0` → opts out of a limit (see `resolveNutrientLimits`).
 */
export const foodLimits: Readable<Partial<Record<string, number>>> = {
  subscribe: limits.subscribe,
};

/**
 * The personalized calorie/macro helper's frozen result (ADR-0033 §4): the
 * `{ energy, protein, fat, carbs }` set the user last accepted from "Calculate
 * from body metrics", filtered to {@link PERSONALIZED_TARGET_KEYS}. This is a
 * **default** layer, not an override: it sits *between* the baked reference and
 * {@link foodTargets}, so a cleared override (the editor's ↺) falls back to the
 * computed figure rather than the generic 2000-kcal reference (see
 * `defaultNutrientTargets`). Absent → the helper has never been applied. The
 * stored numbers are frozen, never recomputed, so tweaking the helper's
 * constants cannot shift a user's defaults.
 */
export const foodCalculatedTargets: Readable<Partial<Record<string, number>>> =
  {
    subscribe: calculatedTargets.subscribe,
  };

/**
 * The last-used inputs of the personalized calorie/macro helper (ADR-0033 §2),
 * or `null` when the helper has never been applied. Read only to seed the
 * calculator form — **inert** everywhere else, so it is deliberately not part of
 * the resolved targets/limits the app renders.
 */
export const foodProfile: Readable<FoodProfile | null> = {
  subscribe: profile.subscribe,
};

/** Records the reach-toward override map. Its own key, its own setter. */
export function setFoodTargets(next: Partial<Record<string, number>>): void {
  safeSet(LS_KEYS.food_targets, JSON.stringify(next));
  targets.set({ ...next });
}

/** Records the stay-under override map, independent of the targets above. */
export function setFoodLimits(next: Partial<Record<string, number>>): void {
  safeSet(LS_KEYS.food_limits, JSON.stringify(next));
  limits.set({ ...next });
}

/**
 * Records the whole result of the personalized calculator (ADR-0033 §4) — the
 * frozen `calculated_targets` default layer, the `targets` override map (with the
 * four personalized keys cleared so the fresh default shows through), and the
 * inert pre-fill `profile`.
 *
 * This was one atomic ledger append until ADR-0085 §5. `localStorage` has no
 * transaction, so the three writes are sequential; the exposure is smaller than
 * the guarantee it replaced, since they are synchronous, in one function, with
 * nothing awaited between them. Kept as one call rather than three at the call
 * site so the three stay a plan, not three unrelated edits.
 */
export function applyCalculatorPlan(plan: {
  calculated_targets: Partial<Record<string, number>>;
  targets: Partial<Record<string, number>>;
  profile: FoodProfile;
}): void {
  safeSet(
    LS_KEYS.food_calculated_targets,
    JSON.stringify(plan.calculated_targets)
  );
  calculatedTargets.set({ ...plan.calculated_targets });
  setFoodTargets(plan.targets);
  safeSet(LS_KEYS.food_profile, JSON.stringify(plan.profile));
  profile.set({ ...plan.profile });
}
