/**
 * A `LockManager` for the suites that prove something is serialised (#418).
 *
 * The Web Locks API is secure-context only and the Node unit runner has a
 * `navigator` with no `locks` on it, so a suite that wants the lock has to
 * bring one. This is a real exclusive lock rather than a spy: every request for
 * a name chains onto the previous holder's completion, so a caller that takes
 * it second genuinely does not start until the first has returned. A fake that
 * only recorded the call would let an unserialised interleave pass.
 *
 * It implements the one mode the app uses. `"shared"` is not offered and
 * `query()` throws rather than lying, because a fake that answered a question
 * nothing asks is a shape to maintain for nothing.
 */
import { vi } from "vitest";

export interface FakeLockManager extends LockManager {
  /** Every name requested, in the order the requests arrived. */
  readonly requested: string[];
}

function fakeLockManager(): FakeLockManager {
  const requested: string[] = [];
  /** The tail of each name's queue: what the next requester waits behind. */
  const queued = new Map<string, Promise<void>>();

  const request: LockManager["request"] = async <T>(
    name: string,
    second: LockOptions | LockGrantedCallback<T>,
    third?: LockGrantedCallback<T>
  ): Promise<Awaited<T>> => {
    const granted = typeof second === "function" ? second : third;
    if (granted === undefined) {
      throw new TypeError("request() was given no callback");
    }
    requested.push(name);
    // The queue is joined before anything is awaited, so requests are served in
    // the order they were made rather than in the order their waits happen to
    // resolve.
    const ahead = queued.get(name) ?? Promise.resolve();
    let release!: () => void;
    queued.set(name, new Promise<void>((resolve) => (release = resolve)));
    await ahead;
    try {
      // Awaited rather than returned raw: a real `request()` holds the lock
      // until the callback's promise **settles**, and resolves with its value.
      return await granted({ name, mode: "exclusive" });
    } finally {
      // Released however the holder finished: a lock a rejected callback never
      // gave back would deadlock the suite rather than fail it.
      release();
    }
  };

  return {
    requested,
    request,
    query: () => {
      throw new Error("query() is not implemented");
    },
  };
}

/**
 * The fake, installed as the global the module under test will read.
 *
 * `local-storage.ts`'s rule, for the same reason: an uninstalled manager is one
 * nothing under test can see, so the builder stays private.
 */
export function stubLockManager(): FakeLockManager {
  const locks = fakeLockManager();
  vi.stubGlobal("navigator", { locks });
  return locks;
}

/**
 * A browser with no Web Locks at all — the Node runner, and an insecure
 * context, where the API is not exposed.
 *
 * Stated rather than left to the runner's ambient absence: a suite that proves
 * this case by *not* stubbing proves nothing the day the environment changes.
 */
export function stubNoLockManager(): void {
  vi.stubGlobal("navigator", {});
}
