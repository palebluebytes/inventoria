import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { computeMediaLibraryState } from "../media/state";
import { computeAcquisitionState } from "../acquisition/state";
import {
  appendDatoms,
  createLedgerSchema,
  resetLedgerSchema,
  type LedgerDb,
} from "./db.core";

let db: LedgerDb | null = null;
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

      // Auto-create the datoms table and indexes
      createLedgerSchema(db);

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

      const rows: any[] = [];
      db.exec({
        sql,
        bind: params || [],
        rowMode: "object",
        callback: (row: any) => {
          rows.push(row);
        },
      });

      self.postMessage({ id, status: "ok", data: rows });
    } else if (type === "project") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }

      const { pipeline, params } = payload;

      if (pipeline === "MEDIA_LIBRARY") {
        const rows: any[] = [];
        db.exec({
          sql: "SELECT entity, attribute, value, time FROM datoms WHERE attribute LIKE 'media/%' OR attribute LIKE 'event/%' ORDER BY time ASC",
          rowMode: "object",
          callback: (row: any) => {
            rows.push(row);
          },
        });
        const enriched = computeMediaLibraryState(rows);
        self.postMessage({ id, status: "ok", data: enriched });
      } else if (pipeline === "ACQUISITION_LIBRARY") {
        const rows: any[] = [];
        db.exec({
          sql: "SELECT entity, attribute, value, time FROM datoms WHERE attribute LIKE 'twin/%' OR attribute LIKE 'event/%' ORDER BY time ASC",
          rowMode: "object",
          callback: (row: any) => {
            rows.push(row);
          },
        });
        const enriched = computeAcquisitionState(rows);
        self.postMessage({ id, status: "ok", data: enriched });
      } else {
        throw new Error(`Unknown projection pipeline: ${pipeline}`);
      }
    } else if (type === "append") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }

      const { datoms } = payload;
      const attributes = appendDatoms(db, datoms);

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
