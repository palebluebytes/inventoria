/**
 * The Facet registry (ADR-0076 §6), holding what is true today and nothing else.
 *
 * ADR-0076 §6 named this module and deliberately did not write it, because "an
 * entry pointing at an entry point that has not been built would be a lie in
 * code". That refusal is narrow and it is about entry points. Who owns `gtin:`
 * is true today, checkable today, and ADR-0079 §3 derives a delete button's
 * predicate from it — so ownership was written first, and scope, name, icon and
 * `start_url` were **absent rather than stubbed**, to arrive with the entry
 * point that makes them true.
 *
 * #301 built that entry point, so scope, name and start URL are here, and #302
 * minted an icon Rations is allowed to ship, so the icon is here too. Both
 * arrived the same way: the field was **absent rather than stubbed** until a
 * file it could name was in the build, because a path to a file that is not
 * there would be the lie this module was written to avoid. #305 wrote both
 * Facets a manifest off these fields, which is what made the icon required
 * rather than optional and brought the three that describe an install —
 * `description`, `themeColor`, `backgroundColor` — in beside it.
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
 * One entry in a manifest's `icons`, in the member names the manifest spec
 * gives them. snake_case would be wrong here and camelCase would be wrong in a
 * datom: these are somebody else's field names, written the way the reader of
 * the file expects to find them (CODING_STANDARDS §1.3 governs the ledger, and
 * a manifest is not one).
 */
export interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  /** Absent means `any`, which is the spec's own default. */
  readonly purpose?: "maskable";
}

/**
 * A named, icon-bearing face onto the Jar that can be installed on its own. The
 * roster is two and the root is one of them (ADR-0076 §2).
 */
export interface Facet {
  readonly id: string;
  /** What it is called on a home screen. Never the id, which is build vocabulary. */
  readonly name: string;
  /**
   * The URL prefix this Facet's pages live under: its manifest's `scope` and
   * its service worker's (ADR-0077 §1). Every Facet's scope contains its own
   * start URL, and the root's contains every other Facet's — which is why the
   * root may link to Rations without leaving itself while the reverse would
   * eject a user into a browser (ADR-0078 §3).
   */
  readonly scope: string;
  /**
   * Where an install opens. The manifest member is spelled `start_url`, and it
   * is spelled `startUrl` here on purpose: snake_case in this codebase means a
   * ledger field (CODING_STANDARDS §1.3), a Facet is never written to a datom
   * (ADR-0076 §2), and the one rename happens where the manifest is built.
   */
  readonly startUrl: string;
  /**
   * What it says about itself on a home screen, verbatim in its manifest.
   *
   * These four are here rather than in `src/lib/facets/manifest.ts` for the
   * same reason `name` and `startUrl` are: they are facts about a Facet, and
   * the builder is a shape. Nothing else in the app reads them — a Facet's
   * manifest is the only consumer — which is why they arrived with #305 and not
   * before.
   */
  readonly description: string;
  /** The colour the OS tints its chrome with while the install is open. */
  readonly themeColor: string;
  /** What a splash screen paints behind the icon before the app draws. */
  readonly backgroundColor: string;
  /**
   * The icons its manifest enumerates, `any`-purpose mark first.
   *
   * #302 left this one URL on purpose: which files a manifest enumerates, at
   * what `sizes` and with what `purpose`, was **#305's to decide**, and a list
   * written before that decision would have been the decision made early. #305
   * decides, and it decides here, because the build is what reads it.
   *
   * The list is the *manifest's*, not the Facet's whole set. `rations-32.png`
   * and `rations-180.png` are a tab favicon and an `apple-touch-icon`, declared
   * by `food/index.html` with `<link>` because that is where a browser looks
   * for them; a manifest that also listed them would be claiming they are
   * install icons. Nor is it yet the declaration ADR-0077 §2 asks for, which
   * names "the Rations icon set" among the static assets a Facet declares so
   * its own service worker can precache them: that set is the five files and is
   * #306's.
   *
   * Every entry sits **inside the Facet's own scope**, which is not a style
   * rule — a service worker scoped to `/food/` cannot precache a URL above it
   * (`docs/icon-provenance.md`).
   */
  readonly icons: readonly ManifestIcon[];
  readonly domains: readonly string[];
  /**
   * Whether it exists as a thing you can install. **Installability is
   * definitional** (ADR-0076 §1), so an entry point alone does not flip this:
   * Rations had a screen of its own from #301 and became `built` at #305, which
   * is where it got a manifest. Both are `built` today, so nothing reads this
   * yet — it is here because the word the roster uses for a Facet that has been
   * decided and not built is the thing a third entry will need.
   */
  readonly status: "built" | "decided";
}

export const FACETS = [
  {
    id: "root",
    name: "Inventoria",
    scope: "/",
    startUrl: "/",
    description: "Local-first item and habit tracking",
    themeColor: "#863bff",
    backgroundColor: "#000000",
    // One file, and `sizes` says two because an SVG is every size. The mark's
    // own provenance is unrecorded and `docs/icon-provenance.md` says so
    // rather than implying a clearance; #302's subject was Rations.
    icons: [
      { src: "/favicon.svg", sizes: "192x192 512x512", type: "image/svg+xml" },
    ],
    domains: ["food", "media", "items", "habits", "calendar", "notes"],
    status: "built",
  },
  {
    id: "food",
    name: "Rations",
    scope: "/food/",
    startUrl: "/food/",
    description:
      "Log what you eat against an immutable append-only ledger that stays on your device.",
    // Ink on paper, the app's own frame (ADR-0038), rather than the root's
    // purple on black. The background is the one that has to match something:
    // an installed icon is composited onto it, and the Rations drawing carries
    // its own opaque white ground (`docs/icon-provenance.md`), so paper is the
    // colour that makes the splash seamless and black is the one that would
    // draw a white card in the middle of a dark screen.
    themeColor: "#000000",
    backgroundColor: "#ffffff",
    icons: [
      {
        src: "/food/icons/rations-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/food/icons/rations-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/food/icons/rations-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    domains: ["food"],
    // Installability is definitional (ADR-0076 §1) and #305 is where Rations
    // gets a manifest of its own, so this is the ticket that flips it.
    status: "built",
  },
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
