import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

let db: any = null;
let initialized = false;

// Handle messages from the main thread
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === "init") {
      if (initialized) {
        self.postMessage({ id, status: "ok" });
        return;
      }

      const { dbPath } = payload;
      const sqlite3 = await (sqlite3InitModule as any)({
        print: console.log,
        printErr: console.error,
      });

      if (!(sqlite3 as any).opfs) {
        throw new Error("OPFS is not supported in this browser environment");
      }

      db = new (sqlite3 as any).oo1.OpfsDb(dbPath);

      // Auto-create the datoms table and indexes
      db.exec(`
        CREATE TABLE IF NOT EXISTS datoms (
          entity TEXT NOT NULL,
          attribute TEXT NOT NULL,
          value TEXT NOT NULL,
          time INTEGER NOT NULL,
          PRIMARY KEY (entity, attribute, time)
        ) WITHOUT ROWID;
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_eav ON datoms (entity, attribute, time);
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ave ON datoms (attribute, value, entity);
      `);

      initialized = true;
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
    } else if (type === "append") {
      if (!db) {
        throw new Error("Database not initialized. Please call 'init' first.");
      }

      const { datoms } = payload;
      if (!Array.isArray(datoms)) {
        throw new Error("Payload 'datoms' must be an array");
      }

      db.exec("BEGIN TRANSACTION;");
      try {
        const stmt = db.prepare(
          "INSERT OR REPLACE INTO datoms (entity, attribute, value, time) VALUES (?, ?, ?, ?);"
        );
        try {
          for (const datom of datoms) {
            const { entity, attribute, value, time } = datom;
            if (!entity || !attribute || value === undefined || !time) {
              throw new Error(
                `Invalid datom structure: ${JSON.stringify(datom)}`
              );
            }
            // Bind accepts arrays (1-based mapping inside the driver)
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

      // Collect unique attributes modified
      const attributes = Array.from(
        new Set(datoms.map((d: any) => d.attribute))
      );

      self.postMessage({ id, status: "ok" });

      // Broadcast invalidation to trigger Svelte store re-evaluation
      self.postMessage({
        type: "broadcast_invalidation",
        payload: { attributes },
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
