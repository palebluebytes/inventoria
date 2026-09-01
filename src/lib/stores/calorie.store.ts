import { dbClient } from "../db/db.client";
import { mintEntity } from "../facets/entity-id";
import { ingestEntity } from "../ingestion/ingest";
import { HLC_ORDER_ASC, HLC_ORDER_DESC } from "../db/hlc";
import { createProjectionStore, createQueryStore } from "./datoms.store";
import type { ConsumptionEvent } from "../food/consumption-state";
import {
  basisUnit,
  nutritionFromMacros,
  roundFood,
  PER_SERVING,
  EXTRA_NUTRIENT_KEYS,
  type AmountUnit,
  type NutritionInfo,
  type NutritionBreakdown,
  type Portion,
} from "../food/nutrition";
import type { LabelCapture, ManualEntry } from "../food/provenance";
import {
  deriveRecipeNutrition,
  deriveIngredientMacros,
  type ReferenceIngredient,
} from "../food/recipe-nutrition";
import {
  buildInstantiation,
  type Instantiation,
} from "../food/recipe-instantiation";
import {
  ingredientFromTwin,
  quantityLabel,
  type RecipeIngredient,
} from "../food/recipe-ingredient";

export type { ConsumptionEvent };

// Helper to get local start/end of a given date
export function getDayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

// Live store of every enriched Consumption Event, folded by the worker-side
// CONSUMPTION projection. The Food dashboard narrows to a day on the main
// thread (ADR-0019).
export const consumptionStore = createProjectionStore<ConsumptionEvent[]>(
  "CONSUMPTION",
  {},
  []
);

/** One saved Recipe Twin, surfaced for the Instantiate browser (ADR-0022). */
export interface RecipeTwinRow {
  entity: string;
  value: string;
}

// Live list of saved Recipe Twins (by `recipe/name`), newest first — the browse
// list behind the Instantiate verb. Rows are `{ entity, value }` where `value` is
// the JSON-encoded name; callers dedupe by entity (a future template rename would
// append a second name datom, ADR-0022 §Deferred).
export const recipeTwinsStore = createQueryStore<RecipeTwinRow>(
  `SELECT entity, value FROM datoms WHERE attribute = 'recipe/name' ORDER BY ${HLC_ORDER_DESC}`
);

/** Filters a consumption list to the events that fall on a given local day. */
export function consumptionForDay(
  events: ConsumptionEvent[],
  date: Date
): ConsumptionEvent[] {
  const { start, end } = getDayBounds(date);
  return events.filter((e) => e.time >= start && e.time <= end);
}

// ---------------------------------------------------------------------------
// Logging helper actions
// ---------------------------------------------------------------------------

/**
 * Creates and appends a Consumption Event's datoms to the ledger. `instantiation`
 * is the optional `event/instantiation` snapshot a logged recipe carries beside
 * its frozen `event/metrics` headline (ADR-0022); a plain food logs without one.
 *
 * `breakdown` widens the frozen `event/metrics` to the food's **full** panel
 * scaled to the amount (ADR-0030 / #28): the four `{ calories, protein, fat,
 * carbs }` headline keys are written from the positional args, and every extra
 * nutrient the breakdown carried is merged in under its panel name. Omit it — as
 * a macro-only custom food (no source panel) does — and the snapshot stays
 * exactly the four-key headline; an extra a food never reported is never written,
 * so it reads as absent (never 0) forever.
 *
 * `protein`/`fat`/`carbs` are **omittable** (pass `undefined`): a manual-entry
 * intent (ADR-0035 §7) freezes `calories` only, so a macro passed as `undefined`
 * is left OUT of `event/metrics` entirely — the daily macro meters treat it as
 * not-counted (never coerced to 0), moving only the calorie ring. Every other
 * caller passes real numbers and is unchanged.
 *
 * `entityId` is the id the event is logged under. Every caller but one omits it
 * and gets the fresh random mint below, which is right for an occasion the user
 * is recording now. The receive path supplies one instead, derived from the
 * payload it is accepting, so that accepting the same meal twice cannot log it
 * twice (ADR-0073 §5).
 */
export async function logFoodConsumption(
  ...args: Parameters<typeof consumptionDatoms>
): Promise<string> {
  const { entity, datoms } = consumptionDatoms(...args);
  await dbClient.append(datoms);
  return entity;
}

/**
 * The datoms one Consumption Event is made of, minted but not yet appended.
 *
 * Split out of `logFoodConsumption` so a caller writing SEVERAL events can put
 * them all in one append (see `scaleLoggedFoods`). Appending per event costs a
 * worker round trip and a full re-projection each, and a retract-and-replace
 * split across two appends is briefly visible as BOTH the old food and its
 * replacement — the day grows a row, then loses it again.
 */
function consumptionDatoms(
  targetEntity: string,
  quantity: string,
  meal_type: string,
  calories: number,
  protein: number | undefined,
  fat: number | undefined,
  carbs: number | undefined,
  selectedDate: Date,
  instantiation?: Instantiation,
  breakdown?: NutritionBreakdown,
  entityId?: string
) {
  // Use selected date's time, but keep current hour/minute/second so events don't all cluster at 00:00
  const now = new Date();
  const eventDate = new Date(selectedDate);
  eventDate.setHours(
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  const timestamp = eventDate.getTime();

  const entity =
    entityId ??
    mintEntity(
      "event:consume_",
      `${Math.random().toString(36).substring(2, 9)}_${timestamp}`
    );

  // `calories` is always frozen; each of the three headline macros is frozen only
  // when supplied (a manual-entry intent omits them, ADR-0035 §7 — absent ≠ 0).
  // The rest of the panel is merged in under its panel name only for nutrients the
  // food actually reported (ADR-0030 / #28).
  const metrics: Record<string, number> = { calories };
  if (typeof protein === "number") metrics.protein = protein;
  if (typeof fat === "number") metrics.fat = fat;
  if (typeof carbs === "number") metrics.carbs = carbs;
  if (breakdown) {
    for (const key of EXTRA_NUTRIENT_KEYS) {
      const v = breakdown[key];
      if (typeof v === "number") metrics[key] = v;
    }
  }

  const attributes: Record<string, unknown> = {
    "event/type": "ConsumeAction",
    "event/target": targetEntity,
    "event/quantity": quantity,
    "event/meal_type": meal_type,
    "event/metrics": metrics,
  };
  if (instantiation) attributes["event/instantiation"] = instantiation;

  const datoms = ingestEntity({ entity, attributes });

  // Inject manually since ingestEntity maps all values. Note time is injected inside dbClient.append
  // but datoms array has .time field which dbClient uses.
  for (const datom of datoms) {
    datom.time = timestamp;
  }

  return { entity, datoms };
}

/** One logged food, already resolved to what a scale will act on. */
export interface ScaleChange {
  /** The event being replaced. Its meal, its day and its id come from here. */
  event: ConsumptionEvent;
  /** The scaled amount, in `unit`. */
  amount: number;
  unit: AmountUnit;
  /** The target twin's panel, read when the Scale tier opened. */
  panel: NutritionInfo;
  /** The food twin the replacement points at. */
  ref: string;
}

/**
 * Scales several logged foods in **one append** (ADR-0088 §5).
 *
 * `changeLoggedFoodAmount` below is the single-food version and re-reads the
 * twin each time. Across a Selection that read is pure waste: the Scale tier
 * already resolved every panel before it drew, which is what the live preview
 * is derived from, so the caller hands them back rather than making the worker
 * find them again. What is left is arithmetic, and the whole run becomes one
 * round trip instead of three per food.
 *
 * The single append is what makes the change land as one event rather than a
 * cascade: every row takes its new figure and lets go of its mark in the same
 * frame, and no intermediate state is ever projected — not a day holding an old
 * food beside its replacement, and not a half-scaled Selection.
 */
export async function scaleLoggedFoods(
  changes: ScaleChange[]
): Promise<number> {
  if (changes.length === 0) return 0;

  const datoms: ReturnType<typeof ingestEntity> = [];
  for (const change of changes) {
    const breakdown = deriveIngredientMacros(
      { ref: change.ref, amount: change.amount, unit: change.unit },
      () => change.panel
    );
    const replacement = consumptionDatoms(
      change.ref,
      quantityLabel(change.amount, change.unit),
      change.event.meal_type ?? "snack",
      roundFood(breakdown.calories),
      roundFood(breakdown.protein),
      roundFood(breakdown.fat),
      roundFood(breakdown.carbs),
      new Date(change.event.time),
      undefined,
      breakdown
    );
    datoms.push(...replacement.datoms);
    // The same retraction `retractConsumptionEvent` writes, inlined so it rides
    // the one append. `event/replaced_by` is also what keeps the row where it
    // is: the projection hands a replacement its predecessor's place.
    datoms.push(
      ...ingestEntity({
        entity: change.event.id,
        attributes: {
          "event/status": "retracted",
          "event/replaced_by": replacement.entity,
        },
      })
    );
  }

  await dbClient.append(datoms);
  return changes.length;
}

/**
 * Copies a past meal's entries into `meal_type` on `selectedDate` (ADR-0058).
 *
 * Every field a copy needs is already frozen on the source event, so this
 * re-logs rather than re-derives: the quantity is carried verbatim (§2), the
 * `event/instantiation` snapshot travels as it was cooked rather than being
 * re-read from a template that may since have been edited (§9), the full frozen
 * panel goes through as the breakdown, and an absent macro stays absent rather
 * than becoming a 0. The stamp is `logFoodConsumption`'s own — now's clock on
 * the viewed day (§10).
 *
 * Per §11 it loops per item and catches per item, so one failed append leaves
 * the rest of the meal copyable instead of aborting the run half-applied. This
 * is `scaleSelected`'s contract in `FoodView.svelte`, and the counts it returns
 * are what {@link copyTally} turns into a line — or into silence.
 *
 * `partitionCopyable` has already removed what cannot be reproduced, so `lost`
 * here counts only appends that actually threw.
 *
 * `mintEventId` is the receive path's one seam into this operation (ADR-0073 §5,
 * amending ADR-0058). Accepting a sent meal **is** this copy with a wire in
 * front of it — the same re-log of frozen fields into the recipient's own meal
 * on their own clock — differing only in that the id is derived from the payload
 * rather than minted fresh, so a meal accepted twice cannot land twice. Omitted,
 * every copy mints its own.
 */
export async function copyPastMeal(
  items: ConsumptionEvent[],
  meal_type: string,
  selectedDate: Date,
  mintEventId?: (item: ConsumptionEvent) => string
): Promise<{ copied: number; lost: number }> {
  let copied = 0;
  let lost = 0;
  for (const item of items) {
    try {
      await logFoodConsumption(
        item.target as string,
        item.quantity as string,
        meal_type,
        item.calories as number,
        item.protein,
        item.fat,
        item.carbs,
        selectedDate,
        item.instantiation,
        item.metrics,
        mintEventId?.(item)
      );
      copied += 1;
    } catch (e) {
      console.error("copying a logged food failed", e);
      lost += 1;
    }
  }
  return { copied, lost };
}

/**
 * Saves a custom manual entry or photo-based food twin.
 */
export async function saveCustomFood(
  name: string,
  calories: number,
  protein: number,
  fat: number,
  carbs: number,
  photoBase64?: string,
  customEntityId?: string
): Promise<string> {
  const timestamp = Date.now();
  const entityId =
    customEntityId ||
    mintEntity(
      "food:custom_",
      `${Math.random().toString(36).substring(2, 9)}_${timestamp}`
    );

  // Custom foods are entered as absolute totals for one serving, so the panel's
  // basis is "1 serving" rather than 100 g (ADR-0021).
  const nutrition = nutritionFromMacros(
    { calories, protein, fat, carbs },
    PER_SERVING
  );
  const payload: any = {
    entity: entityId,
    attributes: {
      "food/name": name,
      "nutrition/info": nutrition,
    },
  };

  if (photoBase64) {
    payload.attributes["food/photo_base64"] = photoBase64;
  }

  await dbClient.append(ingestEntity(payload));
  return entityId;
}

/** The full-panel food a label capture commits (ADR-0034 §6). */
export interface LabelFoodInput {
  /** schema.org name read from the label. */
  name: string;
  /** Brand read from the label, when present. */
  brand?: string;
  /**
   * Category read from OFF / typed on the form → `food/category` (OFF's
   * language-neutral taxonomy). Stored so an enriched twin keeps the identity a
   * later edit or OFF contribution can forward (ADR-0034 §8, #84).
   */
  category?: string;
  /**
   * The corrected ingredients transcription (ADR-0043 §5) → canonical OFF
   * `food/ingredients_text`. True read-along: seeded from the twin's existing
   * `food/ingredients_text`, corrected on the form, written back here. NB this is
   * the canonical OFF ingredients text, NOT `food/ingredients` (the unrelated
   * menu-descriptor, ADR-0035). Written only when non-empty (suppress-when-empty),
   * so an untouched field never appends a blank datom.
   */
  ingredientsText?: string;
  /**
   * The full nutrition panel the user confirmed. Stored VERBATIM: grams, and
   * **absent ≠ 0** — the form omits any row the label didn't carry, and this
   * writer never fills a missing key with 0 (ADR-0030 / #28).
   */
  nutrition: NutritionInfo;
  /** Household portions transcribed from the label, when any. */
  portions?: Portion[];
  /**
   * The captured label photos (base64), first = display. Empty for a photo-less
   * manual entry — then neither `food/label_photos` nor the `food/photo_base64`
   * mirror is written (absent `food/label_photos` ⇒ no photo, ADR-0034 §5).
   */
  labelPhotos: string[];
  /** The user-origin provenance envelope ({@link buildLabelCapture}, §7). */
  labelCapture: LabelCapture;
  /**
   * `gtin:<code>` to ENRICH that twin in place (found-but-poor / missing /
   * unread-but-typed doors), or omitted to MINT a fresh `food:custom_` twin
   * (barcode-less manual). See the door→entity table, ADR-0034 §6.
   */
  entityId?: string;
}

/**
 * Saves a full-fidelity food twin captured from its label (ADR-0034 §6) — the
 * writer that widens the too-narrow {@link saveCustomFood} for a whole
 * `nutrition/info` panel + brand + portions + a photo array + user provenance.
 *
 * The key follows the barcode: an `entityId` (`gtin:<code>`) is used **verbatim**
 * to enrich that twin in place, while an absent one **mints** a fresh
 * `food:custom_<rand>_<ts>` exactly as `saveCustomFood` does (the inline
 * `Date.now()`/`Math.random()` is the intended impurity source). Enrich is a
 * PLAIN append — no delete, no read-modify-write: the ledger is append-only and
 * `getLocalFoodTwin` folds latest-wins, so the corrected `food/name` +
 * `nutrition/info` supersede a found-but-poor OFF twin's values on the next read
 * while its `provenance/raw` survives beside the new `food/label_capture`.
 *
 * The panel is written exactly as given (absent ≠ 0). `food/photo_base64` mirrors
 * `labelPhotos[0]` so every existing singular-photo display surface is unchanged
 * (§5). Returns the twin's entity id (minted or the passed one).
 */
export async function saveLabelFood(input: LabelFoodInput): Promise<string> {
  const timestamp = Date.now();
  const entityId =
    input.entityId ||
    mintEntity(
      "food:custom_",
      `${Math.random().toString(36).substring(2, 9)}_${timestamp}`
    );

  const attributes: Record<string, unknown> = {
    "food/name": input.name,
    // The panel is stored verbatim — the form already omitted untouched rows, so
    // this writer must not fabricate a 0 for a nutrient the label didn't carry.
    "nutrition/info": input.nutrition,
    "food/label_capture": input.labelCapture,
  };
  if (input.brand) attributes["food/brand"] = input.brand;
  if (input.category) attributes["food/category"] = input.category;
  // Canonical OFF ingredients (ADR-0043 §5) — appended only when non-empty, so an
  // untouched read-along field never writes a blank. NOT `food/ingredients`.
  if (input.ingredientsText?.trim())
    attributes["food/ingredients_text"] = input.ingredientsText.trim();
  if (input.portions?.length) attributes["food/portions"] = input.portions;
  if (input.labelPhotos.length > 0) {
    attributes["food/label_photos"] = input.labelPhotos;
    // Mirror the first photo into the singular attribute every current display
    // surface reads (staged card, consumption views, ingredient picker), §5.
    attributes["food/photo_base64"] = input.labelPhotos[0];
  }

  await dbClient.append(ingestEntity({ entity: entityId, attributes }));
  return entityId;
}

/** A manual-entry food from one of the Custom chooser's intents (ADR-0035). */
export interface ManualFoodInput {
  /** The dish/food name (already resolved — quick-estimate defaults it upstream). */
  name: string;
  /** The one number every intent carries; stored calories-only, no macros. */
  calories: number;
  /** Menu "Place" → `food/brand`; absent for quick estimate / plate. */
  brand?: string;
  /**
   * Free-text ingredients → `food/ingredients` — descriptive only, NEVER computes
   * calories (ADR-0035 §4). Present for the menu / plate intents when typed.
   */
  ingredients?: string;
  /** The captured/picked photo (base64); mirrored into `food/label_photos[0]`. */
  photo?: string;
  /** The manual-entry provenance envelope ({@link buildManualEntry}, §6). */
  manualEntry: ManualEntry;
}

/**
 * Saves a manual-entry food twin for one of the Custom chooser's three intents
 * (ADR-0035 §3–§6). Always MINTS a fresh `food:custom_` twin — a manual entry is
 * never a barcoded `gtin:` product (the inline `Date.now()`/`Math.random()` is the
 * intended impurity source). The panel is **calories-only**: macros are absent,
 * never 0 (ADR-0035 §7), so the twin is honest about carrying no protein/fat/carbs.
 * The `menu` intent additionally writes `food/brand` (Place) and `food/ingredients`
 * (descriptive free text, never a calorie source). A photo, when present, is
 * stored under `food/label_photos` with the singular `food/photo_base64` mirror so
 * every existing display surface reads it (ADR-0034 §5). Returns the minted id.
 */
export async function saveManualFood(input: ManualFoodInput): Promise<string> {
  const timestamp = Date.now();
  const entityId = mintEntity(
    "food:custom_",
    `${Math.random().toString(36).substring(2, 9)}_${timestamp}`
  );

  // Calories-only panel against a whole-serving basis (ADR-0021): only `calories`
  // is set, so macros stay absent (not 0) on the twin, matching the event freeze.
  const nutrition: NutritionInfo = {
    serving_size: PER_SERVING,
    calories: input.calories,
  };
  const attributes: Record<string, unknown> = {
    "food/name": input.name,
    "nutrition/info": nutrition,
    "food/manual_entry": input.manualEntry,
  };
  if (input.brand?.trim()) attributes["food/brand"] = input.brand.trim();
  if (input.ingredients?.trim()) {
    attributes["food/ingredients"] = input.ingredients.trim();
  }
  if (input.photo) {
    attributes["food/label_photos"] = [input.photo];
    attributes["food/photo_base64"] = input.photo;
  }

  await dbClient.append(ingestEntity({ entity: entityId, attributes }));
  return entityId;
}

export interface RecipeInput {
  /** schema.org name. */
  name: string;
  /** Pure `{ ref, amount, unit }` references to the ingredient food twins. */
  ingredients: ReferenceIngredient[];
  /** schema.org description (the "Notes" field in the UI). */
  description?: string;
  /** schema.org url / isBasedOn (the "Source" field in the UI). */
  url?: string;
  /** schema.org image. */
  image?: string;
  /** schema.org recipeInstructions — ordered HowToStep text. */
  instructions?: string[];
  /** schema.org recipeYield; defaults to 1 (single-serving) this ticket. */
  yield?: number;
}

/**
 * Saves a schema.org/Recipe twin (ADR-0021). A recipe stores **no** macros of
 * its own — `recipe/ingredients` holds pure `{ ref, amount, unit }` references,
 * and per-serving nutrition is derived from the referenced ingredient twins.
 * That derived aggregate is frozen into the Consumption Event's `event/metrics`
 * snapshot at log time, so later recipe edits never rewrite logged history.
 *
 * Called two ways (ADR-0022 #13):
 *   • **Define / Consolidate** (no `entity`): mints a fresh `recipe:<id>`. Empty
 *     optional fields are skipped, keeping the ledger clean.
 *   • **Edit** (`entity` given): appends newer `recipe/*` datoms to that SAME
 *     twin. Latest-wins re-seeds only **future** instantiations; past ones,
 *     being snapshots, never move. Optional fields are written *unconditionally*
 *     here — append-only has no delete, so an omitted attribute would keep its
 *     old value; writing an empty value is how an edit clears a field.
 */
export async function saveRecipe(
  input: RecipeInput,
  entity?: string
): Promise<string> {
  const isEdit = entity !== undefined;
  const entityId =
    entity ??
    mintEntity(
      "recipe:",
      `${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
    );

  const attributes: Record<string, any> = {
    "recipe/name": input.name,
    // Store direct JSON arrays/objects; ingestEntity/worker stringifies them.
    "recipe/ingredients": input.ingredients,
    "recipe/yield": input.yield ?? 1,
  };
  // Optional schema.org fields. One rule for all four: write the present value,
  // or — on edit only — its `empty` sentinel to clear the field (append-only has
  // no delete). `value` falsy on a Define simply skips the attribute.
  const optionals: [key: string, value: unknown, empty: unknown][] = [
    ["recipe/description", input.description?.trim(), ""],
    ["recipe/url", input.url?.trim(), ""],
    [
      "recipe/instructions",
      input.instructions?.length ? input.instructions : undefined,
      [],
    ],
    ["recipe/image", input.image, ""],
  ];
  for (const [key, value, empty] of optionals) {
    if (isEdit || value) attributes[key] = value ?? empty;
  }

  await dbClient.append(ingestEntity({ entity: entityId, attributes }));
  return entityId;
}

/**
 * Logs a recipe as a Recipe Instantiation — a Consumption Event carrying a frozen
 * `event/instantiation` snapshot beside its `event/metrics` headline (ADR-0022).
 * Both are derived from the referenced ingredient twins' real `nutrition/info`
 * panels ÷ `recipeYield`: the headline via `deriveRecipeNutrition`, the snapshot's
 * per-row macros via the same `deriveIngredientMacros` those sum from, so the rows
 * add up to the headline forever. This is the single store path that computes them,
 * so a logged recipe's numbers are the true derivation, not hand-supplied.
 * `resolve` yields each referenced twin's panel and `resolveName` its display name
 * (both from the in-memory builder, or a test double) — read, never mutated.
 */
export async function logRecipeConsumption(
  recipeId: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => NutritionInfo | undefined,
  resolveName: (ref: string) => string | undefined,
  meal_type: string,
  selectedDate: Date
): Promise<string> {
  const snapshot = deriveRecipeNutrition(ingredients, recipeYield, resolve);
  const instantiation = buildInstantiation(
    recipeId,
    ingredients,
    recipeYield,
    resolve,
    resolveName
  );
  return logFoodConsumption(
    recipeId,
    "1 serving",
    meal_type,
    snapshot.calories,
    snapshot.protein,
    snapshot.fat,
    snapshot.carbs,
    selectedDate,
    instantiation,
    snapshot
  );
}

/**
 * Corrects a past Recipe Instantiation by supersession (ADR-0008 / ADR-0022): it
 * logs a **new** instantiation with a freshly-derived snapshot, then retracts the
 * old event with `event/replaced_by` pointing at the replacement. A read never
 * silently drifts — the correction re-derives from the *current* ingredient twins
 * (via `resolve` / `resolveName`, exactly like editing a logged food), so a stale
 * frozen row is only ever replaced by a deliberate edit, never rewritten in place.
 * `based_on` is the template the occasion was seeded from (carried through from
 * the original instantiation's `based_on`, equal to its `event/target`). Returns
 * the new event's id.
 */
export async function correctInstantiation(
  editId: string,
  based_on: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => NutritionInfo | undefined,
  resolveName: (ref: string) => string | undefined,
  meal_type: string,
  selectedDate: Date
): Promise<string> {
  const newId = await logRecipeConsumption(
    based_on,
    ingredients,
    recipeYield,
    resolve,
    resolveName,
    meal_type,
    selectedDate
  );
  await retractConsumptionEvent(editId, newId);
  return newId;
}

/**
 * Retracts a Consumption Event by appending a newer `event/status = "retracted"`
 * datom (never deletes — the projection's latest-wins fold hides it). Mirrors the
 * habit soft-archive convention (ADR-0008). `replacedBy` links the retracted event
 * to whatever supersedes it (e.g. the recipe event, or the re-logged event of an
 * edit) for an auditable trail; omit it for a plain user-initiated removal.
 */
export async function retractConsumptionEvent(
  eventId: string,
  replacedBy?: string
): Promise<void> {
  const attributes: Record<string, string> = {
    "event/status": "retracted",
  };
  if (replacedBy) attributes["event/replaced_by"] = replacedBy;
  await dbClient.append(ingestEntity({ entity: eventId, attributes }));
}

/**
 * Moves logged foods to another meal of the same day by appending **one new
 * `event/meal_type` datom onto each existing Consumption Event** (ADR-0088 §8).
 * Latest-wins does the rest.
 *
 * It is deliberately NOT the re-log-and-retract every other edit in this module
 * performs. Re-logging would assert that you un-ate that banana at breakfast and
 * ate a different one at lunch, leaving two bananas in the history with one
 * retracted; a move corrects a fact about one event and re-derives no numbers,
 * so the event keeps its id, its `event/time`, its metrics, its photo, its
 * provenance and its arrival mark. `retractConsumptionEvent` above is the
 * precedent: a Consumption Event may gain an attribute after the fact.
 *
 * Because no id changes, a caller holding the old ids — the Selection — needs
 * nothing back.
 *
 * **One append for the whole move**, on `scaleLoggedFoods`'s reasoning above.
 * Appending per food costs a worker round trip and a full re-projection each, so
 * the foods relocate one at a time — a stagger nobody designed, just the round
 * trips showing through. In one append the meal sections redraw once and every
 * food arrives together.
 *
 * That makes the write all-or-nothing, replacing a per-food isolation this
 * function used to advertise. Nothing is lost: the isolation only ever covered a
 * failing `append`, which is a ledger-level fault rather than a fact about one
 * banana, and a caller told "3 moved, 1 failed" could not act on it anyway — it
 * was never told WHICH. The genuine per-food case survives, because it is not a
 * failure: a food already at the destination is decided here, before the write.
 */
export async function moveLoggedFoodsToMeal(
  events: ConsumptionEvent[],
  meal_type: string
): Promise<{ moved: number; failed: number }> {
  // A food already at that meal is skipped rather than restamped: an append
  // that changes nothing is still a row, and the ledger syncs.
  const settled = events.filter(
    (event) => event.meal_type === meal_type
  ).length;
  const moving = events.filter((event) => event.meal_type !== meal_type);
  if (moving.length === 0) return { moved: settled, failed: 0 };

  const datoms = moving.flatMap((event) =>
    ingestEntity({
      entity: event.id,
      attributes: { "event/meal_type": meal_type },
    })
  );

  try {
    await dbClient.append(datoms);
  } catch (e) {
    console.error("moving the selection failed", e);
    // Nothing was written, so only the foods that were already there are at the
    // destination — they were never part of the write.
    return { moved: settled, failed: moving.length };
  }
  return { moved: settled + moving.length, failed: 0 };
}

/**
 * Changes a plain logged food's measured amount, append-only: re-derives its
 * macros from the food twin's `nutrition/info` panel at the new amount (the
 * ADR-0021 formula, the same one the recipe rows use), logs a fresh Consumption
 * Event, and retracts the old one — the amount-picker equivalent of
 * `LogFoodSheet`'s edit, but amount-only (ADR-0008). For plain foods scaled
 * against a panel; recipe instantiations are corrected on their own editor and
 * whole-serving foods are locked (future work).
 *
 * `amount` is in the panel's OWN unit and nothing converts (ADR-0060 §1/§2): the
 * twin is already resolved here, so the unit is read straight off its
 * `serving_size` — millilitres for a drink published per 100 ml, grams for
 * everything else — and both the scaling factor and the logged quantity string
 * follow from it. Without that a drink would be re-logged as a gram weight it
 * was never measured in, and would go uneditable the moment the amount screen
 * starts naming its unit.
 *
 * Returns the id of the Consumption Event that replaced the old one, or `null`
 * when there was nothing to scale from (no target, or a twin carrying no
 * panel). Callers holding the old id — the dashboard's selection — need the new
 * one, since the old event is now retracted; `null` tells them the food was
 * left exactly as it was.
 */
export async function changeLoggedFoodAmount(
  event: ConsumptionEvent,
  amount: number
): Promise<string | null> {
  if (!event.target) return null;
  const twin = await getLocalFoodTwin(event.target);
  const panel = twin?.attributes?.["nutrition/info"] as
    | NutritionInfo
    | undefined;
  if (!panel) return null;
  const unit = basisUnit(panel.serving_size);
  const breakdown = deriveIngredientMacros(
    { ref: event.target, amount, unit },
    () => panel
  );
  const newId = await logFoodConsumption(
    event.target,
    quantityLabel(amount, unit),
    event.meal_type ?? "snack",
    roundFood(breakdown.calories),
    roundFood(breakdown.protein),
    roundFood(breakdown.fat),
    roundFood(breakdown.carbs),
    new Date(event.time),
    undefined,
    breakdown
  );
  await retractConsumptionEvent(event.id, newId);
  return newId;
}

/**
 * Retrieves a local digital twin by its entity ID if it exists in the database.
 */
export async function getLocalFoodTwin(entityId: string): Promise<any | null> {
  // HLC-ascending so a later append (an edited twin — a corrected food, or a
  // Recipe Twin template edit, ADR-0022 #13) is folded LAST and therefore wins
  // per attribute. Without the explicit order the latest value is not guaranteed.
  const rows = await dbClient.query<{ attribute: string; value: string }>(
    `SELECT attribute, value FROM datoms WHERE entity = ? ORDER BY ${HLC_ORDER_ASC}`,
    [entityId]
  );
  if (rows.length === 0) return null;

  const attributes: Record<string, any> = {};
  for (const row of rows) {
    try {
      attributes[row.attribute] = JSON.parse(row.value);
    } catch {
      attributes[row.attribute] = row.value;
    }
  }

  return {
    entity: entityId,
    attributes,
  };
}

/** A frozen instantiation row's display name + macros, for the seed fallback. */
export interface FrozenRow {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

/**
 * Resolves a stored `{ ref, amount, unit }` to a builder ingredient off its
 * **current** twin — the shared seed step behind editing a Recipe Twin template
 * (#13) and instantiating/correcting one (ADR-0022). Reading the live twin is
 * what lets an edit re-derive from current ingredient data. When the twin is
 * gone (a soft/dangling ref) it falls back to a self-contained per-serving twin:
 * equal to the `frozen` snapshot row when given (a correction — the row still
 * derives to what was logged rather than vanishing), or a zero-macro placeholder
 * keyed by the ref (a template edit, where no historical reading exists).
 */
export async function seedRowFromRef(
  ref: string,
  amount: number,
  unit: AmountUnit,
  frozen?: FrozenRow
): Promise<RecipeIngredient> {
  const twin = await getLocalFoodTwin(ref);
  const ing = ingredientFromTwin(twin, amount, unit);
  if (ing) return ing;
  const name = frozen?.name ?? ref;
  const nutrition = nutritionFromMacros(
    {
      calories: frozen?.calories ?? 0,
      protein: frozen?.protein ?? 0,
      fat: frozen?.fat ?? 0,
      carbs: frozen?.carbs ?? 0,
    },
    PER_SERVING
  );
  return {
    entity: ref,
    name,
    amount: frozen ? 1 : amount,
    unit: frozen ? "serving" : unit,
    payload: {
      entity: ref,
      attributes: { "food/name": name, "nutrition/info": nutrition },
    },
  };
}

/**
 * Seeds a builder ingredient list from a Recipe Twin's `recipe/ingredients`,
 * resolving each stored `{ ref, amount, unit }` off its current twin — the shared
 * step behind editing a template (#13) and instantiating one (ADR-0022). Rows
 * resolve concurrently.
 */
export function seedRowsFromTemplate(
  attributes: Record<string, any>
): Promise<RecipeIngredient[]> {
  const refs = (attributes["recipe/ingredients"] ??
    []) as ReferenceIngredient[];
  return Promise.all(refs.map((r) => seedRowFromRef(r.ref, r.amount, r.unit)));
}
