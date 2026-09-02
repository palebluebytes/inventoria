/**
 * What a Facet-scoped wipe takes, and how it works that out (ADR-0079 §2, §3).
 *
 * **Everything here is derived from the registry, and nothing is authored.** A
 * second hand-written list of prefixes drifts the first time one is added, and
 * the drift is silent: the wipe reports success having missed rows. So the
 * entity prefixes come from {@link entityPrefixesOf}, the `localStorage`
 * namespaces from {@link storagePrefixesOf}, and the names in the confirmation
 * from the Tracked Domains themselves.
 *
 * The derivation is sound only because ownership is exclusive (ADR-0086): every
 * entity prefix has exactly one owning domain, so "food's rows" is a set with a
 * boundary rather than an intersection to negotiate. `pnpm check:entities` is
 * what keeps that true.
 *
 * **Ownership is the rule and the storage medium is incidental** (ADR-0079 §2),
 * which is why a module about a delete button reaches into the log facility. A
 * log channel's key follows its *name* — `inventoria_log_search` — not its
 * domain's `localStorage` namespace, so a wipe deriving keys from the registry's
 * prefixes alone would leave food's search records behind while saying it had
 * deleted all food data. The channel already declares the domain that writes
 * it, so this reads that declaration instead of asking anyone to keep a prefix
 * in step with a name.
 *
 * The ledger half is `db/db.core.ts`'s: `deleteDatomsByEntityPrefix` is the
 * third sanctioned destructive operation and lives with the other two. This
 * module decides *what* to hand it, and takes the `localStorage` side itself,
 * because the worker has no `localStorage` to take.
 */

import type { EntityCensus, EntityCensusGroup } from "../db/db.core";
import { channelsOfFacet, channelStorageKey } from "../logs/log-facility";
import {
  TRACKED_DOMAINS,
  domainsOf,
  entityPrefixesOf,
  facetOf,
  storagePrefixesOf,
  type FacetId,
} from "./registry";

/**
 * The census groups the confirmation asks for: one per Tracked Domain.
 *
 * Domains rather than Facets, because Facets overlap (ADR-0076 §3) and a row
 * counted twice would make "what stays" larger than the ledger. The caller adds
 * up the groups it needs.
 */
export function domainCensusGroups(): EntityCensusGroup[] {
  return TRACKED_DOMAINS.map((domain) => ({
    id: domain.id,
    prefixes: domain.entityPrefixes,
  }));
}

/**
 * The `localStorage` keys this Facet owns **that are actually present**, so the
 * figure the confirmation shows is a count of records rather than a count of
 * namespaces.
 *
 * Enumerated off the store rather than assembled from known key names: food's
 * settings are one key per preference and several are written only once the
 * user has touched them, so a list of names would over-count an untouched
 * install and miss anything a future setting adds under the same namespace.
 *
 * Guarded like every other access in the app: `localStorage` is absent under the
 * Node unit runner and can throw outright in a privacy-locked browser, and a
 * store that cannot be read holds nothing this can take.
 */
export function facetStorageKeys(facetId: FacetId): string[] {
  const prefixes = storagePrefixesOf(facetId);
  const channelKeys = new Set(
    channelsOfFacet(facetId).map((channel) => channelStorageKey(channel))
  );
  try {
    if (typeof localStorage === "undefined") return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      if (prefixes.some((p) => key.startsWith(p)) || channelKeys.has(key)) {
        keys.push(key);
      }
    }
    return keys;
  } catch {
    return [];
  }
}

/**
 * Removes those keys, and answers how many went.
 *
 * The keys are read before any is removed, because removing while enumerating
 * shifts the indices `key(i)` walks.
 */
export function wipeFacetStorage(facetId: FacetId): number {
  const keys = facetStorageKeys(facetId);
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* privacy-locked — there was nothing readable to take either */
    }
  }
  return keys.length;
}

/** A domain with rows the wipe will not touch, in the words the user reads. */
export interface StayingDomain {
  id: string;
  name: string;
  datoms: number;
}

/**
 * Everything the confirmation says, counted against this ledger (ADR-0079 §5).
 *
 * **It counts rather than reciting policy**, on both halves. What goes is the
 * Facet's own rows; what stays is named by walking the census and keeping the
 * domains that hold something — never by listing the roster. A standalone
 * Rations install whose jar holds nothing else therefore names nothing, which
 * is the honest answer and also the platform-blind one (ADR-0079 §7): if iOS
 * gives each install its own jar the counts simply come back smaller, and no
 * branch anywhere had to guess at that.
 */
export interface FacetWipePlan {
  facetId: FacetId;
  /** What a home screen calls it, for a caller that needs to say so. */
  facetName: string;
  entityPrefixes: string[];
  datomsGoing: number;
  datomsStaying: number;
  stayingDomains: StayingDomain[];
  storageGoing: number;
}

export function planFacetWipe(
  facetId: FacetId,
  census: EntityCensus,
  storageKeys: readonly string[]
): FacetWipePlan {
  const mine = new Set(domainsOf(facetId).map((d) => d.id));
  const datomsGoing = TRACKED_DOMAINS.filter((d) => mine.has(d.id)).reduce(
    (sum, d) => sum + (census.counts[d.id] ?? 0),
    0
  );
  return {
    facetId,
    facetName: facetOf(facetId).name,
    entityPrefixes: entityPrefixesOf(facetId),
    datomsGoing,
    // The whole table less what goes, so rows no domain claims are counted
    // among the survivors even though there is no name to list them under.
    datomsStaying: census.total - datomsGoing,
    stayingDomains: TRACKED_DOMAINS.filter(
      (d) => !mine.has(d.id) && (census.counts[d.id] ?? 0) > 0
    ).map((d) => ({ id: d.id, name: d.name, datoms: census.counts[d.id] })),
    storageGoing: storageKeys.length,
  };
}

// ---------------------------------------------------------------------------
// One run of the wipe
// ---------------------------------------------------------------------------

/**
 * Where a run's two effects go. Injected rather than imported, the arrangement
 * `views/ledger/export-run.ts` already uses for the export: the ordering below
 * and the sentence it produces are the parts worth testing, and neither should
 * need a Worker to exercise.
 */
export interface FacetWipeSeams {
  /** Removes the rows and answers how many went. `dbClient.facetWipe`. */
  deleteDatoms: (entityPrefixes: readonly string[]) => Promise<number>;
  /** Hands the freed pages back. `dbClient.vacuum`, and allowed to reject. */
  reclaimSpace: () => Promise<void>;
}

/** How a run ended, in the words the screen prints. */
export type FacetWipeOutcome =
  | {
      kind: "wiped";
      datomsDeleted: number;
      storageRemoved: number;
      /** Whether the `VACUUM` succeeded. The rows are gone either way. */
      reclaimed: boolean;
      message: string;
    }
  | { kind: "failed"; message: string; error: unknown };

/**
 * Deletes, then takes the keys, then attempts the reclaim, and says what
 * happened.
 *
 * **The order is the argument.** The ledger goes first because it holds the
 * substance, so a failure there leaves everything standing rather than half of
 * it — including the `localStorage` records, which have no transaction to roll
 * back and would otherwise be gone with the datoms still there.
 *
 * **The reclaim is best-effort and separate from the delete** (ADR-0079 §4).
 * `VACUUM` cannot run inside a transaction, so "both or neither" is not
 * expressible in SQLite; the delete commits and the reclaim is attempted after
 * it. Here, unlike the jar-wide wipe, the survivors are everything that is not
 * this Facet's, and that surviving live set is what the rewrite is staged
 * against — so this is the wipe the amendment at ADR-0079's foot relocated the
 * exposure to. A reclaim that fails leaves the rows gone and the space merely
 * reusable, and the sentence says exactly that rather than claiming the space
 * back.
 */
export async function runFacetWipe(
  facetId: FacetId,
  entityPrefixes: readonly string[],
  seams: FacetWipeSeams
): Promise<FacetWipeOutcome> {
  let datomsDeleted: number;
  try {
    datomsDeleted = await seams.deleteDatoms(entityPrefixes);
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof Error
          ? `Nothing was deleted: ${error.message}`
          : "Nothing was deleted.",
      error,
    };
  }

  const storageRemoved = wipeFacetStorage(facetId);

  let reclaimed = true;
  try {
    await seams.reclaimSpace();
  } catch (error) {
    console.error("The wipe could not reclaim the space it freed", error);
    reclaimed = false;
  }

  return {
    kind: "wiped",
    datomsDeleted,
    storageRemoved,
    reclaimed,
    message:
      `Deleted ${datomsDeleted.toLocaleString()} datoms and ${storageRemoved.toLocaleString()} local settings. ` +
      (reclaimed
        ? "The space they were using has been handed back."
        : "The space they were using could not be handed back, so it is reusable by this app rather than free."),
  };
}
