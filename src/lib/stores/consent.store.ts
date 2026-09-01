import { createQueryStore } from "./datoms.store";
import { derived } from "svelte/store";
import { dbClient } from "../db/db.client";
import { ingestEntity } from "../ingestion/ingest";
import { parseDatomValue } from "../db/datom-fold";
import { HLC_ORDER_ASC } from "../db/hlc";

/**
 * The consents, and nothing else. This module was `settings.store.ts` until
 * ADR-0085, which emptied it: **a setting is never a datom**, so every setting
 * moved to `stores/device-settings.ts` and `settings:global` disappeared.
 *
 * What is left is not a setting. A consent is a **recorded act** — the same
 * category as a logged meal, not the same category as a folded panel. Something
 * happened: at a moment you can name, the user agreed to something they can
 * state. That is a fact about the world, which is what the ledger is for. They
 * were called settings because they are toggles on a settings screen, which is a
 * fact about where the control is drawn and not about what the datom means.
 *
 * **One entity each, so no entity in the jar has two owners** (ADR-0076 §4, and
 * the predicate ADR-0079 §3's scoped wipe is derived from). The entity says what
 * was agreed; the datom's own stamp says when. Nothing else is stored, because
 * nothing else is known.
 *
 * The two counts differ because the two consents are about different kinds of
 * thing (ADR-0085 §3):
 *
 * - `off_contribute` governs an **act on the world**, so there is one of it —
 *   contributing to Open Food Facts is the same act whichever screen offers it.
 * - `log_export` governs an **egress door**, and each Facet has its own. The
 *   root's is `consent:log_export`; Rations gets `consent:food_log_export`
 *   (ADR-0080 §5), which has no writer until Rations has a settings surface and
 *   so is declared in `docs/eavt-vocabulary.md` rather than named here.
 *
 * Secrets stay out of the ledger for their own reason — a credential must not
 * sit in an undeletable, syncing log (ADR-0034 §8, see `stores/secrets.ts`) —
 * and so do log records, because redaction there is a deletion (ADR-0054 §4).
 */

/** Contributing corrected label data back to Open Food Facts. Food's (Rations'). */
const OFF_CONTRIBUTE_ENTITY = "consent:food_off_contribute";
/** Exporting the root Facet's local logs. The root's. */
const LOG_EXPORT_ENTITY = "consent:log_export";

/**
 * The one attribute every consent entity carries: a JSON boolean. Absent means
 * not granted, so a consent never given and one withdrawn read the same to the
 * code that gates on them and differ in the ledger, which is the point of
 * recording the act rather than storing a preference.
 */
const GRANTED = "consent/granted";

// Every consent in the jar, in HLC order so the collapse below is a plain
// last-one-wins. Scoped by entity prefix and never by attribute namespace
// (ADR-0076 §4); `consent:` bare is owned by nobody, which is fine here because
// this is a read of all of them rather than a Facet-scoped operation.
export const consentDatomsStore = createQueryStore<{
  entity: string;
  attribute: string;
  value: string;
  time: number;
}>(
  `SELECT entity, attribute, value, time FROM datoms WHERE entity LIKE 'consent:%' ORDER BY ${HLC_ORDER_ASC}`
);

export interface ConsentState {
  /**
   * The consent MASTER toggle for contributing corrected label data back to Open
   * Food Facts (ADR-0034 §8, model C). Default **off**. It is not itself the
   * consent to submit — it merely SEEDS the always-shown-before-submit
   * per-capture checkbox in the Custom form, which must still be ticked every
   * time.
   */
  off_contribute: boolean;
  /**
   * The consent MASTER toggle for exporting the root Facet's local logs
   * (ADR-0054 §4). Default **off**. It is not itself the consent to export — the
   * review sheet still shows the exact payload, and the channels are chosen
   * individually there, because bundling a `personal` channel with a `technical`
   * one behind one yes is a consent surface that does not mean what it appears
   * to.
   */
  log_export: boolean;
}

/**
 * Collapses the consent datoms to what is granted now. Only a literal `true`
 * grants: a malformed or legacy value can never enable a submission or an
 * export, which is the one direction this fold is allowed to be wrong in.
 */
export const consentStore = derived(consentDatomsStore, ($datoms) => {
  const consents: ConsentState = {
    off_contribute: false,
    log_export: false,
  };
  for (const d of $datoms) {
    if (d.attribute !== GRANTED) continue;
    const granted = parseDatomValue(GRANTED, d.value) === true;
    if (d.entity === OFF_CONTRIBUTE_ENTITY) consents.off_contribute = granted;
    else if (d.entity === LOG_EXPORT_ENTITY) consents.log_export = granted;
  }
  return consents;
});

// Appends one consent datom. The clock impurity (`Date.now()`) is deliberately
// inline here, as it is in every store that mints a stamp.
async function recordConsent(entity: string, granted: boolean): Promise<void> {
  await dbClient.append(
    ingestEntity({ entity, attributes: { [GRANTED]: granted } }, Date.now())
  );
}

/**
 * Records the OFF-contribution consent on its own entity (ADR-0034 §8, model C).
 * Its own writer, so a screen that does not own this consent cannot overwrite it.
 */
export async function saveOffContribute(enabled: boolean): Promise<void> {
  await recordConsent(OFF_CONTRIBUTE_ENTITY, enabled);
}

/**
 * Records the root Facet's local-log export consent on its own entity
 * (ADR-0054 §4). Rations' door is a separate consent and a separate entity
 * (ADR-0080 §5); this one never speaks for it.
 */
export async function saveLogExportConsent(enabled: boolean): Promise<void> {
  await recordConsent(LOG_EXPORT_ENTITY, enabled);
}
