import DBWorker from "./db.worker?worker";
import type {
  Datom,
  EntityCensus,
  EntityCensusGroup,
  LedgerCursor,
  LedgerSummary,
  LedgerRow,
  StoredDatom,
} from "./db.core";

export type {
  Datom,
  EntityCensus,
  EntityCensusGroup,
  LedgerCursor,
  LedgerSummary,
  LedgerRow,
  StoredDatom,
};

export type InvalidationListener = (attributes: string[]) => void;

export class DBClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (data: any) => void; reject: (err: any) => void }
  >();
  private messageCounter = 0;
  private invalidationListeners = new Set<InvalidationListener>();
  private initialized = false;

  /**
   * Initializes the SQLite Worker and sets up the OPFS database file.
   */
  async init(dbPath: string = "/inventoria.db"): Promise<void> {
    console.log("dbClient: init() started for path", dbPath);
    if (this.initialized) {
      console.log("dbClient: already initialized");
      return;
    }

    // Instantiate worker using Vite's ?worker import syntax
    console.log("dbClient: instantiating DBWorker...");
    this.worker = new DBWorker();

    this.worker.onmessage = (event: MessageEvent) => {
      const { id, type, status, data, error, payload } = event.data;
      console.log("dbClient: worker message received:", {
        id,
        type,
        status,
        error,
      });

      // Handle invalidation broadcasts (does not correspond to a pending request ID)
      if (type === "broadcast_invalidation") {
        const attributes = payload?.attributes || [];
        this.invalidationListeners.forEach((listener) => listener(attributes));
        return;
      }

      // Resolve/reject matching request ID
      const pending = this.pendingRequests.get(id);
      if (!pending) return;

      this.pendingRequests.delete(id);

      if (status === "ok") {
        pending.resolve(data);
      } else {
        pending.reject(new Error(error || "Unknown worker error"));
      }
    };

    this.initialized = true;

    // Test-only escape hatch: `?mem=1` forces an in-memory database so the app
    // is usable in headless/CI environments where OPFS writes fail. Has no
    // effect in normal use.
    const forceMemory =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("mem") === "1";

    // Trigger initialization inside the worker
    console.log("dbClient: sending init request to worker");
    await this.send("init", { dbPath, forceMemory });
    console.log("dbClient: worker finished initialization");
  }

  /**
   * Run a read-only SELECT query against the ledger.
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.send<T[]>("query", { sql, params });
  }

  /**
   * Run a named projection pipeline against the ledger inside the worker.
   */
  async project<T = any>(
    pipeline: string,
    params?: Record<string, any>
  ): Promise<T> {
    return this.send<T>("project", { pipeline, params });
  }

  /**
   * Append a list of immutable datoms to the ledger.
   */
  async append(datoms: Datom[]): Promise<void> {
    return this.send<void>("append", { datoms });
  }

  /**
   * Register a listener that fires whenever datoms are successfully appended to the ledger.
   * Returns a cleanup function to unsubscribe.
   */
  onInvalidate(listener: InvalidationListener): () => void {
    this.invalidationListeners.add(listener);
    return () => {
      this.invalidationListeners.delete(listener);
    };
  }

  /**
   * What the ledger says about itself: how many rows it holds and which device
   * it belongs to. The two facts an export envelope carries.
   */
  async ledgerSummary(
    entityPrefixes?: readonly string[]
  ): Promise<LedgerSummary> {
    return this.send<LedgerSummary>("ledger_summary", { entityPrefixes });
  }

  /**
   * Rows per group and rows overall, which is what a Facet-scoped wipe's
   * confirmation counts against (ADR-0079 §5). One message rather than one per
   * group, so the figures the user reads are all taken at the same instant.
   */
  async entityCensus(
    groups: readonly EntityCensusGroup[]
  ): Promise<EntityCensus> {
    return this.send<EntityCensus>("entity_census", { groups });
  }

  /**
   * Removes every row whose entity carries one of `entityPrefixes`, and answers
   * how many went: the Facet-scoped wipe, and the third sanctioned destructive
   * operation (ADR-0079 §1).
   *
   * The prefixes are the caller's, derived from the registry by
   * `facets/facet-wipe.ts`. Nothing here knows what a Facet is, which is what
   * keeps the predicate in the one place that can be checked against ownership.
   *
   * The `localStorage` half is not this method's and cannot be: a worker has no
   * `localStorage` to take.
   */
  async facetWipe(entityPrefixes: readonly string[]): Promise<number> {
    return this.send<number>("facet_wipe", { entityPrefixes });
  }

  /**
   * The next rows of the ledger after `after`, bounded by `budgetBytes` of
   * value, or an empty array once the walk is finished.
   *
   * This is the export's read seam. SQLite stays in the worker and the table
   * never crosses the boundary whole: a ledger carrying full-resolution label
   * photos is far larger than a message the main thread can hold.
   */
  async ledgerPage(
    after: LedgerCursor | null,
    budgetBytes: number,
    entityPrefixes?: readonly string[]
  ): Promise<LedgerRow[]> {
    return this.send<LedgerRow[]>("ledger_page", {
      after,
      budgetBytes,
      entityPrefixes,
    });
  }

  /**
   * Appends one batch of imported rows, returning how many of them were new.
   *
   * This is the import's write seam, and the mirror of `ledgerPage`: the file
   * is read on the main thread and crosses into the worker a batch at a time,
   * because an export carrying full-resolution photos is far larger than a
   * message. `final` marks the batch that finishes the import, which is what
   * makes the worker tell every projection to re-read once rather than once per
   * batch.
   */
  async ledgerImport(rows: LedgerRow[], final: boolean): Promise<number> {
    return this.send<number>("ledger_import", { rows, final });
  }

  /**
   * Clears all data from the ledger by dropping and recreating the datoms table.
   */
  async clear(): Promise<void> {
    return this.send<void>("clear", {});
  }

  /**
   * Returns the pages a deletion freed to the browser, by rewriting the
   * database file (ADR-0079 §4, #290). A `clear` alone leaves them on SQLite's
   * freelist, where they are reusable by this app and invisible to everyone
   * else — including the storage figure on the screen the wipe lives on.
   *
   * Its own operation rather than part of `clear`; `vacuumLedger` in
   * `db.core.ts` carries the argument for why.
   *
   * It rejects like every other message when the vacuum fails. Nothing here
   * makes it best-effort; a caller that has already committed its delete makes
   * it so by declining to fail on it.
   */
  async vacuum(): Promise<void> {
    return this.send<void>("vacuum", {});
  }

  /**
   * Sends a typed message to the worker and returns a Promise.
   */
  private send<T>(type: string, payload: any): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error("Database worker not initialized."));
    }

    const id = `msg_${this.messageCounter++}_${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker!.postMessage({ id, type, payload });
    });
  }

  /**
   * Terminates the worker. Mostly useful for cleaning up test environments.
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.pendingRequests.clear();
    }
  }
}

export const dbClient = new DBClient();
