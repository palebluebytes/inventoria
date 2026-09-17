// Everything the app does with a Recipe Twin: the projections that read the
// saved templates and their ingredient lists, saving one, logging an occasion of
// it, correcting a logged occasion, and re-seeding an editor from either.
//
// It left `calorie.store.ts` when the batch weight (ADR-0106) pushed that file
// past the ~1000-line mark CODING_STANDARDS §4 sets, and this is the seam it
// came apart on: everything here is about a **recipe**, everything left behind
// is about a logged **food**, and the two meet at three functions —
// `logFoodConsumption`, `retractConsumptionEvent` and `getLocalFoodTwin` —
// imported below rather than reached into. The dependency runs one way, so
// `calorie.store.ts` names this module nowhere.
//
// Nothing about the behaviour moved with it. This is a file boundary drawn where
// one already was in everything but the file name.

import { dbClient } from "../db/db.client";
import { createQueryStore } from "./datoms.store";
import { HLC_ORDER_DESC } from "../db/hlc";
import { digestSuffix, mintEntity } from "../facets/entity-id";
import { ingestEntity } from "../ingestion/ingest";
import {
  logFoodConsumption,
  retractConsumptionEvent,
  getLocalFoodTwin,
} from "./calorie.store";
import {
  deriveRecipeNutrition,
  type IngredientSource,
  type ReferenceIngredient,
} from "../food/recipe-nutrition";
import {
  buildInstantiation,
  type Instantiation,
} from "../food/recipe-instantiation";
import {
  RECIPE_BATCH_WEIGHT_ATTR,
  weighedOccasion,
  type OccasionSize,
} from "../food/batch-weight";
import {
  ingredientFromTwin,
  quantityLabel,
  type RecipeIngredient,
} from "../food/recipe-ingredient";
import {
  nutritionFromMacros,
  PER_SERVING,
  type AmountUnit,
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
 * An Impromptu Recipe's entity id: the `recipe:` prefix over a digest of its
 * ingredient `ref`s, sorted (ADR-0110 §4). Computing it is how the twin is
 * found — consolidating the same things again lands on the twin that already
 * exists, and a second device doing so converges on it rather than forking.
 *
 * **Only the sorted refs go in.** Amounts, units, yield and batch weight are
 * left out because they are the occasion rather than the dish: they are already
 * frozen on the event, they vary every time, and including them would make the
 * reuse a no-op in practice, since `scaleAmount` leaves an amount unrounded on
 * some paths. This is ADR-0022 §2's boundary applied to identity — the twin is
 * what the dish is, the event is what you made that day.
 *
 * The sort is what makes the key canonical, and it costs the stored ingredient
 * order where two consolidations collapse onto one twin: nothing normalises
 * that order today, so whichever minted the twin first is the one that survives.
 */
async function impromptuRecipeId(
  ingredients: ReferenceIngredient[]
): Promise<string> {
  const refs = ingredients.map((i) => i.ref).sort();
  // Newline-joined: an entity id cannot contain one, so no two ref sets can
  // render to the same string by running together at the seam.
  return mintEntity("recipe:", await digestSuffix(refs.join("\n")));
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
 * `recipe/name` is written only where there is one. Not an empty string: the
 * library is `WHERE attribute = 'recipe/name'`, and a blank name would put an
 * impromptu dish in it while reading as a name-shaped falsy value everywhere
 * else.
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

  // Reuse is the point of a derived id, and reuse appends nothing.
  if (impromptu && (await getLocalFoodTwin(entityId))) return entityId;

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
  const weighed = weighedOccasion(occasion);
  const snapshot = deriveRecipeNutrition(ingredients, recipeYield, resolve);
  const instantiation = buildInstantiation(
    recipeId,
    ingredients,
    recipeYield,
    resolve,
    resolveName,
    weighed?.batch_weight
  );
  return logFoodConsumption(
    recipeId,
    // The weight when one was taken, the count when none was (ADR-0106 §8).
    weighed
      ? quantityLabel(weighed.portion_weight, "g")
      : quantityLabel(occasion.servings ?? 1, "serving"),
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
  resolve: (ref: string) => IngredientSource | undefined,
  resolveName: (ref: string) => string | undefined,
  meal_type: string,
  selectedDate: Date,
  occasion: OccasionSize = {}
): Promise<string> {
  const newId = await logRecipeConsumption(
    based_on,
    ingredients,
    recipeYield,
    resolve,
    resolveName,
    meal_type,
    selectedDate,
    occasion
  );
  await retractConsumptionEvent(editId, newId);
  return newId;
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
