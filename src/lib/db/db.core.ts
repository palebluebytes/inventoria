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

import { compareHlcMark, type Hlc, type HlcKey, type HlcMark } from "./hlc";

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
  entityPrefixes?: readonly string[]
): LedgerRow[] {
  // Narrowing the walk is what makes a Facet-scoped export the same code as the
  // jar-wide one (ADR-0079 §6): the cursor, the budget and the byte probe are
  // unchanged, and only the rows the walk is allowed to see differ.
  const clauses: string[] = [];
  const bind: unknown[] = [];
  if (after) {
    clauses.push(`(${LEDGER_KEY}) > (?, ?, ?, ?, ?)`);
    bind.push(
      after.entity,
      after.attribute,
      after.hlc_ms,
      after.hlc_ctr,
      after.device_id
    );
  }
  if (entityPrefixes) {
    const match = entityPrefixMatch(entityPrefixes);
    clauses.push(`(${match.where})`);
    bind.push(...match.bind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")} ` : "";
  // The probe and the fetch must walk the same rows in the same order, so they
  // share one query shape and differ only in what they select.
  const pageSql = (select: string) =>
    `SELECT ${select} FROM datoms ${where}ORDER BY ${LEDGER_KEY} LIMIT ?;`;

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

  const before = totalChanges(db);
  let highWater: HlcMark | null = null;

  db.exec("BEGIN TRANSACTION;");
  try {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO datoms (${LEDGER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?);`
    );
    try {
      for (const row of rows) {
        if (
          !row.entity ||
          !row.attribute ||
          typeof row.value !== "string" ||
          !isLedgerInteger(row.time) ||
          !isLedgerInteger(row.hlc_ms) ||
          !isLedgerInteger(row.hlc_ctr) ||
          !row.device_id
        ) {
          throw new Error(`Invalid ledger row: ${JSON.stringify(row.entity)}`);
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
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return { rowsAdded: totalChanges(db) - before, highWater };
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
      for (const datom of datoms) {
        const { entity, attribute, value, time } = datom;
        if (!entity || !attribute || value === undefined || !time) {
          throw new Error(`Invalid datom structure: ${JSON.stringify(datom)}`);
        }
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
 */
function entityPrefixMatch(prefixes: readonly string[]): {
  where: string;
  bind: unknown[];
} {
  if (prefixes.length === 0) return { where: "0", bind: [] };
  return {
    where: prefixes.map(() => "substr(entity, 1, ?) = ?").join(" OR "),
    bind: prefixes.flatMap((p) => [p.length, p]),
  };
}

/** How many rows carry one of these entity prefixes. */
export function countDatomsByEntityPrefix(
  db: LedgerDb,
  prefixes: readonly string[]
): number {
  const { where, bind } = entityPrefixMatch(prefixes);
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
 */
export function deleteDatomsByEntityPrefix(
  db: LedgerDb,
  prefixes: readonly string[]
): number {
  const going = countDatomsByEntityPrefix(db, prefixes);
  if (going === 0) return 0;
  const { where, bind } = entityPrefixMatch(prefixes);
  execWrite(db, `DELETE FROM datoms WHERE ${where};`, bind);
  return going;
}
