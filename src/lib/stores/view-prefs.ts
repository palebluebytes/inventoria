import { writable } from "svelte/store";

/**
 * View preferences the **first paint** depends on, held in `localStorage`.
 *
 * This is a third reason to keep something out of the append-only EAVT ledger,
 * distinct from the two already recorded. A secret must not live there because
 * the ledger is undeletable and it syncs (ADR-0034 §8); a log record must not
 * because redaction is a deletion and the cap removes entries (ADR-0054 §4).
 * This one is about *when* a value can be read rather than what it is.
 *
 * Every ledger-backed store is asynchronous by construction: `createQueryStore`
 * holds an empty array until its first `dbClient.query` resolves, and that query
 * waits on the worker spawning, SQLite WASM loading and OPFS opening. On a cold
 * start that is seconds, and for all of them a settings read returns the *unset
 * default*. A preference that only changes how a number formats can absorb
 * that — the numbers are not there yet either. A preference that decides whether
 * a whole block of the page is shown cannot: the page renders the default,
 * visibly wrong, until the ledger catches up.
 *
 * `localStorage` is synchronous, so a value read here is correct in the first
 * frame. The cost is that these do not sync across devices and are not part of
 * history, which is the right trade for view state that has no history worth
 * keeping.
 */

// Namespaced like the secrets module, so a preference cannot collide with other
// app state (e.g. `inventoria_test_state`).
const LS_KEY_NUTRITION_PANEL_OPEN = "inventoria_pref_nutrition_panel_open";

// `localStorage` is absent under the Node unit runner (and can throw in a
// privacy-locked browser), so every access is guarded — a missing store reads as
// unset and writes are no-ops.
function safeGet(lsKey: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(lsKey);
  } catch {
    return null;
  }
}

function safeSet(lsKey: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(lsKey, value);
  } catch {
    /* privacy-locked / quota-exceeded — the preference just doesn't persist */
  }
}

/**
 * Whether the dashboard's nutrition panel is unfolded. Unset reads as open, and
 * only a stored `"false"` shuts it — the same absent-means-on shape
 * `settings/food/round_nutrition` uses, so an existing user meets the panel as
 * they left it and a new one meets it open.
 */
function readNutritionPanelOpen(): boolean {
  return safeGet(LS_KEY_NUTRITION_PANEL_OPEN) !== "false";
}

const nutritionPanel = writable<boolean>(readNutritionPanelOpen());

/** Reactive fold state for the dashboard's nutrition panel. */
export const nutritionPanelOpen = { subscribe: nutritionPanel.subscribe };

/**
 * Records the panel's fold. Appends **no datom**: this is view state whose only
 * job is to be correct before the ledger is awake.
 */
export function setNutritionPanelOpen(open: boolean): void {
  safeSet(LS_KEY_NUTRITION_PANEL_OPEN, String(open));
  nutritionPanel.set(open);
}
