import { describe, it, expect, vi } from "vitest";
import {
  installBootGuard,
  type BootGuardDeps,
} from "../../src/lib/boot-recovery";

/** Lets the guard's promise chain settle before the assertion reads it. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness(overrides: Partial<BootGuardDeps> = {}) {
  let fire: () => void = () => {};
  let expire: () => void = () => {};
  const cancel = vi.fn();
  let recovered = false;

  const deps: BootGuardDeps = {
    onShellError: (handler) => {
      fire = handler;
    },
    schedule: (_ms, run) => {
      expire = run;
      return cancel;
    },
    hasRecovered: () => recovered,
    markRecovered: vi.fn(() => {
      recovered = true;
    }),
    dropServiceWorker: vi.fn(async () => {}),
    reload: vi.fn(),
    showDeadEnd: vi.fn(),
    ...overrides,
  };

  return {
    deps,
    cancel,
    guard: installBootGuard(deps),
    shellThrows: () => fire(),
    graceExpires: () => expire(),
    setRecovered: (value: boolean) => {
      recovered = value;
    },
  };
}

describe("boot guard", () => {
  it("drops the worker and reloads when the shell throws before it mounts", async () => {
    const h = harness();
    h.shellThrows();
    await flush();

    expect(h.deps.dropServiceWorker).toHaveBeenCalledTimes(1);
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
    expect(h.deps.markRecovered).toHaveBeenCalledTimes(1);
  });

  it("drops the worker and reloads when nothing mounts inside the grace period", async () => {
    const h = harness();
    h.graceExpires();
    await flush();

    expect(h.deps.dropServiceWorker).toHaveBeenCalledTimes(1);
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it("stands down once the app mounts, so a later error is not a boot failure", async () => {
    const h = harness();
    h.guard.markMounted();
    expect(h.cancel).toHaveBeenCalledTimes(1);

    h.shellThrows();
    h.graceExpires();
    await flush();

    expect(h.deps.dropServiceWorker).not.toHaveBeenCalled();
    expect(h.deps.reload).not.toHaveBeenCalled();
  });

  it("recovers once however many times the shell throws", async () => {
    const h = harness();
    h.shellThrows();
    h.shellThrows();
    h.graceExpires();
    await flush();

    expect(h.deps.dropServiceWorker).toHaveBeenCalledTimes(1);
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it("says so rather than looping when the reloaded shell fails too", async () => {
    const h = harness();
    h.setRecovered(true);
    h.shellThrows();
    await flush();

    expect(h.deps.reload).not.toHaveBeenCalled();
    expect(h.deps.dropServiceWorker).not.toHaveBeenCalled();
    expect(h.deps.showDeadEnd).toHaveBeenCalledTimes(1);
  });
});
