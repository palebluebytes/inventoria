import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createBackStack,
  type BackStopKind,
} from "../../src/lib/ui/back-stack";
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
      // A traversal the app asked for. The browser runs it as a task and the
      // `popstate` lands afterwards, which is why the fake owes one rather than
      // calling straight back into the stack.
      back() {
        gone += 1;
        depth = Math.max(0, depth - 1);
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
  const enter = (kind: BackStopKind, name: string) =>
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

  it("pushes nothing while a Back of its own is still in flight", async () => {
    // The replacement that does NOT land in one flush: a sheet closes, and what
    // its `onClose` sets is what mounts the next one. Pushing an entry while the
    // browser has a traversal queued and unrun is a race the browser resolves,
    // and the stack would be counting an entry that may not survive it.
    const { browser, stack, enter } = harness();
    const first = enter("sheet", "log");
    await settled();

    stack.leave(first);
    await settled();
    expect(browser.navigations()).toBe(1);

    enter("sheet", "recipe");
    await settled();
    expect(browser.depth()).toBe(0);

    // The pop that ends the traversal is what lets the next entry be pushed.
    browser.deliver();
    await settled();
    expect(browser.depth()).toBe(1);
    expect(browser.navigations()).toBe(1);
  });

  it("gives back one entry per pass when several stops leave at once", async () => {
    // A Selection whose verb opened a sheet, both ending on the same action.
    // One `back()` per pass, so nothing has to assume how many `popstate` events
    // a multi-entry traversal produces.
    const { browser, stack, enter } = harness();
    const mode = enter("mode", "selection");
    const sheet = enter("sheet", "move-meal");
    await settled();
    expect(browser.depth()).toBe(2);

    stack.leave(sheet);
    stack.leave(mode);
    await settled();
    expect(browser.depth()).toBe(1);

    browser.deliver();
    await settled();
    expect(browser.depth()).toBe(0);
    expect(browser.navigations()).toBe(2);
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

describe("a place stop walks one rung per press", () => {
  /**
   * The replacement path, which is what ADR-0114 §14's one-stop rule is made of.
   *
   * A shell holds **one** `place` stop whose `dismiss` is "up one level", so the
   * stop that answers a press is replaced by the next one down in the same Svelte
   * flush: `dismiss` walks the way back, the face republishes `faceBack`, and the
   * effect's teardown and re-run are the leave and the enter. This path has
   * existed since ADR-0089 §7 and has only ever been exercised by a sheet
   * unmounting as another mounts, so it is proved here rather than assumed.
   *
   * **The two rungs are walked by two controls and the bookkeeping differs**, and
   * #539's trace ran them together. A Back press spends the entry itself, so the
   * replacement has nothing to net and `reconcile` finds one entry to **push
   * back** — the property that matters being that the next press is answered by
   * the stack rather than leaving the app. The title walks the same rung having
   * spent nothing, and there the deferral is load-bearing: the leave and the enter
   * must cancel, or walking up a level costs a history entry the person never
   * pressed for. So "one owned entry throughout" holds for the title and not for
   * Back, where it goes 1 → 0 → 1 within the press.
   */
  it("replaces its stop in the flush the Back dismissed it in", async () => {
    const { browser, stack, dismissed, enter } = harness();
    // Standing on the Reports page: one stop, whose way up is the day.
    const page = enter("place", "reports");
    await settled();
    expect(browser.depth()).toBe(1);

    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["reports"]);

    // What `dismiss` did: `page = null`, which republishes `faceBack` as `null`
    // and re-runs the effect. Both halves land before anything reconciles.
    stack.leave(page);
    const day = enter("place", "rations");
    await settled();

    // One rung spent, one entry still owned, and no navigation of our own — a
    // `back()` here would have been the stack spending a second entry for a
    // press the person made once.
    expect(browser.depth()).toBe(1);
    expect(browser.navigations()).toBe(0);
    expect(browser.departures()).toBe(0);

    // And the next press walks the last rung, to the start destination.
    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["reports", "rations"]);
    stack.leave(day);
    await settled();
    expect(browser.depth()).toBe(0);
  });

  it("spends no entry when the title walks the rung instead", async () => {
    // The other control on the same rung (ADR-0091 §5): the face's own title,
    // which calls the identical `go()` with no press behind it. Nothing was
    // spent, so the leave and the enter must cancel — a `back()` here would
    // charge the person a history entry for a tap that was not Back, which is
    // also what a stop-per-page design would have done on every crossing.
    const { browser, stack, enter } = harness();
    const page = enter("place", "reports");
    await settled();
    expect(browser.depth()).toBe(1);

    stack.leave(page);
    enter("place", "rations");
    await settled();

    expect(browser.depth()).toBe(1);
    expect(browser.navigations()).toBe(0);
  });

  it("is under the panel it was standing behind, so Back closes the panel only", async () => {
    // Standing on a face with the switcher open: the face was entered first, so
    // the ordering is right by construction rather than by a rule (ADR-0114 §14).
    const { browser, stack, dismissed, enter } = harness();
    const place = enter("place", "media");
    const panel = enter("sheet", "switcher");
    await settled();
    expect(browser.depth()).toBe(2);

    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["switcher"]);
    stack.leave(panel);
    await settled();
    expect(browser.depth()).toBe(1);

    // The face is still where it was, and its stop is the one left to answer.
    browser.pressBack();
    browser.deliver();
    expect(dismissed).toEqual(["switcher", "media"]);
    stack.leave(place);
    await settled();
    expect(browser.depth()).toBe(0);
  });

  it("is not the top sheet, so a BottomSheet never compares itself to a face", async () => {
    // §14's reason for a third kind rather than reusing `sheet`: `topSheet` names
    // the surface a sheet asks whether it has been replaced by, and a face is not
    // one. A place stop above an open sheet must leave that answer alone.
    const { stack, enter } = harness();
    const sheet = enter("sheet", "log");
    enter("place", "media");
    expect(get(stack.topSheet)).toBe(sheet);
    await settled();
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
