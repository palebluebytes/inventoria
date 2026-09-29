/**
 * Reading a raw ledger export the way the app reads its own ledger.
 *
 * Five census scripts had grown their own copy of the same latest-datom-wins
 * fold, and `veto-census.mjs` said so out loud — `copied from
 * pairing-census.mjs's fold; same HLC rule`. CODING_STANDARDS §2.2 names the
 * canonical one: ordering is `compareHlc`, from `src/lib/db/hlc.ts`. Every copy
 * compared `hlc_ms` then `hlc_ctr` and stopped there, so none of them carried
 * ADR-0020's device-id tiebreak, and two devices writing one attribute at the
 * same stamp decided the census by which line the export happened to hold first.
 *
 * **The canonical function is reachable here for nothing.** `hlc.ts` imports no
 * neighbour, so plain Node strips its types and imports it directly — no esbuild
 * bundle (`usda-app-module.mjs`) and no resolve hook (`ts-resolve-hook.mjs`).
 * ADR-0047 §4's import-don't-copy rule at its cheapest.
 *
 * A library, not a command. It changes when the export's shape or the clock's
 * order does, never when a census question does.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { compareHlc } = await import(
  pathToFileURL(join(ROOT, "src", "lib", "db", "hlc.ts")).href
);

/**
 * Every datom line of an export, optionally narrowed to one entity prefix.
 *
 * The export's first line is its own header — `artifact`, `row_count`, `scope`
 * (ADR-0064 §1) — and carries no `entity`, which is what skips it. Every fold
 * below leaned on the same absence; it is stated once here instead.
 */
function* exportRows(path, entityPrefix) {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!row.entity) continue;
    if (entityPrefix && !row.entity.startsWith(entityPrefix)) continue;
    yield row;
  }
}

/**
 * The latest datom per (entity, attribute), by the app's own order.
 *
 * `compareHlc` rather than a hand-rolled `>`: a twin edited after capture has to
 * be read as it stands now or a census measures a product that was superseded,
 * and which of two same-stamp rows stands is ADR-0020's question rather than
 * this file's.
 */
function foldLatest(rows) {
  const latest = new Map();
  for (const row of rows) {
    const attrs = latest.get(row.entity) ?? new Map();
    const held = attrs.get(row.attribute);
    if (!held || compareHlc(row, held) > 0) attrs.set(row.attribute, row);
    latest.set(row.entity, attrs);
  }
  return latest;
}

/** One entity's attributes as parsed values, keyed by attribute name. */
const valuesOf = (attrs) =>
  Object.fromEntries(
    [...attrs].map(([attribute, row]) => [attribute, JSON.parse(row.value)])
  );

/**
 * An export folded to current state: `Map<entity, { [attribute]: value }>`.
 *
 * The shape every caller wanted, rather than the stamps they threw away — a
 * census asks what a twin says now, and the one caller that also needs when it
 * was first written is {@link readPackTwins}.
 */
export function foldLedgerExport(path, { entityPrefix = "" } = {}) {
  return new Map(
    [...foldLatest(exportRows(path, entityPrefix))].map(([entity, attrs]) => [
      entity,
      valuesOf(attrs),
    ])
  );
}

/**
 * Every `gtin:` twin in an export, with the OFF record it was captured from.
 *
 * `captured` is the earliest stamp any of the twin's datoms carries, which is
 * when the pack was first seen rather than when it was last edited.
 *
 * The provenance is read under **the superseded name first**, deliberately and
 * not as an oversight: ADR-0086 §5 renamed `twin/raw_provenance` to
 * `provenance/raw` and accepted in terms that datoms already written stay under
 * names nothing will read again, so a real ledger carries both and a census
 * measuring the *population* wants whichever is there. A census asking what the
 * shipped code can see asks the opposite question and reads `provenance/raw`
 * alone — `limit-fill-census.mjs` does exactly that, which is why its reading is
 * its own rather than this one.
 */
export function readPackTwins(path) {
  const rows = [...exportRows(path, "gtin:")];

  const captured = new Map();
  for (const row of rows) {
    const held = captured.get(row.entity);
    if (held === undefined || row.hlc_ms < held)
      captured.set(row.entity, row.hlc_ms);
  }

  return [...foldLatest(rows)].map(([entity, attrs]) => {
    const values = valuesOf(attrs);
    const provenance =
      values["twin/raw_provenance"] ?? values["provenance/raw"];
    const product = provenance?.raw_data?.product ?? provenance?.product ?? {};
    return {
      gtin: entity.slice("gtin:".length),
      captured: captured.get(entity),
      name: values["food/name"] ?? null,
      panel: values["nutrition/info"] ?? null,
      hasOffRecord: Object.keys(product).length > 0,
      productName: product.product_name || null,
      categoriesTags: product.categories_tags ?? [],
    };
  });
}

/**
 * #243's query construction: what one pack offers the corpus to be matched on.
 *
 * `en:`-prefixed tags only. OFF's taxonomy is canonically English however the
 * pack is written, which is the whole reason the categories are worth more here
 * than the name — the measured population is Spanish, French, Catalan, Dutch,
 * German and Chinese, and the corpus is English. A `da:`, `es:` or `fr:` tag is a
 * language-local leaf OFF never canonicalised and the corpus cannot answer.
 *
 * OFF orders a tag list broad to specific, so it is read backwards: most
 * specific first.
 *
 * The packaging is each caller's, because they ask different questions of it —
 * one reports per-proposer hit rates against the tags and the name separately,
 * the other walks them as one ordered list of attempts. What may not differ is
 * the derivation, which is #243's measured construction and is here.
 */
export function packQueries(twin) {
  return {
    tags: twin.categoriesTags
      .filter((tag) => tag.startsWith("en:"))
      .map((tag) => tag.slice(3).replaceAll("-", " ").toLowerCase())
      .reverse(),
    name: twin.productName ?? twin.name,
  };
}
