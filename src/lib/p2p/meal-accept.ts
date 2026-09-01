import { mintEntity } from "../facets/entity-id";
import type { EntityPrefix } from "../facets/registry";
/**
 * What a received Meal payload becomes when the recipient accepts it
 * (ADR-0073 §3, §5, §6, §7 and §11).
 *
 * The refusals are already spent: {@link readMealPayload} judged all seven when
 * the bytes arrived, before anything reached the screen. Accept re-checks none
 * of them. It evaluates exactly one rule against the ledger as it now stands —
 * §6's skip — and then writes.
 *
 * Four rules, and they are the whole of what this module decides:
 *
 *   1. **The meal is re-logged, not merged in** (§5). Receiving is
 *      `copyPastMeal` with a wire in front of it: the same re-log of frozen
 *      fields into the day the recipient chose, differing only in that the
 *      event id is derived from the payload's declared root rather than minted
 *      fresh. There is **no closure rewrite at all** — `event/target` carries
 *      through untouched, and every reference in the payload still resolves,
 *      because the twins cross with their own ids.
 *
 *      **Each event lands in its own Meal Type**, read off the event rather
 *      than chosen by the caller (§5, amended 2026-09-01). A payload can carry
 *      a whole day now that the full-day panel has a way out, and one meal type
 *      taken off the front of it would put a dinner in somebody's breakfast.
 *      One meal is the case where every event agrees, so it needs no branch.
 *   2. **An entity the recipient already holds is skipped whole** (§6). Not
 *      merged, not latest-wins: projections take the last row in logical-clock
 *      order, so merging would let a sender's numbers overwrite the recipient's
 *      own corrections whenever their stamp is greater — and `hlc_ms` is
 *      wall-clock-seeded, so a fast phone wins.
 *   3. **Everything lands on the recipient's own clock** (§7). Every row goes
 *      through the ordinary append path as a `Datom`, which carries no stamp
 *      columns at all, so **no foreign `device_id` can enter the ledger** and
 *      there is nothing for `Hlc.update` to be called against. ADR-0067 §2's
 *      kept stamps and §3's advance-on-receive do **not** transfer here, though
 *      they do transfer for `Settings → Import Ledger` two files away: keeping a
 *      foreign stamp requires advancing to it, and a sender whose phone says
 *      2030 would drag the recipient's clock forward permanently.
 *   4. **`fdc:` provenance is rebuilt and `gtin:` provenance is not** (§3), and
 *      a food that arrived is marked as having arrived (§11).
 *
 * The seams are injected for the reason the rest of the app injects them: the
 * whole of the above is then testable without a Worker, a corpus fetch or a
 * clock.
 */

import { ingestEntity } from "../ingestion/ingest";
import { dbClient } from "../db/db.client";
import type { Datom, LedgerRow } from "../db/db.core";
import type { ConsumptionEvent } from "../food/consumption-state";
import type { MealType } from "../food/meal-type";
import { buildArrival, FOOD_ARRIVAL_ATTR } from "../food/provenance";
import {
  loadSearchCorpus,
  mapIndexRowToPayload,
  type SearchCorpus,
} from "../food/usda-corpus";
import { copyPastMeal } from "../stores/calorie.store";
import { MEAL_ROOT_PREFIX, winningRows } from "./meal-payload";
import { mealsByType, receivedMealEvents } from "./received-meal";
import type { ReceivedMealPayload } from "./meal-reader";

/**
 * The twin kinds an arrival mark is written on: the food twins (ADR-0073 §11).
 *
 * A `recipe:` twin is deliberately not among them. The mark exists to stop a
 * received food claiming an origin this device cannot vouch for, and a recipe
 * already reads correctly off its own prefix — so marking one would buy nothing
 * and would annotate the recipe list, which §11 rules out.
 */
const ARRIVAL_MARKED_PREFIXES: readonly string[] = [
  "fdc:",
  "gtin:",
  "food:custom_",
];

/** The prefix of a twin whose provenance the bundled corpus can rebuild (§3). */
const USDA_PREFIX: EntityPrefix = "fdc:";

/** What one accept did, counted against what the payload declared. */
export interface AcceptedMeal {
  /** Consumption Events logged, on this device's clock and in its Meal Type. */
  logged: number;
  /**
   * Declared roots this device already held under their derived id, so nothing
   * was written for them. A deliberate second send lands here (§5): the price
   * of never being able to duplicate a meal by accident.
   */
  absorbed: number;
  /**
   * Declared roots that neither logged nor were absorbed — an event the payload
   * carried too little of to reproduce, or one whose append threw.
   */
  lost: number;
  /**
   * The Meal Types this landed in, in the order the day was eaten.
   *
   * What the recipient is told reads this rather than the caller's argument,
   * because there is no longer a caller's argument: several means a day was
   * handed over and "added to your breakfast" would be false.
   */
  meal_types: MealType[];
  /** Food twins and recipes this meal landed. */
  landed: number;
  /** Twins skipped whole because the recipient already held them (§6). */
  skipped: number;
}

/**
 * Everything the accept path reaches outside itself.
 *
 * `logMeal` is `copyPastMeal` (ADR-0058, amended by ADR-0073 §5) and is the one
 * that carries the design: receiving is that operation, which is why this module
 * injects it rather than restating it.
 */
export interface MealAcceptSeams {
  /** Which of these entities the ledger already holds — §6's one question. */
  heldEntities: (entities: string[]) => Promise<string[]>;
  /** The ordinary append path: one batch, all-or-nothing. */
  append: (datoms: Datom[]) => Promise<void>;
  /** Re-logs the meal's events under ids derived from the payload's roots. */
  logMeal: (
    items: ConsumptionEvent[],
    meal_type: string,
    selectedDate: Date,
    mintEventId: (item: ConsumptionEvent) => string
  ) => Promise<{ copied: number; lost: number }>;
  /** The bundled Search index, for §3's `fdc:` provenance rebuild. */
  loadCorpus: () => Promise<SearchCorpus>;
  /** The moment of acceptance, which every landed row is stamped with. */
  now: () => number;
}

const LEDGER_SEAMS: MealAcceptSeams = {
  heldEntities: async (entities) => {
    if (entities.length === 0) return [];
    const marks = entities.map(() => "?").join(", ");
    const rows = await dbClient.query<{ entity: string }>(
      `SELECT DISTINCT entity FROM datoms WHERE entity IN (${marks})`,
      entities
    );
    return rows.map((r) => r.entity);
  },
  append: (datoms) => dbClient.append(datoms),
  logMeal: copyPastMeal,
  loadCorpus: loadSearchCorpus,
  now: Date.now,
};

/**
 * The id a declared root is re-minted under: `event:consume_` and the first half
 * of a SHA-256 over the root entity id, rendered hex (ADR-0073 §5).
 *
 * Derived rather than random, because `logFoodConsumption`'s own mint is fresh
 * on every call and a second accept of the same payload would log the meal
 * twice. Derived from the **root alone**, so the same occasion re-sent from any
 * device lands on the same id — and so the id encodes nothing about the sender:
 * a hash of an opaque uuid identifies nobody, and §11's refusal of sender
 * identity holds through it.
 *
 * The event is re-minted at all because it is a claim about *the recipient*
 * eating — their clock, their day, their Meal Type. The twins are not claims
 * about anyone, so their ids cross verbatim, which is what buys free
 * deduplication.
 */
export async function receivedEventId(root: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(root)
  );
  const half = new Uint8Array(digest).subarray(0, 16);
  const hex = [...half].map((b) => b.toString(16).padStart(2, "0")).join("");
  return mintEntity(MEAL_ROOT_PREFIX, hex);
}

/**
 * Lands a received payload: its twins as datoms on this device's clock, then
 * its Consumption Events re-logged on `selectedDate`, each into the Meal Type
 * its own event carries.
 *
 * The twins go first and in one batch, so a meal's foods land together or not at
 * all and no event is ever logged against a twin that failed to arrive. The
 * events follow through {@link MealAcceptSeams.logMeal}, which catches per item
 * — ADR-0058 §11's contract, kept, so one failed append leaves the rest of the
 * meal accepted rather than aborting the run half-applied.
 */
export async function acceptMealPayload(
  payload: ReceivedMealPayload,
  selectedDate: Date,
  seams: MealAcceptSeams = LEDGER_SEAMS
): Promise<AcceptedMeal> {
  const received_at = seams.now();

  const reminted = new Map<string, string>();
  for (const root of payload.roots) {
    reminted.set(root, await receivedEventId(root));
  }

  // Narrowed again on the way in, though §1 says a payload is already narrowed
  // on the way out. Nothing the reader refuses stops a payload carrying two rows
  // for one `(entity, attribute)`, and both readings below take a row per pair —
  // so without this the winner would be the order the lines happened to arrive
  // in, which is neither the logical clock nor `time` (`CODING_STANDARDS.md`
  // §2.1). The stamps decide, as the sender's own build did; that they are the
  // sender's is fine, because a stamp is being READ here and none is kept (§7).
  const rows = winningRows(payload.rows);

  // The roots are re-minted rather than carried, so their own rows are read as
  // events below and never land as datoms of their own.
  const twins = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    if (reminted.has(row.entity)) continue;
    const held = twins.get(row.entity);
    if (held) held.push(row);
    else twins.set(row.entity, [row]);
  }

  // One question, asked of the twins and of the re-minted event ids together.
  //
  // Asking it of the events is what makes a second accept absorb (§5), and it is
  // asked HERE rather than left to the insert. ADR-0073 §5 says "`INSERT OR
  // IGNORE` absorbs it", and that mechanism cannot fire on this path: §7
  // restamps every row on the local clock, so the primary key — which spans the
  // whole stamp — differs on the second accept, and `appendDatoms` deliberately
  // keeps a plain `INSERT` so a genuine duplicate stamp is heard about rather
  // than swallowed. The derived id still does the whole of the work §5 gives it,
  // and §5's promise holds without the insert: the projection folds by entity, so
  // even two accepts racing past this check write one entity and the day shows
  // one meal. What the skip saves is the redundant rows, not the meal.
  const held = new Set(
    await seams.heldEntities([...twins.keys(), ...reminted.values()])
  );

  const landing = [...twins.keys()].filter((entity) => !held.has(entity));
  const datoms = await landingDatoms(landing, twins, received_at, seams);
  if (datoms.length > 0) await seams.append(datoms);

  // The payload read by the app's own fold, so a received event is understood
  // exactly as a locally logged one is. Its twins are in the same stream, which
  // is what resolves each event's display name — and `partitionCopyable` drops
  // an event that has none, rather than logging an Unknown Food.
  //
  // The fold is shared with the receiving surface rather than repeated here:
  // what the person was shown and what this lands must be the same meal.
  const events = receivedMealEvents(rows, payload.roots);
  const fresh = events.filter((event) => !held.has(reminted.get(event.id)!));

  // One call per Meal Type rather than one for the payload. `logMeal` is
  // `copyPastMeal`, which takes the meal a copy lands in, so a day is as many
  // copies as it has meals — and a single meal is one group, which is the same
  // one call it always was.
  //
  // Sequential on purpose. Each call appends, and ADR-0058 §11's contract is
  // that one failed append leaves the rest of the meal accepted; running the
  // groups concurrently would interleave those appends for no gain a person
  // could perceive, on a path whose whole cost is already the wire.
  let copied = 0;
  const meal_types: MealType[] = [];
  for (const [meal_type, items] of mealsByType(fresh)) {
    meal_types.push(meal_type);
    const landed = await seams.logMeal(
      items,
      meal_type,
      selectedDate,
      (item) => reminted.get(item.id)!
    );
    copied += landed.copied;
  }

  const absorbed = events.length - fresh.length;
  return {
    logged: copied,
    absorbed,
    // Counted against the roots rather than against what survived the fold, so
    // a root the payload carried nothing usable for is reported rather than
    // quietly disappearing between the two.
    lost: payload.roots.length - absorbed - copied,
    meal_types,
    landed: landing.length,
    skipped: twins.size - landing.length,
  };
}

/**
 * The datoms one meal's landing twins become: their own facts, plus what §3
 * rebuilds and what §11 marks.
 *
 * `JSON.parse` is safe on every value here without a guard — the reader parsed
 * each line's `value` as the JSON text the ledger stores before this payload was
 * ever shown to anybody, and a row that would not parse was refused then.
 */
async function landingDatoms(
  landing: string[],
  twins: Map<string, LedgerRow[]>,
  received_at: number,
  seams: MealAcceptSeams
): Promise<Datom[]> {
  const rebuilt = await rebuiltProvenance(landing, seams.loadCorpus);
  const datoms: Datom[] = [];

  for (const entity of landing) {
    const attributes: Record<string, unknown> = {};
    for (const row of twins.get(entity) ?? []) {
      attributes[row.attribute] = JSON.parse(row.value);
    }
    const provenance = rebuilt.get(entity);
    if (provenance) attributes["provenance/raw"] = provenance;
    if (ARRIVAL_MARKED_PREFIXES.some((prefix) => entity.startsWith(prefix))) {
      attributes[FOOD_ARRIVAL_ATTR] = buildArrival(received_at);
    }
    // Written as datoms in this same append, not as a read-through: they are
    // facts this device derived, on its own clock, and a read-through would make
    // every NOVA badge re-parse the corpus.
    datoms.push(...ingestEntity({ entity, attributes }, received_at));
  }

  return datoms;
}

/**
 * The `provenance/raw` the recipient can rebuild for itself (ADR-0073 §3).
 *
 * Only `fdc:`, and only from the bundle already loaded for search:
 * `mapIndexRowToPayload` regenerates the identical blob deterministically,
 * offline, with no network. **`gtin:` is not rebuilt at all** — the only path is
 * an Open Food Facts re-fetch, and turning acceptance into a disclosure to a
 * third party is not admissible.
 *
 * A row the bundle does not carry, and a bundle that cannot be read at all, are
 * both **silent degradations and never refusals**: the twin lands without
 * provenance and its badge reads "not rated", which ADR-0041 §2 already reserves
 * as the neutral answer for a food that cannot be judged.
 */
async function rebuiltProvenance(
  landing: string[],
  loadCorpus: MealAcceptSeams["loadCorpus"]
): Promise<Map<string, unknown>> {
  const rebuilt = new Map<string, unknown>();
  const wanted = landing.filter((entity) => entity.startsWith(USDA_PREFIX));
  if (wanted.length === 0) return rebuilt;

  let corpus: SearchCorpus;
  try {
    corpus = await loadCorpus();
  } catch {
    return rebuilt;
  }

  const rows = new Map(
    corpus.foods.map((food) => [
      mintEntity(USDA_PREFIX, food.row.fdcId),
      food.row,
    ])
  );
  for (const entity of wanted) {
    const row = rows.get(entity);
    if (!row) continue;
    // The alias-widened name a vocabulary search produces is a display name, so
    // the mapper is asked without one: the blob is the row's, not the query's.
    rebuilt.set(entity, mapIndexRowToPayload(row).attributes["provenance/raw"]);
  }
  return rebuilt;
}
