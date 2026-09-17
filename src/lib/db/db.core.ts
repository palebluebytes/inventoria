/**
 * Pure SQLite ledger operations shared by the DB worker and unit tests.
 *
 * The schema and the append routine live here rather than inline in
 * db.worker.ts so the append-only invariant has a single home and can be tested
 * directly against sqlite-wasm, without standing up the Worker/OPFS layer.
 *
 * Per ADR-0020, a datom's order and identity is a Hybrid Logical Clock
 * `(hlc_ms, hlc_ctr, device_id)`, not the bare wall-clock `time`. `time` is
 * kept as the domain timestamp (for example, the millisecond a user confirmed
 * an event); ordering and the primary key are the HLC's job.
 */

import {
  CARRIED_DELETION_ATTRIBUTE,
  carriedDeletionRow,
  readCarriedDeletion,
  siftArrivingRows,
  SWEPT_NOTHING,
  type CarriedDeletion,
  type CarriedDeletionSweep,
} from "./carried-deletion";
import { describeValue } from "./describe-value";
import { entityPrefixesOfDomains } from "../facets/registry";
import { compareHlcMark, type Hlc, type HlcKey, type HlcMark } from "./hlc";
import {
  foldVersionVector,
  vectorAboveMatch,
  versionVectorQuery,
  type VectorMark,
  type VersionVector,
} from "./version-vector";

export interface Datom {
  entity: string;
  attribute: string;
  value: unknown;
  time: number;
}

/** A datom as read back from the ledger: the write shape plus its HLC key. */
export interface StoredDatom extends Datom, HlcKey {}

/**
 * The primary key of one ledger row, and so the position a paged read resumes
 * after. It is the whole key rather than the HLC alone: the ADR-0020 migration
 * stamps every legacy row `hlc_ms = time, hlc_ctr = 0`, so a migrated ledger
 * holds rows whose HLC collides and only `(entity, attribute, …)` separates.
 */
export interface LedgerCursor extends HlcKey {
  entity: string;
  attribute: string;
}

/**
 * One row of `datoms` exactly as the table holds it. `value` is the stored
 * TEXT — the JSON `appendDatoms` wrote — and is deliberately left unparsed, so
 * a reader that writes it back out reproduces the column byte for byte.
 */
export interface LedgerRow extends LedgerCursor {
  value: string;
  time: number;
}

/** What the ledger says about itself: the two facts an export header needs. */
export interface LedgerSummary {
  row_count: number;
  device_id: string;
}

/** Options form of the sqlite-wasm `exec`, used for row-returning queries. */
export interface LedgerExecOptions {
  sql: string;
  bind?: unknown[];
  rowMode?: string;
  callback?: (row: any) => void;
}

/** Minimal structural view of the sqlite-wasm oo1 DB handle we depend on. */
export interface LedgerDb {
  exec(sql: string): unknown;
  exec(options: LedgerExecOptions): unknown;
  prepare(sql: string): LedgerStatement;
}

export interface LedgerStatement {
  bind(values: unknown[]): unknown;
  step(): unknown;
  reset(): unknown;
  finalize(): unknown;
}

const CREATE_DATOMS_TABLE = `
  CREATE TABLE IF NOT EXISTS datoms (
    entity TEXT NOT NULL,
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    time INTEGER NOT NULL,
    hlc_ms INTEGER NOT NULL,
    hlc_ctr INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (entity, attribute, hlc_ms, hlc_ctr, device_id)
  ) WITHOUT ROWID;
`;
// Ordered reads scope by entity/attribute then fold in HLC order, so the index
// carries the HLC key after the scoping columns.
const CREATE_EAV_INDEX = `CREATE INDEX IF NOT EXISTS idx_eav ON datoms (entity, attribute, hlc_ms, hlc_ctr, device_id);`;
const CREATE_AVE_INDEX = `CREATE INDEX IF NOT EXISTS idx_ave ON datoms (attribute, value, entity);`;
const CREATE_META_TABLE = `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;`;

/** Runs a SELECT and collects its rows as objects. */
export function execRows<T = Record<string, unknown>>(
  db: LedgerDb,
  sql: string,
  bind: unknown[] = []
): T[] {
  const rows: T[] = [];
  db.exec({
    sql,
    bind,
    rowMode: "object",
    callback: (row: any) => rows.push(row),
  });
  return rows;
}

function execWrite(db: LedgerDb, sql: string, bind: unknown[]): void {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(bind);
    stmt.step();
    stmt.reset();
  } finally {
    stmt.finalize();
  }
}

/** Creates the datoms table (HLC schema) and its indexes if they do not exist. */
export function createLedgerSchema(db: LedgerDb): void {
  db.exec(CREATE_DATOMS_TABLE);
  db.exec(CREATE_EAV_INDEX);
  db.exec(CREATE_AVE_INDEX);
}

/** Drops and recreates the datoms table — backs the `clear` operation. */
export function resetLedgerSchema(db: LedgerDb): void {
  db.exec("DROP TABLE IF EXISTS datoms;");
  createLedgerSchema(db);
}

/**
 * Rewrites the database file so the pages a sanctioned deletion freed are
 * returned to the browser instead of sitting on the freelist (ADR-0079 §4,
 * [#290](https://github.com/palebluebytes/inventoria/issues/290)).
 *
 * **This is not a third destructive operation** and `CODING_STANDARDS.md` §1.1
 * says so explicitly. `VACUUM` reads every surviving row and writes it back; it
 * takes nothing a deletion has not already taken, and there is no argument of
 * it that could lose a datom.
 *
 * It is deliberately its own function rather than a tail on `resetLedgerSchema`,
 * because a Facet-scoped wipe needs the same step after a different delete
 * ([#311](https://github.com/palebluebytes/inventoria/issues/311)) and one
 * shared operation is what stops the two wipes drifting apart.
 *
 * `VACUUM` cannot run inside a transaction, so "both or neither" is not
 * expressible: the caller commits its delete first and attempts this after. A
 * failure here throws, and what makes the step best-effort is that the caller
 * declines to care — the rows are gone either way.
 */
export function vacuumLedger(db: LedgerDb): void {
  db.exec("VACUUM;");
}

/** True when a datoms table exists but predates the ADR-0020 HLC columns. */
function needsHlcMigration(db: LedgerDb): boolean {
  const cols = execRows<{ name: string }>(db, "PRAGMA table_info(datoms);");
  if (cols.length === 0) return false; // no table yet: a fresh create, not a migration
  return !cols.some((c) => c.name === "hlc_ms");
}

/**
 * One-time backfill from the pre-ADR-0020 `(entity, attribute, time)` schema to
 * the HLC schema, mapping each legacy datom to `hlc_ms = time, hlc_ctr = 0,
 * device_id = <this device>`. Legacy rows were unique on `(entity, attribute,
 * time)`, so they stay unique under the HLC primary key. State is re-derived
 * from the log, so this rewrites keys, not the meaning of past facts.
 *
 * The new table and its indexes come from the canonical `createLedgerSchema`
 * DDL, so the migrated shape can never drift from a fresh create. Ordering
 * matters: the legacy table's `idx_eav`/`idx_ave` occupy those global index
 * names until `datoms_legacy` is dropped, so the indexes are (re)created only
 * after the drop, once `createLedgerSchema` runs post-commit.
 */
function migrateToHlcSchema(db: LedgerDb, device_id: string): void {
  db.exec("BEGIN TRANSACTION;");
  try {
    db.exec("DROP TABLE IF EXISTS datoms_legacy;");
    db.exec("ALTER TABLE datoms RENAME TO datoms_legacy;");
    db.exec(CREATE_DATOMS_TABLE);
    execWrite(
      db,
      `INSERT INTO datoms (entity, attribute, value, time, hlc_ms, hlc_ctr, device_id)
       SELECT entity, attribute, value, time, time, 0, ? FROM datoms_legacy;`,
      [device_id]
    );
    db.exec("DROP TABLE datoms_legacy;");
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
  createLedgerSchema(db);
}

/**
 * Ensures the ledger is present and on the HLC schema, migrating a legacy
 * database in place if needed. Used by the worker on init; the pure unit tests
 * call `createLedgerSchema` directly against a fresh database. The `meta` table
 * is owned by `getOrCreateDeviceId`, not created here.
 */
export function ensureLedgerSchema(db: LedgerDb, device_id: string): void {
  if (needsHlcMigration(db)) {
    migrateToHlcSchema(db, device_id);
  } else {
    createLedgerSchema(db);
  }
}

/** Reads (or lazily creates) the stable per-device identifier from `meta`. */
export function getOrCreateDeviceId(
  db: LedgerDb,
  generate: () => string = () => crypto.randomUUID()
): string {
  db.exec(CREATE_META_TABLE);
  const rows = execRows<{ value: string }>(
    db,
    "SELECT value FROM meta WHERE key = 'device_id';"
  );
  if (rows.length > 0) return rows[0].value;
  const id = generate();
  execWrite(db, "INSERT INTO meta (key, value) VALUES ('device_id', ?);", [id]);
  return id;
}

/**
 * The ledger's current HLC high-water mark, used to seed the clock on init.
 * `device_id` is intentionally omitted from the sort: seeding only needs the
 * greatest `(hlc_ms, hlc_ctr)` seen, not the total order's device tiebreak.
 * HLC values stay well within `Number.MAX_SAFE_INTEGER`, so sqlite-wasm returns
 * them as plain numbers — the same values `compareHlc` and the folds consume raw.
 */
export function readHlcHighWater(db: LedgerDb): HlcMark {
  const rows = execRows<HlcMark>(
    db,
    "SELECT hlc_ms, hlc_ctr FROM datoms ORDER BY hlc_ms DESC, hlc_ctr DESC LIMIT 1;"
  );
  if (rows.length === 0) return { hlc_ms: 0, hlc_ctr: 0 };
  return { hlc_ms: rows[0].hlc_ms, hlc_ctr: rows[0].hlc_ctr };
}

// ---------------------------------------------------------------------------
// Paged reads
// ---------------------------------------------------------------------------

const LEDGER_COLUMNS =
  "entity, attribute, value, time, hlc_ms, hlc_ctr, device_id";
// The primary key, in its declared order, which for a WITHOUT ROWID table is
// also the physical order — so a keyset walk is a straight scan, not a sort.
const LEDGER_KEY = "entity, attribute, hlc_ms, hlc_ctr, device_id";
// The same five columns, led by the stamp. There is no index for it — one added
// here would be paid on every append to speed a walk that runs once per open —
// so a stamp-ordered page is a scan and a top-`LIMIT` sort over the rows the
// narrowing already let through, which in steady state is a handful.
const LEDGER_STAMP_KEY = "hlc_ms, hlc_ctr, device_id, entity, attribute";

/**
 * Which order a paged walk runs in, and it is a **correctness** choice rather
 * than a preference.
 *
 * `key` is the primary key, which for a `WITHOUT ROWID` table is the physical
 * order, so the walk is a straight scan. It is what an export wants and what a
 * walk that runs to the end wants, because a walk that finishes has no order.
 *
 * `stamp` is what a walk that may be **cut short** needs (ADR-0096 §1: a
 * depositor over the ceiling deposits its _oldest_ 16 MiB). A prefix in key
 * order is not downward-closed in stamp order — `event:aaa` stamped 900 walks
 * ahead of `event:bbb` stamped 100 — so a version vector summarising that
 * prefix claims a watermark the peer has not really reached, and every row
 * below it is withheld **permanently**. A prefix in stamp order is exactly the
 * set a vector can describe.
 */
export type LedgerPageOrder = "key" | "stamp";

/**
 * How each order names its cursor, so the `ORDER BY` and the keyset comparison
 * can never disagree about what "after" means.
 */
const WALK_ORDERS: Record<
  LedgerPageOrder,
  { columns: string; cursor: (after: LedgerCursor) => unknown[] }
> = {
  key: {
    columns: LEDGER_KEY,
    cursor: (after) => [
      after.entity,
      after.attribute,
      after.hlc_ms,
      after.hlc_ctr,
      after.device_id,
    ],
  },
  stamp: {
    columns: LEDGER_STAMP_KEY,
    cursor: (after) => [
      after.hlc_ms,
      after.hlc_ctr,
      after.device_id,
      after.entity,
      after.attribute,
    ],
  },
};

/** Every row the ledger holds, superseded facts included. */
export function countDatoms(db: LedgerDb): number {
  const rows = execRows<{ row_count: number }>(
    db,
    "SELECT count(*) AS row_count FROM datoms;"
  );
  return rows[0].row_count;
}

/**
 * What the ledger says about itself, for the export envelope to carry.
 *
 * `entityPrefixes` narrows the count to the rows a Facet owns, which is what a
 * Facet-scoped export's envelope has to say (ADR-0079 §6). Omitted, it is the
 * whole table — the count the jar-wide export has always carried.
 */
export function readLedgerSummary(
  db: LedgerDb,
  device_id: string,
  entityPrefixes?: readonly string[]
): LedgerSummary {
  return {
    row_count: entityPrefixes
      ? countDatomsByEntityPrefix(db, entityPrefixes)
      : countDatoms(db),
    device_id,
  };
}

/**
 * What this ledger holds, per originating device and Tracked Domain
 * (ADR-0075 §6, re-keyed by ADR-0105 §5).
 *
 * The whole of the sync watermark, and it is a **read** rather than a record:
 * nothing is stored, so nothing can fall out of step with the table it
 * describes. `version-vector.ts` carries the query and the argument for its
 * shape; this is the seam that runs it where SQLite lives.
 */
export function readLedgerVersionVector(db: LedgerDb): VersionVector {
  const { sql, bind } = versionVectorQuery();
  return foldVersionVector(execRows<VectorMark>(db, sql, bind));
}

/** The position a paged read resumes from, taken off the row it stopped at. */
export function cursorOf(row: LedgerRow): LedgerCursor {
  return {
    entity: row.entity,
    attribute: row.attribute,
    hlc_ms: row.hlc_ms,
    hlc_ctr: row.hlc_ctr,
    device_id: row.device_id,
  };
}

/**
 * The most rows one page will look at, whatever the byte budget allows. It
 * bounds the size probe below, which is the only part of a page read that
 * touches more rows than it returns.
 */
const LEDGER_PAGE_MAX_ROWS = 256;

/**
 * How a paged walk runs: which rows it is allowed to see, and in what order.
 *
 * Both narrowings are optional and both apply together; absent, the walk is the
 * whole ledger. The order defaults to the primary key's, which is every
 * caller's but the one that may stop part way (see {@link LedgerPageOrder}).
 */
export interface LedgerPageNarrowing {
  /** One Facet's rows, for a Facet-scoped export (ADR-0079 §6). */
  entityPrefixes?: readonly string[];
  /**
   * What one lane carries, by Tracked Domain id (ADR-0105 §1 and §6).
   *
   * **It and `entityPrefixes` are never both given.** They are two narrowings
   * of one concern for two callers — an export names a Facet's prefixes, a sync
   * names a lane's domains — and a read passing both would simply `AND` them,
   * which is a question nobody asks.
   *
   * It is the **Lane scope** rather than a prefix list, because two rules
   * answer to it and only one of them is expressible in prefixes:
   * {@link laneScopeMatch} derives the prefixes for the content rows and reads
   * the same list again for a Carried deletion, whose entity says nothing about
   * what it deletes. Handing prefixes in would leave the second rule to the
   * caller, which is the hand-written second list ADR-0079 §3 forbids.
   */
  laneScope?: readonly string[];
  /** Only what a holder of this vector lacks, for a sync (ADR-0075 §6). */
  above?: VersionVector;
  /** Which order the walk runs in. Defaults to `key`. */
  order?: LedgerPageOrder;
}

/**
 * The next rows after `after`, in primary-key order, stopping once their values
 * exceed `budgetBytes`. An empty result means the walk is finished.
 *
 * The budget is what keeps a photo-carrying ledger streamable: rows are counted
 * in bytes rather than in rows because a single `food/label_photo` value is
 * larger than a thousand ordinary datoms, and a page measured in rows would
 * hand the main thread hundreds of megabytes in one message. A size probe runs
 * first so the widths are known before any value is materialised in JavaScript.
 *
 * One row always comes back when one exists, so a value larger than the whole
 * budget moves rather than stalling the walk forever.
 */
export function readLedgerPage(
  db: LedgerDb,
  after: LedgerCursor | null,
  budgetBytes: number,
  narrowing: LedgerPageNarrowing = {}
): LedgerRow[] {
  // Narrowing the walk is what makes a Facet-scoped export the same code as the
  // jar-wide one (ADR-0079 §6), and the sync's delta the same code as both
  // (ADR-0075 §7): the cursor, the budget and the byte probe are unchanged, and
  // only the rows the walk is allowed to see differ.
  const walk = WALK_ORDERS[narrowing.order ?? "key"];
  const clauses: string[] = [];
  const bind: unknown[] = [];
  if (after) {
    clauses.push(`(${walk.columns}) > (?, ?, ?, ?, ?)`);
    bind.push(...walk.cursor(after));
  }
  for (const match of [
    narrowing.entityPrefixes && entityPrefixMatch(narrowing.entityPrefixes),
    narrowing.laneScope && laneScopeMatch(narrowing.laneScope),
    narrowing.above && vectorAboveMatch(narrowing.above),
  ]) {
    if (!match) continue;
    clauses.push(`(${match.where})`);
    bind.push(...match.bind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")} ` : "";
  // The probe and the fetch must walk the same rows in the same order, so they
  // share one query shape and differ only in what they select.
  const pageSql = (select: string) =>
    `SELECT ${select} FROM datoms ${where}ORDER BY ${walk.columns} LIMIT ?;`;

  // `length()` over TEXT counts characters; the cast makes it count the UTF-8
  // bytes the file will actually carry.
  const widths = execRows<{ value_bytes: number }>(
    db,
    pageSql("length(CAST(value AS BLOB)) AS value_bytes"),
    [...bind, LEDGER_PAGE_MAX_ROWS]
  );
  if (widths.length === 0) return [];

  let taken = 0;
  let bytes = 0;
  while (
    taken < widths.length &&
    (taken === 0 || bytes + widths[taken].value_bytes <= budgetBytes)
  ) {
    bytes += widths[taken].value_bytes;
    taken += 1;
  }

  return execRows<LedgerRow>(db, pageSql(LEDGER_COLUMNS), [...bind, taken]);
}

/**
 * Whether a value can stand in one of `datoms`' integer columns. All four of
 * them (`time` and the three stamp parts) are whole, non-negative and inside
 * the safe range, and one predicate is what keeps the worker's boundary check
 * from disagreeing with the import reader's (`ledger-import.ts`).
 */
export function isLedgerInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** What one batch of imported rows did, and how far it moves the clock. */
export interface LedgerImportOutcome {
  /** Rows the table did not already hold, key for key. */
  rowsAdded: number;
  /**
   * The greatest stamp the batch carried, or `null` for an empty batch. The
   * caller feeds it to `Hlc.update` so a local write made after an import
   * orders after the facts the import brought in (ADR-0020).
   */
  highWater: HlcMark | null;
}

// ---------------------------------------------------------------------------
// Why a write shape was refused
// ---------------------------------------------------------------------------

/**
 * The two write paths check the same kind of thing — every field present and
 * the right sort of thing — and both used to report it by serialising the whole
 * subject into the message. On this ledger that is a meal, a note or a base64
 * label photo, and on the scan path an entity id is `gtin:<barcode>`, which
 * ADR-0071 §4 forbids by name; the import screen puts a failure's message
 * straight in front of the user, so the dump was rendered (#227).
 *
 * A rule carries the field's name and what it has to be, so the refusal can say
 * both without reaching for the value. `describeValue` supplies the rest — the
 * shape of what was actually there, never its content.
 */
interface FieldRule<T> {
  /** The field, spelled the way the ledger's columns spell it. */
  readonly field: keyof T & string;
  /** What the field has to be, phrased to follow "must be". */
  readonly requirement: string;
  readonly holds: (subject: T) => boolean;
}

/** What `appendDatoms` requires of a datom handed to it. */
const DATOM_RULES: readonly FieldRule<Datom>[] = [
  {
    field: "entity",
    requirement: "a non-empty string",
    holds: (d) => Boolean(d.entity),
  },
  {
    field: "attribute",
    requirement: "a non-empty string",
    holds: (d) => Boolean(d.attribute),
  },
  {
    field: "value",
    requirement: "present",
    holds: (d) => d.value !== undefined,
  },
  {
    field: "time",
    requirement: "a number other than zero",
    holds: (d) => Boolean(d.time),
  },
];

/** What `importLedgerRows` requires of a row that arrived with its own stamp. */
const LEDGER_ROW_RULES: readonly FieldRule<LedgerRow>[] = [
  {
    field: "entity",
    requirement: "a non-empty string",
    holds: (r) => Boolean(r.entity),
  },
  {
    field: "attribute",
    requirement: "a non-empty string",
    holds: (r) => Boolean(r.attribute),
  },
  {
    field: "value",
    requirement: "the JSON text the ledger stores",
    holds: (r) => typeof r.value === "string",
  },
  {
    field: "time",
    requirement: "a whole number of at least zero",
    holds: (r) => isLedgerInteger(r.time),
  },
  {
    field: "hlc_ms",
    requirement: "a whole number of at least zero",
    holds: (r) => isLedgerInteger(r.hlc_ms),
  },
  {
    field: "hlc_ctr",
    requirement: "a whole number of at least zero",
    holds: (r) => isLedgerInteger(r.hlc_ctr),
  },
  {
    field: "device_id",
    requirement: "a non-empty string",
    holds: (r) => Boolean(r.device_id),
  },
];

/**
 * The first rule `subject` breaks, said in one clause, or `null` when it breaks
 * none. First rather than all of them: a caller fixing a malformed row fixes it
 * a field at a time, and a list of every complaint is a longer message that
 * says no more.
 */
function describeBrokenRule<T>(
  subject: T,
  rules: readonly FieldRule<T>[]
): string | null {
  for (const rule of rules) {
    if (rule.holds(subject)) continue;
    return `"${rule.field}" must be ${rule.requirement}, and is ${describeValue(subject[rule.field])}`;
  }
  return null;
}

/**
 * Appends rows that arrived with their own HLC stamps, in a single transaction
 * (ADR-0067). This is the import's write path, and it differs from
 * `appendDatoms` in exactly two ways.
 *
 * It **keeps the stamp the row came with** rather than issuing a new one. The
 * stamp is the row's identity, and re-stamping it would turn a re-import into a
 * second copy of every fact.
 *
 * It uses `INSERT OR IGNORE`, which is what makes an import idempotent. The
 * primary key spans entity, attribute and the whole stamp including the
 * originating device, so a row already present is the same row, and skipping it
 * is a no-op rather than a lost write. That is an append that decided not to
 * append, not an overwrite: nothing in `datoms` is ever changed or removed, so
 * the §1.1 red line stands. `appendDatoms` keeps its plain `INSERT` for the
 * opposite reason, since a collision there means the clock issued a stamp twice
 * and has to be heard about.
 */
export function importLedgerRows(
  db: LedgerDb,
  rows: LedgerRow[]
): LedgerImportOutcome {
  if (!Array.isArray(rows)) {
    throw new Error("Payload 'rows' must be an array");
  }
  if (rows.length === 0) return { rowsAdded: 0, highWater: null };
  return inTransaction(db, () => writeStampedRows(db, rows));
}

/**
 * The write itself, **without a transaction of its own**, so a caller that has
 * more to do under the same "both or neither" can reach it.
 *
 * There is one such caller, {@link importConvergedRows}: a batch and the
 * deletions it brings have to land together, or a deletion whose sweep failed
 * would be held here and never applied to the rows already in the table.
 */
function writeStampedRows(
  db: LedgerDb,
  rows: LedgerRow[]
): LedgerImportOutcome {
  const before = totalChanges(db);
  let highWater: HlcMark | null = null;

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO datoms (${LEDGER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?);`
  );
  try {
    for (const [index, row] of rows.entries()) {
      const complaint = describeBrokenRule(row, LEDGER_ROW_RULES);
      if (complaint !== null) {
        // The place is within this batch, not within the file: an import
        // sends the file a couple of megabytes at a time, so a line number
        // is not something this function is in a position to know.
        throw new Error(
          `Invalid ledger row: row ${index + 1} of the ${rows.length} in this batch — ${complaint}.`
        );
      }
      stmt.bind([
        row.entity,
        row.attribute,
        row.value,
        row.time,
        row.hlc_ms,
        row.hlc_ctr,
        row.device_id,
      ]);
      stmt.step();
      stmt.reset();
      if (highWater === null || compareHlcMark(row, highWater) > 0) {
        highWater = { hlc_ms: row.hlc_ms, hlc_ctr: row.hlc_ctr };
      }
    }
  } finally {
    stmt.finalize();
  }

  return { rowsAdded: totalChanges(db) - before, highWater };
}

/** Runs `work` under one transaction, rolling the whole of it back on a throw. */
function inTransaction<T>(db: LedgerDb, work: () => T): T {
  db.exec("BEGIN TRANSACTION;");
  try {
    const answer = work();
    db.exec("COMMIT;");
    return answer;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

/**
 * Rows this connection has actually written since it opened. It is what counts
 * the additions: a conflicting `INSERT OR IGNORE` writes no row and so moves
 * this counter by nothing, which is exactly the distinction the screen reports.
 */
function totalChanges(db: LedgerDb): number {
  return execRows<{ changed: number }>(
    db,
    "SELECT total_changes() AS changed;"
  )[0].changed;
}

/**
 * Appends datoms in a single transaction and returns the unique attributes
 * touched (for invalidation). Each datom is stamped with the next HLC tick, so
 * two writes in the same millisecond no longer collide on the primary key
 * (ADR-0020). A plain INSERT still surfaces any genuine duplicate stamp as an
 * error rather than overwriting an immutable datom. Any error rolls back the
 * whole batch.
 */
export function appendDatoms(
  db: LedgerDb,
  datoms: Datom[],
  clock: Hlc
): string[] {
  if (!Array.isArray(datoms)) {
    throw new Error("Payload 'datoms' must be an array");
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    const stmt = db.prepare(
      "INSERT INTO datoms (entity, attribute, value, time, hlc_ms, hlc_ctr, device_id) VALUES (?, ?, ?, ?, ?, ?, ?);"
    );
    try {
      for (const [index, datom] of datoms.entries()) {
        const complaint = describeBrokenRule(datom, DATOM_RULES);
        if (complaint !== null) {
          throw new Error(
            `Invalid datom structure: datom ${index + 1} of the ${datoms.length} in this append — ${complaint}.`
          );
        }
        const { entity, attribute, value, time } = datom;
        const stamp = clock.now();
        // Bind accepts arrays (1-based mapping inside the driver). `stamp`
        // already carries the ledger's column names, so it binds verbatim.
        stmt.bind([
          entity,
          attribute,
          JSON.stringify(value),
          time,
          stamp.hlc_ms,
          stamp.hlc_ctr,
          stamp.device_id,
        ]);
        stmt.step();
        stmt.reset();
      }
    } finally {
      stmt.finalize();
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return Array.from(new Set(datoms.map((d) => d.attribute)));
}

// ---------------------------------------------------------------------------
// The Facet-scoped wipe
// ---------------------------------------------------------------------------

/**
 * One narrowing of a read of `datoms`: the `WHERE` it contributes, and the
 * values to bind under it.
 *
 * Named once because {@link readLedgerPage} composes several of them and they
 * have to agree about the order their binds are spent in. `version-vector.ts`
 * hands back the same shape and declares its own, because it owns the vector in
 * all three of its forms.
 */
interface LedgerMatch {
  where: string;
  bind: unknown[];
}

/**
 * The `WHERE` matching every row whose entity starts with one of `prefixes`,
 * and the values to bind under it.
 *
 * `substr(entity, 1, n) = prefix` rather than `LIKE prefix || '%'`, because
 * `LIKE` reads `_` as a single-character wildcard and two of food's five
 * prefixes end in one: `food:custom_` would take `food:customer_1` and
 * `event:consume_` would take `event:consumed_1`. The count would agree with
 * the delete, so nothing would look wrong.
 *
 * An empty prefix list matches nothing rather than everything. The one caller
 * that can pass one is a Facet holding no domains, and "wipe a Facet nobody has
 * heard of" must not mean "wipe the jar".
 *
 * `takenAtOrBefore` is the wiping act's own stamp (ADR-0096 §12). It bounds the
 * match to rows stamped **at or before** the act and nothing after, so a wipe
 * deletes history and never the future and two of them compose in either order.
 * It is inclusive on the counter, because a row stamped in the same tick as the
 * act is one the act saw. Absent, the predicate is the whole prefix set with no
 * ceiling, which is what a local wipe meant before there was anything to carry.
 */
function entityPrefixMatch(
  prefixes: readonly string[],
  takenAtOrBefore: HlcMark | null = null
): LedgerMatch {
  if (prefixes.length === 0) return { where: "0", bind: [] };
  const under = prefixes.map(() => "substr(entity, 1, ?) = ?").join(" OR ");
  const bind = prefixes.flatMap((p) => [p.length, p]);
  if (takenAtOrBefore === null) return { where: under, bind };
  return {
    where: `(${under}) AND (hlc_ms < ? OR (hlc_ms = ? AND hlc_ctr <= ?))`,
    bind: [
      ...bind,
      takenAtOrBefore.hlc_ms,
      takenAtOrBefore.hlc_ms,
      takenAtOrBefore.hlc_ctr,
    ],
  };
}

/**
 * The rows one lane carries: its domains' entities, and the Carried deletions
 * that reach no further than it does (ADR-0105 §1 and §6).
 *
 * **Two arms, because a deletion is not described by its own entity.** A
 * content row belongs to the domain that owns its prefix, which is §1's
 * predicate and the first arm. A Carried deletion's entity is `deletion:` and
 * belongs to the Jar domain whatever it deletes, so the domains it is *about*
 * live in its frozen prefix list — and §6's rule is that it crosses **if and
 * only if that list is a subset of this lane's**. Letting it merely intersect
 * would have a food lane delete a peer's Media; leaving it to §1 alone would
 * have a food lane never carry a food wipe at all, which is
 * [#415](https://github.com/palebluebytes/inventoria/issues/415).
 *
 * **A jar-wide lane still carries every deletion on the first arm**, because it
 * declares `deletion:` like every other prefix the registry holds. That is what
 * this rule does *not* change: it narrows nothing that crossed before it, and
 * the subset test is what a narrower lane is bought with.
 *
 * **The list is read inside SQLite rather than parsed here**, so the walk skips
 * a refused deletion instead of a caller filtering the page afterwards — a page
 * that came back empty because everything in it was filtered would end the walk
 * and withhold every row behind it, permanently. `json_each` over the frozen
 * list is the same reading `readCarriedDeletion` does in memory, and the `CASE`
 * is what keeps a malformed value from throwing: SQLite's `AND` is free not to
 * short-circuit, and a `deletion/prefixes` row that will not parse is in an
 * append-only table forever, so a throw would wedge every sync this device ever
 * runs. Such a row crosses no lane narrow enough to ask, which is the same
 * refusal `readCarriedDeletion` makes of it.
 */
function laneScopeMatch(scope: readonly string[]): LedgerMatch {
  const prefixes = entityPrefixesOfDomains(scope);
  if (prefixes.length === 0) return { where: "0", bind: [] };
  const under = entityPrefixMatch(prefixes);
  return {
    where:
      `(${under.where}) OR (attribute = ? AND CASE WHEN json_valid(value) ` +
      `THEN NOT EXISTS (SELECT 1 FROM json_each(datoms.value) ` +
      `WHERE json_each.value NOT IN (${prefixes.map(() => "?").join(", ")})) ` +
      `ELSE 0 END)`,
    bind: [...under.bind, CARRIED_DELETION_ATTRIBUTE, ...prefixes],
  };
}

/** How many rows carry one of these entity prefixes, under the same bound. */
export function countDatomsByEntityPrefix(
  db: LedgerDb,
  prefixes: readonly string[],
  takenAtOrBefore: HlcMark | null = null
): number {
  const { where, bind } = entityPrefixMatch(prefixes, takenAtOrBefore);
  return execRows<{ row_count: number }>(
    db,
    `SELECT count(*) AS row_count FROM datoms WHERE ${where};`,
    bind
  )[0].row_count;
}

/** One question an {@link EntityCensus} answers: a name, and the rows under it. */
export interface EntityCensusGroup {
  id: string;
  prefixes: readonly string[];
}

/** What the ledger holds, in total and per group. Groups may overlap; none do. */
export interface EntityCensus {
  total: number;
  counts: Record<string, number>;
}

/**
 * Rows per group and rows overall, in one pass of the worker rather than one
 * round trip per group.
 *
 * The total is the whole table, not the sum of the groups: the difference is
 * the rows no group claims, and a confirmation that promised "everything else
 * stays" while quietly not counting some of it would be the wrong way round.
 */
export function censusByEntityPrefix(
  db: LedgerDb,
  groups: readonly EntityCensusGroup[]
): EntityCensus {
  const counts: Record<string, number> = {};
  for (const group of groups) {
    counts[group.id] = countDatomsByEntityPrefix(db, group.prefixes);
  }
  return { total: countDatoms(db), counts };
}

/**
 * Removes every row whose entity carries one of `prefixes`, and answers how
 * many went. **The third sanctioned destructive operation** (ADR-0079 §1),
 * beside `resetLedgerSchema` and the one-shot ADR-0020 migration, and the only
 * one of the three that is partial.
 *
 * It is sanctioned on a condition the other two did not need: the rows it takes
 * are **closed under reference**, so nothing surviving points at anything it
 * removed. That is a property of the caller's prefix set, not of this function,
 * and ADR-0079 §1 is where Rations' is shown to hold. A Facet that cannot show
 * it does not get a wipe, and this function is not the place that can tell.
 *
 * It mutates no state. Deletion is what the red line forbids because a fact
 * changing value silently is not a fact; this retires whole entities, which is
 * `resetLedgerSchema`'s act narrowed to one Facet's rows.
 *
 * The count is taken under the same predicate rather than read off `changes()`,
 * so the number the user was shown and the number of rows that went are the
 * same expression evaluated twice.
 *
 * **`takenAtOrBefore` is what makes the fourth deletion the same act as this
 * one** (ADR-0096 §12). A peer applying a carried deletion calls this function,
 * with that act's frozen prefix list and that act's stamp — the same predicate,
 * not a re-enactment of it — which is how it inherits the closure proof above
 * rather than asking for an exemption of its own.
 *
 * **It has no default**, for the reason the write seam one layer up has none: a
 * caller that forgot it would silently widen a `DELETE` into the future, and
 * every act that reaches here knows the stamp it acted at. The count beside it
 * keeps its default, because a census legitimately has no ceiling.
 */
export function deleteDatomsByEntityPrefix(
  db: LedgerDb,
  prefixes: readonly string[],
  takenAtOrBefore: HlcMark
): number {
  const going = countDatomsByEntityPrefix(db, prefixes, takenAtOrBefore);
  if (going === 0) return 0;
  const { where, bind } = entityPrefixMatch(prefixes, takenAtOrBefore);
  execWrite(db, `DELETE FROM datoms WHERE ${where};`, bind);
  return going;
}

// ---------------------------------------------------------------------------
// The deletion the wipe carries, and what a peer does with it
// ---------------------------------------------------------------------------

/**
 * The ledger half of one Facet-scoped wipe: the rows go, and the act is written
 * down in the same transaction (ADR-0096 §12).
 *
 * **Both or neither.** A delete whose record failed leaves a device whose peer
 * hands the rows straight back, and a record whose delete failed claims an act
 * that did not happen — to a peer, which would then perform it. SQLite gives
 * "both or neither" for two statements, which is exactly what this needs, and
 * unlike the `VACUUM` beside it there is nothing here that cannot run inside a
 * transaction.
 *
 * **The record is written first and is not taken by the delete it records.** It
 * is `deletion:`, owned by the Jar domain, which no Facet declares — so it is
 * absent from every Facet's derived prefix set as arithmetic rather than as a
 * rule anybody has to remember (ADR-0096 §13). The stamp bound would refuse it
 * a second time over.
 *
 * **A plain `INSERT`, for `appendDatoms`' reason and not `importLedgerRows`'**
 * (`CODING_STANDARDS` §5). The entity is the stamp, so a collision means the
 * clock issued one twice, which has to be heard about — and `OR IGNORE` here
 * would drop the record while the `DELETE` in the same transaction still ran,
 * leaving a wipe no peer could ever learn about.
 */
export function wipeFacetFromLedger(
  db: LedgerDb,
  prefixes: readonly string[],
  stamp: HlcKey
): number {
  const row = carriedDeletionRow(stamp, prefixes);
  return inTransaction(db, () => {
    execWrite(
      db,
      `INSERT INTO datoms (${LEDGER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        row.entity,
        row.attribute,
        row.value,
        row.time,
        row.hlc_ms,
        row.hlc_ctr,
        row.device_id,
      ]
    );
    return deleteDatomsByEntityPrefix(db, prefixes, stamp);
  });
}

/**
 * Every carried deletion this ledger holds.
 *
 * Read by attribute, which is `idx_ave`'s leading column, so the question "has
 * anything ever been wiped?" costs an index seek rather than a scan — and in a
 * jar nobody has wiped it is the whole cost of this mechanism, once per
 * arriving batch.
 *
 * A row whose value will not parse is dropped rather than thrown on. A carried
 * deletion is in an append-only table forever, so a throw would wedge every
 * convergence this device ever attempts; `readCarriedDeletion` carries that
 * argument.
 */
export function heldCarriedDeletions(db: LedgerDb): CarriedDeletion[] {
  return execRows<LedgerRow>(
    db,
    `SELECT ${LEDGER_COLUMNS} FROM datoms WHERE attribute = ?;`,
    [CARRIED_DELETION_ATTRIBUTE]
  )
    .map(readCarriedDeletion)
    .filter((deletion): deletion is CarriedDeletion => deletion !== null);
}

/**
 * One batch of rows a **convergence** brought: written, and held to every
 * carried deletion this ledger has (ADR-0096 §12).
 *
 * This is the fourth sanctioned destructive operation, and the exemption is the
 * choice between this function and {@link importLedgerRows} rather than a flag
 * inside one of them — a user-chosen file takes the other door, because a
 * peer's payload *arrives* and a file is *chosen*.
 *
 * **Two halves, and only the first deletes.** A deletion **new to this device**
 * takes everything it covers that is already here, once. Every deletion this
 * ledger already held instead **refuses** the rows this batch carries, which
 * never reach the table at all. Nothing re-evaluates a held deletion against
 * rows that are already here, and that is what keeps _wipe, then import_ a
 * composition the user can rely on rather than one an unrelated later batch
 * silently undoes.
 *
 * **One transaction over both halves**, so a sweep that failed cannot leave its
 * deletion held and unapplied — the batch rolls back with it, and the peer's
 * retry brings the deletion round again as a new one.
 */
export function importConvergedRows(
  db: LedgerDb,
  rows: LedgerRow[]
): { outcome: LedgerImportOutcome; swept: CarriedDeletionSweep } {
  if (!Array.isArray(rows)) {
    throw new Error("Payload 'rows' must be an array");
  }
  if (rows.length === 0) {
    return { outcome: { rowsAdded: 0, highWater: null }, swept: SWEPT_NOTHING };
  }

  return inTransaction(db, () => {
    // Read before the write, because "new to this device" is exactly what this
    // ledger did not hold a moment ago. A deletion the peer re-sends after a
    // collection that could not settle is already here, and must not sweep the
    // table a second time.
    const held = heldCarriedDeletions(db);
    const sifted = siftArrivingRows(held, rows);
    const outcome = writeStampedRows(db, sifted.keep);
    const arrived = applyArrivedDeletions(db, held);
    return {
      outcome,
      swept: { ...arrived, refused: sifted.refused },
    };
  });
}

/**
 * Each deletion this batch brought that the ledger did not already hold, applied
 * to the whole of it, and what each one took.
 *
 * **Per prefix rather than per deletion**, and one `DELETE` each, so the notice
 * names only the prefixes rows actually went under: a wipe carries a Facet's
 * whole prefix set, and a peer holding meals but no recipes deleted meals.
 * Running them in sequence is also what keeps the total honest where one prefix
 * nests inside another of the same owner, since the first takes the rows and
 * the second then finds none.
 */
function applyArrivedDeletions(
  db: LedgerDb,
  heldBefore: readonly CarriedDeletion[]
): { prefixes: string[]; datomsDeleted: number } {
  const known = new Set(heldBefore.map((deletion) => deletion.entity));
  const prefixes: string[] = [];
  let datomsDeleted = 0;
  for (const deletion of heldCarriedDeletions(db)) {
    if (known.has(deletion.entity)) continue;
    for (const prefix of deletion.prefixes) {
      const went = deleteDatomsByEntityPrefix(db, [prefix], deletion);
      if (went === 0) continue;
      datomsDeleted += went;
      if (!prefixes.includes(prefix)) prefixes.push(prefix);
    }
  }
  return { prefixes, datomsDeleted };
}
