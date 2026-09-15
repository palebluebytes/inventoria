/**
 * What the app records, and who owns each entity prefix (ADR-0086 §1).
 *
 * This is the half of the Facet registry that is **about the jar rather than
 * about an install**: the Tracked Domains, the prefixes each owns, and the
 * three readings that need nothing but them. `registry.ts` holds the other
 * half — the Facet roster, its manifests and its precache — imports this one,
 * and re-exports every name here, so nothing outside this directory has to
 * know the split exists.
 *
 * **It is split so that reaching a prefix does not reach a manifest.**
 * `entity-id.ts` needs `ENTITY_PREFIXES` and nothing else, and it is imported
 * by the food search, which `scripts/food-search-explainer.mjs` bundles into
 * `docs/food-search.html`. While the two lived in one module that bundle
 * carried the whole Facet roster as dead code — esbuild cannot drop it,
 * because `precache: [...JAR_PRECACHE]` is an array spread and a spread may
 * invoke an iterator — so editing `precacheBytes` rewrote 1.3 MiB of committed
 * HTML and failed `pnpm check` until the page was regenerated. A module that
 * holds only data nobody can call is the cheapest fix that keeps the gate at
 * full strength.
 *
 * `docs/eavt-vocabulary.md` stays canonical for the reader; this is canonical
 * for the code, and `scripts/entity-ownership-check.mjs` keeps them honest.
 */

/**
 * A kind of thing the app records, carrying its own entity prefixes, its own
 * attributes and its own fold. The roster is seven and lives in `CONTEXT.md`;
 * this adds what each one owns in the jar.
 *
 * **Six of the seven also carry a screen and sit in a Facet. The Jar domain
 * carries neither** (ADR-0096 §13). ADR-0086 §1's sentence — the owner of an
 * entity prefix is a Tracked Domain, and there is no second kind of owner —
 * survives word for word; what widened is its subject, because the carried
 * deletion a wipe hands a peer needs an owner and cannot have one inside any
 * Facet. `scripts/entity-ownership-check.mjs` holds the two cases apart with a
 * biconditional: a domain with views is declared by at least one Facet, and a
 * domain with no views is declared by none.
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
  /**
   * The part of `src/lib/views/` this domain owns, **its screen first**, or
   * empty for a domain that draws nothing.
   *
   * The lead entry is the screen ADR-0078 §2 fixes one of per domain, which
   * binds every domain a Facet holds and no others: **empty is the Jar
   * domain's, and it is the field that says so** (ADR-0096 §13). Later entries
   * end in `/` and are directories: a screen's own components, which are as much
   * this domain's as the screen is. Same convention as {@link Facet.icons},
   * where the lead is the mark the Facet installs under.
   *
   * **Attached to the domain rather than to the Facet** (ADR-0083 §4). A Facet
   * already declares its domains, so a per-Facet list of views would re-record
   * ADR-0078 §1's conclusion with its reason thrown away — the one thing
   * ADR-0080 §8's surviving rule forbids this registry. `pnpm check:facets`
   * derives both halves of its containment claim from here: every view module a
   * Facet's built entry reaches belongs to a domain it declares, and every
   * declared domain's screen is reached (ADR-0083 §5).
   *
   * **The directories are why the claim is worth making.** ADR-0078 §8's claim
   * is that the built Rations entry contains no root-only *view module*, and
   * the six screens are six of the 90 modules under `src/lib/views/`. A
   * population of screens alone passes an `ItemCard` imported into a food
   * component, which is the same crossing one file down.
   *
   * Which module belongs to which domain is a **fact about the codebase**, not a
   * decision anyone argued, which is what makes it declarable at all. Three
   * facts here read oddly and are written down rather than left to surprise the
   * next reader:
   *
   *   - **Habits and Calendar events share `AgendaView`.** The root has six tabs
   *     and six domains and they are not the same six: agenda draws both. Only
   *     habits owns `views/habits/`, because a shared directory would be two
   *     owners for one path and the point of ownership is that there is one.
   *   - **`src/lib/views/HabitsView.svelte` is named by nothing**, here or in
   *     `src/`. It is reachable from neither entry point, so it is in neither
   *     build and no domain claims it.
   *   - **`SettingsView.svelte`, `views/ledger/`, `views/logs/` and
   *     `views/storage/` are claimed by nobody**, and that is deliberate rather
   *     than an omission. They are the jar-wide surface, and which Facet should
   *     carry a block of it is ADR-0080 §1's judgement — which ADR-0083 §10
   *     declined to gate, because a check that half-checks a judgement reads as
   *     covered. The containment check counts what it did not judge and prints
   *     the number, so the gap stays visible.
   */
  readonly views: readonly string[];
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
    views: ["src/lib/views/FoodView.svelte", "src/lib/views/food/"],
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
    views: ["src/lib/views/MediaView.svelte", "src/lib/views/media/"],
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
    views: ["src/lib/views/ItemsView.svelte", "src/lib/views/items/"],
  },
  {
    id: "habits",
    name: "Habits",
    entityPrefixes: ["habit:", "event:execute_"],
    storagePrefixes: [],
    views: ["src/lib/views/AgendaView.svelte", "src/lib/views/habits/"],
  },
  {
    id: "calendar",
    name: "Calendar events",
    entityPrefixes: ["cal_event:", "event:occur_"],
    storagePrefixes: [],
    views: ["src/lib/views/AgendaView.svelte"],
  },
  {
    id: "notes",
    name: "Notes and checklists",
    entityPrefixes: ["notes:"],
    storagePrefixes: [],
    views: ["src/lib/views/NotesView.svelte", "src/lib/views/notes/"],
  },
  {
    // **The jar's own record of what has been done to it**, which is not the
    // Jar — that is where things are kept — and is not a seventh kind of
    // content (ADR-0096 §13). It exists because a Facet-scoped wipe that a peer
    // can carry has to be a datom, and that datom's owner must sit outside
    // every Facet's prefix set or a wipe deletes its own record of itself.
    //
    // **Its home is arithmetic rather than policy.** `entityPrefixesOf` is the
    // union of `domainsOf(facetId)`, which filters this roster by the Facet's
    // own list, so a domain no Facet names is absent from every Facet's wipe
    // predicate without anything having to remember to exclude it. The same
    // absence pays the screen problem: `checkViewContainment` compares
    // `facet.domains` against `screensOf(facet.id)`, and a domain in neither
    // set leaves that check unchanged rather than excused. `resetLedgerSchema`,
    // which is the jar-wide `clear`, still takes the rows.
    //
    // Named for the class, and the class admits **one** member; a second costs
    // an amendment to that record.
    id: "jar",
    // **The label is what the wipe confirmation prints**, beside "Media",
    // "Physical items" and "Notes and checklists" in `FoodDataSection`'s
    // *what stays* line, so it names the rows the way its siblings do. Bare
    // "Jar" would be wrong twice: `CONTEXT.md` spends that term on the storage,
    // and a sentence reading "412 datoms stay: Media and Jar" says nothing
    // about what those rows are. The domain is still the Jar domain; `id` is
    // where that lives, because ids are build vocabulary and this is not.
    name: "Deletion records",
    // The act's own datom key: `deletion:<hlc_ms>_<hlc_ctr>_<device_id>`,
    // unique across devices by construction and needing neither a clock read
    // nor a random of its own. Per-act rather than a singleton, because two
    // wipes are two facts with two stamps and one entity under *a later fact
    // wins* would keep only the newer prefix list, stranding rows under any
    // prefix that retired between builds.
    entityPrefixes: ["deletion:"],
    storagePrefixes: [],
    // No screen, which is the widening. Nothing draws a carried deletion: the
    // peer shows a one-shot notice of a completed act (ADR-0096 §12), and a
    // notice is not a domain's screen.
    views: [],
  },
] as const satisfies readonly TrackedDomain[];

/** Every entity prefix any domain owns. Flat, and in no meaningful order. */
export const ENTITY_PREFIXES = TRACKED_DOMAINS.flatMap((d) => d.entityPrefixes);

/**
 * The id of a Tracked Domain on the roster. A literal union rather than
 * `string`, so anything declaring which domain it belongs to — a log channel
 * naming the domain whose act writes it (ADR-0080 §2) — names one that exists,
 * or does not compile.
 */
export type TrackedDomainId = (typeof TRACKED_DOMAINS)[number]["id"];

/**
 * A **content domain**: a Tracked Domain that records a kind of thing the user
 * tracks, carries a screen and sits in a Facet. `CONTEXT.md` carries the term.
 * Today it is the six, and not the Jar domain.
 *
 * Derived from `views` rather than from any Facet's list, and the two agree
 * because `scripts/entity-ownership-check.mjs` holds them to the biconditional:
 * a domain with views is declared by at least one Facet, and a domain with no
 * views is declared by none (ADR-0096 §13).
 */
export type ContentDomain = Extract<
  (typeof TRACKED_DOMAINS)[number],
  { views: readonly [unknown, ...unknown[]] }
>;

/**
 * A {@link ContentDomain}'s id, as a literal union.
 *
 * It exists for anything whose meaning is *the Facets this belongs to*, where
 * naming a domain no Facet holds is not a narrower answer but an empty one. A
 * log channel is the case: `channelsOfFacet` builds a `Set` of the domain ids a
 * Facet holds, so a channel owned by the Jar domain would be in no Facet's card,
 * in no export and in no wipe, and would still spend the budget — the permanent
 * invisible record ADR-0092 §13's `null` arm was written to prevent. `null` is
 * the way to say *jar-wide*, and it is a different statement from naming an
 * owner nobody can reach.
 */
export type ContentDomainId = ContentDomain["id"];

/**
 * The content domains themselves, in roster order — {@link ContentDomainId}'s
 * value, read off the same field so the type and the list cannot name
 * different sets.
 *
 * It exists for the readers that need each domain's **prefixes** rather than
 * only its id: the version vector has one axis per content domain and none for
 * the Jar domain (ADR-0105 §5), and it builds both the query that computes a
 * vector and the `WHERE` that filters by one out of what each domain owns.
 */
export const CONTENT_DOMAINS: readonly ContentDomain[] = TRACKED_DOMAINS.filter(
  (domain): domain is ContentDomain => domain.views.length > 0
);

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
 * The entity prefixes a set of Tracked Domains owns, named by id.
 *
 * The same derivation {@link entityPrefixesOf} reads through a Facet's own
 * list, reached directly by the one caller whose domains are not a Facet's: a
 * lane's scope is the **intersection** of two Facets' domain sets (ADR-0105
 * §3), so it can be narrower than either Facet and there is no `facetId` to
 * ask. One function is what keeps a wipe's predicate and a lane's from being
 * two lists of the same thing (ADR-0079 §3).
 *
 * **A domain id this build does not know contributes nothing**, which is how a
 * scope stated by a device on a later build is inert rather than refused: no
 * row here can belong to a domain that is not on this roster.
 */
export function entityPrefixesOfDomains(ids: readonly string[]): string[] {
  return TRACKED_DOMAINS.filter((d) => ids.includes(d.id)).flatMap((d) => [
    ...d.entityPrefixes,
  ]);
}

/**
 * The domain that owns a view module, or `null` if nobody does.
 *
 * A declaration ending in `/` is a directory and matches by prefix; anything
 * else is one module and matches exactly. Longest match wins, the same rule
 * {@link ownerOfEntity} follows and for the same reason: it is the one that
 * survives a nesting nobody has yet had cause to reject.
 *
 * `null` is a real answer rather than a failure. `SettingsView` and the ledger,
 * log and storage blocks under it are the jar-wide surface, and which Facet
 * carries one is a judgement ADR-0083 §10 declined to gate. The containment
 * check counts them rather than passing them in silence.
 */
export function ownerOfViewModule(module: string): TrackedDomain | null {
  let best: TrackedDomain | null = null;
  let bestLength = 0;
  for (const domain of TRACKED_DOMAINS) {
    for (const owned of domain.views) {
      const matches = owned.endsWith("/")
        ? module.startsWith(owned)
        : module === owned;
      if (matches && owned.length > bestLength) {
        best = domain;
        bestLength = owned.length;
      }
    }
  }
  return best;
}
