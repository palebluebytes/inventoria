/**
 * The escape hatch for a shell that cannot start.
 *
 * `registerType: "prompt"` means a new service worker installs and then waits
 * for {@link ReloadPrompt}'s button to promote it. That button lives inside the
 * app, so a build that throws before it renders can never be replaced: the
 * browser keeps serving the broken shell out of the precache and the only thing
 * that could fix it is locked inside the thing that is broken. That is what a
 * pre-#125 install did when its `loro_wasm_bg-*.wasm` stopped existing on the
 * server — a 404 during module evaluation, a blank page, and no way out but the
 * user knowing to hard-reload.
 *
 * So the shell watches itself boot. If it has not mounted — because a module
 * threw on the way, or because nothing arrived at all — the guard drops the
 * service worker and its caches and reloads once, which puts the next load on
 * the network and therefore on whatever is currently deployed. Once only, and
 * never again in the same session: a shell that fails twice says so on the page
 * rather than reloading forever.
 *
 * Every capability it uses is injected, so the whole contract is exercised in
 * `tests/unit/boot-recovery.test.ts` without a DOM. `src/boot-guard.ts` is the
 * one place the real browser is wired in, and it is imported first by
 * `main.ts` — before the `App` graph it is guarding.
 */
export type BootGuardDeps = {
  /** Registers a handler for an uncaught error in the shell. */
  onShellError: (handler: () => void) => void;
  /** Runs `run` after `ms`; the returned function calls that off. */
  schedule: (ms: number, run: () => void) => () => void;
  /** Whether this session has already tried to recover. Survives the reload. */
  hasRecovered: () => boolean;
  markRecovered: () => void;
  /** Unregisters the worker and deletes its caches. */
  dropServiceWorker: () => Promise<void>;
  reload: () => void;
  /** Draws the last word when a recovered shell fails again. */
  showDeadEnd: () => void;
};

/**
 * How long the shell has to mount before the guard treats it as dead. Mounting
 * follows module evaluation by microseconds, so this is not a performance
 * budget: it is the margin for a slow device finishing work already in hand.
 */
const GRACE_MS = 10_000;

export function installBootGuard(
  deps: BootGuardDeps,
  graceMs: number = GRACE_MS
): { markMounted: () => void } {
  let settled = false;

  function failed() {
    if (settled) return;
    settled = true;

    // A second failure is the recovery itself failing. Reloading again would
    // only spin, so the page says what happened and stops.
    if (deps.hasRecovered()) {
      deps.showDeadEnd();
      return;
    }

    deps.markRecovered();
    deps.dropServiceWorker().then(deps.reload, deps.reload);
  }

  deps.onShellError(failed);
  const standDown = deps.schedule(graceMs, failed);

  return {
    markMounted() {
      settled = true;
      standDown();
    },
  };
}
