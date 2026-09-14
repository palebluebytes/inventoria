/**
 * A lane's scope: the Tracked Domains a pairing carries, and nothing else
 * (ADR-0103 §1, §2 and §3).
 *
 * **A pairing carries the rows of the Tracked Domains held by the Facet the
 * pairing act ran in, and the root Facet's scope is the whole Jar.** One rule,
 * with root-to-root as its unrestricted case rather than a second mechanism.
 * It is the fourth application of ADR-0086 §1's key — the Tracked Domain is the
 * unit of ownership — after the wipe's predicate (ADR-0079 §3) and hand-off
 * ownership (ADR-0084 §1), so it is not a new vocabulary.
 *
 * **The scope binds rows, never the peer** (§2). Nothing here learns which
 * Facets the other device has installed, and there would be nothing to enforce
 * if it did: both Facets are one origin and one Jar, and on iOS WebKit keys
 * storage by origin alone (#286). A Rations-only phone pairing with a laptop
 * that also has the root installed is therefore ordinary rather than an edge
 * case, and {@link laneScope} gives it a food lane without anyone choosing one.
 *
 * **The predicate is derived and never authored.** A scope is a list of domain
 * ids, and `entityPrefixesOfDomains` is what turns one into the prefixes the
 * read seam narrows by — the same function `facet-wipe.ts` reaches through
 * `entityPrefixesOf`. A hand-written second list is the drift ADR-0079 §3
 * forbids.
 *
 * **A scope is a list of ids rather than of domains**, for
 * `version-vector.ts`' reason one field along: it is written into a
 * `localStorage` record and stated on a wire, so a device on a later build can
 * name a domain this one has never heard of. Such a domain is **inert** — no
 * row here can belong to it, so it narrows nothing and withholds nothing.
 */

import {
  CONTENT_DOMAINS,
  domainsOf,
  TRACKED_DOMAINS,
  type FacetId,
  type TrackedDomain,
} from "../facets/registry";

/**
 * The Tracked Domains a lane carries, by id, in the registry's own order.
 *
 * The order is not decoration: both ends of a lane compute the same scope from
 * the same two statements, and a scope spelled two ways is two records of one
 * fact for a later reader to reconcile.
 */
export type LaneScope = readonly string[];

/**
 * Every domain on the roster: the whole Jar, and so the root Facet's scope.
 *
 * It is also what an **absent** statement is read as, in both places one can be
 * absent — a peer on a build that states nothing, and a Paired Device record
 * written before this field existed. Both predate the pairing surface leaving
 * the root (ADR-0084 §6), and the root's lane was jar-wide, so the reading is
 * the sound one rather than the convenient one.
 */
export const WHOLE_JAR: LaneScope = TRACKED_DOMAINS.map((domain) => domain.id);

/**
 * What a pairing act run in this Facet scopes its lane to.
 *
 * **The root's whole-Jar scope is derived here rather than keyed on its name.**
 * A Facet's own domains are its content domains; what a Facet holding *every*
 * content domain gains with them is the **Jar domain**, which no Facet declares
 * and which owns the `deletion:` rows a Carried deletion is written as. That
 * follows from ADR-0103 §6 rather than being asserted beside it: a deletion
 * crosses a lane only where its frozen prefix list is a subset of the lane's,
 * and a lane covering every content domain covers every list a Facet-scoped
 * wipe can freeze. A narrower lane covers only some, so it does not carry the
 * Jar domain at all.
 */
export function scopeOfFacet(facetId: FacetId): LaneScope {
  const held = domainsOf(facetId).map((domain) => domain.id);
  return CONTENT_DOMAINS.every((domain) => held.includes(domain.id))
    ? WHOLE_JAR
    : held;
}

/**
 * The Tracked Domains a scope names, in the registry's own order.
 *
 * **The roster is what is walked, never the scope.** A scope is a list of ids
 * off a wire or a `localStorage` record, so it can name a domain this build has
 * never heard of and can spell the ones it does know in any order. Walking the
 * roster answers both at once: an unknown id has no domain to yield, and what
 * comes back is in the one order every reader of a scope sees.
 *
 * It is the shape {@link laneScope} intersects with and the shape a surface
 * names a lane's contents from (ADR-0103 §10), which is why it is here rather
 * than in either caller: the second copy of this walk is where an unknown id
 * starts being dropped in one place and admitted in the other.
 */
export function domainsOfScope(scope: LaneScope): TrackedDomain[] {
  return TRACKED_DOMAINS.filter((domain) => scope.includes(domain.id));
}

/**
 * The lane two sides agree on: the intersection of what each stated (§3).
 *
 * root↔root is the whole Jar, Rations↔Rations is food, Rations↔root is food —
 * automatically, and with nobody choosing. **Intersection is the only rule that
 * is symmetric**, and a lane whose two ends ran different predicates would have
 * each side filtering `above` over a different domain set, which is a silent
 * divergence rather than an error.
 *
 * Walking the roster rather than either argument is what makes it symmetric in
 * spelling as well as in membership, and it is also what keeps a domain only
 * the peer knows out: this device can attribute no row to one, so carrying it
 * in the scope would be a promise about rows that cannot exist here.
 */
export function laneScope(ours: LaneScope, theirs: LaneScope): LaneScope {
  return domainsOfScope(ours)
    .filter((domain) => theirs.includes(domain.id))
    .map((domain) => domain.id);
}

/**
 * A scope that arrived from somewhere else — a peer's opening frame, or a
 * record this jar already held — checked to the standard it is used at.
 *
 * **Absent is the whole Jar** for the reason {@link WHOLE_JAR} gives, and it is
 * a different statement from an **empty** scope, which says the lane carries
 * nothing. The two must not collapse, exactly as `peer_roster`'s `null` and
 * `[]` must not: one is a build that has said nothing, the other is a claim.
 *
 * A domain this build does not know is **admitted rather than dropped**.
 * Dropping it would rewrite a peer's statement before intersecting it, which
 * changes nothing about the answer — this device can attribute no row to such a
 * domain — and would lose the honest record of what the peer said.
 */
export function readLaneScope(raw: unknown): LaneScope {
  if (raw === undefined || raw === null) return WHOLE_JAR;
  if (!Array.isArray(raw)) {
    throw new LaneScopeRefusedError(
      "a lane's scope is a list of Tracked Domains."
    );
  }
  const scope: string[] = [];
  for (const domain_id of raw) {
    if (typeof domain_id !== "string" || domain_id.length === 0) {
      // What the entry *said* is never quoted back (#227): a scope arrives off
      // a wire, and the sentence a surface renders is bounded by this code.
      throw new LaneScopeRefusedError(
        "a lane's scope names each Tracked Domain by id, and one of its entries is not one."
      );
    }
    scope.push(domain_id);
  }
  return scope;
}

export class LaneScopeRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "LaneScopeRefusedError";
  }
}
