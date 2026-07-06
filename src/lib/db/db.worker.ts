import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { projections } from "./projections";
import {
  appendDatoms,
  ensureLedgerSchema,
  getOrCreateDeviceId,
  readHlcHighWater,
  resetLedgerSchema,
  execRows,
  type LedgerDb,
} from "./db.core";
import { createHlc, type Hlc } from "./hlc";

let db: LedgerDb | null = null;
let hlc: Hlc | null = null;
let initialized = false;

// Handle messages from the main thread
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;
  console.log("worker: received message type =", type, "id =", id);

  try {
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
      const deviceId = getOrCreateDeviceId(db);
      ensureLedgerSchema(db, deviceId);
      hlc = createHlc(deviceId, { seed: readHlcHighWater(db) });

      console.log("worker: table and indices initialized");
      initialized = true;
      console.log("worker: sending status ok response for init");
      self.postMessage({ id, status: "ok" });
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
    } else {
      throw new Error(`Unsupported message type: ${type}`);
    }
  } catch (error: any) {
    self.postMessage({
      id,
      status: "error",
      error: error.message || String(error),
    });
  }
};
