import { describe, it, expect, vi, afterEach } from "vitest";
import { createBackStack } from "../../src/lib/ui/back-stack";
import { get } from "svelte/store";

/**
 * What Back means inside the app (ADR-0089 §7, ADR-0088 §3).
 *
 * The claim under test is not "a sheet closes" — a sheet has always had a `×`.
 * It is that the platform's own gesture spends **one** history entry per open
 * surface, in the order they were opened, and that a navigation the app asked
 * for itself is never mistaken for one the person made. Those are properties of
 * a counter and an event, so they are provable here; whether a phone emits the
 * gesture at all is not, and belongs to `tests/bottomsheet-demo.spec.ts`, which
 * drives a real browser's `goBack`.
 *
 * The fake is a history, not a spy. It keeps a depth, pops it when the person
 * presses Back, and delivers `popstate` **after** the call that caused it — the
 * asynchrony is the whole reason the stack counts its own navigations rather
 * than assuming the next event is the user's.
 */

/** A browser's history and its `popstate`, driven by the test. */
function fakeBrowser() {
  const listeners = new Set<() => void>();
  /** Entries above the one the app was loaded on. */
  let depth = 0;
  /** `popstate` events the browser owes us. */
  let owed = 0;
  let gone = 0;
  let left = 0;

  const win = {
    addEventListener(type: string, fn: () => void) {
      if (type === "popstate") listeners.add(fn);
    },
    history: {
      pushState() {
        depth += 1;
      },
      go(delta: number) {
        gone += 1;
        depth = Math.max(0, depth + delta);
        owed += 1;
      },
    },
  };

  return {
    win,
    /** How many entries this app has put on the stack. */
    depth: () => depth,
    /** How many navigations the app asked for itself. */
    navigations: () => gone,
    /** How many Backs fell off the end of the app's own entries. */
    departures: () => left,
    listening: () => listeners.size,
    /** The person's Back gesture: the entry goes, then the event arrives. */
    pressBack() {
      if (depth === 0) left += 1;
      else depth -= 1;
      owed += 1;
    },
    /** Deliver every `popstate` the browser owes, as it would on the next turn. */
    deliver() {
      while (owed > 0) {
        owed -= 1;
        for (const fn of listeners) fn();
      }
    },
  };
}

/** Let the stack's deferred reconciliation run. */
const settled = () => new Promise<void>((done) => queueMicrotask(() => done()));

afterEach(() => vi.unstubAllGlobals());

/** A stack over a fresh history, with the dismissals it hands out recorded. */
function harness() {
  const browser = fakeBrowser();
  vi.stubGlobal("window", browser.win);
  const stack = createBackStack();
  const dismissed: string[] = [];
  const enter = (kind: "sheet" | "mode", name: string) =>
    stack.enter(kind, () => dismissed.push(name));
  return { browser, stack, dismissed, enter };
}

describe("a Back stop owns exactly one history entry", () => {
  it("pushes one when a sheet opens", async () => {
    const { browser, enter } = harness();
    enter("sheet", "log");
    await settled();
    expect(browser.depth()).toBe(1);
  });

  it("spends it again when the sheet closes by its own control", async () => {
    const { browser, stack, dismissed, enter } = harness();
    const sheet = enter("sheet", "log");
    await settled();

    stack.leave(sheet);
    await settled();
    expect(browser.depth()).toBe(0);

    // The `popstate` that navigation produces arrives afterwards, and must not
    // read as a Back — there is nothing left open for it to close.
    browser.deliver();
    expect(dismissed).toEqual([]);
  });

  it("costs no navigation when one sheet replaces another in the same flush", async () => {
    const { browser, stack, enter } = harness();
    const first = enter("sheet", "log");
    await settled();
    expect(browser.navigations()).toBe(0);

    // The shape a replacement takes: the outgoing sheet unmounts and the
    // incoming one mounts before anything reconciles. One entry answers both,
    // and a `back()` racing a `push()` is a race the browser resolves, not us.
    stack.leave(first);
    enter("sheet", "recipe");
    await settled();

    expect(browser.depth()).toBe(1);
    expect(browser.navigations()).toBe(0);
  });

  it("is listening before it has pushed anything", async () => {
    const { browser, enter } = harness();
    expect(browser.listening()).toBe(0);

    enter("sheet", "log");
    // Before the reconciliation, so the order is asserted rather than inferred:
    // an entry nobody listens for is worse than no entry at all, because Back
    // then does nothing visible instead of leaving the app.
    expect(browser.listening()).toBe(1);
    expect(browser.depth()).toBe(0);

    await settled();
    expect(browser.depth()).toBe(1);
  });
});

describe("Back dismisses the top stop, not the app", () => {
  it("closes the sheet above and leaves the one beneath open", async () => {
    const { browser, dismissed, enter } = harness();
    enter("sheet", "settings");
    enter("sheet", "calculator");
    await settled();
    expect(browser.depth()).toBe(2);

    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["calculator"]);
    expect(browser.depth()).toBe(1);
    expect(browser.departures()).toBe(0);
  });

  it("takes a Selection and a sheet in the order they arrived (ADR-0088 §3)", async () => {
    // The case two owners of the top entry got wrong: the Selection bar's verbs
    // open sheets, so one Back used to close the sheet *and* clear the
    // Selection, leaving the Selection's own entry behind.
    const { browser, stack, dismissed, enter } = harness();
    const selection = enter("mode", "selection");
    const sheet = enter("sheet", "move-meal");
    await settled();

    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["move-meal"]);
    stack.leave(sheet);
    await settled();
    expect(browser.depth()).toBe(1);

    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["move-meal", "selection"]);
    stack.leave(selection);
    await settled();
    expect(browser.depth()).toBe(0);
  });

  it("leaves the app once nothing is stacked", async () => {
    const { browser, stack, dismissed, enter } = harness();
    const sheet = enter("sheet", "log");
    await settled();
    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["log"]);

    // A dismissal ends with its stop leaving, which is what the primitive's
    // does by unmounting the sheet. Nothing is left to answer the next Back.
    stack.leave(sheet);
    await settled();
    expect(browser.depth()).toBe(0);
    expect(browser.navigations()).toBe(0);

    browser.pressBack();
    browser.deliver();
    // Nothing of ours was on top, so the Back belonged to whatever came before
    // the app. It is not swallowed and it dismisses nothing twice.
    expect(dismissed).toEqual(["log"]);
    expect(browser.departures()).toBe(1);
  });
});

describe("the top sheet is the one that replaced the rest", () => {
  it("names the sheet above, and the one beneath again when it goes", async () => {
    const { stack, enter } = harness();
    const first = enter("sheet", "settings");
    expect(get(stack.topSheet)).toBe(first);

    const second = enter("sheet", "calculator");
    expect(get(stack.topSheet)).toBe(second);

    stack.leave(second);
    expect(get(stack.topSheet)).toBe(first);

    stack.leave(first);
    expect(get(stack.topSheet)).toBe(0);
    await settled();
  });

  it("is not moved by a mode, which covers nothing", async () => {
    // A Selection is a Back stop but not a surface: the bar sits at the foot of
    // the screen and the sheet beneath it, if any, is still the one on show.
    const { stack, enter } = harness();
    const sheet = enter("sheet", "log");
    enter("mode", "selection");
    expect(get(stack.topSheet)).toBe(sheet);
    await settled();
  });
});
