import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { projections } from "./projections";
import {
  appendDatoms,
  ensureLedgerSchema,
  getOrCreateDeviceId,
  importLedgerRows,
  readHlcHighWater,
  readLedgerPage,
  readLedgerSummary,
  resetLedgerSchema,
  vacuumLedger,
  execRows,
  type LedgerDb,
} from "./db.core";
import { createHlc, type Hlc } from "./hlc";

let db: LedgerDb | null = null;
let hlc: Hlc | null = null;
// Kept from init so a summary read does not have to re-derive it: the id is
// stable for the life of the database file.
let device_id: string | null = null;
let initialized = false;

// Gate that opens once `init` has finished (whether it succeeded or threw).
// Non-init messages await it before touching the database. The client posts
// messages in order, but `init` is async (OPFS/WASM setup), so without this a
// query/projection dispatched during the app's first render could be processed
// while `init` is still awaiting and hit a null `db`.
let resolveReady!: () => void;
const ready = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

// Handle messages from the main thread
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;
  console.log("worker: received message type =", type, "id =", id);

  try {
    // Everything except init depends on an open database; hold dependent
    // operations until init has resolved the `ready` gate above.
    if (type !== "init") {
      await ready;
    }

    if (type === "init") {
      if (initialized) {
        console.log("worker: already initialized, responding ok");
        self.postMessage({ id, status: "ok" });
        return;
      }

      const { dbPath, forceMemory } = payload;
      const sqlite3 = await (sqlite3InitModule as any)({
        print: console.log,
        printErr: console.error,
      });

      // `forceMemory` is set by the client for the `?mem=1` escape hatch, used
      // by the e2e suite in headless/CI environments where OPFS writes fail.
      const opfsVfs = forceMemory
        ? null
        : sqlite3.capi.sqlite3_vfs_find("opfs");
      if (!opfsVfs) {
        console.warn(
          forceMemory
            ? "worker: forceMemory set — using an in-memory database."
            : "worker: OPFS is not supported in this browser environment. Falling back to in-memory database."
        );
        db = new (sqlite3 as any).oo1.DB() as LedgerDb;
        console.log("worker: in-memory db opened successfully");
      } else {
        console.log("worker: opfs is supported. opening db...");
        db = new (sqlite3 as any).oo1.OpfsDb(dbPath) as LedgerDb;
        console.log("worker: db opened successfully");
      }

      // Ensure the ledger exists on the HLC schema (migrating a legacy
      // database in place), then seed the clock from its high-water mark so
      // stamps stay monotonic across restarts (ADR-0020).
      device_id = getOrCreateDeviceId(db);
      ensureLedgerSchema(db, device_id);
      hlc = createHlc(device_id, { seed: readHlcHighWater(db) });

      console.log("worker: table and indices initialized");
      initialized = true;
      console.log("worker: sending status ok response for init");
      self.postMessage({ id, status: "ok" });
      resolveReady();
    } else if (type === "query") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }

      const { sql, params } = payload;

      // Programmatic check: only allow SELECT queries (read-only)
      const trimmedSql = sql.trim().toLowerCase();
      if (!trimmedSql.startsWith("select")) {
        throw new Error(
          "Security Violation: Only SELECT queries are permitted in read operations."
        );
      }

      const rows = execRows(db, sql, params || []);
      self.postMessage({ id, status: "ok", data: rows });
    } else if (type === "project") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }

      const { pipeline } = payload;
      const projection = projections[pipeline];
      if (!projection) {
        throw new Error(`Unknown projection pipeline: ${pipeline}`);
      }

      const enriched = projection.compute(execRows(db, projection.sql));
      self.postMessage({ id, status: "ok", data: enriched });
    } else if (type === "append") {
      if (!db || !hlc) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }

      const { datoms } = payload;
      const attributes = appendDatoms(db, datoms, hlc);

      self.postMessage({ id, status: "ok" });

      // Broadcast invalidation to trigger Svelte store re-evaluation
      self.postMessage({
        type: "broadcast_invalidation",
        payload: { attributes },
      });
    } else if (type === "ledger_summary") {
      if (!db || !device_id) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }
      self.postMessage({
        id,
        status: "ok",
        data: readLedgerSummary(db, device_id),
      });
    } else if (type === "ledger_page") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }
      // The export's read seam. Rows leave a page at a time, bounded by bytes,
      // so a ledger full of label photos never crosses the boundary whole.
      const { after, budgetBytes } = payload;
      self.postMessage({
        id,
        status: "ok",
        data: readLedgerPage(db, after ?? null, budgetBytes),
      });
    } else if (type === "ledger_import") {
      if (!db || !hlc) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }
      // The import's write seam. Rows arrive already stamped and are appended
      // with their stamps intact, so the same file imported twice is the same
      // ledger (ADR-0067).
      const { rows, final } = payload;
      const outcome = importLedgerRows(db, rows);
      // A stamp issued elsewhere has to move this device's clock, or a write
      // made straight after an import could order before the facts it brought
      // in. This is exactly what ADR-0020 gave `update` to do.
      if (outcome.highWater) hlc.update(outcome.highWater);
      self.postMessage({ id, status: "ok", data: outcome.rowsAdded });

      // Once, at the end. Every ledger-backed store re-reads on a broadcast,
      // and an import is many batches, so announcing each one would re-run
      // every projection in the app a few hundred times.
      if (final) {
        self.postMessage({
          type: "broadcast_invalidation",
          payload: { attributes: [] },
        });
      }
    } else if (type === "clear") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }
      resetLedgerSchema(db);
      self.postMessage({ id, status: "ok" });
      self.postMessage({
        type: "broadcast_invalidation",
        payload: { attributes: [] },
      });
    } else if (type === "vacuum") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }
      // Its own operation rather than a tail on `clear` — `vacuumLedger` says
      // why. Nothing is invalidated here: a vacuum rewrites the file and
      // changes no fact, so no projection has a different answer afterwards.
      vacuumLedger(db);
      self.postMessage({ id, status: "ok" });
    } else {
      throw new Error(`Unsupported message type: ${type}`);
    }
  } catch (error: any) {
    // If init itself failed, open the gate so any queued messages unblock and
    // fail fast on the null-db checks rather than hanging on `ready` forever.
    if (type === "init") {
      resolveReady();
    }
    self.postMessage({
      id,
      status: "error",
      error: error.message || String(error),
    });
  }
};
