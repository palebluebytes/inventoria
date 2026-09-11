/**
 * One `localStorage` for the suites that test the modules reading it.
 *
 * Five suites each carried their own `Map`-backed stub and they had already
 * diverged, so none could grow a capability another needed — a quota-exceeded
 * mode, for instance, which `log-facility.test.ts` hand-rolled per test, and the
 * key enumeration only `facet-wipe.test.ts` had (#222). This is that one
 * adapter, and it covers every shape those copies between them reached for: a
 * seeded jar, an observer on the writes, a counter on the reads, key
 * enumeration, a store that refuses, and no store at all.
 *
 * It is a real read/write path rather than a mock, because the guarded
 * accessors ARE the behaviour under test: every module here reads
 * `localStorage` through a `typeof` check and a `try`, and a stub that never
 * refuses would leave both halves unexercised.
 *
 * The module-reloading helpers live beside it rather than in a file of their
 * own, because the two are one arrangement: `device-settings`, `secrets` and
 * the log facility all snapshot the store (or register into module state) at
 * import, so stubbing the jar and re-importing the module are two halves of the
 * same step and a suite that does one without the other tests the previous
 * test's state.
 */
import { vi } from "vitest";

/** A store a test can hold: seed it, watch it, and read back what landed. */
export interface FakeLocalStorage extends Storage {
  /** The records themselves, so a test can seed a jar or assert its keys. */
  readonly store: Map<string, string>;
}

/**
 * How a real store refuses, in the two shapes the app guards against.
 *
 * - `quota` — a full jar: writes throw, reads and removals still work. What a
 *   device with no room left does to a log no feature may fail over.
 * - `privacy-locked` — site data blocked outright: every accessor throws,
 *   including the enumeration a Facet-scoped wipe walks.
 */
export type StorageRefusal = "quota" | "privacy-locked";

export interface FakeLocalStorageOptions {
  /** Records already in the jar before the module under test reads it. */
  seed?: Record<string, string>;
  /**
   * Runs before each write lands, for a test asserting which keys are rewritten.
   * A refused write never lands, so on a refusing store it never runs.
   */
  onSet?: (key: string, value: string) => void;
  /** Runs on each read, for a test counting how often a module reaches for the store. */
  onGet?: (key: string) => void;
  /** Makes the store refuse the way a real one does. */
  refuses?: StorageRefusal;
}

function fakeLocalStorage(
  options: FakeLocalStorageOptions = {}
): FakeLocalStorage {
  const { seed, onSet, onGet, refuses } = options;
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  const locked = refuses === "privacy-locked";
  // Named after the DOM errors the app's `catch` blocks are written for. The
  // app reads neither message — what it must survive is the throw — but a fake
  // that threw `new Error("nope")` would read as a fault rather than as a jar.
  const blocked = (api: string): never => {
    throw new Error(`SecurityError: localStorage.${api} is blocked`);
  };
  const full = (): never => {
    throw new Error("QuotaExceededError");
  };
  return {
    store,
    get length() {
      if (locked) blocked("length");
      return store.size;
    },
    key: (i: number) =>
      locked ? blocked("key") : ([...store.keys()][i] ?? null),
    getItem: (k: string) => {
      if (locked) blocked("getItem");
      onGet?.(k);
      return store.has(k) ? store.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      if (locked) blocked("setItem");
      if (refuses === "quota") full();
      onSet?.(k, String(v));
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      if (locked) blocked("removeItem");
      store.delete(k);
    },
    clear: () => {
      if (locked) blocked("clear");
      store.clear();
    },
  };
}

/**
 * The fake, installed as the global the module under test will read.
 *
 * The only way in: an uninstalled store is a store nothing under test can see,
 * so `fakeLocalStorage` stays private until a suite has a use for one.
 */
export function stubLocalStorage(
  options: FakeLocalStorageOptions = {}
): FakeLocalStorage {
  const store = fakeLocalStorage(options);
  vi.stubGlobal("localStorage", store);
  return store;
}

/**
 * No `localStorage` at all — the Node runner, and a browser that has taken it
 * away entirely rather than made it throw.
 *
 * Stated rather than left to the runner's ambient absence: a suite that proves
 * this case by *not* stubbing proves nothing the day the environment changes.
 */
export function stubNoLocalStorage(): void {
  vi.stubGlobal("localStorage", undefined);
}

/**
 * A module that reads its globals at import, imported afresh.
 *
 * Stub whatever it will read first: the import is what snapshots.
 */
export async function freshModule<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return load();
}

/**
 * A fresh module and the jar it reads, in one step and in the right order:
 * `[the module, its store]`.
 */
export async function freshModuleWithStorage<T>(
  load: () => Promise<T>,
  options: FakeLocalStorageOptions = {}
): Promise<[T, FakeLocalStorage]> {
  const store = stubLocalStorage(options);
  return [await freshModule(load), store];
}
