import { dbClient } from "../db/db.client";
import { mintEntity } from "../facets/entity-id";
import { ingestEntity } from "../ingestion/ingest";
import {
  readFoodDensity,
  FOOD_DENSITY_ATTR,
  type FoodDensity,
} from "../food/density";
import { HLC_ORDER_ASC } from "../db/hlc";
import { createProjectionStore } from "./datoms.store";
import type { ConsumptionEvent } from "../food/consumption-state";
import {
  nutritionFromMacros,
  roundFood,
  PER_SERVING,
  EXTRA_NUTRIENT_KEYS,
  type AmountUnit,
  type MeasuredUnit,
  type Macros,
  type NutritionInfo,
  type NutritionBreakdown,
  type NutritionExtras,
  type Portion,
} from "../food/nutrition";
import type { LabelCapture, ManualEntry } from "../food/provenance";
import {
  deriveIngredientMacros,
  type IngredientSource,
} from "../food/recipe-nutrition";
import type { Instantiation } from "../food/recipe-instantiation";
import { quantityLabel } from "../food/recipe-ingredient";
import { appError } from "../logs/app-log";

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
): Promise<string> {
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

  const attributes: Record<string, unknown> = {
    "event/type": "ConsumeAction",
    "event/target": targetEntity,
    "event/quantity": quantity,
    "event/meal_type": meal_type,
    "event/metrics": frozenMetrics(
      { calories, protein, fat, carbs },
      breakdown
    ),
  };
  if (instantiation) attributes["event/instantiation"] = instantiation;

  const datoms = ingestEntity({ entity, attributes });

  // Inject manually since ingestEntity maps all values. Note time is injected inside dbClient.append
  // but datoms array has .time field which dbClient uses.
  for (const datom of datoms) {
    datom.time = timestamp;
  }

  await dbClient.append(datoms);
  return entity;
}

/**
 * The headline a Consumption Event freezes: `calories` always, and each of the
 * three macros only where it was measured. A macro passed as `undefined` is
 * **absent, never 0** (ADR-0035 §7) — the daily macro meters read it as
 * not-counted and only the calorie ring moves.
 */
export interface FrozenHeadline extends Partial<Macros> {
  calories: number;
}

/** The whole `event/metrics` value: the headline plus the extras. */
export interface FrozenMetrics extends FrozenHeadline, NutritionExtras {}

/**
 * The `event/metrics` value a log or a correction of that log freezes: the
 * headline above, plus every extra nutrient the food actually reported merged in
 * under its panel name (ADR-0030 / #28). An extra a food never reported is never
 * written, so it reads as absent forever.
 *
 * One spelling, because `event/metrics` is a single value and latest-wins
 * replaces the whole of it: a correction that froze a narrower shape than the log
 * it corrects would silently drop nutrients the food still reports (ADR-0111 §1).
 */
function frozenMetrics(
  headline: FrozenHeadline,
  breakdown?: NutritionBreakdown
): FrozenMetrics {
  const metrics: FrozenMetrics = { calories: headline.calories };
  if (typeof headline.protein === "number") metrics.protein = headline.protein;
  if (typeof headline.fat === "number") metrics.fat = headline.fat;
  if (typeof headline.carbs === "number") metrics.carbs = headline.carbs;
  if (breakdown) {
    for (const key of EXTRA_NUTRIENT_KEYS) {
      const v = breakdown[key];
      if (typeof v === "number") metrics[key] = v;
    }
  }
  return metrics;
}

/**
 * The headline a re-derived breakdown freezes, at the stored food precision —
 * the rounding a logged figure gets so the rows a day sums are the rows it
 * shows. The extras ride the breakdown itself and are already at that precision.
 */
function roundedHeadline(breakdown: NutritionBreakdown): FrozenHeadline {
  return {
    calories: roundFood(breakdown.calories),
    protein: roundFood(breakdown.protein),
    fat: roundFood(breakdown.fat),
    carbs: roundFood(breakdown.carbs),
  };
}

/**
 * What one correction may append onto a Consumption Event (ADR-0111 §1). Only
 * what changed is written: every key omitted here keeps the value the event
 * already holds, where a replacement had to restate every attribute of the event
 * plus two datoms on its predecessor.
 *
 * `macros` and `breakdown` are the pair a log freezes, for the reason
 * {@link frozenMetrics} gives: the blob is one value, so a correction that
 * touches it writes all of it.
 */
export interface Correction {
  /** The food twin the occasion now names — said ONLY where it changed, which
   *  is one path: a correction reached through the label form can mint a fresh
   *  twin rather than enrich the one it opened on, and an event left pointing at
   *  the old one would read as the food the user has just replaced. Every other
   *  correction leaves the target alone rather than restating it. */
  target?: string;
  quantity?: string;
  meal_type?: string;
  macros?: FrozenHeadline;
  breakdown?: NutritionBreakdown;
  instantiation?: Instantiation;
}

/**
 * The datoms one correction is made of, minted but not yet appended — so a
 * caller correcting SEVERAL events can put them all in one append (see
 * {@link scaleLoggedFoods}).
 *
 * No `time` is injected. An event takes its **first** datom's time, so a
 * correction stamped now leaves the occasion where it was logged: correcting a
 * 9am banana at 5pm no longer restamps it 5pm (ADR-0111 §1).
 */
function correctionDatoms(eventId: string, correction: Correction) {
  const attributes: Record<string, unknown> = {};
  if (correction.target !== undefined)
    attributes["event/target"] = correction.target;
  if (correction.quantity !== undefined)
    attributes["event/quantity"] = correction.quantity;
  if (correction.meal_type !== undefined)
    attributes["event/meal_type"] = correction.meal_type;
  if (correction.macros !== undefined)
    attributes["event/metrics"] = frozenMetrics(
      correction.macros,
      correction.breakdown
    );
  if (correction.instantiation !== undefined)
    attributes["event/instantiation"] = correction.instantiation;
  return ingestEntity({ entity: eventId, attributes });
}

/**
 * Corrects one logged occasion by appending onto the event it corrects
 * (ADR-0111 §1): no id changes, nothing is retracted, and no
 * `event/replaced_by` is written. Latest-wins per attribute does the rest, which
 * is what makes two devices correcting the same occasion converge on the later
 * value instead of leaving two live events (#463).
 *
 * **Every datom of one correction rides one append** (ADR-0111 §3). Appending
 * onto a live entity makes a new headline beside an old breakdown representable
 * for the first time, and the P2P payload builder's `winningRows` narrows per
 * `(entity, attribute)` — exactly the granularity at which a half-arrived set
 * would split.
 *
 * It returns nothing. A caller holding the event's id already holds the only id
 * there is, and ADR-0107's reveal turns on being handed an id: a correction that
 * reported one would move the page under a hand that has just committed an edit.
 *
 * A correction carrying nothing throws at {@link ingestEntity} rather than
 * appending an empty batch, which is the behaviour to want: a caller that
 * decided there was nothing to correct should not have called this.
 */
export async function correctConsumptionEvent(
  eventId: string,
  correction: Correction
): Promise<void> {
  await dbClient.append(correctionDatoms(eventId, correction));
}

/** One logged food, already resolved to what a scale will act on. */
export interface ScaleChange {
  /** The event being corrected. Its id is where the datoms land. */
  event: ConsumptionEvent;
  /** The scaled amount, in `unit`. */
  amount: number;
  unit: AmountUnit;
  /** The target twin's panel and density, read when the Scale tier opened. A
   *  scaled amount keeps the unit it was logged in, so the density is needed for
   *  the same reason the panel is: a gram amount against a per-100 ml panel has
   *  to be converted before it can be divided (ADR-0108 §5). */
  source: IngredientSource;
  /** The food twin whose panel the new figures are derived from — the event's
   *  own target. A scale changes how much, never what. */
  ref: string;
}

/**
 * Scales several logged foods in **one append** (ADR-0088 §5), each by
 * correcting the event it is (ADR-0111 §1).
 *
 * `changeLoggedFoodAmount` below is the single-food version and re-reads the
 * twin each time. Across a Selection that read is pure waste: the Scale tier
 * already resolved every panel before it drew, which is what the live preview
 * is derived from, so the caller hands them back rather than making the worker
 * find them again. What is left is arithmetic, and the whole run becomes one
 * round trip instead of three per food.
 *
 * The single append is what makes the run land as one change rather than a
 * cascade: every row takes its new figure in the same frame, and no intermediate
 * state is ever projected — not a half-scaled Selection, and not a day where
 * some rows have moved and others have not.
 *
 * It returns a **count**, and should, even though every id it wrote is an id it
 * was handed. Nothing wants them: a Selection holding those ids needs nothing
 * back now that none of them changed, and a reveal handed one would fire on a
 * row the user is already looking at (ADR-0111 §9).
 */
export async function scaleLoggedFoods(
  changes: ScaleChange[]
): Promise<number> {
  if (changes.length === 0) return 0;

  const datoms: ReturnType<typeof ingestEntity> = [];
  for (const change of changes) {
    const breakdown = deriveIngredientMacros(
      { ref: change.ref, amount: change.amount, unit: change.unit },
      () => change.source
    );
    datoms.push(
      ...correctionDatoms(change.event.id, {
        quantity: quantityLabel(change.amount, change.unit),
        macros: roundedHeadline(breakdown),
        breakdown,
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
 * The ids it returns are the events it actually wrote, in the order it wrote
 * them, and never the ones it lost — #440 waits for every id it is handed to
 * appear in the day, so an id for an append that threw would hold that wait open
 * forever.
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
): Promise<{ copied: number; lost: number; ids: string[] }> {
  let lost = 0;
  const ids: string[] = [];
  for (const item of items) {
    try {
      const id = await logFoodConsumption(
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
      ids.push(id);
    } catch (e) {
      appError("copying a logged food failed", e);
      lost += 1;
    }
  }
  // `copied` is `ids.length` and stays in the shape callers already destructure:
  // the tally reads a number and #440 reads the ids, and deriving one from the
  // other at each call site is how the two would come to disagree.
  return { copied: ids.length, lost, ids };
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
   * What kind of liquid this food is, on a panel the user declared per 100 ml
   * (ADR-0108 §1). Written as given; absent on every gram capture, which has
   * nothing to ask.
   */
  density?: FoodDensity;
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
  if (input.density) attributes[FOOD_DENSITY_ATTR] = input.density;
  if (input.labelPhotos.length > 0) {
    attributes["food/label_photos"] = input.labelPhotos;
    // Mirror the first photo into the singular attribute every current display
    // surface reads (staged card, consumption views, ingredient picker), §5.
    attributes["food/photo_base64"] = input.labelPhotos[0];
  }

  await dbClient.append(ingestEntity({ entity: entityId, attributes }));
  return entityId;
}

/**
 * Records what kind of liquid a food is, on a twin already in the ledger
 * (ADR-0108 §1/§4).
 *
 * One datom on one attribute, and latest-wins settles a user who changes their
 * mind — which is the whole reason `food/density` is one key whose VALUE names
 * which kind of answer it holds rather than two keys that could disagree about
 * one food with nothing to arbitrate them.
 *
 * The figure is never written beside the class: 0.92 is our reading of "this is
 * an oil", and a reading belongs derived, so improving a class figure improves
 * every food filed under it without a migration (§4).
 *
 * This is the path for a food the user reaches through an already-logged row or
 * an already-added ingredient. A food still being STAGED has no twin in the
 * ledger yet, and its assertion rides its payload to whatever commits it, so it
 * does not come through here.
 */
export async function setFoodDensity(
  entity: string,
  density: FoodDensity
): Promise<void> {
  await dbClient.append(
    ingestEntity({ entity, attributes: { [FOOD_DENSITY_ATTR]: density } })
  );
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

/**
 * Retracts a Consumption Event by appending a newer `event/status = "retracted"`
 * datom (never deletes — the projection's latest-wins fold hides it).
 *
 * `replacedBy` is the **consumption link**: the one event the retracted one was
 * consumed INTO, written on each of the N foods a Consolidate folds into a
 * recipe, all naming the same successor (ADR-0111 §6). That many-to-one shape is
 * its only job. A plain user-initiated removal omits it, and a correction never
 * writes one at all — a correction appends onto the event it corrects, so no id
 * changes and there is nothing to link (§1).
 *
 * The ADR-0008 citation this comment used to carry is struck. It reasons about
 * Habit Blueprints, whose Execution Events target a fixed blueprint *version*;
 * nothing targets a Consumption Event, which is a leaf, so the convention was
 * inherited here rather than derived. The "auditable trail" it claimed for the
 * link is struck too: nothing in the repo audits one, and a correction's history
 * is one entity's datoms in HLC order (§8).
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
 * This was once the exception in this module and is now an instance of the rule
 * (ADR-0111 §1): re-logging would assert that you un-ate that banana at
 * breakfast and ate a different one at lunch, leaving two bananas in the history
 * with one retracted, and the argument ADR-0088 §8 made for a move — the event
 * keeps its id, its `event/time`, its metrics, its photo, its provenance and its
 * arrival mark — turned out to apply word for word to every correction. What
 * dropped out was the line it drew: re-deriving numbers produces a new *value*
 * for `event/metrics`, and storing a new value for an attribute is what an
 * append is.
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
    appError("moving the selection failed", e);
    // Nothing was written, so only the foods that were already there are at the
    // destination — they were never part of the write.
    return { moved: settled, failed: moving.length };
  }
  return { moved: settled + moving.length, failed: 0 };
}

/**
 * Changes a plain logged food's measured amount by correcting the event
 * (ADR-0111 §1): it re-derives the macros from the food twin's `nutrition/info`
 * panel at the new amount (the ADR-0021 formula, the same one the recipe rows
 * use) and appends the new quantity and metrics onto the event that is already
 * there. The amount-picker equivalent of `LogFoodSheet`'s edit, but amount-only.
 * For plain foods scaled against a panel; recipe instantiations are corrected on
 * their own editor and whole-serving foods are locked (future work).
 *
 * `amount` travels with the `unit` it was entered in rather than having one read
 * back off the panel, which is what it did until #430. The two coincide on every
 * food carrying no Density Class, and on one that does they may not: the screen
 * above this offers both units, so a unit re-derived here would silently
 * contradict what the user just typed. The logged quantity string is spelled in
 * the unit that reaches it, and the scaling factor puts that amount into the
 * panel's own unit first (ADR-0108 §5) rather than rewriting the panel.
 *
 * `retarget` is the twin the occasion should now name, and only the label form's
 * edit path passes one: a correction there may have minted a fresh twin instead
 * of enriching the one it opened on, and an event left naming the old twin would
 * read as the food the user has just replaced. It is both what the panel is read
 * from and what is written onto the event. Omitted — every other caller — the
 * correction says nothing at all about the target, because nothing about it
 * changed (ADR-0111 §1: only what changed is written).
 *
 * It returns nothing, and the two things it might have returned are both
 * refused for one reason: nothing reads them. **No id**, because the event's is
 * unchanged and the caller already holds it (ADR-0111 §1). **No "did it write"
 * flag**, because a twin carrying no panel is a food that cannot be scaled at
 * all, which the amount picker settled before it drew — both call sites discard
 * the answer, and a flag nobody reads is the id churn's mistake in a smaller
 * shape.
 */
export async function changeLoggedFoodAmount(
  event: ConsumptionEvent,
  amount: number,
  unit: MeasuredUnit,
  retarget?: string
): Promise<void> {
  const target = retarget ?? event.target;
  if (!target) return;
  const twin = await getLocalFoodTwin(target);
  const panel = twin?.attributes?.["nutrition/info"] as
    | NutritionInfo
    | undefined;
  if (!panel) return;
  const breakdown = deriveIngredientMacros(
    { ref: target, amount, unit },
    () => ({ panel, density: readFoodDensity(twin?.attributes) })
  );
  await correctConsumptionEvent(event.id, {
    target: retarget,
    quantity: quantityLabel(amount, unit),
    macros: roundedHeadline(breakdown),
    breakdown,
  });
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
