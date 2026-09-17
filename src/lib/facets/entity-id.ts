import { ENTITY_PREFIXES, type EntityPrefix } from "./domains";

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
 * The suffix a **derived** entity id is minted under: the first half of a
 * SHA-256 over `content`, rendered hex.
 *
 * ADR-0014's stated purpose for the whole prefix scheme — "two offline devices
 * must independently generate the exact same entity identifier so that their
 * datoms merge cleanly" — is reached by making the id a fingerprint of what the
 * entity *is*, so that computing it twice is landing on it twice. A random mint
 * cannot do that: it is fresh on every call, so the second device, or the second
 * occasion, gets a rival entity holding the same facts.
 *
 * Half a digest rather than the whole of it, because 128 bits is already past
 * any collision this app can reach and a 64-character entity id is read by
 * people. What goes *into* `content` is the caller's decision and the
 * interesting one: it fixes what counts as the same thing (ADR-0073 §5 hashes a
 * sent meal's root; ADR-0110 §4 hashes a dish's sorted ingredient refs).
 *
 * `worker/src/index.ts` renders a digest to hex a second time and stays that
 * way — `scripts/worker-closure-check.mjs` pins what the edge script may
 * compile in, so sharing these lines would mean moving app code to the edge to
 * save them.
 */
export async function digestSuffix(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content)
  );
  const half = new Uint8Array(digest).subarray(0, 16);
  return [...half].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Whether a string is an entity id the registry accounts for. Used by the ledger
 * import path and by tests; deliberately not used by {@link mintEntity}, whose
 * prefix argument is already a compile-time union.
 */
export function isDeclaredEntity(entity: string): boolean {
  return ENTITY_PREFIXES.some((p) => entity.startsWith(p));
}
