#!/usr/bin/env node
/**
 * #196 — Measure one past meal's reference closure, and the whole ledger's.
 *
 * Reads an ADR-0064 ledger export (NDJSON: envelope line, then one datom per
 * line) and prices what a peer-to-peer send would actually have to carry.
 *
 * Throwaway measuring tool for wayfinder map #185. It reads the file and
 * writes a report; it never writes to the ledger and never leaves the
 * scratchpad.
 *
 *   node measure-closure.mjs <export.ndjson> [--json out.json]
 *
 * A "Past meal" is (local calendar day, meal_type) — the same bucket
 * `pastMealsFor` uses (src/lib/food/past-meals.ts, ADR-0058 §4/§6).
 *
 * The closure of a meal is: every datom of every `event:consume_` in that
 * bucket, plus the transitive closure over
 *   - `event/target`                        → the twin eaten
 *   - `event/instantiation.based_on`        → the recipe template
 *   - `event/instantiation.ingredients[].ref` → the frozen ingredient rows
 *   - `recipe/ingredients[].ref`            → the live template's ingredients
 * ...and every datom those entities carry.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Reading the export
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
if (!filePath) {
  console.error("usage: measure-closure.mjs <export.ndjson> [--json out.json]");
  process.exit(2);
}
const jsonOutFlag = args.indexOf("--json");
const jsonOut = jsonOutFlag >= 0 ? args[jsonOutFlag + 1] : null;

const text = readFileSync(filePath, "utf8");
const lines = text.split("\n").filter((l) => l.length > 0);

const envelopeLine = lines[0];
const envelope = JSON.parse(envelopeLine);
if (envelope.artifact !== "inventoria-ledger") {
  console.error(`not a ledger export: artifact=${envelope.artifact}`);
  process.exit(2);
}

/**
 * One datom, carrying the EXACT bytes of the line it arrived on. The wire unit
 * is the line, so nothing is re-serialised: a re-stringify could differ from
 * what the export wrote and would quietly mis-price the payload.
 */
const datoms = [];
for (let i = 1; i < lines.length; i++) {
  const raw = lines[i];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`line ${i + 1} is not JSON; stopping`);
    process.exit(2);
  }
  datoms.push({
    entity: parsed.entity,
    attribute: parsed.attribute,
    value: parsed.value,
    time: parsed.time,
    hlc_ms: parsed.hlc_ms,
    hlc_ctr: parsed.hlc_ctr,
    device_id: parsed.device_id,
    // +1 for the newline the export writes after every line.
    bytes: Buffer.byteLength(raw, "utf8") + 1,
    line: raw + "\n",
  });
}

// ---------------------------------------------------------------------------
// Folding
// ---------------------------------------------------------------------------

/** Ledger order (ADR-0020): hlc_ms, then hlc_ctr, then device_id. */
function compareHlc(a, b) {
  if (a.hlc_ms !== b.hlc_ms) return a.hlc_ms - b.hlc_ms;
  if (a.hlc_ctr !== b.hlc_ctr) return a.hlc_ctr - b.hlc_ctr;
  return a.device_id < b.device_id ? -1 : a.device_id > b.device_id ? 1 : 0;
}

/** Values are JSON-encoded TEXT; a few attributes hold opaque strings. */
function parseValue(raw) {
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
}

const ordered = [...datoms].sort(compareHlc);

/** entity → { attribute → winning datom } */
const state = new Map();
/** entity → datom[] (every datom, history included) */
const byEntity = new Map();

for (const d of ordered) {
  let all = byEntity.get(d.entity);
  if (!all) byEntity.set(d.entity, (all = []));
  all.push(d);

  let fields = state.get(d.entity);
  if (!fields) state.set(d.entity, (fields = new Map()));
  fields.set(d.attribute, d); // later HLC wins
}

/** The folded value of one attribute on one entity, or undefined. */
function field(entity, attribute) {
  const d = state.get(entity)?.get(attribute);
  return d === undefined ? undefined : parseValue(d.value);
}

// ---------------------------------------------------------------------------
// The reference closure
// ---------------------------------------------------------------------------

const PHOTO_ATTRIBUTES = new Set(["food/photo_base64", "food/label_photos"]);

/** ADR-0014: derived ids two devices construct identically, without talking. */
function idKind(entity) {
  if (entity.startsWith("gtin:") || entity.startsWith("fdc:")) return "derived";
  return "minted";
}

/** Every entity one entity points at. */
function refsOf(entity) {
  const out = new Set();
  const fields = state.get(entity);
  if (!fields) return out;

  for (const [attribute, d] of fields) {
    const v = parseValue(d.value);
    if (attribute === "event/target" && typeof v === "string") out.add(v);
    if (attribute === "event/instantiation" && v && typeof v === "object") {
      if (typeof v.based_on === "string") out.add(v.based_on);
      for (const row of v.ingredients ?? []) {
        if (typeof row?.ref === "string") out.add(row.ref);
      }
    }
    if (attribute === "recipe/ingredients" && Array.isArray(v)) {
      for (const row of v) {
        if (typeof row?.ref === "string") out.add(row.ref);
      }
    }
  }
  return out;
}

/** Transitive closure from a set of seed entities. */
function closureOf(seeds) {
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length) {
    const e = queue.pop();
    if (seen.has(e)) continue;
    seen.add(e);
    for (const ref of refsOf(e)) if (!seen.has(ref)) queue.push(ref);
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function priceDatoms(ds) {
  const kept = ds.filter((d) => !PHOTO_ATTRIBUTES.has(d.attribute));
  const body = ds.map((d) => d.line).join("");
  const bodyNoPhoto = kept.map((d) => d.line).join("");
  return {
    datoms: ds.length,
    bytes: Buffer.byteLength(body, "utf8"),
    gzip: ds.length ? gzipSync(Buffer.from(body, "utf8")).length : 0,
    datomsNoPhoto: kept.length,
    bytesNoPhoto: Buffer.byteLength(bodyNoPhoto, "utf8"),
    gzipNoPhoto: kept.length
      ? gzipSync(Buffer.from(bodyNoPhoto, "utf8")).length
      : 0,
  };
}

/**
 * Prices a closure two ways. `all` is every datom those entities ever carried;
 * `current` is only the HLC-winning datom per (entity, attribute) — the
 * smallest thing a receiver could be given that still folds to the same state.
 */
function priceClosure(entities) {
  const all = [];
  const current = [];
  for (const e of entities) {
    for (const d of byEntity.get(e) ?? []) all.push(d);
    for (const d of state.get(e)?.values() ?? []) current.push(d);
  }
  all.sort(compareHlc);
  current.sort(compareHlc);

  const kinds = { derived: 0, minted: 0 };
  const byPrefix = {};
  for (const e of entities) {
    kinds[idKind(e)]++;
    const prefix = e.startsWith("event:consume_")
      ? "event:consume_"
      : e.startsWith("food:custom_")
        ? "food:custom_"
        : `${e.split(":")[0]}:`;
    byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
  }

  return {
    entities: entities.size,
    kinds,
    byPrefix,
    all: priceDatoms(all),
    current: priceDatoms(current),
  };
}

/** Bytes attributable to each attribute, over a datom set. */
function attributeCost(ds) {
  const rows = new Map();
  for (const d of ds) {
    const r = rows.get(d.attribute) ?? {
      attribute: d.attribute,
      n: 0,
      bytes: 0,
    };
    r.n++;
    r.bytes += d.bytes;
    rows.set(d.attribute, r);
  }
  return [...rows.values()].sort((a, b) => b.bytes - a.bytes);
}

// ---------------------------------------------------------------------------
// Past meals
// ---------------------------------------------------------------------------

function dayKeyOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const consumeEvents = [];
for (const entity of byEntity.keys()) {
  if (!entity.startsWith("event:consume_")) continue;
  const status = field(entity, "event/status");
  const meal_type = field(entity, "event/meal_type");
  const target = field(entity, "event/target");
  // The projection hides retracted events; a send carries the meal as shown.
  const retracted = status === "retracted";
  const time = (byEntity.get(entity) ?? [])[0]?.time ?? 0;
  consumeEvents.push({ entity, meal_type, target, time, retracted });
}

/** (day, meal_type) → event entities, the `pastMealsFor` bucket. */
const meals = new Map();
for (const e of consumeEvents) {
  if (e.retracted) continue;
  if (!e.meal_type) continue;
  const key = `${dayKeyOf(e.time)} ${e.meal_type}`;
  const m = meals.get(key) ?? {
    day: dayKeyOf(e.time),
    meal_type: e.meal_type,
    events: [],
  };
  m.events.push(e);
  meals.set(key, m);
}

/** Which of the ticket's four cases a meal exercises. */
function casesOf(entities) {
  const has = (p) => [...entities].some((e) => e.startsWith(p));
  const photoCarrier = [...entities].some((e) =>
    [...(state.get(e)?.keys() ?? [])].some((a) => PHOTO_ATTRIBUTES.has(a))
  );
  const labelCaptured = [...entities].some(
    (e) => field(e, "food/label_capture") !== undefined
  );
  const cases = [];
  if (has("fdc:")) cases.push("fdc");
  if (has("gtin:")) cases.push("gtin");
  if (has("food:custom_")) cases.push("custom");
  if (has("recipe:")) cases.push("recipe");
  if (photoCarrier) cases.push("photo");
  if (labelCaptured) cases.push("label");
  return cases;
}

const priced = [];
for (const m of meals.values()) {
  const seeds = new Set(m.events.map((e) => e.entity));
  const entities = closureOf(seeds);
  priced.push({
    day: m.day,
    meal_type: m.meal_type,
    events: m.events.length,
    cases: casesOf(entities),
    ...priceClosure(entities),
    entityList: [...entities],
  });
}
priced.sort((a, b) => b.all.bytes - a.all.bytes);

// ---------------------------------------------------------------------------
// The whole ledger
// ---------------------------------------------------------------------------

const wholeAll = priceDatoms(ordered);
const wholeCurrent = priceDatoms(
  [...state.values()].flatMap((f) => [...f.values()]).sort(compareHlc)
);
const envelopeBytes = Buffer.byteLength(envelopeLine, "utf8") + 1;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const kb = (n) => (n / 1024).toFixed(1);

const out = [];
const say = (s = "") => out.push(s);

say(`# #196 — reference closure measurements`);
say();
say(`Export: \`${filePath.split("/").pop()}\``);
say(`Device: \`${envelope.device_id}\`  ·  schema v${envelope.schema_version}`);
say(
  `Envelope says ${envelope.row_count.toLocaleString()} rows; the file carries ${datoms.length.toLocaleString()}.`
);
say();

say(`## The whole ledger`);
say();
say(`| set | entities | datoms | raw | gzip | raw −photos | gzip −photos |`);
say(`| --- | --- | --- | --- | --- | --- | --- |`);
const wholeEntities = byEntity.size;
say(
  `| every datom | ${wholeEntities.toLocaleString()} | ${wholeAll.datoms.toLocaleString()} | ${kb(wholeAll.bytes)} KiB | ${kb(wholeAll.gzip)} KiB | ${kb(wholeAll.bytesNoPhoto)} KiB | ${kb(wholeAll.gzipNoPhoto)} KiB |`
);
say(
  `| current state only | ${wholeEntities.toLocaleString()} | ${wholeCurrent.datoms.toLocaleString()} | ${kb(wholeCurrent.bytes)} KiB | ${kb(wholeCurrent.gzip)} KiB | ${kb(wholeCurrent.bytesNoPhoto)} KiB | ${kb(wholeCurrent.gzipNoPhoto)} KiB |`
);
say();
say(`Envelope line: ${envelopeBytes} bytes.`);
say();

say(`### What the ledger's bytes are spent on`);
say();
say(`| attribute | datoms | bytes | % of ledger |`);
say(`| --- | --- | --- | --- |`);
for (const r of attributeCost(ordered).slice(0, 20)) {
  say(
    `| \`${r.attribute}\` | ${r.n.toLocaleString()} | ${kb(r.bytes)} KiB | ${((100 * r.bytes) / wholeAll.bytes).toFixed(1)}% |`
  );
}
say();

say(`### Entities by prefix`);
say();
const prefixes = {};
for (const e of byEntity.keys()) {
  const p = e.startsWith("event:")
    ? e.split("_")[0] + "_"
    : e.startsWith("food:custom_")
      ? "food:custom_"
      : `${e.split(":")[0]}:`;
  prefixes[p] = (prefixes[p] ?? 0) + 1;
}
say(`| prefix | entities | id |`);
say(`| --- | --- | --- |`);
for (const [p, n] of Object.entries(prefixes).sort((a, b) => b[1] - a[1])) {
  say(`| \`${p}\` | ${n.toLocaleString()} | ${idKind(p)} |`);
}
say();

say(`## Past meals`);
say();
say(`${priced.length} past meals — (local day, Meal Type) buckets.`);
say();

if (priced.length) {
  const stat = (sel) => {
    const v = priced.map(sel).sort((a, b) => a - b);
    return {
      min: v[0],
      p50: v[Math.floor(v.length / 2)],
      max: v[v.length - 1],
      mean: v.reduce((a, b) => a + b, 0) / v.length,
    };
  };
  const rows = [
    ["entities", stat((m) => m.entities)],
    ["datoms (all)", stat((m) => m.all.datoms)],
    ["raw bytes (all)", stat((m) => m.all.bytes)],
    ["gzip bytes (all)", stat((m) => m.all.gzip)],
    ["raw bytes (current)", stat((m) => m.current.bytes)],
    ["gzip bytes (current)", stat((m) => m.current.gzip)],
    ["raw −photos (current)", stat((m) => m.current.bytesNoPhoto)],
    ["gzip −photos (current)", stat((m) => m.current.gzipNoPhoto)],
  ];
  say(`| figure | min | median | mean | max |`);
  say(`| --- | --- | --- | --- | --- |`);
  for (const [label, s] of rows) {
    say(
      `| ${label} | ${Math.round(s.min).toLocaleString()} | ${Math.round(s.p50).toLocaleString()} | ${Math.round(s.mean).toLocaleString()} | ${Math.round(s.max).toLocaleString()} |`
    );
  }
  say();

  say(`### The ten heaviest`);
  say();
  say(
    `| day | meal | items | cases | ents | datoms | raw | gzip | gzip −photos | gzip current −photos |`
  );
  say(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const m of priced.slice(0, 10)) {
    say(
      `| ${m.day} | ${m.meal_type} | ${m.events} | ${m.cases.join("+") || "—"} | ${m.entities} | ${m.all.datoms} | ${kb(m.all.bytes)} KiB | ${kb(m.all.gzip)} KiB | ${kb(m.all.gzipNoPhoto)} KiB | ${kb(m.current.gzipNoPhoto)} KiB |`
    );
  }
  say();

  say(`### One representative per case`);
  say();
  const wanted = [
    ["all fdc: basics", (m) => m.cases.length === 1 && m.cases[0] === "fdc"],
    ["a barcode twin", (m) => m.cases.includes("gtin")],
    [
      "a label-captured custom food with a photo",
      (m) => m.cases.includes("label") && m.cases.includes("photo"),
    ],
    [
      "a custom food with a photo",
      (m) => m.cases.includes("custom") && m.cases.includes("photo"),
    ],
    ["a Recipe Instantiation", (m) => m.cases.includes("recipe")],
  ];
  say(
    `| case | day | meal | ents | derived | minted | datoms | raw | gzip | raw −photos | gzip −photos |`
  );
  say(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const [label, pred] of wanted) {
    const hit = priced.find(pred);
    if (!hit) {
      say(`| ${label} | — | — | — | — | — | — | — | — | — | — |`);
      continue;
    }
    say(
      `| ${label} | ${hit.day} | ${hit.meal_type} | ${hit.entities} | ${hit.kinds.derived} | ${hit.kinds.minted} | ${hit.all.datoms} | ${kb(hit.all.bytes)} KiB | ${kb(hit.all.gzip)} KiB | ${kb(hit.all.bytesNoPhoto)} KiB | ${kb(hit.all.gzipNoPhoto)} KiB |`
    );
  }
  say();

  say(`### Derived vs minted, across every past meal`);
  say();
  const totals = priced.reduce(
    (a, m) => ({
      derived: a.derived + m.kinds.derived,
      minted: a.minted + m.kinds.minted,
    }),
    { derived: 0, minted: 0 }
  );
  say(
    `Derived (\`gtin:\`, \`fdc:\` — merge for free): ${totals.derived}  ·  minted uuids (\`food:custom_\`, \`recipe:\`, \`event:consume_\` — do not): ${totals.minted}`
  );
  say();
}

const report = out.join("\n");
console.log(report);

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        envelope,
        whole: {
          entities: wholeEntities,
          all: wholeAll,
          current: wholeCurrent,
        },
        attributeCost: attributeCost(ordered),
        meals: priced.map(({ entityList, ...m }) => m),
      },
      null,
      2
    )
  );
}
