/**
 * What the two USDA artifacts are shaped like, how they are written, and how big
 * they turn out.
 *
 * Split from `usda-bundle.mjs`, which decides WHAT ships; this decides what the
 * bytes look like once that is settled. The two change for different reasons — a
 * filter or a merge moves the corpus, while a schema bump, ADR-0047 §3's
 * reviewable-diff rule and ADR-0049 §4's per-phrase layout move the shape — and
 * the generator was past `CODING_STANDARDS.md` §4's ~1000 lines carrying both.
 *
 * `SCHEMA_VERSION` and the three builders below joined it for the second half of
 * that same reason (#151). They are what a schema bump edits: every one of the
 * five versions the number has had was a change to a FIELD on a row or a section
 * on the artifact, and not one of them moved a filter. The corpus arrives here
 * already decided, as `survivors`, and the app's own logic arrives as `app` —
 * nothing here reaches for either (ADR-0047 §4).
 *
 * A library, not a command: `usda-bundle.mjs` is the only entry point, and
 * `usda-coverage.mjs` reads the finished files rather than writing them. Node
 * built-ins only, like every script beside it.
 */

import { brotliCompressSync, constants, gzipSync } from "node:zlib";

// ---------------------------------------------------------------------------
// The shape: what a row carries, and what the two files are made of
// ---------------------------------------------------------------------------
/**
 * Bumped when either artifact's shape changes, so a reader can refuse an old one.
 *
 * 2 adds the search index's `vocabulary_off` section (ADR-0049 §4). 3 adds a
 * row's `also`, the names the twin merge discarded (#137). 4 adds the
 * `vocabulary_local` section beside it, the hand-written half the ODbL
 * derivative does not cover (#141). 5 adds a row's `plain_sibling`, the one
 * ranking key that cannot be derived from a description (ADR-0055 §6). 6 changes
 * no field but rewrites a value: a row's `description` no longer carries the
 * commercial origin USDA wrote into it, so a reader holding a captured row can
 * tell which naming a flag was computed against (ADR-0056). 7 changes no field
 * either and is the same kind of bump for the same kind of reader: seventy-four
 * rows left the corpus and one milk was renamed (ADR-0061), so an empty-search
 * flag ADR-0053 captured under 6 was measured against a corpus that still held
 * chocolate milk. 8 is the third of those value-only bumps: nine rows lost the
 * fortification phrase USDA wrote into their names (ADR-0062 §2), so a capture
 * made under 7 recorded five milks, two spreads and two processed cheeses under
 * names the corpus no longer ships. Both files carry the version because both
 * are generated together from one corpus, and a pair that disagreed about their
 * version would be the bug the number exists to catch.
 */
export const SCHEMA_VERSION = 8;

/**
 * The panel fields a search result row renders, which is the whole of what the
 * index carries about nutrition (ADR-0047 §2). Everything else is in the
 * nutrient store, parsed only when a food is staged.
 *
 * Keys, not nutrient ids: the values are read off the payload
 * `mapFdcFoodToPayload` builds, so the ids behind them, the energy preference
 * order and the mg/µg normalisation are all the app's and none of them is
 * restated here.
 */
export const ROW_MACRO_KEYS = [
  "calories",
  "protein_content",
  "fat_content",
  "carbohydrate_content",
];

/**
 * The distinct nutrient ids across every record, as `id -> { name, unit }`.
 *
 * A dictionary is only sound if a nutrient id means one unit everywhere, so that
 * is checked rather than assumed: measured over both archives on 2026-08-19, all
 * 246 ids are single-unit, and a record that ever broke that would make every
 * stored amount ambiguous. Failing loudly is the only safe response.
 */
export function collectNutrientDictionary(foods) {
  const dictionary = new Map();
  for (const food of foods)
    for (const nutrient of food.foodNutrients) {
      const known = dictionary.get(nutrient.nutrientId);
      if (!known) {
        dictionary.set(nutrient.nutrientId, {
          name: nutrient.nutrientName,
          unit: nutrient.unitName,
        });
        continue;
      }
      if (known.unit !== nutrient.unitName)
        throw new Error(
          `nutrient ${nutrient.nutrientId} is reported in both "${known.unit}" and ` +
            `"${nutrient.unitName}"; the store keys units by nutrient id and cannot ` +
            "carry two"
        );
    }
  return dictionary;
}

// ---------------------------------------------------------------------------
// The two artifacts
// ---------------------------------------------------------------------------

/**
 * What the artifacts say about where they came from (ADR-0047 §12): the release
 * each archive names, and the digest that pins the exact bytes behind it.
 *
 * There is deliberately no generation timestamp. One would change every byte of
 * both files on every run and turn §3's reviewable diff into a diff nobody
 * reads.
 */
export function generatedFrom(archives) {
  return archives.map((archive) => ({
    dataset: archive.dataset,
    release: archive.release,
    file: archive.file,
    sha256: archive.sha256,
  }));
}

/**
 * One search index row: identity, the fields ADR-0042 ranks on, the macros the
 * results list shows, the household portions, and the twin reference where the
 * food merged (ADR-0047 §2 and §8).
 *
 * `merged_from` rides inline because with hydration retired there is no other
 * carrier for it, and ADR-0045 §4 requires that a merged panel never present
 * itself as one record USDA served. It is omitted rather than emitted empty:
 * three of the 190 twinned pairs borrow nothing, and a food whose panel is
 * entirely its own did not merge.
 *
 * Every absent field is omitted for the same reason — "not measured" is a
 * distinction the panel makes, and `null` costs bytes to say nothing.
 *
 * @param {Survivor} survivor
 * @param {AppModule} app
 * @returns {IndexRow}
 */
export function buildIndexRow({ food, merged_from, foodPortions, also }, app) {
  const payload = app.mapFdcFoodToPayload(food, merged_from);
  const panel = payload.attributes["nutrition/info"];
  const macros = {};
  for (const key of ROW_MACRO_KEYS)
    if (panel[key] !== undefined) macros[key] = panel[key];

  const row = {
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType,
  };
  if (food.foodCategory) row.foodCategory = food.foodCategory;
  if (food.scientificName) row.scientificName = food.scientificName;
  row.macros = macros;
  const portions = app.mapFdcPortions(foodPortions);
  if (portions.length) row.portions = portions;
  if (merged_from.length) row.merged_from = merged_from;
  if (also?.length) row.also = also;
  return row;
}

/**
 * One nutrient-store entry: every nutrient the merged record reports, keyed by
 * id and sorted by it, in USDA's own published unit.
 *
 * No coverage gate (ADR-0047 §5) — sparse columns compress to almost nothing, so
 * a gate would save ~60 KiB brotli at its most aggressive and leave a judgement
 * for somebody to re-litigate. Amounts are USDA's, not normalised to grams:
 * normalising here would turn 0.3 mg into 0.00029999999999999997 and store float
 * noise, and the mapper normalises at read time anyway.
 *
 * @param {Survivor} survivor
 * @returns {Record<string, number>}
 */
export function buildNutrientEntry({ food }) {
  /** @type {Record<string, number>} */
  const entry = {};
  for (const nutrient of [...food.foodNutrients].sort(
    (a, b) => a.nutrientId - b.nutrientId
  ))
    entry[nutrient.nutrientId] = nutrient.value;
  return entry;
}

/**
 * Both artifacts, built over one corpus.
 *
 * The vocabulary is passed in rather than derived here because it is derived
 * FROM the finished corpus (ADR-0049 §3): the effect filter asks what these
 * survivors retrieve, so it cannot run until they are known. The hand-written
 * section rides in the same way, though for the opposite reason — it is not
 * derived from anything, and it is CHECKED against the index this returns.
 *
 * @param {Survivor[]} survivors
 * @param {AppModule} app
 * @param {ReturnType<typeof buildVocabularySection>} vocabulary_off
 * @param {ReturnType<typeof buildLocalVocabularySection>} vocabulary_local
 */
export function buildArtifacts(
  survivors,
  archives,
  app,
  vocabulary_off,
  vocabulary_local
) {
  const dictionary = collectNutrientDictionary(survivors.map((s) => s.food));
  const generated_from = generatedFrom(archives);
  const nutrients = {};
  for (const id of [...dictionary.keys()].sort((a, b) => a - b))
    nutrients[id] = dictionary.get(id);
  const foods = {};
  for (const survivor of survivors)
    foods[survivor.food.fdcId] = buildNutrientEntry(survivor);

  // ADR-0055 §3's key, decided here rather than in `buildIndexRow` because it
  // is the only field on a row that the row cannot answer: a name is a qualified
  // form only relative to the OTHER names in the corpus. Descriptions alone go
  // in — an `also` alias has no way to become a parent, which is what stops the
  // fourteen rows that are a row AND the prefix of their own alias (`Oil, corn`,
  // `Pineapple, raw`, `Nuts, almonds, whole, raw`) from demoting themselves.
  const rows = survivors.map((survivor) => buildIndexRow(survivor, app));
  const qualified = app.plainSiblingsOf(rows.map((row) => row.description));
  rows.forEach((row, i) => {
    if (qualified[i]) row.plain_sibling = true;
  });

  return {
    index: {
      schema_version: SCHEMA_VERSION,
      generated_from,
      vocabulary_off,
      vocabulary_local,
      foods: rows,
    },
    nutrientStore: {
      schema_version: SCHEMA_VERSION,
      generated_from,
      nutrients,
      foods,
    },
  };
}

// ---------------------------------------------------------------------------
// Serialisation: ADR-0047 §3's reviewable diff
// ---------------------------------------------------------------------------

/**
 * A JSON collection with one entry per line, which is the shape ADR-0047 §3 asks
 * for and neither of `JSON.stringify`'s two modes produces. Pretty-printing
 * would put every nutrient on its own line and diff 4.7 MB as half a million of
 * them; compact printing would put the whole corpus on one line and diff as a
 * single changed line nobody can read.
 */
function linePerEntry(open, close, lines) {
  return lines.length
    ? `${open}\n${lines.join(",\n")}\n${close}`
    : open + close;
}

/**
 * A JSON object written as ordered `"key": <already-rendered value>` sections.
 *
 * The two artifacts share this envelope — what they are, the schema a reader has
 * to understand, and the archives behind them — and differ only in the sections
 * that follow it. `vocabulary_off` nests one inside another, which is why this
 * renders no trailing newline and {@link serialiseDocument} adds it.
 */
function renderObject(sections) {
  const body = sections
    .map(([key, rendered]) => `${JSON.stringify(key)}: ${rendered}`)
    .join(",\n");
  return `{\n${body}\n}`;
}

/** {@link renderObject} as a whole file: one trailing newline, as POSIX wants. */
function serialiseDocument(sections) {
  return `${renderObject(sections)}\n`;
}

/** The `generated_from` block both artifacts carry, one archive per line. */
function renderProvenance(generated_from) {
  return linePerEntry(
    "[",
    "]",
    generated_from.map((archive) => JSON.stringify(archive))
  );
}

/**
 * A vocabulary section, one key per line (ADR-0049 §4).
 *
 * Per line for the reason the foods are: a taxonomy refresh has to diff as the
 * handful of phrases that moved, since the committed map IS the review gate for
 * a source that is unversioned and rewritten in place.
 *
 * The provenance fields are rendered from what the section HAS rather than from
 * a fixed list, because the two sections deliberately differ in exactly those
 * fields (ADR-0049 §4 and its #141 Amendment). Listing four keys here would emit
 * `"licence": undefined` for the half whose whole point is not having one.
 */
function renderVocabulary(vocabulary) {
  const { expansions, ...provenance } = vocabulary;
  return renderObject([
    ...Object.entries(provenance).map(([field, value]) => [
      field,
      JSON.stringify(value),
    ]),
    [
      "expansions",
      linePerEntry(
        "{",
        "}",
        Object.entries(expansions).map(
          ([phrase, targets]) =>
            `${JSON.stringify(phrase)}: ${JSON.stringify(targets)}`
        )
      ),
    ],
  ]);
}

/** The search index, serialised as one food per line, sorted by `fdcId` (§3). */
export function serialiseIndex(artifact) {
  return serialiseDocument([
    ["artifact", '"usda-search-index"'],
    ["schema_version", String(artifact.schema_version)],
    ["generated_from", renderProvenance(artifact.generated_from)],
    ["vocabulary_off", renderVocabulary(artifact.vocabulary_off)],
    ["vocabulary_local", renderVocabulary(artifact.vocabulary_local)],
    [
      "foods",
      linePerEntry(
        "[",
        "]",
        artifact.foods.map((row) => JSON.stringify(row))
      ),
    ],
  ]);
}

/** The nutrient store, serialised as one food per line, keyed by `fdcId` (§3). */
export function serialiseNutrientStore(artifact) {
  const keyed = (entries) =>
    linePerEntry(
      "{",
      "}",
      entries.map(
        ([key, value]) =>
          `${JSON.stringify(String(key))}: ${JSON.stringify(value)}`
      )
    );
  return serialiseDocument([
    ["artifact", '"usda-nutrient-store"'],
    ["schema_version", String(artifact.schema_version)],
    ["generated_from", renderProvenance(artifact.generated_from)],
    ["nutrients", keyed(Object.entries(artifact.nutrients))],
    ["foods", keyed(Object.entries(artifact.foods))],
  ]);
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** A byte count as the run's report prints it. */
export const kib = (bytes) => `${Math.round(bytes / 1024)} KiB`;

/**
 * Raw, gzip-9 and brotli-11 bytes for one artifact.
 *
 * Every compressor is named beside its number, and all three are printed rather
 * than one. A size quoted without its compressor is how "361 KiB" survived three
 * ADRs before #120 caught it, and the two figures that disagreed there were the
 * same artifact under gzip and brotli.
 */
export function measure(text) {
  const raw = Buffer.byteLength(text);
  return {
    raw,
    gzip: gzipSync(text, { level: 9 }).length,
    brotli: brotliCompressSync(Buffer.from(text), {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: raw,
      },
    }).length,
  };
}

/**
 * How long `JSON.parse` takes on this machine, in milliseconds: the fastest of
 * several warmed runs, because a single timing on a busy machine measures the
 * machine rather than the artifact, and ADR-0047 §2's split rests on the ratio
 * between these two numbers.
 *
 * It is a Node figure on a dev machine and says nothing about a phone. The
 * in-app measurement is #113's, and it is the one that decides whether the
 * nutrient store ever needs a Worker.
 */
export function parseMs(text) {
  let best = Infinity;
  for (let run = 0; run < 5; run++) {
    const started = process.hrtime.bigint();
    JSON.parse(text);
    best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
  }
  return best;
}
