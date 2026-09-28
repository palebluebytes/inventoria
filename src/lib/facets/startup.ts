/**
 * The errands a Facet's entry point runs on a real load of the app.
 *
 * There are two entry points now — `src/main.ts` (Inventoria) and
 * `src/food-main.ts` (Rations, #301) — and these are the ones that belong to the
 * **Jar** rather than to any one screen. They live in one list because the
 * failure that list prevents had already been written: `ensurePersistentStorage`
 * sat inside `App.svelte`, so a second entry point would have opened the same
 * OPFS ledger and silently never asked the browser to keep it (ADR-0065). A
 * shared list is the only shape in which a third entry point cannot miss one.
 *
 * One member is the **document's** rather than the Jar's: the visible band
 * (ADR-0089 §1). It is here because it has the same shape of failure — two
 * shells publish it or a phone's sheets run under the keyboard on whichever one
 * forgot — and because it must run *below* ADR-0069's boot guard rather than in
 * `mountFacet` above it, where a throw would be read as "this shell cannot
 * start" and wipe the service worker and every cache over a layout measurement.
 *
 * Three things are deliberately **not** here. The receive link and the iOS code
 * handover are the root's, because both are about a URL that arrives at `/`
 * (ADR-0074 §8, ADR-0082 §2) and a Facet does not forward a hand-off aimed at
 * the other (ADR-0078 §6). The ledger is not opened here: that call has to be
 * made synchronously from the entry's own shell, before any child view
 * subscribes to a store, and moving it behind a function would put a tempting
 * `await` in front of it.
 *
 * And the **USDA warm left this list** (ADR-0114 §13). It qualified while food
 * was the landing screen of both Facets, which is the sentence the comment on it
 * used to open with; the root lands on the grid of faces now, so warming ~960 KB
 * of search index here would be an errand run for a screen that never reads it.
 * It belongs to the face that searches food rather than to the entry that
 * mounted the shell, and `warmUsdaCorpus`'s own doc carries the schedule. This
 * is the first member to leave, and what it leaves behind is the test of
 * membership: an errand is the Jar's when a second entry point missing it would
 * be a silent defect, and a warm nobody asked for is not one.
 */
import { clearRetiredSecrets } from "../stores/secrets";
import { ensurePersistentStorage } from "../storage/persistent-storage";
import { startViewportInset } from "../ui/viewport-inset";

/**
 * Run them. Called from `onMount`, after the ledger has been kicked off and
 * never before it, and never on a page that is telling the user this jar is not
 * theirs (ADR-0082 §8).
 *
 * Nothing here is awaited and nothing here can reject: each is a startup errand
 * whose answer changes nothing about the load.
 */
export function runStartupErrands(): void {
  // Take the retired USDA API key off the device (ADR-0047 §1). On every entry
  // because the key is on the device rather than in a Facet.
  clearRetiredSecrets();
  // Ask the browser to keep the ledger rather than leaving it evictable
  // (ADR-0065). Not awaited: the answer changes nothing about the load, and the
  // request is memoised, so the Settings readout reaches this same decision
  // instead of asking a second time.
  void ensurePersistentStorage();
  // Publish the visible band (ADR-0089 §1). The disposer is dropped on purpose:
  // the band belongs to the document and dies with it, and `startViewportInset`
  // is idempotent, so there is nothing for a second call to leak.
  startViewportInset();
}
