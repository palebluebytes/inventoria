/**
 * What a received Meal payload has to survive before anybody sees it
 * (ADR-0073 §8 and §9).
 *
 * Two jobs, in the order the bytes meet them:
 *
 *   1. {@link decodeMealPayload} inflates the wire bytes, **counting decoded
 *      bytes as they arrive and abandoning the stream the moment the ceiling is
 *      crossed** (§9). A payload gzips about 9:1, so a bound on what arrives
 *      would let 1 MiB decode to roughly 9 MiB.
 *   2. {@link readMealPayload} judges the seven refusals over the text (§8).
 *
 * Both run **when the payload arrives, before anything is shown** — so a
 * hostile payload never reaches the screen, and the failure lands while the
 * sender is still there to be told. Accept re-checks nothing; only the skip
 * rule (§6) is evaluated then, against the ledger as it stands.
 *
 * The load-bearing refusal is reachability. Without it a "meal" can carry
 * `settings/food/targets`, a `habit:` or a `notes/op`, and the skip rule only
 * skips entities the recipient *already holds*, so anything unfamiliar would
 * land unseen. Everything else here is grammar; that one is the security.
 *
 * This module is pure and has no transport in it. What the payload *becomes*
 * when it lands is the accept path's.
 */

import { describeBytes } from "../storage/describe-bytes";
import type { LedgerRow } from "../db/db.core";
import {
  LedgerImportRefusedError,
  parseNdjsonObject,
  readDatomLine,
  type NdjsonLine,
} from "../db/ledger-import";
import {
  MEAL_PAYLOAD_ARTIFACT,
  MEAL_PAYLOAD_CEILING_BYTES,
  MEAL_PAYLOAD_SCHEMA_VERSION,
  MEAL_ROOT_PREFIX,
  MEAL_TWIN_PREFIXES,
  MEAL_WIRE_COMPRESSION,
  OMITTED_ATTRIBUTES,
  referencesOf,
  type MealPayloadEnvelope,
} from "./meal-payload";

/**
 * The payload versions this reader understands. A list rather than a number,
 * following ADR-0067 §4: a reader may legitimately understand more than one,
 * and the point of the check is to refuse a version it does not.
 */
export const MEAL_PAYLOAD_SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [
  MEAL_PAYLOAD_SCHEMA_VERSION,
];

/**
 * Why a payload was refused, in the technical wording ADR-0074 §6 puts behind a
 * "show why" disclosure. The screen says one line; this says which clause fired.
 *
 * `lineNumber` is 1-based and counts the envelope as line one, matching
 * {@link LedgerImportRefusedError}. It is `null` when the complaint is about the
 * payload as a whole rather than about one of its lines.
 *
 * It is deliberately **not** a subclass of that one and shares no base with it.
 * The two formats' grammar is shared, by the functions this reader borrows;
 * their refusals are not, because a caller that could catch one and get the
 * other is exactly the conflation ADR-0073 §4 exists to stop.
 */
export class MealPayloadRefusedError extends Error {
  readonly lineNumber: number | null;

  constructor(reason: string, lineNumber: number | null = null) {
    super(lineNumber === null ? reason : `Line ${lineNumber}: ${reason}`);
    this.name = "MealPayloadRefusedError";
    this.lineNumber = lineNumber;
  }
}

/**
 * The ceiling refusal, carrying the two numbers that explain it.
 *
 * `bytes` is the running total at the moment the count crossed, so it names
 * where the stream was abandoned rather than how large the payload would have
 * decoded to — which is the point, and why the message says "at least".
 */
export class MealPayloadTooLargeError extends MealPayloadRefusedError {
  readonly bytes: number;
  readonly ceilingBytes: number;

  constructor(bytes: number, ceilingBytes: number) {
    super(
      `this meal decodes to at least ${describeBytes(bytes)}, against a ${describeBytes(ceilingBytes)} ceiling. ` +
        `Nothing more of it was read.`
    );
    this.name = "MealPayloadTooLargeError";
    this.bytes = bytes;
    this.ceilingBytes = ceilingBytes;
  }
}

/**
 * Inflates the wire bytes, refusing the moment the decoded count passes
 * `ceilingBytes` (ADR-0073 §9).
 *
 * The count is on **decoded** bytes and it is incremental: the stream is read a
 * chunk at a time and cancelled mid-flight, so the memory a bomb asked for is
 * memory that is never spent. The relay's wire-byte backstop (ADR-0072 §11.3)
 * is a different bound with a different job — **this is the one that refuses a
 * meal**, and the two must not be conflated.
 *
 * `ceilingBytes` is a parameter so a test can prove the abort without
 * synthesising a megabyte, never so a caller can raise it.
 */
export async function decodeMealPayload(
  wireBytes: Uint8Array,
  ceilingBytes: number = MEAL_PAYLOAD_CEILING_BYTES
): Promise<string> {
  const inflated = new Blob([wireBytes as BlobPart])
    .stream()
    .pipeThrough(
      new DecompressionStream(
        MEAL_WIRE_COMPRESSION
      ) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
    );
  const chunks = inflated.getReader();
  // Streaming, because a multi-byte character routinely straddles two chunks.
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await chunks.read();
    } catch {
      // Not one of §8's seven: those judge a payload that opened, and this one
      // never became a payload at all.
      throw new MealPayloadRefusedError(
        "these bytes are not a meal payload — they do not decompress."
      );
    }
    if (chunk.done) break;
    bytes += chunk.value.length;
    if (bytes > ceilingBytes) {
      await chunks.cancel();
      throw new MealPayloadTooLargeError(bytes, ceilingBytes);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

/** A payload that survived all seven refusals, ready for the accept path. */
export interface ReceivedMealPayload {
  envelope: MealPayloadEnvelope;
  /** The declared closure roots, deduplicated. */
  roots: string[];
  /** Every datom line the payload carried, in the order it carried them. */
  rows: LedgerRow[];
}

/** One reference a row makes, kept with where it was made so a refusal can say. */
interface PayloadReference {
  entity: string;
  attribute: string;
  ref: string;
  lineNumber: number;
}

/**
 * The seven refusals, judged in one pass over the payload.
 *
 * **One pass, not two.** ADR-0067 §5 reads a file twice to promise
 * all-or-nothing over something too large to hold in memory; a payload is
 * single-digit KB, arrives over a wire *into* memory, and is bounded by
 * {@link decodeMealPayload}, so checking everything before writing anything is
 * free. Stated because the next reader will go looking for the second pass.
 *
 * **An unknown attribute is explicitly not a refusal.** Reachability already
 * contains the threat: an unknown attribute can only ride an entity the closure
 * reaches, so it is a fact about a food, harmless if unread. Refusing it would
 * need a hand-maintained mirror of `docs/eavt-vocabulary.md`. Do not "fix" this.
 */
export function readMealPayload(ndjson: string): ReceivedMealPayload {
  const lines = meaningfulLines(ndjson);
  if (lines.length === 0) {
    throw new MealPayloadRefusedError(
      "there is nothing here: the payload carries no lines at all."
    );
  }

  const envelope = readMealEnvelope(lines[0].text);
  const rows: LedgerRow[] = [];
  const carried = new Set<string>();
  const references: PayloadReference[] = [];

  for (const line of lines.slice(1)) {
    const row = asMealRefusal(() => readDatomLine(line.text, line.lineNumber));
    // (7) Refused rather than silently dropped: a recipient quietly given less
    // than was sent cannot tell.
    if (OMITTED_ATTRIBUTES.includes(row.attribute)) {
      throw new MealPayloadRefusedError(
        `"${row.attribute}" is not an attribute a meal carries.`,
        line.lineNumber
      );
    }
    rows.push(row);
    carried.add(row.entity);
    for (const ref of referencesOf(row)) {
      references.push({
        entity: row.entity,
        attribute: row.attribute,
        ref,
        lineNumber: line.lineNumber,
      });
    }
  }

  const roots = [...new Set(envelope.roots)];
  // (4) A declared root the lines do not carry is a truncated closure, and the
  // reachability check below would silently pass over the gap.
  for (const root of roots) {
    if (!carried.has(root)) {
      throw new MealPayloadRefusedError(
        `line one declares the root "${root}", and no line carries it.`
      );
    }
  }

  // (6) The payload must be self-contained: the sender cannot know what the
  // recipient holds, so completeness is the sender's obligation and an
  // unresolvable reference means a truncated closure — the meal would land with
  // a row that has no name.
  for (const reference of references) {
    if (!carried.has(reference.ref)) {
      throw new MealPayloadRefusedError(
        `"${reference.attribute}" on "${reference.entity}" points at "${reference.ref}", which did not come with it.`,
        reference.lineNumber
      );
    }
  }

  // (5) The clause doing the security work: the closure is recomputed from the
  // roots, and everything outside it is refused.
  //
  // Reachability alone is not the whole of it. The edges are the payload's own
  // assertions, so a hostile sender who points `event/target` at
  // `settings:global` makes it reachable and smuggles it in through the very
  // check meant to stop it. A meal's closure is two kinds of entity and no
  // others — its declared Consumption Events, and the food twins they point at
  // — so both halves are checked.
  const reached = reachableFrom(roots, references);
  const declared = new Set(roots);
  for (const entity of carried) {
    if (
      !declared.has(entity) &&
      !MEAL_TWIN_PREFIXES.some((prefix) => entity.startsWith(prefix))
    ) {
      throw new MealPayloadRefusedError(
        `"${entity}" is not a food, and a meal carries its Consumption Events and the foods they point at.`
      );
    }
    if (!reached.has(entity)) {
      throw new MealPayloadRefusedError(
        `"${entity}" is reachable from no declared root, so it is not part of this meal.`
      );
    }
  }

  return { envelope, roots, rows };
}

/**
 * Line one: what this is, what version of it, and what its closure was walked
 * from. This is the whole gate for an unfamiliar payload — one line decides it.
 */
function readMealEnvelope(line: string): MealPayloadEnvelope {
  const raw = asMealRefusal(() => parseNdjsonObject(line, 1));

  // (1) A separate message from (2), and neither claims the payload is newer:
  // saying so would be a guess in the one place the format exists to stop the
  // reader guessing.
  if (raw.artifact !== MEAL_PAYLOAD_ARTIFACT) {
    throw new MealPayloadRefusedError(
      `this is not an Inventoria meal. Line one says "artifact" is ${JSON.stringify(raw.artifact)}, and a meal says ${JSON.stringify(MEAL_PAYLOAD_ARTIFACT)}.`
    );
  }

  // (2)
  const reads = `This app reads version ${MEAL_PAYLOAD_SUPPORTED_SCHEMA_VERSIONS.join(" or ")}.`;
  const schema_version = raw.schema_version;
  if (typeof schema_version !== "number") {
    throw new MealPayloadRefusedError(
      `line one does not say which version of the format this meal is. ${reads}`
    );
  }
  if (!MEAL_PAYLOAD_SUPPORTED_SCHEMA_VERSIONS.includes(schema_version)) {
    throw new MealPayloadRefusedError(
      `this meal is version ${schema_version}. ${reads} Reading it would mean guessing at what the two versions differ on.`
    );
  }

  return {
    artifact: MEAL_PAYLOAD_ARTIFACT,
    schema_version,
    roots: readRoots(raw.roots),
  };
}

/**
 * (4) The declared roots, checked for being Consumption Event ids.
 *
 * The prefix check belongs to this refusal rather than being an eighth one:
 * reachability is computed **from** the roots, so a payload free to declare any
 * entity a root could declare `settings:global` and pass a closure check that
 * then means nothing. It is what makes refusal (5) worth having.
 */
function readRoots(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new MealPayloadRefusedError(
      "line one declares no closure roots, so this is a bag of datoms rather than a meal."
    );
  }
  const roots: string[] = [];
  for (const root of raw) {
    if (typeof root !== "string" || !root.startsWith(MEAL_ROOT_PREFIX)) {
      throw new MealPayloadRefusedError(
        `line one declares ${JSON.stringify(root)} as a closure root, and a meal's roots are Consumption Events.`
      );
    }
    roots.push(root);
  }
  return roots;
}

/**
 * (3) The ledger reader's own grammar, run under this format's refusal.
 *
 * The checks are the same checks by the same functions, so the two NDJSON
 * formats cannot drift apart on what a well-formed row is; only the refusal is
 * this format's, which is the whole of what this adapter does.
 */
function asMealRefusal<T>(borrowed: () => T): T {
  try {
    return borrowed();
  } catch (err) {
    if (err instanceof LedgerImportRefusedError) {
      throw new MealPayloadRefusedError(err.reason, err.lineNumber);
    }
    throw err;
  }
}

/** The entities the declared roots actually reach, following every reference. */
function reachableFrom(
  roots: string[],
  references: PayloadReference[]
): Set<string> {
  const outward = new Map<string, string[]>();
  for (const { entity, ref } of references) {
    const held = outward.get(entity);
    if (held) held.push(ref);
    else outward.set(entity, [ref]);
  }

  const reached = new Set(roots);
  let frontier = roots;
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const entity of frontier) {
      for (const ref of outward.get(entity) ?? []) {
        if (reached.has(ref)) continue;
        reached.add(ref);
        next.push(ref);
      }
    }
    frontier = next;
  }
  return reached;
}

/**
 * The payload's lines, blank ones passed over but still counted so a refusal
 * names the line a person would find.
 *
 * It splits rather than reusing the import's `linesOf`: that one rejoins chunks
 * across boundaries a disk put there, and a payload is one string that arrived
 * whole.
 */
function meaningfulLines(ndjson: string): NdjsonLine[] {
  return ndjson
    .split("\n")
    .map((text, index) => ({ text: text.trim(), lineNumber: index + 1 }))
    .filter((line) => line.text.length > 0);
}
