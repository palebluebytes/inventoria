import { ENTITY_PREFIXES, type EntityPrefix } from "./registry";

/**
 * The one place an entity id is constructed (ADR-0086 §7).
 *
 * ADR-0076 §4 documented the one-owner rule and `isbn:` collided with the Items
 * scraper anyway, because the defect was never in the documentation: it was a
 * place where the **code** minted something the documentation did not know
 * about. A gate that reads only the registry passes straight through every one
 * of those. So the invariant is made true by construction instead, and the gate
 * is reduced to checking that this is the only door
 * (`scripts/entity-ownership-check.mjs`).
 *
 * A scan alone was rejected. It is the same species of artifact as the prefix
 * list that rotted — a claim about code that nobody re-reads, passing quietly
 * the day someone adds a seventeenth minting site.
 *
 * **Reads route through here too**, not only mints. A caller reconstructing an
 * id to look it up (a scanned barcode, a curated stand-in) has to build the same
 * string the mint did, so if the prefix ever changes it must change with it.
 */
export function mintEntity(
  prefix: EntityPrefix,
  suffix: string | number
): string {
  return `${prefix}${suffix}`;
}

/**
 * Whether a string is an entity id the registry accounts for. Used by the ledger
 * import path and by tests; deliberately not used by {@link mintEntity}, whose
 * prefix argument is already a compile-time union.
 */
export function isDeclaredEntity(entity: string): boolean {
  return ENTITY_PREFIXES.some((p) => entity.startsWith(p));
}
