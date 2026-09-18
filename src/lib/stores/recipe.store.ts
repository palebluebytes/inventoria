// Everything the app does with a Recipe Twin: the projections that read the
// saved templates and their ingredient lists, saving one, logging an occasion of
// it, correcting a logged occasion, and re-seeding an editor from either.
//
// It left `calorie.store.ts` when the batch weight (ADR-0106) pushed that file
// past the ~1000-line mark CODING_STANDARDS §4 sets, and this is the seam it
// came apart on: everything here is about a **recipe**, everything left behind
// is about a logged **food**, and the two meet at three functions —
// `logFoodConsumption`, `correctConsumptionEvent` and `getLocalFoodTwin` —
// imported below rather than reached into. The dependency runs one way, so
// `calorie.store.ts` names this module nowhere.
//
// Nothing about the behaviour moved with it. This is a file boundary drawn where
// one already was in everything but the file name.

import { dbClient } from "../db/db.client";
import { createQueryStore } from "./datoms.store";
import { HLC_ORDER_DESC } from "../db/hlc";
import { mintEntity } from "../facets/entity-id";
import { ingestEntity } from "../ingestion/ingest";
import {
  logFoodConsumption,
  correctConsumptionEvent,
  getLocalFoodTwin,
  retractConsumptionEvent,
  type ConsumptionEvent,
} from "./calorie.store";
import {
  deriveRecipeNutrition,
  sanitizeYield,
  type IngredientSource,
  type ReferenceIngredient,
} from "../food/recipe-nutrition";
import {
  buildInstantiation,
  type Instantiation,
} from "../food/recipe-instantiation";
import {
  RECIPE_BATCH_WEIGHT_ATTR,
  sanitizeWeight,
  weighedOccasion,
  type OccasionSize,
} from "../food/batch-weight";
import { scaleAmount } from "../food/scale-amount";
import {
  impromptuRecipeId,
  ingredientFromTwin,
  nameFromIngredients,
  parseLoggedQuantity,
  quantityLabel,
  sourceFromIngredients,
  toReferenceIngredient,
  type RecipeIngredient,
} from "../food/recipe-ingredient";
import {
  nutritionFromMacros,
  PER_SERVING,
  roundFood,
  type AmountUnit,
  type NutritionBreakdown,
} from "../food/nutrition";

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

/** One recipe's ingredient list, as the ledger holds it. */
export interface RecipeIngredientsRow {
  entity: string;
  value: string;
}

/**
 * Every recipe's `recipe/ingredients` list, newest first — the recipe context's
 * memory of which unit a food was last measured into a dish in (ADR-0108 §7).
 *
 * Newest first is the whole of the ordering requirement: the first list holding
 * a food is the last one it was put into. HLC order rather than `time`, like
 * every other state read (ADR-0020).
 *
 * It is a raw row list rather than a projection because nothing else needs it
 * folded: the one reader takes the lists in order and stops at the first match
 * (`rememberedIngredientUnit`). Edits append, so one recipe can appear twice and
 * its newer list is simply the one reached first, which is latest-wins by
 * position.
 */
export const recipeIngredientsStore = createQueryStore<RecipeIngredientsRow>(
  `SELECT entity, value FROM datoms WHERE attribute = 'recipe/ingredients' ORDER BY ${HLC_ORDER_DESC}`
);

/**
 * The rows above as the ingredient lists they hold, newest first — the shape
 * `rememberedIngredientUnit` walks.
 *
 * The parse lives here rather than in the sheet that reads it, because a datom's
 * value arriving as JSON is a fact about the ledger and not about a screen
 * (`CODING_STANDARDS.md` §2.2). A row that does not parse to a list is dropped
 * rather than thrown on: this feeds a default, and a recipe written by a build
 * that shaped its list differently should cost the user an opening unit, not the
 * screen.
 */
export function recipeIngredientLists(
  rows: readonly RecipeIngredientsRow[]
): ReferenceIngredient[][] {
  return rows.map((row) => {
    try {
      const parsed: unknown = JSON.parse(row.value);
      return Array.isArray(parsed) ? (parsed as ReferenceIngredient[]) : [];
    } catch {
      return [];
    }
  });
}

export interface RecipeInput {
  /**
   * schema.org name — **optional**, and its absence is a fact rather than a
   * gap (ADR-0110 §1). A twin that carries one is a Recipe Twin and belongs to
   * the library; one that does not is an Impromptu Recipe, a dish made once
   * from what was already on the day. Nothing else records the difference.
   */
  name?: string;
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
  /**
   * What the finished batch weighs, in grams — a remembered default the
   * instantiation surface opens on (ADR-0106 §3). It sits **beside**
   * {@link RecipeInput.yield} rather than deriving it or being derived from it
   * (§4): 900 g in the pot says nothing about whether the cook thinks in four
   * portions or six.
   */
  batch_weight?: number;
}

/**
 * Saves a schema.org/Recipe twin (ADR-0021). A recipe stores **no** macros of
 * its own — `recipe/ingredients` holds pure `{ ref, amount, unit }` references,
 * and per-serving nutrition is derived from the referenced ingredient twins.
 * That derived aggregate is frozen into the Consumption Event's `event/metrics`
 * snapshot at log time, so later recipe edits never rewrite logged history.
 *
 * Called three ways (ADR-0022 #13, extended by ADR-0110 §4):
 *   • **Define / Create / a named Consolidate** (no `entity`, a name given):
 *     mints a fresh random `recipe:<id>`. Empty optional fields are skipped,
 *     keeping the ledger clean.
 *   • **An unnamed Consolidate** (no `entity`, no name): an Impromptu Recipe.
 *     Its id is {@link impromptuRecipeId}, so the same ingredients reach the
 *     same twin — and where that twin is already in the ledger this **writes
 *     nothing at all** and hands its id back. Writing would mean taking the
 *     edit branch below, whose unconditional optionals would clear the notes,
 *     steps, image and batch weight of a twin somebody had since named and
 *     filled in. The consolidation logs its instantiation and retracts its
 *     sources; the dish it landed on is left as it was.
 *   • **Edit** (`entity` given): appends newer `recipe/*` datoms to that SAME
 *     twin. Latest-wins re-seeds only **future** instantiations; past ones,
 *     being snapshots, never move. Optional fields are written *unconditionally*
 *     here — append-only has no delete, so an omitted attribute would keep its
 *     old value; writing an empty value is how an edit clears a field.
 *
 * `recipe/name` is written only where there is one, in **all three** cases, and
 * so it is not one of the optionals an edit clears by writing empty. Not an
 * empty string: the library is `WHERE attribute = 'recipe/name'`, and a blank
 * name would put an impromptu dish in it while reading as a name-shaped falsy
 * value everywhere else. The consequence is that naming is one-way — an edit
 * promotes an Impromptu Recipe (ADR-0110 §5) and no edit demotes a Recipe Twin
 * back. That is the ADR's model rather than an oversight: membership is derived
 * from the name, and it names no verb for taking one away.
 */
export async function saveRecipe(
  input: RecipeInput,
  entity?: string
): Promise<string> {
  const isEdit = entity !== undefined;
  const name = input.name?.trim();
  const impromptu = !isEdit && !name;
  const entityId =
    entity ??
    (impromptu
      ? await impromptuRecipeId(input.ingredients)
      : mintEntity(
          "recipe:",
          `${Math.random().toString(36).substring(2, 9)}_${Date.now()}`
        ));

  // Reuse is the point of a derived id, and reuse appends nothing. `null` is
  // this read's answer for "no such entity", so the test is against that rather
  // than the truthiness of the `any` it hands back otherwise.
  if (impromptu && (await getLocalFoodTwin(entityId)) !== null) return entityId;

  const attributes: Record<string, any> = {
    // Store direct JSON arrays/objects; ingestEntity/worker stringifies them.
    "recipe/ingredients": input.ingredients,
    "recipe/yield": input.yield ?? 1,
  };
  if (name) attributes["recipe/name"] = name;
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
    // Zero is this attribute's `empty`: `sanitizeWeight` reads a non-positive
    // figure as no batch weight at all, so the clearing sentinel and a field
    // nobody filled in arrive at the one absent answer §7 falls back on.
    [RECIPE_BATCH_WEIGHT_ATTR, input.batch_weight, 0],
  ];
  for (const [key, value, empty] of optionals) {
    if (isEdit || value) attributes[key] = value ?? empty;
  }

  await dbClient.append(ingestEntity({ entity: entityId, attributes }));
  return entityId;
}

/**
 * Promotes an Impromptu Recipe to a Recipe Twin by giving it a name (ADR-0110
 * §5): one appended `recipe/name` datom, after which the twin is in the library
 * and every past occasion of it is an occasion of the named recipe.
 *
 * **It is not a new verb.** It scores exactly as `edit` does on ADR-0022 §4's
 * three columns — creates no twin, logs nothing, retracts nothing — and writes
 * the same attribute on the same entity. What feels distinct about it is the
 * change in membership, and membership is derived rather than written.
 *
 * It is not {@link saveRecipe}'s edit branch either, and that is why it exists.
 * That branch writes the ingredients, the yield and all five optionals
 * unconditionally, because an empty value is how an edit clears a field — so
 * naming a dressing through it would spend eight datoms, clear notes and steps
 * that a later edit may have filled in, and rewrite the ingredient list §7 calls
 * read-only. The id is a fingerprint of those refs; rewriting them would make it
 * a lie.
 *
 * The id is **not** re-minted, because ids are immutable and every existing
 * instantiation names this one. A promoted twin therefore stays in the reuse
 * pool, and consolidating those ingredients again becomes an instantiation of
 * the named recipe (§4).
 *
 * A blank name is refused rather than written. The library is
 * `WHERE attribute = 'recipe/name'`, so an empty one would put the dish in it
 * while reading as a name-shaped falsy value everywhere else — the one thing
 * {@link saveRecipe} will not write. The screen above gates on the same
 * question; this refuses rather than trusting that it held.
 */
export async function nameRecipe(entity: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("a recipe name cannot be blank");
  await dbClient.append(
    ingestEntity({ entity, attributes: { "recipe/name": trimmed } })
  );
}

/**
 * **Consolidate**: N logged foods become one dish on the day (ADR-0022 §4), in
 * the four writes the act has always been — ingest each ingredient's food twin,
 * save the Recipe Twin, log the instantiation, retract the events that remain as
 * ingredients.
 *
 * It lives here because the act is the ledger's and not the builder's. The
 * sequence was written inline in `RecipeBuilder.save()` while the builder was
 * the only way to reach it; the Selection bar's one-tap verb is a second entry
 * point to the same act (ADR-0088's 2026-09-17 amendment), and a second copy of
 * these four writes is where the retraction link, the ingest and the ordering
 * would drift apart.
 *
 * **The order is the argument.** The ingest precedes the save because a twin the
 * recipe references has to exist before the reference does. The retraction
 * follows the log because `event/replaced_by` names the event this consolidation
 * just logged, not the twin it was seeded from (#468) — there is no id to name
 * before it. Nothing here rolls back: each write is append-only and independently
 * true, so a failure part-way leaves facts rather than a half-built dish, and the
 * caller keeps its Selection so the run can be repeated (ADR-0088 §10).
 *
 * `fields` is everything a Recipe Twin may carry beyond its ingredients, and the
 * empty default is the whole of what the one-tap verb passes: **no name**, so
 * {@link saveRecipe} derives the id from the sorted refs and lands on the dish
 * those ingredients already minted rather than minting a second one (ADR-0110
 * §4). The yield is sanitised once and used for both the twin and the occasion,
 * so what the dish says it makes and what the day divided by can never disagree.
 *
 * Returns the logged event's id, which is the row the day reveals (#440).
 */
export async function consolidateIntoRecipe(
  ingredients: readonly RecipeIngredient[],
  meal_type: string,
  selectedDate: Date,
  fields: Omit<RecipeInput, "ingredients"> = {}
): Promise<string> {
  const rows = [...ingredients];
  const references = rows.map(toReferenceIngredient);
  for (const ing of rows) {
    await dbClient.append(ingestEntity(ing.payload));
  }
  const recipeYield = sanitizeYield(fields.yield ?? 1);
  const recipeId = await saveRecipe({
    ...fields,
    yield: recipeYield,
    ingredients: references,
  });
  const logged = await logRecipeConsumption(
    recipeId,
    references,
    recipeYield,
    (ref) => sourceFromIngredients(rows, ref),
    (ref) => nameFromIngredients(rows, ref),
    meal_type,
    selectedDate
  );
  // A row can carry SEVERAL events: two logs of the same food fold into one
  // ingredient (ADR-0024), and the dish replaces both of them.
  for (const ing of rows) {
    for (const event_id of ing.event_ids ?? []) {
      await retractConsumptionEvent(event_id, logged);
    }
  }
  return logged;
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
 *
 * `occasion` is how big the occasion was, and none of it is a divisor: the caller
 * has already scaled the rows, so the numbers are settled before this runs and
 * what arrives here is only there to be *said* and *kept* (ADR-0106 §5, §8).
 * The quantity is spelled through {@link quantityLabel}, which ADR-0060 §4 makes
 * the single site that spells an `event/quantity` — this one wrote the literal
 * `"1 serving"` until #424, reporting every instantiation as one serving however
 * many the cook had asked for.
 */
export async function logRecipeConsumption(
  recipeId: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => IngredientSource | undefined,
  resolveName: (ref: string) => string | undefined,
  meal_type: string,
  selectedDate: Date,
  occasion: OccasionSize = {}
): Promise<string> {
  const { quantity, instantiation, snapshot } = occasionFreeze(
    recipeId,
    ingredients,
    recipeYield,
    resolve,
    resolveName,
    occasion
  );
  return logFoodConsumption(
    recipeId,
    quantity,
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
 * What one occasion of a recipe freezes, derived and not yet written: the
 * quantity it is said in, the `event/instantiation` snapshot, and the
 * `event/metrics` headline those rows add up to.
 *
 * Shared by logging an occasion and correcting one, because the two derive
 * identically — the difference between them is only whether the datoms land on a
 * new entity or on the one already there (ADR-0111 §1).
 */
function occasionFreeze(
  recipeId: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => IngredientSource | undefined,
  resolveName: (ref: string) => string | undefined,
  occasion: OccasionSize
) {
  const weighed = weighedOccasion(occasion);
  return {
    // The weight when one was taken, the count when none was (ADR-0106 §8).
    quantity: weighed
      ? quantityLabel(weighed.portion_weight, "g")
      : quantityLabel(occasion.servings ?? 1, "serving"),
    instantiation: buildInstantiation(
      recipeId,
      ingredients,
      recipeYield,
      resolve,
      resolveName,
      weighed?.batch_weight
    ),
    snapshot: deriveRecipeNutrition(ingredients, recipeYield, resolve),
  };
}

/**
 * Corrects a past Recipe Instantiation by appending onto the event it corrects
 * (ADR-0111 §1): a freshly-derived snapshot, headline and quantity, in one
 * append, onto the occasion that is already there. Nothing is retracted and no
 * id is minted, so the occasion keeps its place in its meal and its time.
 *
 * A read never silently drifts — the correction re-derives from the *current*
 * ingredient twins (via `resolve` / `resolveName`, exactly like editing a logged
 * food), so a stale frozen row is only ever superseded by a deliberate edit,
 * never rewritten under a reader.
 *
 * `based_on` is the template the occasion was seeded from — carried through from
 * the original instantiation's `based_on`, which is its `event/target`. It is
 * therefore not written back: the event already names it, and a correction
 * writes only what changed (ADR-0111 §1). The snapshot still records it, because
 * `based_on` is a field of the instantiation itself (ADR-0022 §2).
 *
 * It takes no `meal_type` and no date, and returns no id, because it can no
 * longer change any of the three: the occasion's meal and its clock are the
 * event's own, and its id is the one the caller already holds.
 */
export async function correctInstantiation(
  editId: string,
  based_on: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => IngredientSource | undefined,
  resolveName: (ref: string) => string | undefined,
  occasion: OccasionSize = {}
): Promise<void> {
  const { quantity, instantiation, snapshot } = occasionFreeze(
    based_on,
    ingredients,
    recipeYield,
    resolve,
    resolveName,
    occasion
  );
  await correctConsumptionEvent(editId, {
    quantity,
    macros: snapshot,
    breakdown: snapshot,
    instantiation,
  });
}

/**
 * How big a logged occasion was, read back off the event it is (ADR-0106 §5, §8).
 *
 * The two weights when the cook had a scale, the serving count when nobody
 * weighed anything, and never both — they are two answers to one question and
 * the ledger says one of them. The denominator is the snapshot's own frozen
 * `batch_weight` rather than the template's current figure, because a logged
 * occasion is a historical reading and the recipe may have been re-weighed
 * since; the numerator is the event's own quantity, which is the portion's
 * weight exactly when one was taken.
 *
 * It exists so that a correction which changes only an ingredient **preserves
 * how the occasion was sized**. Without it every inline edit would re-derive the
 * quantity from nothing and a weighed occasion would silently become "1 serving".
 */
export function occasionSizeOf(event: ConsumptionEvent): OccasionSize {
  const eaten = parseLoggedQuantity(event.quantity);
  return (
    weighedOccasion({
      batch_weight: sanitizeWeight(event.instantiation?.batch_weight),
      portion_weight: eaten.unit === "g" ? eaten.amount : undefined,
    }) ?? { servings: eaten.unit === "serving" ? eaten.amount : 1 }
  );
}

/**
 * A logged occasion's rows, re-seeded against each ref's **current** twin and
 * opened at one serving — the read behind both surfaces that correct one
 * (ADR-0022, ADR-0111 §1).
 *
 * **Open at one serving.** The snapshot stores the batch over the yield it was
 * divided by; a surface that shows a row has to show one serving's worth, or the
 * amounts on screen describe something other than the occasion. Dividing here
 * and holding the yield at 1 leaves `Σrows ÷ yield` the same number either way,
 * which is the invariant ADR-0022 §2 turns on.
 *
 * Reading the live twin is what lets a correction re-derive from current
 * ingredient data; where a twin is gone, {@link seedRowFromRef} falls back to the
 * frozen row, so a dangling ref still opens.
 */
export async function seedOccasionRows(
  event: ConsumptionEvent
): Promise<RecipeIngredient[]> {
  const inst = event.instantiation;
  if (!inst) return [];
  const rows = await Promise.all(
    inst.ingredients.map((r) =>
      seedRowFromRef(r.ref, r.amount, r.unit, {
        name: r.name,
        calories: r.calories,
        protein: r.protein,
        fat: r.fat,
        carbs: r.carbs,
      })
    )
  );
  const batchYield = sanitizeYield(inst.yield || 1);
  return batchYield === 1
    ? rows
    : rows.map((ing) => ({
        ...ing,
        amount: scaleAmount(ing.amount, batchYield, "divide"),
      }));
}

/**
 * Writes a corrected set of rows onto the occasion they belong to: ingest each
 * twin, then append the re-derived snapshot onto the event (ADR-0111 §1).
 *
 * The ingest is what makes an added ingredient's twin exist before the snapshot
 * references it, and is idempotent for the ones that already do.
 *
 * It takes `size` rather than deriving one, because the two surfaces that
 * correct an occasion know it differently: the sheet has just asked for the
 * weights, and the inline fold is carrying forward what the occasion already
 * said ({@link occasionSizeOf}). Deriving it here would make one of them lie.
 */
export async function correctOccasion(
  eventId: string,
  based_on: string,
  rows: readonly RecipeIngredient[],
  recipeYield: number,
  size: OccasionSize
): Promise<void> {
  const list = [...rows];
  for (const ing of list) {
    await dbClient.append(ingestEntity(ing.payload));
  }
  await correctInstantiation(
    eventId,
    based_on,
    list.map(toReferenceIngredient),
    recipeYield,
    (ref) => sourceFromIngredients(list, ref),
    (ref) => nameFromIngredients(list, ref),
    size
  );
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
 * gone (a soft/dangling ref) it falls back to a self-contained twin, built from
 * the `frozen` snapshot row when there is one (a correction — the row still
 * derives to what was logged rather than vanishing), or a zero-macro placeholder
 * keyed by the ref (a template edit, where no historical reading exists).
 *
 * **The fabricated basis is one unit's worth, and the row keeps its amount**
 * (#462). A frozen row knows both the amount it was logged at and what that
 * amount contributed, so dividing one by the other gives a basis the row can be
 * read and re-scaled in: per 100 g for a measured row, per serving for a counted
 * one. This fell back to a flat "1 serving" for every dangling ref until #462,
 * which opened a 240 g row at `1 srv` — an amount nobody logged, in a unit the
 * row was never in. The derived contribution is unchanged either way, because
 * the basis is scaled by exactly what the amount was divided by; what changes is
 * that the reading is now true.
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
  // How many of the fabricated basis this row stands at, and so what to divide
  // its frozen figures by. A row with no amount to divide by keeps the old
  // answer: one serving of exactly what it contributed.
  const measured = unit !== "serving";
  const basis = measured ? 100 : 1;
  const per = frozen && amount > 0 ? basis / amount : undefined;
  const nutrition = nutritionFromMacros(
    {
      calories: roundFood((frozen?.calories ?? 0) * (per ?? 1)),
      protein: roundFood((frozen?.protein ?? 0) * (per ?? 1)),
      fat: roundFood((frozen?.fat ?? 0) * (per ?? 1)),
      carbs: roundFood((frozen?.carbs ?? 0) * (per ?? 1)),
    },
    per !== undefined && measured ? `${basis} ${unit}` : PER_SERVING
  );
  return {
    entity: ref,
    name,
    amount: frozen && per === undefined ? 1 : amount,
    unit: frozen && per === undefined ? "serving" : unit,
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

/**
 * A saved recipe's per-serving figures as the ledger holds them **now** — the
 * macros line on a library row (#488).
 *
 * It is {@link seedRowsFromTemplate} plus the shared derivation: resolve the
 * twin, seed each stored `{ ref, amount, unit }` off its own current food twin,
 * and run {@link deriveRecipeNutrition} over the twin's yield — the same three
 * steps the instantiation editor opens on, over the same twin. It is a **read**
 * of them, which is why that editor does not call this: it re-derives on every
 * keystroke from rows the cook is still changing, and only this caller wants
 * the figures the ledger alone implies. A yield the twin never carried divides
 * by 1, which is {@link sanitizeYield}'s single rule and not restated here.
 * `null` when there is no such entity, which is the browser's answer for a row
 * whose twin has gone.
 *
 * **Nothing is memoised, deliberately.** The figures derive from three things
 * the ledger holds apart — the twin's `recipe/ingredients`, its `recipe/yield`,
 * and each referenced twin's own panel — and an edit moves any of them while
 * leaving the entity id exactly where it was. A cache keyed by entity is
 * therefore keyed on the one input that cannot change, which is how a recipe
 * came to wear its first macros for the rest of the session. A key honest
 * enough to bust would have to name all three, and re-reading them is what
 * computing that key costs anyway.
 */
export async function recipePerServingNutrition(
  entity: string
): Promise<NutritionBreakdown | null> {
  const twin = await getLocalFoodTwin(entity);
  if (!twin) return null;
  const rows = await seedRowsFromTemplate(twin.attributes);
  return deriveRecipeNutrition(
    rows.map(toReferenceIngredient),
    sanitizeYield(twin.attributes["recipe/yield"]),
    (ref) => sourceFromIngredients(rows, ref)
  );
}
