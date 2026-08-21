/**
 * How the two USDA artifacts are written, and how big they turn out.
 *
 * Split from `usda-bundle.mjs`, which decides WHAT ships; this decides what the
 * bytes look like once that is settled. The two change for different reasons — a
 * filter or a merge moves the corpus, while ADR-0047 §3's reviewable-diff rule
 * and ADR-0049 §4's per-phrase layout move the shape — and the generator was
 * past `CODING_STANDARDS.md` §4's ~1000 lines carrying both.
 *
 * A library, not a command: `usda-bundle.mjs` is the only entry point, and
 * `usda-coverage.mjs` reads the finished files rather than writing them. Node
 * built-ins only, like every script beside it.
 */

import { brotliCompressSync, constants, gzipSync } from "node:zlib";

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
 * The `vocabulary_off` section, one key per line (ADR-0049 §4).
 *
 * Per line for the reason the foods are: a taxonomy refresh has to diff as the
 * handful of phrases that moved, since the committed map IS the review gate for
 * a source that is unversioned and rewritten in place.
 */
function renderVocabulary(vocabulary) {
  return renderObject([
    ["licence", JSON.stringify(vocabulary.licence)],
    ["source", JSON.stringify(vocabulary.source)],
    ["url", JSON.stringify(vocabulary.url)],
    ["sha256", JSON.stringify(vocabulary.sha256)],
    [
      "expansions",
      linePerEntry(
        "{",
        "}",
        Object.entries(vocabulary.expansions).map(
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
