/**
 * Pure SQLite ledger operations shared by the DB worker and unit tests.
 *
 * The schema and the append routine live here rather than inline in
 * db.worker.ts so the append-only invariant has a single home and can be tested
 * directly against sqlite-wasm, without standing up the Worker/OPFS layer.
 */

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
    PRIMARY KEY (entity, attribute, time)
  ) WITHOUT ROWID;
`;
const CREATE_EAV_INDEX = `CREATE INDEX IF NOT EXISTS idx_eav ON datoms (entity, attribute, time);`;
const CREATE_AVE_INDEX = `CREATE INDEX IF NOT EXISTS idx_ave ON datoms (attribute, value, entity);`;

/** Creates the datoms table and its indexes if they do not yet exist. */
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
 * Appends datoms in a single transaction and returns the unique attributes
 * touched (for invalidation). Uses a plain INSERT so a PRIMARY KEY
 * (entity, attribute, time) collision surfaces as an error rather than silently
 * overwriting an immutable datom. Any error rolls back the whole batch.
 */
export function appendDatoms(db: LedgerDb, datoms: Datom[]): string[] {
  if (!Array.isArray(datoms)) {
    throw new Error("Payload 'datoms' must be an array");
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    const stmt = db.prepare(
      "INSERT INTO datoms (entity, attribute, value, time) VALUES (?, ?, ?, ?);"
    );
    try {
      for (const datom of datoms) {
        const { entity, attribute, value, time } = datom;
        if (!entity || !attribute || value === undefined || !time) {
          throw new Error(`Invalid datom structure: ${JSON.stringify(datom)}`);
        }
        // Bind accepts arrays (1-based mapping inside the driver).
        stmt.bind([entity, attribute, JSON.stringify(value), time]);
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
