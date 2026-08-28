/**
 * The ledger's way back in (ADR-0067): a file written by
 * {@link ./ledger-export} read a line at a time and merged into whatever this
 * device already holds.
 *
 * It **merges, and never wipes**. Every datom in the file is appended; nothing
 * already in the ledger is touched. Making the file the only truth is
 * `Wipe Database` followed by an import, which stays two deliberate steps.
 *
 * Refusal happens **before the first row is written**. The file is read twice:
 * once to check every line, once to write them. That is the only way to promise
 * "all or nothing" over a file too large to hold in memory, and the price is
 * reading hundreds of megabytes twice.
 *
 * This module is pure. Both seams it needs are injected — a factory that opens
 * the file's lines, called once per pass, and a writer that takes a batch of
 * rows to the worker — so the grammar, the refusals and the batching are
 * testable without a Worker, a picker or a disk.
 */

import { isLedgerInteger, type LedgerRow } from "./db.core";
import {
  LEDGER_EXPORT_ARTIFACT,
  LEDGER_EXPORT_SCHEMA_VERSION,
  type LedgerExportEnvelope,
} from "./ledger-export";

/**
 * The file-format versions this reader understands. It is a list rather than a
 * single number because a reader may legitimately understand more than one, and
 * the point of the check is to refuse a version it does not.
 */
export const IMPORT_SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [
  LEDGER_EXPORT_SCHEMA_VERSION,
];

/**
 * Why a file was refused, and where.
 *
 * `lineNumber` is 1-based and counts the envelope as line one, so it matches
 * what `sed -n 'Np'` shows. It is `null` when the complaint is about the file
 * as a whole rather than about one of its lines.
 */
export class LedgerImportRefusedError extends Error {
  readonly lineNumber: number | null;

  constructor(reason: string, lineNumber: number | null = null) {
    super(lineNumber === null ? reason : `Line ${lineNumber}: ${reason}`);
    this.name = "LedgerImportRefusedError";
    this.lineNumber = lineNumber;
  }
}

function parseJsonObject(
  line: string,
  lineNumber: number | null
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new LedgerImportRefusedError("not valid JSON.", lineNumber);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LedgerImportRefusedError("not a JSON object.", lineNumber);
  }
  return parsed as Record<string, unknown>;
}

/** One line of the file, and where in the file it sat. */
export interface ImportLine {
  text: string;
  /** 1-based, counting blank lines, so it matches `sed -n 'Np'`. */
  lineNumber: number;
}

/**
 * The file's meaningful lines, rejoined across whatever boundaries the stream
 * happened to break on. A chunk boundary falls wherever the disk and the
 * decoder put it, which is routinely mid-datom, so the tail of each chunk is
 * held back until its newline arrives.
 *
 * Blank lines are passed over rather than refused. The export never writes one,
 * but a trailing newline is what every text tool adds and it is not corruption.
 * They are still counted, so a refusal names the line a person would find.
 */
export async function* linesOf(
  chunks: AsyncIterable<string>
): AsyncGenerator<ImportLine> {
  let pending = "";
  let lineNumber = 0;
  for await (const chunk of chunks) {
    pending += chunk;
    let cut = pending.indexOf("\n");
    while (cut !== -1) {
      lineNumber += 1;
      const text = pending.slice(0, cut).trim();
      if (text.length > 0) yield { text, lineNumber };
      pending = pending.slice(cut + 1);
      cut = pending.indexOf("\n");
    }
  }
  const text = pending.trim();
  if (text.length > 0) yield { text, lineNumber: lineNumber + 1 };
}

/**
 * Line one, checked. This is the whole refusal gate for an unfamiliar file: two
 * fields at the front decide it, so a file of hundreds of megabytes costs one
 * line to reject.
 */
export function readImportEnvelope(line: string): LedgerExportEnvelope {
  const raw = parseJsonObject(line, 1);

  if (raw.artifact !== LEDGER_EXPORT_ARTIFACT) {
    throw new LedgerImportRefusedError(
      `this is not an Inventoria ledger export. Line one says "artifact" is ${JSON.stringify(raw.artifact)}, and an export says ${JSON.stringify(LEDGER_EXPORT_ARTIFACT)}.`
    );
  }

  const reads = `This app reads version ${IMPORT_SUPPORTED_SCHEMA_VERSIONS.join(" or ")}.`;
  const schema_version = raw.schema_version;
  // Two refusals rather than one. A file that names a version this reader does
  // not have is not necessarily a newer file, and saying so would be a guess in
  // the one place the format exists to stop the reader guessing.
  if (typeof schema_version !== "number") {
    throw new LedgerImportRefusedError(
      `line one does not say which version of the format this file is. ${reads}`
    );
  }
  if (!IMPORT_SUPPORTED_SCHEMA_VERSIONS.includes(schema_version)) {
    throw new LedgerImportRefusedError(
      `this file is version ${schema_version}. ${reads} Importing it would mean guessing at what the two versions differ on.`
    );
  }

  return {
    artifact: LEDGER_EXPORT_ARTIFACT,
    schema_version,
    exported_at: requireInteger(raw, "exported_at", 1),
    device_id: requireString(raw, "device_id", 1),
    row_count: requireInteger(raw, "row_count", 1),
  };
}

/**
 * One datom line, checked column by column.
 *
 * `value` stays the stored TEXT rather than being parsed into a JavaScript
 * value: the column round-trips byte for byte, which is what makes a photo the
 * same photo on the way back in (ADR-0064 §1). It is still checked for being
 * JSON, because every value the ledger holds was written by `JSON.stringify`
 * and a value that will not parse is a row every projection would choke on.
 */
export function readDatomLine(line: string, lineNumber: number): LedgerRow {
  const raw = parseJsonObject(line, lineNumber);
  const value = requireString(raw, "value", lineNumber);
  try {
    JSON.parse(value);
  } catch {
    throw new LedgerImportRefusedError(
      `"value" is not the JSON text the ledger stores.`,
      lineNumber
    );
  }
  return {
    entity: requireString(raw, "entity", lineNumber),
    attribute: requireString(raw, "attribute", lineNumber),
    value,
    time: requireInteger(raw, "time", lineNumber),
    hlc_ms: requireInteger(raw, "hlc_ms", lineNumber),
    hlc_ctr: requireInteger(raw, "hlc_ctr", lineNumber),
    device_id: requireString(raw, "device_id", lineNumber),
  };
}

function requireInteger(
  raw: Record<string, unknown>,
  field: string,
  lineNumber: number
): number {
  const value = raw[field];
  if (!isLedgerInteger(value)) {
    throw new LedgerImportRefusedError(
      `"${field}" is not a whole number of at least zero.`,
      lineNumber
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// The two seams
// ---------------------------------------------------------------------------

/**
 * Opens the file's text for one pass. Called once per pass, so whatever backs
 * it has to be re-readable: a `File` handle is, a consumed stream is not.
 */
export type ImportChunkSource = () => AsyncIterable<string>;

/**
 * Takes a batch of rows to the worker's append path and returns how many of
 * them were new. `final` marks the batch that finishes the import, which is
 * what lets the worker tell every projection to re-read once rather than once
 * per couple of megabytes.
 */
export type LedgerRowWriter = (
  rows: LedgerRow[],
  final: boolean
) => Promise<number>;

/**
 * Characters of datom line held before a batch is sent. It bounds the message
 * the main thread posts to the worker, the same job `EXPORT_PAGE_BUDGET_BYTES`
 * does in the other direction and for the same reason: one label photo
 * outweighs a thousand ordinary datoms.
 *
 * Characters, not bytes, because the string is what is measured and the figure
 * is a bound rather than an accounting. Base64 photo values are ASCII, so for
 * the lines that make a file large the two counts are the same number.
 */
export const IMPORT_BATCH_BUDGET_CHARS = 2 * 1024 * 1024;

/** Which of the two passes is running, for a screen that says so. */
export type LedgerImportPhase = "checking" | "importing";

export interface LedgerImportOptions {
  batchBudgetChars?: number;
  onProgress?: (phase: LedgerImportPhase, rowsSeen: number) => void;
}

export interface LedgerImportResult {
  envelope: LedgerExportEnvelope;
  /** Datom lines the file actually held, which the envelope only estimates. */
  rowsRead: number;
  rowsAdded: number;
  /**
   * Rows the ledger already held, key for key. Re-importing the same file
   * lands entirely here, because the primary key spans the whole HLC stamp and
   * an insert that ignores a conflict is the whole of the dedupe (ADR-0020).
   */
  rowsAlreadyPresent: number;
}

/**
 * Reads `open()` twice: once checking every line and writing nothing, once
 * writing the batches. A file that is refused leaves the ledger exactly as it
 * was, which is the guarantee that makes a restore safe to attempt.
 *
 * The promise is honest rather than absolute. It holds against the thing that
 * actually goes wrong, which is a file that was truncated or is from another
 * program; it cannot hold against a file edited on disk between the two passes,
 * or against the tab dying part way through the second. Both leave a prefix
 * written, and re-running the import completes it, because every row is an
 * append and the same row twice is the same row.
 */
export async function importLedger(
  open: ImportChunkSource,
  writeRows: LedgerRowWriter,
  options: LedgerImportOptions = {}
): Promise<LedgerImportResult> {
  const envelope = await checkImportFile(open, options.onProgress);
  const budget = options.batchBudgetChars ?? IMPORT_BATCH_BUDGET_CHARS;

  let batch: LedgerRow[] = [];
  let held = 0;
  let rowsRead = 0;
  let rowsAdded = 0;

  const flush = async (final: boolean) => {
    rowsAdded += await writeRows(batch, final);
    batch = [];
    held = 0;
  };

  // Said before the first line is read, so a screen watching the phase moves off
  // "checking" the moment the check is done rather than at the first flush.
  options.onProgress?.("importing", 0);

  let seenEnvelope = false;
  for await (const line of linesOf(open())) {
    // The envelope is whichever line comes first, not line one by number: a
    // file that gained a leading blank line is still the file it was.
    if (!seenEnvelope) {
      seenEnvelope = true;
      continue;
    }
    batch.push(readDatomLine(line.text, line.lineNumber));
    held += line.text.length;
    rowsRead += 1;
    // One row always goes, so a datom larger than the whole budget moves
    // rather than stalling the walk.
    if (held >= budget) {
      await flush(false);
      options.onProgress?.("importing", rowsRead);
    }
  }
  await flush(true);
  options.onProgress?.("importing", rowsRead);

  return {
    envelope,
    rowsRead,
    rowsAdded,
    rowsAlreadyPresent: rowsRead - rowsAdded,
  };
}

/**
 * Pass one: every line parsed and checked, nothing written. It exists to be
 * the whole of the refusal, so anything the writing pass could reject has to
 * be rejected here first.
 */
async function checkImportFile(
  open: ImportChunkSource,
  onProgress: LedgerImportOptions["onProgress"]
): Promise<LedgerExportEnvelope> {
  let envelope: LedgerExportEnvelope | null = null;
  let rowsSeen = 0;

  for await (const line of linesOf(open())) {
    if (!envelope) {
      envelope = readImportEnvelope(line.text);
      continue;
    }
    readDatomLine(line.text, line.lineNumber);
    rowsSeen += 1;
    if (rowsSeen % 1_000 === 0) onProgress?.("checking", rowsSeen);
  }

  if (!envelope) {
    throw new LedgerImportRefusedError(
      "this file is empty, so there is nothing in it to import."
    );
  }
  onProgress?.("checking", rowsSeen);
  return envelope;
}

function requireString(
  raw: Record<string, unknown>,
  field: string,
  lineNumber: number
): string {
  const value = raw[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new LedgerImportRefusedError(
      `"${field}" is missing or is not text.`,
      lineNumber
    );
  }
  return value;
}
