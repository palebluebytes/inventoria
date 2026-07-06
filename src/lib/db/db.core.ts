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

import type { Hlc, HlcMark } from "./hlc";

export interface Datom {
  entity: string;
  attribute: string;
  value: unknown;
  time: number;
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
 */
function migrateToHlcSchema(db: LedgerDb, deviceId: string): void {
  db.exec("BEGIN TRANSACTION;");
  try {
    db.exec("DROP TABLE IF EXISTS datoms_hlc_new;");
    db.exec(`
      CREATE TABLE datoms_hlc_new (
        entity TEXT NOT NULL,
        attribute TEXT NOT NULL,
        value TEXT NOT NULL,
        time INTEGER NOT NULL,
        hlc_ms INTEGER NOT NULL,
        hlc_ctr INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        PRIMARY KEY (entity, attribute, hlc_ms, hlc_ctr, device_id)
      ) WITHOUT ROWID;
    `);
    execWrite(
      db,
      `INSERT INTO datoms_hlc_new (entity, attribute, value, time, hlc_ms, hlc_ctr, device_id)
       SELECT entity, attribute, value, time, time, 0, ? FROM datoms;`,
      [deviceId]
    );
    db.exec("DROP TABLE datoms;");
    db.exec("ALTER TABLE datoms_hlc_new RENAME TO datoms;");
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
  db.exec(CREATE_EAV_INDEX);
  db.exec(CREATE_AVE_INDEX);
}

/**
 * Ensures the ledger is present and on the HLC schema, migrating a legacy
 * database in place if needed. Used by the worker on init; the pure unit tests
 * call `createLedgerSchema` directly against a fresh database.
 */
export function ensureLedgerSchema(db: LedgerDb, deviceId: string): void {
  db.exec(CREATE_META_TABLE);
  if (needsHlcMigration(db)) {
    migrateToHlcSchema(db, deviceId);
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

/** The ledger's current HLC high-water mark, used to seed the clock on init. */
export function readHlcHighWater(db: LedgerDb): HlcMark {
  const rows = execRows<{ hlc_ms: number; hlc_ctr: number }>(
    db,
    "SELECT hlc_ms, hlc_ctr FROM datoms ORDER BY hlc_ms DESC, hlc_ctr DESC LIMIT 1;"
  );
  if (rows.length === 0) return { physical: 0, counter: 0 };
  return { physical: Number(rows[0].hlc_ms), counter: Number(rows[0].hlc_ctr) };
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
        // Bind accepts arrays (1-based mapping inside the driver).
        stmt.bind([
          entity,
          attribute,
          JSON.stringify(value),
          time,
          stamp.physical,
          stamp.counter,
          stamp.deviceId,
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
