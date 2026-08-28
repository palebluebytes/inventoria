/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/p2p-probe/README.md`.
 *
 * Building a real meal payload to push across the wire.
 *
 * The probe needs something honest to send. #199 measured three sizes after
 * #197's narrowing — a normal meal at 13.0 KiB raw / 2.5 KiB gzipped, a
 * Christmas dinner of 30 foods and 3 cooked dishes at 114.6 / 12.7, a 60-food
 * feast at 224.0 / 23.2 — and its harness is a Vitest file that reads Open Food
 * Facts responses from a scratch directory that no longer exists. Rather than
 * revive it, this rebuilds the same meal in the browser from the bundled USDA
 * corpus, through the app's own mappers, so the bytes on the wire are the bytes
 * the app would really produce.
 *
 * Two deliberate departures from #199's harness, both of which make the figures
 * comparable rather than different:
 *
 *   - **No `gtin:` twins.** #199 opened with packaged goods because a `gtin:`
 *     twin used to be the dear one. #197 §1.2 stripped `twin/raw_provenance`,
 *     `food/label_photos` and `food/photo_base64` from the wire, which took a
 *     `gtin:` twin from 58x an `fdc:` twin to rough parity, so an all-USDA meal
 *     of the same food count now costs the same order as a mixed one. That
 *     removes a live network fetch from a probe about not needing a network.
 *   - **The widest rows in the corpus**, exactly as #199 did: sort every corpus
 *     row by serialised size and take from the top. A ceiling proved against
 *     these cannot be beaten by an honest food.
 *
 * The closure walk and the three-attribute omission below are #197's decision
 * expressed as code. That part is genuinely liftable; the meal-fabrication
 * around it is not.
 */

import {
  loadSearchCorpus,
  loadNutrientStore,
  mapIndexRowToPayload,
  completeStagedPanel,
  type SearchCorpus,
  type NutrientStore,
} from "../food/usda-corpus";
import { buildInstantiation } from "../food/recipe-instantiation";
import { deriveIngredientMacros } from "../food/recipe-nutrition";
import { EXTRA_NUTRIENT_KEYS } from "../food/nutrition";
import { ingestEntity } from "../ingestion/ingest";
import { datomLine, envelopeLine } from "../db/ledger-export";
import type { LedgerRow } from "../db/db.core";

/**
 * #197 §1.2 / §1.3 — the three attributes that never cross to another person.
 * Everything else in the closure crosses verbatim, `food/manual_entry` and
 * `food/label_capture` included, because a short enumerable omission list was
 * judged worth more than a pure principle.
 */
const FORBIDDEN = new Set([
  "twin/raw_provenance",
  "food/label_photos",
  "food/photo_base64",
]);

/**
 * #197 §4 — a meal payload is a distinct artifact, not a ledger export, or
 * Settings -> Import would swallow it and bypass every receive rule.
 */
export const MEAL_ARTIFACT = "inventoria-meal";

export interface MealSize {
  key: string;
  label: string;
  foods: number;
  recipes: number;
  /** What #199 measured for this shape, so the probe can check itself. */
  expectedRawKiB: number;
}

/** The three shapes #199 priced, plus the one it called beyond any honest meal. */
export const MEAL_SIZES: MealSize[] = [
  {
    key: "normal",
    label: "a normal meal",
    foods: 4,
    recipes: 0,
    expectedRawKiB: 13.0,
  },
  {
    key: "dinner",
    label: "a cooked dinner",
    foods: 10,
    recipes: 1,
    expectedRawKiB: 34.9,
  },
  {
    key: "christmas",
    label: "a Christmas dinner",
    foods: 30,
    recipes: 3,
    expectedRawKiB: 114.6,
  },
  {
    key: "feast",
    label: "an implausibly large feast",
    foods: 60,
    recipes: 6,
    expectedRawKiB: 224.0,
  },
];

export interface BuiltPayload {
  ndjson: string;
  rawBytes: number;
  deflatedBytes: number;
  lines: number;
  entities: number;
  roots: string[];
}

type Row = LedgerRow;

/**
 * Builds one meal's narrowed reference closure as NDJSON.
 *
 * Both artifacts are parameters for the reason the rest of the food domain
 * makes them parameters — `searchUsdaCorpus` and `completeStagedPanel` both do
 * the same — so the meal can be priced against the committed artifacts without
 * a browser and a fetch.
 *
 * The steps mirror the real app: stage foods off the corpus (which supersedes
 * the four-macro panel with the full one, so the ledger holds two
 * `nutrition/info` datoms and the wire sends only the winner), cook some of
 * them into recipes with frozen instantiations, then log a Consumption Event
 * against every food and every dish.
 */
export async function buildMealPayload(
  size: MealSize,
  loadCorpus: () => Promise<SearchCorpus> = loadSearchCorpus,
  loadNutrients: () => Promise<NutrientStore> = loadNutrientStore
): Promise<BuiltPayload> {
  const corpus = await loadCorpus();
  const store = await loadNutrients();
  const loadStore = async () => store;

  const widest = [...corpus.foods]
    .map((f) => ({ row: f.row, size: JSON.stringify(f.row).length }))
    .sort((a, b) => b.size - a.size)
    .map((x) => x.row);

  const rows: Row[] = [];
  let hlc = 1_756_000_000_000;
  let clock = new Date(2026, 11, 25, 13, 0, 0).getTime();
  const panels = new Map<string, any>();
  const names = new Map<string, string>();
  const events: string[] = [];

  const emit = (payload: any, time: number) => {
    for (const d of ingestEntity(payload, time)) {
      rows.push({
        entity: d.entity,
        attribute: d.attribute,
        // The ledger stores every value as JSON.stringify(value) and the export
        // writes that TEXT verbatim, so the wire carries the escaping.
        value: JSON.stringify(d.value),
        time,
        hlc_ms: hlc++,
        hlc_ctr: 0,
        device_id: "dev_probe198",
      } as Row);
    }
  };

  const stageFood = async (row: any) => {
    const base = mapIndexRowToPayload(row);
    const staged = await completeStagedPanel(base, loadStore);
    emit(base, (clock += 1000));
    emit(
      {
        entity: staged.entity,
        attributes: { "nutrition/info": staged.attributes["nutrition/info"] },
      },
      (clock += 40)
    );
    panels.set(staged.entity, staged.attributes["nutrition/info"]);
    names.set(
      staged.entity,
      String(staged.attributes["food/name"] ?? staged.entity)
    );
    return staged.entity;
  };

  const resolve = (ref: string) => panels.get(ref);
  const resolveName = (ref: string) => names.get(ref);

  const logEntry = (
    target: string,
    amount: number,
    unit: string,
    instantiation?: any
  ) => {
    const b: any = deriveIngredientMacros(
      { ref: target, amount, unit: unit as any },
      resolve
    );
    const metrics: Record<string, number> = { calories: b.calories };
    for (const k of ["protein", "fat", "carbs"] as const)
      if (typeof b[k] === "number") metrics[k] = b[k];
    for (const k of EXTRA_NUTRIENT_KEYS)
      if (typeof b[k] === "number") metrics[k] = b[k];
    const entity = `event:consume_${(hlc % 1e7).toString(36)}_${clock}`;
    const attributes: Record<string, unknown> = {
      "event/type": "ConsumeAction",
      "event/target": target,
      "event/quantity": `${amount}${unit}`,
      "event/meal_type": "dinner",
      "event/metrics": metrics,
    };
    if (instantiation) attributes["event/instantiation"] = instantiation;
    emit({ entity, attributes }, (clock += 1000));
    events.push(entity);
  };

  const ids: string[] = [];
  for (let i = 0; i < size.foods; i++) ids.push(await stageFood(widest[i]));

  const perRecipe = Math.max(
    4,
    Math.floor(ids.length / Math.max(1, size.recipes))
  );
  for (let r = 0; r < size.recipes; r++) {
    const refs = ids.slice(r * perRecipe, (r + 1) * perRecipe);
    if (refs.length === 0) break;
    const ingredients = refs.map((ref, i) => ({
      ref,
      amount: 80 + i * 15,
      unit: "g" as const,
    }));
    const entity = `recipe:dish-${r}-4d9b0c17-2f5a-4e8b-9a13-6c2e7f01d8aa`;
    emit(
      {
        entity,
        attributes: {
          "recipe/name": `Roast course number ${r + 1}`,
          "recipe/yield": 8,
          "recipe/ingredients": ingredients,
          "recipe/instructions": [
            "Heat the oven to 190C and prepare the tray.",
            "Combine the aromatics and cook until softened, about ten minutes.",
            "Add the remaining ingredients, season, and roast until done.",
            "Rest before serving.",
          ],
        },
      },
      (clock += 1000)
    );
    logEntry(
      entity,
      1,
      "serving",
      buildInstantiation(entity, ingredients, 8, resolve, resolveName)
    );
  }
  for (const id of ids) logEntry(id, 90, "g");

  // ── #197 §1.1: winning datoms only, never the superseded history ─────────
  const byEntity = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byEntity.has(r.entity)) byEntity.set(r.entity, []);
    byEntity.get(r.entity)!.push(r);
  }
  const winning = (entity: string) => {
    const seen = new Map<string, Row>();
    for (const r of byEntity.get(entity) ?? []) {
      const prev = seen.get(r.attribute);
      if (!prev || r.hlc_ms > prev.hlc_ms) seen.set(r.attribute, r);
    }
    return [...seen.values()];
  };

  // ── The reference closure, walked from the Consumption Events ────────────
  const closure = new Set<string>();
  const walk = (entity: string) => {
    if (closure.has(entity)) return;
    closure.add(entity);
    for (const r of winning(entity)) {
      const v = JSON.parse(r.value);
      if (r.attribute === "event/target") walk(v);
      if (r.attribute === "event/instantiation") {
        if (v.based_on) walk(v.based_on);
        for (const ing of v.ingredients ?? []) if (ing.ref) walk(ing.ref);
      }
      if (r.attribute === "recipe/ingredients")
        for (const ing of v ?? []) if (ing.ref) walk(ing.ref);
    }
  };
  for (const e of events) walk(e);

  const payloadRows: Row[] = [];
  for (const entity of closure)
    for (const r of winning(entity))
      if (!FORBIDDEN.has(r.attribute)) payloadRows.push(r);

  // #197 §4: the envelope declares the closure roots. Without them a closure
  // cannot be told from a bag of datoms, and the reachability refusal — the
  // load-bearing one of #197 §5's seven — has nothing to check against.
  const ndjson =
    envelopeLine({
      artifact: MEAL_ARTIFACT,
      schema_version: 1,
      exported_at: clock,
      device_id: "dev_probe198",
      row_count: payloadRows.length,
      roots: events,
    } as any) + payloadRows.map((r) => datomLine(r)).join("");

  const rawBytes = new TextEncoder().encode(ndjson).length;
  return {
    ndjson,
    rawBytes,
    deflatedBytes: (await deflate(new TextEncoder().encode(ndjson))).length,
    lines: payloadRows.length,
    entities: closure.size,
    roots: events,
  };
}

// ---------------------------------------------------------------------------
// Compression, the browser's own
// ---------------------------------------------------------------------------

const through = async (
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> => {
  const blob = new Blob([bytes as BlobPart]);
  const piped = blob
    .stream()
    .pipeThrough(
      stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
    );
  return new Uint8Array(await new Response(piped).arrayBuffer());
};

/**
 * Raw DEFLATE, not gzip. #194 §4.3 measured the difference and it is not
 * cosmetic for the QR question: gzip's header and trailer are 18 wasted bytes
 * in a symbol, and base64 on top of either is the worst combination available.
 */
export const deflate = (bytes: Uint8Array): Promise<Uint8Array> =>
  through(bytes, new CompressionStream("deflate-raw"));

export const inflate = (bytes: Uint8Array): Promise<Uint8Array> =>
  through(bytes, new DecompressionStream("deflate-raw"));
