/**
 * The version vector: what this device holds, per originating device **and per
 * Tracked Domain**, read straight off `datoms` (ADR-0075 §6, re-keyed by
 * ADR-0105 §5).
 *
 * **The watermark is not stored, it is queried.** Every datom carries the
 * `device_id` that minted it, and a device's own stamps are strictly monotonic
 * — `Hlc.now` raises `hlc_ms` or increments `hlc_ctr`, and `Hlc.update`
 * likewise. So the greatest `(hlc_ms, hlc_ctr)` **per originating device** is an
 * exact statement of what this device holds from that device. There is no
 * second table, no import log and no content hash to fall out of step with the
 * ledger, because the vector *is* a read of the ledger, and ADR-0067 §2's
 * refusal of an import log therefore does not apply to it at all.
 *
 * **A single scalar HLC watermark is wrong, not merely coarse.** A peer can
 * hand you a row stamped *below* your maximum — from a third device, or from a
 * device whose wall clock was behind — and a scalar filter would silently drop
 * it. The bug would be invisible and permanent, which is why the shape here is
 * a map keyed by device rather than one pair.
 *
 * **The second key is that same argument along a second axis.** A vector entry
 * is sound only where there are **no holes below it**, and a lane that carries
 * one Tracked Domain and not another punches exactly that hole: take a peer's
 * food up to stamp 7 over a food lane, never receive its Media row at stamp 6,
 * and a per-device mark of 7 withholds row 6 from every later wide lane,
 * permanently and silently. Within one domain there are no holes, because every
 * lane that carries a domain carries **all** of it above the peer's mark — a
 * wide lane by containing it, a narrow lane by being it. So the vector is keyed
 * by (originating device, Tracked Domain), and a lane may be narrowed
 * (ADR-0105 §1) without the vector lying about what crossed.
 *
 * **A row's domain is the domain it is *about*.** For a content row that is
 * `ownerOfEntity`; for a **Carried deletion** it is the domains its frozen
 * prefix list names, and never the Jar domain that owns its entity — which is
 * why the Jar domain gets no axis here at all (ADR-0105 §6). Attributing a
 * deletion to `jar` would give that domain one mark a narrow lane raises while
 * skipping the deletions it may not carry, reopening inside the vector the very
 * hole the second axis closes. {@link domainsOfRow} is the rule.
 *
 * **Two properties fall out for free.** A *first* sync is still the empty-vector
 * case, so it needs no separate code path — {@link vectorAboveMatch} of an empty
 * vector matches every row that has a domain at all. And resume after a dropped
 * socket costs nothing: re-exchange vectors and continue from wherever it got
 * to.
 *
 * This module is pure. It owns the vector in all three of its forms — the query
 * that computes one, the `WHERE` that filters by one, and the shape one takes
 * when it crosses a wire — so those three can never disagree about what "above"
 * means. The first two share one predicate, {@link contentDomainMatch}, for
 * that reason; the third is {@link readVersionVector}.
 */

import {
  CONTENT_DOMAINS,
  ownerOfEntity,
  type ContentDomain,
  type ContentDomainId,
} from "../facets/registry";
import { CARRIED_DELETION_ATTRIBUTE } from "./carried-deletion";
import { describeMarker } from "./describe-value";
import {
  compareHlcMark,
  HLC_ORDER_DESC,
  type HlcKey,
  type HlcMark,
} from "./hlc";

/**
 * The greatest stamp held from one originating device, per Tracked Domain.
 *
 * A domain absent from the map is one this ledger has never held a row of from
 * that device, which is the same statement as a stamp of zero and is written as
 * absence for {@link VersionVector}'s reason.
 *
 * Keyed by `string` rather than by {@link ContentDomainId}, because a vector
 * arrives off a wire from a device that may be on a later build than this one.
 * A domain this build does not know is inert: no row here can be attributed to
 * it, so it matches nothing and withholds nothing.
 */
export type DomainMarks = Readonly<Record<string, HlcMark>>;

/**
 * What this ledger holds, keyed by originating device and then by the Tracked
 * Domain the rows belong to.
 *
 * A device absent from the map is one this ledger has never held a row from,
 * which is the same statement as a stamp of zero and is written as absence so
 * that the empty vector — a device that has never held anything at all — is the
 * empty map rather than a map of zeros it would have to enumerate.
 */
export type VersionVector = Readonly<Record<string, DomainMarks>>;

/** A vector that holds nothing: what a device with an empty ledger sends. */
export const EMPTY_VERSION_VECTOR: VersionVector = Object.freeze({});

/** One `(device, domain)` axis with its stamp: what the query returns. */
export interface VectorMark extends HlcKey {
  domain_id: string;
}

/** The parts of a ledger row that decide which axes it stands on. */
export interface AttributedRow {
  entity: string;
  attribute: string;
  value: string;
}

/** A stored row as the vector reads it: its stamp, and where it stands. */
export type StampedRow = HlcKey & AttributedRow;

/**
 * The Tracked Domains one row is *about*, in roster order (ADR-0105 §6).
 *
 * A content row stands on one axis, its owner's. A **Carried deletion** stands
 * on one axis per domain its frozen prefix list names — plural, because a wipe
 * whose Facet held two domains is a fact about both — and on none belonging to
 * the Jar domain that owns its entity.
 *
 * **An entity no domain owns stands on no axis and can cross no lane.** That is
 * a `pnpm check:entities` failure rather than a runtime case (ADR-0105 §5), and
 * it is the empty list here so that the gate's absence is never read as a
 * silence.
 *
 * **A deletion's list is read as text rather than parsed**, which is the one
 * place this rule bends to its mirror: `contentDomainMatch` has to ask the same
 * question inside SQLite, where there is nothing to parse with. The frozen list
 * is written by `carriedDeletionRow` as a JSON array of the registry's own
 * prefix strings, so a prefix appears in it as its own quoted form and nothing
 * else can produce that substring.
 */
export function domainsOfRow(row: AttributedRow): ContentDomainId[] {
  const owner = ownerOfEntity(row.entity)?.id;
  const deletion = row.attribute === CARRIED_DELETION_ATTRIBUTE;
  return CONTENT_DOMAINS.filter(
    (domain) =>
      domain.id === owner ||
      (deletion &&
        domain.entityPrefixes.some((prefix) =>
          row.value.includes(quoted(prefix))
        ))
  ).map((domain) => domain.id);
}

/**
 * The SQL matching every row that stands on one domain's axis: the mirror of
 * {@link domainsOfRow}, one domain at a time.
 *
 * **The prefixes are bound, never written into the statement.** The SQL text
 * this returns holds nothing but `?`, so the list is derived from the registry
 * on every call rather than restated beside it — the drift ADR-0079 §3 forbids
 * a wipe's predicate is the same drift here.
 *
 * `substr(entity, 1, ?) = ?` rather than a `LIKE`, because four declared
 * prefixes carry an underscore and `LIKE` would read it as a wildcard. The
 * deletion arm is an exact substring of the frozen list for the reason
 * {@link domainsOfRow} gives.
 */
function contentDomainMatch(domain: ContentDomain): SqlFragment {
  return {
    sql: `(${domain.entityPrefixes
      .map(() => "substr(entity, 1, ?) = ?")
      .join(" OR ")}) OR (attribute = ? AND (${domain.entityPrefixes
      .map(() => "instr(value, ?) > 0")
      .join(" OR ")}))`,
    bind: [
      ...domain.entityPrefixes.flatMap((prefix) => [prefix.length, prefix]),
      CARRIED_DELETION_ATTRIBUTE,
      ...domain.entityPrefixes.map(quoted),
    ],
  };
}

/** A piece of SQL, with the values that go under its placeholders. */
interface SqlFragment {
  sql: string;
  bind: unknown[];
}

/** One prefix as the frozen list of a Carried deletion spells it. */
const quoted = (prefix: string): string => JSON.stringify(prefix);

/**
 * One fragment per content domain, with every bind gathered in the order the
 * fragments' own text spends it.
 *
 * Both the query and the filter are a fragment per domain over
 * {@link contentDomainMatch}, and both are silently wrong — not loudly — if one
 * bind lands out of order behind another arm. Gathering it in one place is what
 * keeps that order from being written twice.
 */
function perContentDomain(
  fragment: (domain: ContentDomain, match: SqlFragment) => SqlFragment
): { parts: string[]; bind: unknown[] } {
  const parts: string[] = [];
  const bind: unknown[] = [];
  for (const domain of CONTENT_DOMAINS) {
    const piece = fragment(domain, contentDomainMatch(domain));
    parts.push(piece.sql);
    bind.push(...piece.bind);
  }
  return { parts, bind };
}

/**
 * The query, one row per originating device per Tracked Domain.
 *
 * `MAX(hlc_ms), MAX(hlc_ctr)` grouped by device would be **wrong** rather than
 * approximate: the two aggregates are free to come from different rows, so a
 * ledger holding `(5, 0)` and `(4, 9)` would report `(5, 9)` and the peer would
 * be told to withhold a row nobody has. The window function takes the whole
 * pair off one row, which is the only reading of "greatest" the vector can
 * stand on.
 *
 * **One arm per content domain rather than one scan with a `CASE`**, because a
 * row can stand on more than one axis — a Carried deletion naming two Facets'
 * prefixes is one row and two facts — and a `CASE` yields one label per row. It
 * costs a pass per content domain where the old shape cost a single pass; the
 * work per row is the same handful of prefix comparisons either way, and this
 * is read once per open.
 *
 * It is a full scan, because no index leads with `device_id` and one added for
 * this would be paid on every append to save a read that happens once per open.
 */
export function versionVectorQuery(): SqlFragment {
  const { parts, bind } = perContentDomain((domain, match) => ({
    sql: `SELECT ? AS domain_id, device_id, hlc_ms, hlc_ctr FROM (
      SELECT device_id, hlc_ms, hlc_ctr,
             ROW_NUMBER() OVER (
               PARTITION BY device_id ORDER BY ${HLC_ORDER_DESC}
             ) AS place
        FROM datoms WHERE ${match.sql}
    ) WHERE place = 1`,
    bind: [domain.id, ...match.bind],
  }));
  return { sql: `${parts.join("\n    UNION ALL\n    ")};`, bind };
}

/** The rows {@link versionVectorQuery} returns, as the vector they describe. */
export function foldVersionVector(rows: readonly VectorMark[]): VersionVector {
  const vector: Record<string, Record<string, HlcMark>> = {};
  for (const row of rows) {
    const marks = (vector[row.device_id] ??= {});
    keepGreater(marks, row.domain_id, {
      hlc_ms: row.hlc_ms,
      hlc_ctr: row.hlc_ctr,
    });
  }
  return vector;
}

/** The vector a ledger holding exactly these rows and nothing else reports. */
export function vectorOfRows(rows: readonly StampedRow[]): VersionVector {
  return foldVersionVector(
    rows.flatMap((row) =>
      domainsOfRow(row).map((domain_id) => ({ ...row, domain_id }))
    )
  );
}

/**
 * The vector a holder of `vector` has once it also holds `rows`.
 *
 * **A lower bound, and a sound one**, which is what a store-carried
 * convergence needs and a live one never did. The peer's own vector crosses
 * exactly once, at the first sync's closing exchange (ADR-0096 §8); after that
 * each side keeps its view of the other current from what it has **observed**
 * — rows it collected from the peer, which the peer necessarily held to send,
 * and rows of its own the peer acknowledged collecting.
 *
 * That is why a Deposit carries an acknowledgement and a delta and no vector
 * (ADR-0096 §3). Re-asserting one would state which *third* devices this
 * ledger has heard from, which ADR-0096 §6 closes the door on, and it would buy
 * only exactness: understating what a peer holds costs a re-sent row an import
 * ignores, where overstating it would withhold a row permanently.
 *
 * **A partial deposit is now expressible, and that is what the second axis
 * buys** (ADR-0105 §9): a wake that carried one Facet's rows raises only the
 * marks for the domains it carried, where under a per-device scalar it would
 * have claimed the peer held everything below the greatest stamp it sent.
 */
export function vectorWith(
  vector: VersionVector,
  rows: readonly StampedRow[]
): VersionVector {
  return mergeVersionVectors(vector, vectorOfRows(rows));
}

/**
 * The vector a device has once it holds everything either of these two
 * describes: the greater mark per device **and domain**, and every axis either
 * names.
 *
 * Merging rather than replacing is what keeps two sound statements about one
 * peer from cancelling each other out. A deposit's acknowledgement says _the
 * peer collected what that object carried_, and a collection says _the peer
 * held what it sent me_; they are made at different moments about different
 * rows, and taking the later one whole would throw the other away and re-send
 * what it covered on the next wake. Under the second axis the same argument
 * runs one level down, because the two statements may now be about different
 * domains of one device.
 */
export function mergeVersionVectors(
  held: VersionVector,
  also: VersionVector
): VersionVector {
  const merged: Record<string, Record<string, HlcMark>> = {};
  for (const device_id of new Set([
    ...Object.keys(held),
    ...Object.keys(also),
  ])) {
    const marks: Record<string, HlcMark> = { ...held[device_id] };
    const arriving = also[device_id] ?? {};
    for (const domain_id of Object.keys(arriving)) {
      keepGreater(marks, domain_id, arriving[domain_id]);
    }
    merged[device_id] = marks;
  }
  return merged;
}

/** Keeps the greater of the standing mark and this one, on one axis. */
function keepGreater(
  marks: Record<string, HlcMark>,
  domain_id: string,
  mark: HlcMark
): void {
  const standing = marks[domain_id];
  if (!standing || compareHlcMark(standing, mark) < 0) marks[domain_id] = mark;
}

/**
 * The `WHERE` matching every row a holder of `vector` does not have, and the
 * values to bind under it.
 *
 * One arm per content domain, and each arm is two clauses. The second is the
 * one a scalar watermark cannot express: a device the peer has never heard *of
 * this domain from* contributes **all** of its rows of that domain, whatever
 * their stamps, so rows stamped below the peer's greatest anything still cross.
 *
 * A row crosses if the peer's mark for **(its originating device, its domain)**
 * is absent or below its stamp — so a row standing on two axes crosses while
 * either of them is behind, which is right: the peer holds a Carried deletion
 * only if it holds every domain that deletion is about up to its stamp.
 *
 * An empty vector matches every row that stands on an axis at all, which is the
 * first sync, and is why there is no separate first-sync path anywhere above
 * this. A row standing on no axis matches nothing, here and on a first sync
 * alike — ADR-0105 §5's *an entity with no owning domain can cross no lane*,
 * which `pnpm check:entities` is what keeps hypothetical.
 */
export function vectorAboveMatch(vector: VersionVector): {
  where: string;
  bind: unknown[];
} {
  const { parts, bind } = perContentDomain((domain, match) => {
    const heard = Object.keys(vector).filter(
      (device_id) => vector[device_id][domain.id]
    );
    const above =
      heard.length === 0
        ? "1"
        : [
            `device_id NOT IN (${heard.map(() => "?").join(", ")})`,
            ...heard.map(
              () => "(device_id = ? AND (hlc_ms, hlc_ctr) > (?, ?))"
            ),
          ].join(" OR ");
    return {
      sql: `((${match.sql}) AND (${above}))`,
      bind: [
        ...match.bind,
        ...heard,
        ...heard.flatMap((device_id) => [
          device_id,
          vector[device_id][domain.id].hlc_ms,
          vector[device_id][domain.id].hlc_ctr,
        ]),
      ],
    };
  });
  return { where: parts.join(" OR "), bind };
}

/**
 * A vector that arrived from somewhere else, checked.
 *
 * ADR-0075 §13 keeps two of ADR-0073 §8's refusals on this path — a chunk whose
 * seal fails, and rows failing `importLedgerRows`' column validation — not
 * because a paired device is untrusted but because **if the seal held and what
 * is inside is malformed, that is a bug**, and a bug that drives a sync decides
 * which rows are withheld permanently. A vector is the other input that decides
 * that, so it is checked to the same standard rather than trusted for being
 * sealed.
 *
 * **A vector in ADR-0075 §6's older shape is read as this one**, by assigning
 * its whole-stamp entry to every content domain (ADR-0105 §11). Sound, and
 * provably: an old-shape vector can only have been produced by an unfiltered
 * lane, so the peer genuinely holds every domain below that mark. Refusing it
 * would pay a visible failure for nothing.
 *
 * **The reverse direction fails here, and that is the right failure.** A device
 * on the older build receiving this shape refuses it, because a domain map is
 * not a whole stamp — loud, at the boundary, and never a silent withholding.
 *
 * One entry the older reader refused is now legal: a device mapped to **no
 * domains at all**, which had no meaning when a device carried one stamp and
 * now says what that device's absence says — this peer holds nothing from it,
 * so all of its rows cross.
 */
export function readVersionVector(raw: unknown): VersionVector {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VersionVectorRefusedError("a version vector is a JSON object.");
  }
  const vector: Record<string, DomainMarks> = {};
  for (const device_id of Object.keys(raw)) {
    if (device_id.length === 0) {
      throw new VersionVectorRefusedError(
        "a version vector is keyed by device, and one of its keys is empty."
      );
    }
    vector[device_id] = readDomainMarks(Reflect.get(raw, device_id), device_id);
  }
  return vector;
}

/**
 * One device's entry: a map of marks, or an older build's single mark spread
 * across every content domain.
 *
 * The two are told apart by the stamp's own field names, which no domain id can
 * collide with — they are the registry's ids, and `hlc_ms` is not one. Reading
 * the older shape that way rather than by falling through keeps a *malformed*
 * old entry refused as the half-stamp it is instead of as a domain map with a
 * strange key.
 */
function readDomainMarks(entry: unknown, device_id: string): DomainMarks {
  const brokenEntry = () =>
    new VersionVectorRefusedError(
      // The id is what a reader needs to find the entry, and it is a label
      // rather than content — `datoms` carries it in every primary key. It is
      // still quoted back only while it is label-sized, because this one
      // arrived off a wire and the refusal is rendered (#227). What the entry
      // *said* is never quoted at all.
      `the entry for ${describeMarker(device_id)} is not a whole stamp.`
    );
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw brokenEntry();
  }
  if ("hlc_ms" in entry || "hlc_ctr" in entry) {
    if (!isMark(entry)) throw brokenEntry();
    const mark = { hlc_ms: entry.hlc_ms, hlc_ctr: entry.hlc_ctr };
    return Object.fromEntries(
      CONTENT_DOMAINS.map((domain) => [domain.id, mark])
    );
  }
  const marks: Record<string, HlcMark> = {};
  for (const domain_id of Object.keys(entry)) {
    if (domain_id.length === 0) {
      throw new VersionVectorRefusedError(
        `the entry for ${describeMarker(device_id)} is keyed by Tracked Domain, and one of its keys is empty.`
      );
    }
    const mark: unknown = Reflect.get(entry, domain_id);
    if (!isMark(mark)) {
      throw new VersionVectorRefusedError(
        `the ${describeMarker(domain_id)} mark for ${describeMarker(device_id)} is not a whole stamp.`
      );
    }
    marks[domain_id] = { hlc_ms: mark.hlc_ms, hlc_ctr: mark.hlc_ctr };
  }
  return marks;
}

export class VersionVectorRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "VersionVectorRefusedError";
  }
}

function isMark(value: unknown): value is HlcMark {
  return (
    value !== null &&
    typeof value === "object" &&
    "hlc_ms" in value &&
    "hlc_ctr" in value &&
    isStampPart(value.hlc_ms) &&
    isStampPart(value.hlc_ctr)
  );
}

/** What the ledger's own integer columns accept, and so what a stamp is. */
const isStampPart = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
