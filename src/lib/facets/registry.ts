/**
 * The Facet registry (ADR-0076 §6), holding what is true today and nothing else.
 *
 * ADR-0076 §6 named this module and deliberately did not write it, because "an
 * entry pointing at an entry point that has not been built would be a lie in
 * code". That refusal is narrow and it is about entry points. Who owns `gtin:`
 * is true today, checkable today, and ADR-0079 §3 derives a delete button's
 * predicate from it — so ownership is written now, and scope, name, icon and
 * `start_url` are **absent rather than stubbed**. They arrive with the entry
 * point that makes them true.
 *
 * **The owner is a Tracked Domain** (ADR-0086 §1). It cannot be a Facet: ADR-0076
 * §3 has Facets overlap rather than partition, and the root holds all six
 * domains, so under Facet-ownership every prefix has two owners and "exactly one
 * owner" is unstatable. A Facet's prefix set is therefore **derived** from the
 * domains it holds, never authored beside them, which is also what keeps a second
 * Facet an application of the mechanism rather than a second list to maintain.
 *
 * `docs/eavt-vocabulary.md` stays canonical for the reader; this is canonical for
 * the code. `scripts/entity-ownership-check.mjs` is what keeps them honest, and
 * more importantly what keeps this file honest about `src/`: ADR-0076 §4 already
 * documented the one-owner rule and `isbn:` collided anyway, because every defect
 * ADR-0086 found was a place where the code minted something the documentation
 * did not know about.
 */

/**
 * A kind of thing the app records, carrying its own entity prefixes, its own
 * attributes, its own fold and its own screen. The roster is six and lives in
 * `CONTEXT.md`; this adds what each one owns in the jar.
 */
export interface TrackedDomain {
  /** Build vocabulary. Never written to a datom (ADR-0076 §2). */
  readonly id: string;
  readonly name: string;
  /**
   * The entity prefixes this domain mints. Exactly one domain owns each, and
   * prefixes are compared by **containment, never equality** (ADR-0086 §8):
   * `twin:manual_` sits inside `twin:` and both are this domain's, which is
   * legal. A prefix contained by another domain's is the defect.
   */
  readonly entityPrefixes: readonly string[];
  /**
   * The `localStorage` key prefixes this domain owns, which a Facet-scoped wipe
   * takes alongside its datoms because ownership is the rule and the storage
   * medium is incidental (ADR-0079 §2).
   */
  readonly storagePrefixes: readonly string[];
}

export const TRACKED_DOMAINS = [
  {
    id: "food",
    name: "Food",
    entityPrefixes: [
      "fdc:",
      "gtin:",
      "food:custom_",
      "recipe:",
      "event:consume_",
    ],
    // Four of these predate the convention and carry no `food_` segment
    // (ADR-0085's cost, recorded on #267). They are listed whole rather than
    // matched by a pattern that would silently miss them.
    storagePrefixes: [
      "inventoria_pref_food_",
      "inventoria_pref_visible_nutrients",
      "inventoria_pref_round_nutrition",
      "inventoria_pref_calories_tracked",
      "inventoria_pref_nutrition_panel_open",
    ],
  },
  {
    id: "media",
    name: "Media",
    entityPrefixes: [
      "tmdb:movie:",
      "tmdb:tv:",
      "isbn:",
      "olid:",
      "event:engage_",
    ],
    storagePrefixes: [],
  },
  {
    id: "items",
    name: "Physical items",
    // `twin:` is owned whole and never minted bare; every id carries a second
    // segment naming where it came from. Seven of the eight are the scraper's,
    // which used to mint six *different* prefixes chosen by the scraped page
    // (ADR-0086 §3).
    entityPrefixes: [
      "twin:",
      "twin:manual_",
      "twin:gtin_",
      "twin:isbn_",
      "twin:sku_",
      "twin:asin_",
      "twin:dpp_",
      "twin:url_",
      "twin:temp_",
      "event:acquire_",
    ],
    storagePrefixes: ["inventoria_device_scraper_proxy_url"],
  },
  {
    id: "habits",
    name: "Habits",
    entityPrefixes: ["habit:", "event:execute_"],
    storagePrefixes: [],
  },
  {
    id: "calendar",
    name: "Calendar events",
    entityPrefixes: ["cal_event:", "event:occur_"],
    storagePrefixes: [],
  },
  {
    id: "notes",
    name: "Notes and checklists",
    entityPrefixes: ["notes:"],
    storagePrefixes: [],
  },
] as const satisfies readonly TrackedDomain[];

/**
 * A named, icon-bearing face onto the Jar that can be installed on its own. The
 * roster is two and the root is one of them (ADR-0076 §2).
 */
export interface Facet {
  readonly id: string;
  readonly name: string;
  readonly domains: readonly string[];
  readonly status: "built" | "decided";
}

export const FACETS = [
  {
    id: "root",
    name: "Inventoria",
    domains: ["food", "media", "items", "habits", "calendar", "notes"],
    status: "built",
  },
  { id: "food", name: "Rations", domains: ["food"], status: "decided" },
] as const satisfies readonly Facet[];

/**
 * The id of a Facet on the roster. A literal union rather than `string`, so an
 * entry point naming a Facet that does not exist is a compile error and
 * {@link facetOf} is total.
 */
export type FacetId = (typeof FACETS)[number]["id"];

/**
 * The Facet an entry point is. **This is how a Facet's runtime identity is a
 * build-time constant** (ADR-0076 §6): each entry module names its own Facet as
 * a literal, and nothing anywhere reads `location.pathname` to decide. That is
 * not tidiness — a path check would make every Facet's screens reachable from
 * every entry, the bundler would keep them all, and #272's entire saving (4.23
 * MB of it `NotesView`) would go with it.
 */
export function facetOf(id: FacetId): Facet {
  const facet = FACETS.find((f) => f.id === id);
  // Unreachable while `id` is typed: the union is the roster's own ids. It is a
  // throw rather than a `!` so the day someone widens the parameter, the
  // failure says what happened.
  if (!facet) throw new Error(`no Facet '${id}' on the roster`);
  return facet;
}

/** Every entity prefix any domain owns. Flat, and in no meaningful order. */
export const ENTITY_PREFIXES = TRACKED_DOMAINS.flatMap((d) => d.entityPrefixes);

/**
 * A prefix the app is allowed to mint. The union is what makes an undeclared
 * prefix a **compile** error rather than something the gate has to catch, which
 * is the half of ADR-0086 §7 that costs nothing to run.
 */
export type EntityPrefix =
  (typeof TRACKED_DOMAINS)[number]["entityPrefixes"][number];

/**
 * The domain that owns an entity, or `null` if nothing does. Longest match wins,
 * because prefixes nest: `twin:gtin_1` is matched by `twin:` and by `twin:gtin_`,
 * and both are the same domain's, so the answer is the same either way. The
 * longest match is still the right rule, since it is the one that survives a
 * future nesting the gate has not yet had reason to reject.
 */
export function ownerOfEntity(entity: string): TrackedDomain | null {
  let best: TrackedDomain | null = null;
  let bestLength = 0;
  for (const domain of TRACKED_DOMAINS) {
    for (const prefix of domain.entityPrefixes) {
      if (entity.startsWith(prefix) && prefix.length > bestLength) {
        best = domain;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

/**
 * The entity prefixes a Facet owns: the union of its domains'. **Derived, never
 * stored** — ADR-0080 §8's surviving rule is that the registry carries no field
 * re-recording a conclusion whose reason is discarded, and a stored copy of this
 * would drift the first time a domain gains a prefix.
 */
export function entityPrefixesOf(facetId: string): string[] {
  const facet = FACETS.find((f) => f.id === facetId);
  if (!facet) return [];
  return TRACKED_DOMAINS.filter((d) =>
    (facet.domains as readonly string[]).includes(d.id)
  ).flatMap((d) => [...d.entityPrefixes]);
}

/** The `localStorage` prefixes a Facet owns. Derived the same way, same reason. */
export function storagePrefixesOf(facetId: string): string[] {
  const facet = FACETS.find((f) => f.id === facetId);
  if (!facet) return [];
  return TRACKED_DOMAINS.filter((d) =>
    (facet.domains as readonly string[]).includes(d.id)
  ).flatMap((d) => [...d.storagePrefixes]);
}
