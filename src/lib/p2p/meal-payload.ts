/**
 * One Past meal, narrowed for the wire (ADR-0073).
 *
 * A **Meal payload** is the reference closure of a meal's Consumption Events
 * and the Digital Twins they point at, in the Ledger export's NDJSON grammar
 * (ADR-0064 §2) but under its own `artifact`, its own `schema_version`, and an
 * envelope declaring which `event:consume_` ids the closure was walked from.
 * The rows are the ledger's own rows, byte for byte — nothing here parses and
 * re-serialises a `value`, so ADR-0064 §1 holds and the payload is a subset of
 * lines rather than a projection.
 *
 * Three narrowings, and they are the whole of what this module decides:
 *
 *   1. **Winning datoms only** (§1). One row per `(entity, attribute)`, the one
 *      the logical clock says is current. A sent meal is not a backup: the
 *      recipient is given a food as it stands, not every correction the sender
 *      ever made to it.
 *   2. **Exactly three attributes never cross** (§2), and {@link OMITTED_ATTRIBUTES}
 *      is the exhaustive list. Every other attribute crosses verbatim,
 *      `food/label_capture` and `food/manual_entry` included — the omission list
 *      being short and enumerable was judged worth more than the principle being
 *      pure, so this list is not a rule to generalise from.
 *   3. **The closure is walked from the declared roots** and nothing else is in
 *      it. The `recipe:` entity crosses **whole** (§5): `Instantiation.based_on`
 *      equals `event/target` and the logged row's display name resolves through
 *      it, so omitting the recipe would land a nameless row.
 *
 * This module is pure. Its one seam — {@link EntityRowReader} — is injected, so
 * the closure walk and the narrowing are testable without a Worker or OPFS.
 * There is no transport here and no re-mint: what a payload *becomes* when it
 * lands is the receive path's, and what a reader refuses is #232's.
 */

import { compareHlc } from "../db/hlc";
import { parseDatomValue } from "../db/datom-fold";
import type { LedgerRow } from "../db/db.core";
import {
  datomLine,
  envelopeLine,
  type NdjsonEnvelope,
} from "../db/ledger-export";

/**
 * What line one says this is (ADR-0073 §4) — never `inventoria-ledger`. If the
 * two shared a name, Settings → Import Ledger would swallow a meal and bypass
 * every receive rule, so two formats whose merge rules differ do not share one.
 */
export const MEAL_PAYLOAD_ARTIFACT = "inventoria-meal";

/**
 * The meal payload format's version, moving independently of the export
 * format's. It moves when a reader written against the previous version would
 * misread a newer payload: a changed line grammar, a changed envelope field, a
 * changed narrowing. Adding a field an old reader can ignore does not move it.
 */
export const MEAL_PAYLOAD_SCHEMA_VERSION = 1;

/**
 * The bound on a decoded payload (ADR-0073 §9), which is **8.9x** a large
 * complex meal rather than a tight fit, because "the ceiling exists to bound a
 * hostile payload and must never be the reason an honest meal cannot be sent."
 *
 * It is not checked here. The bound that refuses a meal is the recipient's, on
 * bytes counted as they decode, and the relay's wire-byte backstop is a
 * different bound again — §9 is explicit that the two must not be conflated. It
 * lives beside the format so the one test that guards it has something to guard
 * against.
 */
export const MEAL_PAYLOAD_CEILING_BYTES = 1024 * 1024;

/**
 * The three attributes that never cross to another person (ADR-0073 §2).
 *
 * `twin/raw_provenance` is 39.8% of a measured ledger and the recipient can
 * rebuild the `fdc:` half of it from the bundle it already holds; the two photo
 * attributes are 55.6%, and a label photo is a record of the sender's capture
 * act rather than a property of the food. **The list is exhaustive and short on
 * purpose.** Everything else crosses.
 */
export const OMITTED_ATTRIBUTES: readonly string[] = [
  "twin/raw_provenance",
  "food/label_photos",
  "food/photo_base64",
];

/**
 * What a closure root is: a Consumption Event id, carrying ADR-0014's prefix.
 *
 * It sits with the format rather than with the reader because it is part of
 * what the envelope's `roots` *means*. A reader that took the roots on trust
 * would let a payload declare `settings:global` a root and then pass a closure
 * check computed from it, which is the whole of ADR-0073 §8.5's security.
 */
export const MEAL_ROOT_PREFIX = "event:consume_";

/**
 * What the closure may contain besides its roots: the food Digital Twins a
 * meal's events point at (ADR-0073 §5, which enumerates exactly these — the
 * derived `fdc:` and `gtin:`, and the minted `food:custom_` and `recipe:` that
 * cross verbatim). The media and item twins are not food and no meal reaches
 * them.
 *
 * This is **not** the hand-maintained allow-list ADR-0073 §8 refuses. That one
 * is about attributes, which grow open-endedly with every release; entity
 * prefixes are ADR-0014's small fixed registry, and the reachability refusal
 * cannot do its work without knowing what a closure is allowed to reach. It
 * fails closed: a new kind of food twin has to be added here before a meal
 * carrying one will cross.
 */
export const MEAL_TWIN_PREFIXES: readonly string[] = [
  "fdc:",
  "gtin:",
  "food:custom_",
  "recipe:",
];

/**
 * The attribute namespaces a meal's facts live in.
 *
 * This is **not** the per-attribute allow-list ADR-0073 §8 refuses. That one
 * mirrors `docs/eavt-vocabulary.md` and grows every release; this is the
 * namespace above it, a closed set of ten that grows only when a whole tracked
 * domain is added — which `docs/how-to-add-a-tracked-domain.md` already gates.
 * §8's clause survives where it was actually arguing: an unknown attribute
 * *inside* one of these still crosses, unread and unrefused.
 *
 * It exists because §8's justification for that clause is false as written. "An
 * unknown attribute can only ride an entity the closure reaches, so it is a
 * fact about a food, harmless if unread" assumes every projection scopes its
 * read by entity. Two do not: the Media and Acquisition projections scope by
 * attribute alone (`src/lib/db/projections.ts`), so `twin/name` riding a
 * perfectly legitimate `fdc:` twin lands in a library of physical items the
 * recipient never acquired.
 */
export const MEAL_ATTRIBUTE_NAMESPACES: readonly string[] = [
  "event/",
  "food/",
  "nutrition/",
  "recipe/",
];

/**
 * How the wire compresses a payload. Raw DEFLATE rather than gzip, because
 * gzip's header and trailer are 18 bytes bought for nothing here (#194 §4.3).
 *
 * Like the ceiling above, it is not applied here: compressing is the
 * transport's and undoing it is the reader's. It sits with the format because
 * it is what the two sides have to agree on, and agreeing is easier from one
 * declaration than from two.
 */
export const MEAL_WIRE_COMPRESSION = "deflate-raw";

/** Line one of a meal payload: what it is, and what its closure was walked from. */
export interface MealPayloadEnvelope extends NdjsonEnvelope {
  artifact: typeof MEAL_PAYLOAD_ARTIFACT;
  /**
   * The `event:consume_` ids that constitute the meal. Without them a reader
   * cannot tell a closure from an arbitrary bag of datoms, and the
   * reachability refusal has nothing to recompute against.
   *
   * There is no `device_id` and no row count: sender identity exists nowhere,
   * and a reader counts bytes rather than believing a declaration.
   */
  roots: string[];
}

export function mealPayloadEnvelope(roots: string[]): MealPayloadEnvelope {
  return {
    artifact: MEAL_PAYLOAD_ARTIFACT,
    schema_version: MEAL_PAYLOAD_SCHEMA_VERSION,
    roots,
  };
}

/**
 * Where the closure's rows come from: every datom the ledger holds for these
 * entities, in any order. SQLite stays in the Worker, so the walk asks for one
 * generation of entities at a time rather than pulling the table across.
 */
export type EntityRowReader = (entities: string[]) => Promise<LedgerRow[]>;

/**
 * The winning row per `(entity, attribute)`, in first-appearance order.
 *
 * "Winning" is decided against the **logical clock** (ADR-0020), never against
 * `time`: a fact corrected on a device whose wall clock runs behind still wins
 * if its stamp is greater, and two facts written in the same millisecond are
 * separated by the counter. A `LedgerRow` is an `HlcKey`, so `compareHlc` reads
 * the stamp off the row itself.
 */
export function winningRows(rows: LedgerRow[]): LedgerRow[] {
  const winners = new Map<string, LedgerRow>();
  for (const row of rows) {
    // NUL joins the pair because it is the one byte neither half can hold, so
    // two different pairs can never render as one key.
    const key = `${row.entity}\u0000${row.attribute}`;
    const held = winners.get(key);
    if (!held || compareHlc(row, held) > 0) winners.set(key, row);
  }
  return [...winners.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `ref` of every well-formed row in an ingredient list, in order. */
function refsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) =>
    isRecord(row) && typeof row.ref === "string" ? [row.ref] : []
  );
}

/**
 * The entities one datom points at.
 *
 * These four references are the whole of what a meal's closure is walked
 * through, and the same four are what a reader checks resolve inside a payload.
 * `value` arrives as the ledger's stored TEXT, which is the one place a shape
 * can genuinely be malformed, so it is guarded here rather than trusted and
 * caught later: a blob of the wrong shape yields no reference instead of
 * throwing mid-walk.
 */
export function referencesOf(row: LedgerRow): string[] {
  const value = parseDatomValue(row.attribute, row.value);
  switch (row.attribute) {
    case "event/target":
      return typeof value === "string" ? [value] : [];
    case "event/instantiation":
      if (!isRecord(value)) return [];
      return [
        ...(typeof value.based_on === "string" ? [value.based_on] : []),
        ...refsIn(value.ingredients),
      ];
    case "recipe/ingredients":
      return refsIn(value);
    default:
      return [];
  }
}

/**
 * Builds one Past meal's narrowed closure as NDJSON.
 *
 * The walk goes a generation at a time: the roots are read, their winning rows
 * yield the entities they reference, and those are read next, until nothing new
 * is reached. Each entity is asked for once, so a food eaten twice in a meal
 * costs one read and crosses once.
 */
export async function buildMealPayload(
  roots: string[],
  read: EntityRowReader
): Promise<string> {
  const declared = [...new Set(roots)];
  // Rows per entity rather than one flat list, so an entity's facts sit together
  // in a file somebody may well read with `grep`.
  const closureRows = new Map<string, LedgerRow[]>();
  const reached = new Set(declared);
  let frontier = declared;

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const row of winningRows(await read(frontier))) {
      const held = closureRows.get(row.entity);
      if (held) held.push(row);
      else closureRows.set(row.entity, [row]);
      for (const ref of referencesOf(row)) {
        if (reached.has(ref)) continue;
        reached.add(ref);
        next.push(ref);
      }
    }
    frontier = next;
  }

  const lines = [envelopeLine(mealPayloadEnvelope(declared))];
  for (const rows of closureRows.values()) {
    for (const row of rows) {
      if (!OMITTED_ATTRIBUTES.includes(row.attribute)) {
        lines.push(datomLine(row));
      }
    }
  }
  return lines.join("");
}
