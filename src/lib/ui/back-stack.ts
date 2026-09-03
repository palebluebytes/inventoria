/**
 * The stack of things the platform Back gesture dismisses (ADR-0089 §7).
 *
 * A sheet on a phone is a screen, and until this existed the only way off one
 * was the `×` in its header: the gesture every Android user reaches for first
 * left the app instead, with the sheet still open behind it. That is the whole
 * of §7's second half. The first half is the same fact seen from the other side
 * — on a phone a sheet opened over a sheet **replaces** it (there is no dim to
 * see between two full-height surfaces), so Back is also the only thing that can
 * mean "return to the one beneath".
 *
 * **One stack, not one per feature, because Back is a single resource.** This is
 * not generality for its own sake: the Selection bar (ADR-0088 §3) already
 * pushed an entry of its own, under a comment claiming "ours is the
 * top entry — nothing else in this app pushes one", and its verbs open sheets.
 * Two owners of the top entry cannot both be right: one Back would have closed
 * the sheet *and* cleared the Selection, and left the Selection's entry behind.
 * So a Selection is a stop here too, and the ordering is the one the person saw
 * things arrive in.
 *
 * A **Back stop** is anything that answers Back rather than letting it leave:
 *
 * - `sheet` — an open `BottomSheet`. Only these are asked "am I the top one",
 *   because only these are replaced by the one above them.
 * - `mode` — a state that has taken the ordinary way off a screen away, which
 *   today is a live Selection covering the tab bar.
 *
 * ## The bookkeeping
 *
 * `owned` is how many history entries this stack has pushed; they are always the
 * topmost ones, and there is exactly one per stop. Everything else follows:
 *
 * - a stop arrives → push one entry;
 * - a stop leaves by its own control (`×`, Escape, an action that finishes) →
 *   the entry it pushed is now stale, so navigate back over it;
 * - a `popstate` that is **not** one of those navigations is the person's own
 *   Back → the entry is already gone, so dismiss the topmost stop and push
 *   nothing.
 *
 * Reconciliation is deferred to a microtask so that the two halves of a
 * *replacement* — one sheet unmounting as another mounts, in a single Svelte
 * flush — net to no navigation at all rather than a `back()` racing a `push()`
 * whose order the browser decides. It is the same reason a diff is applied once
 * per flush rather than per keystroke.
 *
 * **What this cannot repair.** A reload with sheets open leaves our entries in
 * the browser's history with nothing left that knows about them; the first Back
 * or two after that then land on a same-document entry and do nothing visible
 * before the third leaves the app. Recording sheet state in the URL is what
 * would fix it, and that is a router, which this app deliberately does not have.
 */
import { writable, type Readable } from "svelte/store";

/** Why something is on the stack. See the two bullets above. */
export type BackStopKind = "sheet" | "mode";

interface BackStop {
  id: number;
  kind: BackStopKind;
  dismiss: () => void;
}

export interface BackStack {
  /**
   * Take the top of the stack until the returned id is handed to `leave`.
   * `dismiss` is what Back means for this stop, and it **must** end with that
   * stop leaving — the primitive's closes the sheet, which unmounts it.
   */
  enter(kind: BackStopKind, dismiss: () => void): number;
  /** Give it up. Idempotent: an id already gone is a no-op. */
  leave(id: number): void;
  /**
   * The topmost `sheet` stop's id, or 0 when none is open. A sheet compares its
   * own id with this to know whether a sheet above has replaced it; a `mode`
   * over a sheet does not, because a Selection bar is not a surface that covers
   * anything.
   */
  topSheet: Readable<number>;
}

/**
 * A stack bound to the document's history. There is one, exported below; this
 * exists so a test can drive a fresh one rather than reach into the shared one's
 * bookkeeping, which is precisely the state a second test would inherit.
 */
export function createBackStack(): BackStack {
  const stops: BackStop[] = [];
  const topSheet = writable(0);

  /** Ids are never reused, so a `leave` from a stop that already left is inert. */
  let lastId = 0;
  /** History entries this stack has pushed — always the topmost ones. */
  let owned = 0;
  /** Navigations this stack asked for, whose `popstate` is therefore not a Back. */
  let selfPops = 0;
  let listening = false;
  let scheduled = false;

  const publish = () => {
    let i = stops.length - 1;
    while (i >= 0 && stops[i].kind !== "sheet") i--;
    topSheet.set(i < 0 ? 0 : stops[i].id);
  };

  const onPop = () => {
    // Our own `go(-n)` coming back. One `popstate` per call, whatever `n` was.
    if (selfPops > 0) {
      selfPops -= 1;
      return;
    }
    // Nothing of ours is on top of the history, so this Back belongs to whatever
    // was there before the app — a genuine navigation, and not ours to swallow.
    if (owned === 0) return;
    owned -= 1;
    // Deliberately no reconcile here. The dismissal removes its own stop, and
    // the `leave` that follows schedules one that finds the counts already
    // level. Scheduling one now would race a dismissal that unmounts on the next
    // flush and push back the entry the person just spent.
    stops[stops.length - 1]?.dismiss();
  };

  const reconcile = () => {
    scheduled = false;
    if (typeof window === "undefined") return;
    while (owned < stops.length) {
      owned += 1;
      window.history.pushState({ inventoriaBackStop: true }, "");
    }
    if (owned > stops.length) {
      const spent = owned - stops.length;
      owned = stops.length;
      selfPops += 1;
      window.history.go(-spent);
    }
  };

  const settle = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(reconcile);
  };

  return {
    enter(kind, dismiss) {
      // The listener and the first push are installed together, and only here.
      // An entry nobody is listening for is strictly worse than no entry: Back
      // would appear to do nothing at all instead of leaving the app.
      if (!listening && typeof window !== "undefined") {
        listening = true;
        window.addEventListener("popstate", onPop);
      }
      lastId += 1;
      stops.push({ id: lastId, kind, dismiss });
      publish();
      settle();
      return lastId;
    },

    leave(id) {
      const at = stops.findIndex((stop) => stop.id === id);
      if (at === -1) return;
      stops.splice(at, 1);
      publish();
      settle();
    },

    topSheet: { subscribe: topSheet.subscribe },
  };
}

/**
 * The document's stack. One per document, like the visible band it serves
 * (`ui/viewport-inset.ts`): both are properties of the screen a person is
 * looking at rather than of any one view, and both die with the page.
 */
export const {
  enter: enterBackStop,
  leave: leaveBackStop,
  topSheet,
} = createBackStack();
