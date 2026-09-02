/**
 * The ledger's way out (ADR-0064): every datom written to a file the user
 * chooses, one line at a time.
 *
 * The artifact is **raw datoms, not projected state**. Every row, every column,
 * superseded facts included. A projection is the current answer; the ledger is
 * the history that produced it, and a backup of the answer cannot restore the
 * history. That is also why nothing here parses `value`: the column travels as
 * the stored TEXT, so what is written back is what was read.
 *
 * The format is **NDJSON** with a metadata envelope on line one. It streams
 * without a closing bracket, greps as plain text, and a truncated write costs
 * the last line rather than the whole file. The envelope carries
 * {@link LEDGER_EXPORT_SCHEMA_VERSION} so a reader can refuse a file it does not
 * understand after one line, before touching hundreds of megabytes of base64.
 *
 * Nothing outside `datoms` is in it. API credentials and the ADR-0053 search log
 * both live in `localStorage` by deliberate decision, and the search log's
 * absence is structural rather than filtered: it is not in the table, so there
 * is nothing here to exclude.
 *
 * This module is pure. Both seams it needs are injected — {@link LedgerPageReader}
 * for where rows come from, {@link ExportSink} for where lines go — so the
 * format and the walk are testable without a Worker, a picker or a disk.
 */

import {
  cursorOf,
  type LedgerCursor,
  type LedgerRow,
  type LedgerSummary,
} from "./db.core";
import { describeBytes } from "../storage/describe-bytes";

/** What line one of the file says the file is. */
export const LEDGER_EXPORT_ARTIFACT = "inventoria-ledger";

/**
 * The file format's version, not the database's.
 *
 * It moves when a reader written against the previous version would misread a
 * newer file: a renamed or dropped column, a changed meaning for one, a
 * different line grammar. Adding a field an old reader can ignore does not move
 * it. The ledger's own schema has already migrated once, when ADR-0020 replaced
 * the primary key, so a restore has to be able to tell what it is holding.
 */
export const LEDGER_EXPORT_SCHEMA_VERSION = 1;

/**
 * What line one of any NDJSON artifact this app writes says: which format it is
 * and which version of it. ADR-0064 §2 put both at the front so a reader can
 * refuse an unfamiliar file after one line, and ADR-0073 §4 gives the format a
 * sibling — a Meal payload shares this grammar and shares no merge rule, which
 * is exactly why the two must not share an `artifact`.
 */
export interface NdjsonEnvelope {
  artifact: string;
  schema_version: number;
}

/**
 * Which Facet's rows an export holds, when it holds one Facet's rather than the
 * whole ledger (ADR-0079 §6).
 *
 * Written into the envelope in snake_case because these fields are read back
 * off a file, and out of a file is where the ledger's own casing rule applies
 * (CODING_STANDARDS §1.3): `entity_prefixes` sits beside `device_id` and
 * `row_count` and is read by the same eye.
 */
export interface LedgerExportScope {
  facet_id: string;
  entity_prefixes: readonly string[];
}

/** Line one of an export: what this file is, and how much of it to expect. */
export interface LedgerExportEnvelope extends NdjsonEnvelope {
  artifact: typeof LEDGER_EXPORT_ARTIFACT;
  /** Unix ms at which the write began. */
  exported_at: number;
  /** The device whose ledger this is, from the `meta` table. */
  device_id: string;
  /**
   * Rows the ledger held when the write began. A count taken at the start
   * cannot promise the count at the end, so a reader treats it as what to
   * expect rather than as an integrity check.
   */
  row_count: number;
  /**
   * Present only on a Facet-scoped export, naming what it holds and by which
   * predicate.
   *
   * **The `artifact` is unchanged and the version does not move.** A scoped
   * export is a subset of the same rows in the same grammar, so the existing
   * import restores it without knowing this field exists — which is the whole
   * of what makes the export a safety control rather than a souvenir. Adding a
   * field an old reader can ignore is explicitly not a version-moving change;
   * see {@link LEDGER_EXPORT_SCHEMA_VERSION}.
   */
  scope?: LedgerExportScope;
}

export function buildExportEnvelope(
  summary: LedgerSummary,
  exported_at: number,
  scope?: LedgerExportScope
): LedgerExportEnvelope {
  return {
    artifact: LEDGER_EXPORT_ARTIFACT,
    schema_version: LEDGER_EXPORT_SCHEMA_VERSION,
    exported_at,
    device_id: summary.device_id,
    row_count: summary.row_count,
    ...(scope ? { scope } : {}),
  };
}

export function envelopeLine(envelope: NdjsonEnvelope): string {
  return `${JSON.stringify(envelope)}\n`;
}

/**
 * One datom as one line. The keys are written in the table's column order, and
 * `value` goes out as the stored TEXT rather than as re-serialised JSON, so the
 * column round-trips byte for byte. `JSON.stringify` escapes any newline inside
 * a value, which is what keeps one datom to one line.
 */
export function datomLine(row: LedgerRow): string {
  return `${JSON.stringify({
    entity: row.entity,
    attribute: row.attribute,
    value: row.value,
    time: row.time,
    hlc_ms: row.hlc_ms,
    hlc_ctr: row.hlc_ctr,
    device_id: row.device_id,
  })}\n`;
}

// ---------------------------------------------------------------------------
// The two seams
// ---------------------------------------------------------------------------

/**
 * Where rows come from: the worker's paged read, or a fake in a test. Returns
 * an empty array once the walk is finished.
 */
export type LedgerPageReader = (
  after: LedgerCursor | null,
  budgetBytes: number
) => Promise<LedgerRow[]>;

/**
 * Where lines go. Deliberately narrower than `WritableStream`: the buffered
 * fallback is not a stream and should not have to pretend to be one.
 */
export interface ExportSink {
  write(chunk: string): Promise<void>;
  /** Commits the file. Called once, and only after every line is written. */
  close(): Promise<void>;
  /** Gives up on the file, leaving nothing behind. */
  abort(reason: unknown): Promise<void>;
}

/**
 * Bytes of datom value fetched in one page. Small enough that the main thread
 * never holds more than a couple of label photos at a time, large enough that a
 * ledger of small facts does not cost a round trip per handful of rows.
 */
export const EXPORT_PAGE_BUDGET_BYTES = 2 * 1024 * 1024;

export interface LedgerExportOptions {
  summary: LedgerSummary;
  /** Unix ms stamped into the envelope. Passed in, never read off a clock. */
  exported_at: number;
  /**
   * The Facet this file holds, if it holds one. It is recorded in the envelope
   * and nothing more: **narrowing the walk is the caller's**, in the
   * {@link LedgerPageReader} it supplies, so there is exactly one place the
   * predicate can be got wrong rather than two that can disagree.
   */
  scope?: LedgerExportScope;
  pageBudgetBytes?: number;
  onProgress?: (rowsWritten: number) => void;
}

export interface LedgerExportResult {
  envelope: LedgerExportEnvelope;
  /**
   * Rows actually written. It differs from `envelope.row_count` only if the
   * ledger was appended to while the file was being written, which is worth
   * telling the user about rather than hiding.
   */
  rowsWritten: number;
}

/**
 * Walks the whole ledger into `sink`, envelope first.
 *
 * The walk never holds more than one page, so the file may be far larger than
 * memory. Any failure aborts the sink before rethrowing, so a half-written
 * export is never left looking like a whole one.
 */
export async function writeLedgerExport(
  readPage: LedgerPageReader,
  sink: ExportSink,
  options: LedgerExportOptions
): Promise<LedgerExportResult> {
  const envelope = buildExportEnvelope(
    options.summary,
    options.exported_at,
    options.scope
  );
  const budgetBytes = options.pageBudgetBytes ?? EXPORT_PAGE_BUDGET_BYTES;
  let rowsWritten = 0;

  try {
    await sink.write(envelopeLine(envelope));
    let after: LedgerCursor | null = null;
    for (;;) {
      const rows = await readPage(after, budgetBytes);
      if (rows.length === 0) break;
      await sink.write(rows.map(datomLine).join(""));
      rowsWritten += rows.length;
      after = cursorOf(rows[rows.length - 1]);
      options.onProgress?.(rowsWritten);
    }
  } catch (err) {
    await sink.abort(err);
    throw err;
  }

  await sink.close();
  return { envelope, rowsWritten };
}

// ---------------------------------------------------------------------------
// The in-memory fallback and its ceiling
// ---------------------------------------------------------------------------

/**
 * The most a buffered export may assemble in memory.
 *
 * Where the File System Access API is missing there is no streaming write, so
 * the whole file has to exist as JavaScript strings before it can become a
 * `Blob`, and the peak cost is several times the file's own size. 64 MiB is
 * comfortably survivable; a ledger of label photos is not, and a tab that dies
 * partway through an export is worse than one that says it cannot do it.
 */
export const EXPORT_FALLBACK_CEILING_BYTES = 64 * 1024 * 1024;

/**
 * The refusal, carrying the two numbers that explain it.
 *
 * `bytes` is the running total at the moment the sink tripped, so it names where
 * the ceiling was crossed rather than how large the finished file would have
 * been. The message says "roughly" and means it.
 */
export class ExportTooLargeError extends Error {
  readonly bytes: number;
  readonly ceilingBytes: number;

  constructor(bytes: number, ceilingBytes: number) {
    super(
      `This browser cannot write a file as it goes, so the export has to be assembled in memory first, ` +
        `and this one is too big for that: roughly ${describeBytes(bytes)} against a ${describeBytes(ceilingBytes)} ceiling. ` +
        `Nothing was written. Export from a Chromium browser, which can stream straight to disk.`
    );
    this.name = "ExportTooLargeError";
    this.bytes = bytes;
    this.ceilingBytes = ceilingBytes;
  }
}

const encoder = new TextEncoder();

/**
 * A sink that assembles the file in memory and hands the parts to `deliver` on
 * close, refusing the moment it passes `ceilingBytes`. The refusal happens
 * during the walk rather than at the end, so the memory it declined to spend is
 * memory it never spends.
 *
 * `deliver` is injected because building a `Blob` and clicking an anchor is the
 * browser's business, not this module's.
 */
export function bufferedSink(
  ceilingBytes: number,
  deliver: (parts: string[]) => void
): ExportSink {
  const parts: string[] = [];
  let bytes = 0;
  let abandoned = false;

  return {
    async write(chunk: string) {
      bytes += encoder.encode(chunk).length;
      if (bytes > ceilingBytes) {
        throw new ExportTooLargeError(bytes, ceilingBytes);
      }
      parts.push(chunk);
    },
    async close() {
      if (abandoned) return;
      deliver(parts);
    },
    async abort() {
      abandoned = true;
      parts.length = 0;
    },
  };
}
