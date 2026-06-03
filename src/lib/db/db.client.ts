import DBWorker from "./db.worker?worker";

export interface Datom {
  entity: string;
  attribute: string;
  value: any;
  time: number;
}

export type InvalidationListener = (attributes: string[]) => void;

class DBClient {
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

    // Trigger initialization inside the worker
    console.log("dbClient: sending init request to worker");
    await this.send("init", { dbPath });
    console.log("dbClient: worker finished initialization");
  }

  /**
   * Run a read-only SELECT query against the ledger.
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.send<T[]>("query", { sql, params });
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
   * Clears all data from the ledger by dropping and recreating the datoms table.
   */
  async clear(): Promise<void> {
    return this.send<void>("clear", {});
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
