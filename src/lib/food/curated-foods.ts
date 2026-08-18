import type { EntityPayload } from "../ingestion/ingest";
import { mapOffProductToPayload } from "./open-food-facts";
import { CURATED_STAND_INS, type CuratedStandIn } from "./curated-stand-ins";

// ---------------------------------------------------------------------------
// Curated stand-ins (ADR-0046): reaching them, and saying what they are
// ---------------------------------------------------------------------------
//
// The table itself — the pinned OFF snapshots and the evidence admitting each
// one — lives in `curated-stand-ins.ts`, which stays type-import-only so the
// quarterly staleness check can read it under a bare Node. This module is the
// part that needs the app: matching a query to an entry, mapping the snapshot
// through the ordinary OFF mapper, and wording the disclosure a stand-in owes
// the reader (§5).
//
// Re-exported here so the table keeps one public face: callers ask
// `curated-foods` for curated things and do not need to know about the split.
// ---------------------------------------------------------------------------

export { CURATED_CEILING, CURATED_STAND_INS } from "./curated-stand-ins";
export type { CuratedStandIn } from "./curated-stand-ins";

/** Words of a phrase, lowercased, punctuation dropped ("Cacao-nibs" → two). */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Loose singular/plural equality, the same rule ADR-0042 §1 uses to match a query
// word against a food's usually-plural head noun: "nib" reaches "nibs", while a
// different word sharing the prefix does not.
const stem = (w: string): string => w.replace(/s$/, "");

/** One curated entry a query reached, and how squarely it hit. */
export interface CuratedMatch {
  entry: CuratedStandIn;
  payload: EntityPayload;
  /**
   * True when the query IS one of the aliases (modulo plural) rather than merely
   * a prefix of one. Exact matches lead the result list; partial ones trail the
   * USDA results, so a broad query never displaces a real reference food.
   */
  exact: boolean;
}

/**
 * The curated stand-ins a free-text query reaches (ADR-0046 §1), each already
 * mapped to a payload by the ordinary OFF mapper. Pure and synchronous — the
 * snapshots are in the bundle, so this costs no network and cannot fail.
 *
 * Two tiers, mirroring ADR-0042 §1's structural ranking rather than inventing a
 * second one: a query whose words EQUAL an alias's words is an exact hit and
 * leads; a query whose every word prefix-matches an alias word is partial and
 * trails. So "cacao nibs" and "nib" lead, "cocoa" trails behind USDA's cocoa
 * powder, and "cocoa butter" reaches nothing here at all.
 */
export function curatedMatches(query: string): CuratedMatch[] {
  const queryWords = wordsOf(query);
  if (queryWords.length === 0) return [];

  const matches: CuratedMatch[] = [];
  for (const entry of CURATED_STAND_INS) {
    let exact = false;
    let partial = false;
    for (const alias of entry.aliases) {
      const aliasWords = wordsOf(alias);
      // Exact: same number of words, each pairing up modulo plural, in order.
      if (
        aliasWords.length === queryWords.length &&
        aliasWords.every((w, i) => stem(w) === stem(queryWords[i] ?? ""))
      ) {
        exact = true;
        break;
      }
      // Partial: every typed word is the start of some alias word. This is the
      // mid-type case ("cacao ni"), and the broad-query case ("cocoa").
      if (
        queryWords.every((t) => aliasWords.some((w) => w.startsWith(t))) ||
        queryWords.every((t) => aliasWords.some((w) => stem(w) === stem(t)))
      )
        partial = true;
    }
    if (exact || partial)
      matches.push({
        entry,
        payload: mapOffProductToPayload(entry.snapshot),
        exact,
      });
  }
  return matches;
}

/**
 * The curated entry a food twin IS, by entity id, or undefined for every other
 * food. Lets a surface tell the user that this OFF product is standing in for a
 * base food USDA does not carry (ADR-0046 §5) — the one genuinely uncomfortable
 * part of the decision, and the reason it is disclosed rather than hidden.
 *
 * Keyed on the entity rather than the name so a food re-opened from the ledger
 * still recognises itself: the twin a curated search stages is byte-comparable
 * with the one a scan of the same pack produces, and both are `gtin:<code>`.
 */
export function curatedStandInFor(
  entity: string | undefined
): CuratedStandIn | undefined {
  if (!entity) return undefined;
  return CURATED_STAND_INS.find(
    (entry) => `gtin:${entry.snapshot.code}` === entity
  );
}

/** The disclosure a curated stand-in owes the reader (ADR-0046 §5). */
export interface CuratedStandInNote {
  /** What is missing, named as the food rather than as a failure. */
  headline: string;
  /** Which product is standing in, and when it was captured. */
  body: string;
}

/**
 * The stand-in disclosure copy (ADR-0046 §5), assembled from the entry rather
 * than written per surface — a branded record presented as a generic reference
 * food is the uncomfortable part of this decision, and ADR-0045 §4 already sets
 * the standard: a panel must never present itself as something it is not.
 *
 * Pure and table-testable, so the wording is asserted in one place. The brand is
 * folded in only when the snapshot carries one, so an own-brand-less record reads
 * as a product name rather than as "undefined".
 */
export function curatedStandInNote(entry: CuratedStandIn): CuratedStandInNote {
  const p = entry.snapshot.product;
  const product = [p.brands, p.product_name].filter(Boolean).join(" ");
  return {
    headline: `No reference table carries ${entry.food}.`,
    body: `These figures are one specific product standing in for it: ${
      product || entry.food
    }, from Open Food Facts, captured ${entry.captured}. Scanning your own pack will usually be closer to what you are eating.`,
  };
}
