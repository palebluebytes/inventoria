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
  /**
   * The part of `src/lib/views/` this domain owns, **its screen first**.
   *
   * The lead entry is the screen ADR-0078 §2 fixes one of per domain. Later
   * entries end in `/` and are directories: a screen's own components, which are
   * as much this domain's as the screen is. Same convention as {@link
   * Facet.icons}, where the lead is the mark the Facet installs under.
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
   * Everything this Facet's service worker precaches that no chunk imports:
   * emitted file names, `*` matching a run of characters inside one path
   * segment (ADR-0077 §3).
   *
   * **The code half is not here**, and that is the point. JavaScript and CSS are
   * *derived* — `src/lib/facets/precache.ts` walks the chunks reachable from
   * this Facet's entry, so adding a view costs nothing here and cannot be
   * forgotten. What is left is everything the walk cannot see: the DB worker and
   * SQLite's WASM are emitted beside the module graph rather than inside it, and
   * `usda/`, `fonts/` and `food/icons/` are copied verbatim out of `public/`.
   *
   * Every Facet names a **complete** set — a shared base plus its own additions,
   * never a subset of the root's. ADR-0076 §2 has Facets overlap rather than
   * nest, and ADR-0077 §5 has these two declare *different* USDA artifacts, so
   * root-as-superset is not merely untidy: it is unstatable.
   *
   * It is an allowlist and never a denylist. The `globIgnores` this replaced
   * had to name the four font subsets the app does not draw, which meant a
   * Fontsource release adding a fifth put it in the install silently; naming the
   * two Latin subsets it *does* draw cannot fail that way.
   *
   * **Measured on 2026-09-01, building #306 against `807233e`**, which is the
   * number these declarations exist to defend. The baseline is this repo's at
   * that commit and **not** ADR-0077's 13,723,556 B: that came off the #269
   * research prototype rather than a named commit here, and what moved between
   * them is a stretch of the arc rather than one addition, so the gap is left
   * unattributed rather than guessed at.
   *
   * | install                       |  urls |      bytes |
   * | ----------------------------- | ----: | ---------: |
   * | one precache, everything      |    44 | 14,539,436 |
   * | Inventoria                    |    31 |  9,341,846 |
   * | Rations                       |    36 |  9,975,828 |
   * | both, as stored               |       | 19,317,674 |
   *
   * A 35.7% saving for the root and 31.4% for Rations, and installing both
   * costs 33% more than installing everything does today. That last is accepted
   * rather than mitigated (ADR-0077 §1): 4,783,558 B is shared between the two
   * and stored twice, because a precache `Cache` is named after
   * `registration.scope`. Whoever installs Rations installs nothing else.
   */
  readonly precache: readonly string[];
  /**
   * What that precache weighed when it was last measured, in bytes: the centre
   * of the band `pnpm check:facets` holds it inside (ADR-0083 §3).
   *
   * **A band, never a ceiling.** A ceiling catches the regression the `precache`
   * declaration above exists to prevent — a hand-written entry re-inflating a
   * Facet — and passes a manifest that has *collapsed*. The derived half failing
   * open ships a Facet that installs and then cannot work, and the offline gate
   * cannot see it: `usda/nutrient-store.json` is read seconds after `mount()`,
   * so a manifest that dropped it boots perfectly and then finds no food. A
   * floor is the only thing looking at that.
   *
   * It sits **here**, beside the declarations whose editing moves it, because a
   * measured byte range is not a conclusion reached by argument — which is the
   * one thing ADR-0080 §8's surviving rule keeps out of this registry. A
   * reviewer changing one is looking at the other.
   *
   * There is deliberately **no `--update` flag**. Moving these numbers is a
   * reviewable diff in the same commit as whatever moved them, because 450 KB of
   * precache is always a decision.
   */
  readonly precacheBytes: number;
  /**
   * Whether it exists as a thing you can install. **Installability is
   * definitional** (ADR-0076 §1), so an entry point alone does not flip this:
   * Rations had a screen of its own from #301 and became `built` at #305, which
   * is where it got a manifest. ADR-0076 §2's own table carried this column
   * until then; the amendment at that record's foot hands it here, so a third
   * entry can be decided in an ADR and declared here before it is built.
   */
  readonly status: "built" | "decided";
}

/**
 * What every Facet precaches, because every Facet is a face onto the same Jar
 * (ADR-0076 §1) drawn in the same faces.
 *
 * Named once and spread into each Facet's own declaration rather than looked up
 * from one: ADR-0077 §3 wants each Facet's set to read as complete where it is
 * declared, and a copy in two places is the thing that drifts.
 *
 * The DB worker and its three SQLite artifacts are the reason a second Facet
 * cannot be free — 1.31 MB of them, stored once per scope, because a precache
 * `Cache` is named after `registration.scope` and no option changes that
 * (ADR-0077 §1). The Latin font subsets are the rest of that floor.
 */
const JAR_PRECACHE = [
  // The ledger. Emitted beside the module graph rather than inside it — the
  // worker is started from a `new Worker(new URL(…))`, so no chunk imports it
  // and no walk can reach it.
  "assets/db.worker-*.js",
  "assets/sqlite3-*.wasm",
  "assets/sqlite3-worker1-*.js",
  "assets/sqlite3-opfs-async-proxy-*.js",
  // The two subsets the app draws, of the seven Fontsource ships. Precaching is
  // the exception to a browser fetching only the subsets a rendered character
  // needs: it pulls everything up front, so an install would otherwise carry
  // Cyrillic, Greek and Vietnamese it never renders.
  "assets/*-latin-wght-*.woff2",
  "assets/*-latin-ext-wght-*.woff2",
  // OFL 1.1 clause 2 asks its notice to travel with every copy of the work, and
  // an offline install *is* a copy. Precaching the font subsets while leaving
  // the licence on the network would distribute the faces without their notice.
  "fonts/OFL.txt",
  // The QR writer, which is how a meal leaves a device (ADR-0072 §9). Both
  // Facets can hand a meal off, so both owe it offline.
  "assets/zxing_writer-*.wasm",
] as const;

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
    precache: [
      ...JAR_PRECACHE,
      // The mark its own manifest enumerates. `includeManifestIcons` puts it in
      // the precache anyway, after every transform; naming it here is what stops
      // the roster and the plugin from disagreeing about the same file.
      "favicon.svg",
      // **The search index, and neither of the other two USDA artifacts**
      // (ADR-0077 §5). Food is this Facet's landing screen, so the index is what
      // the user is looking at before they do anything, and a cold offline
      // install that opened on a search box finding nothing would read as "no
      // such food" rather than "no data yet". The Nutrient store and the scanner
      // are read several seconds later, in answer to an action, and #307 is why
      // those two now say they need a network instead of failing like a broken
      // build — `src/lib/food/bundled-artifact.ts`.
      "usda/search-index.json",
    ],
    precacheBytes: 9_343_729,
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
    // purple on black. The background is the one that has to match something,
    // and since the icons here clear their ground outside the drawing
    // (`docs/icon-provenance.md`) it is load-bearing rather than merely
    // agreeable: an installed icon is composited onto this colour, and it is
    // what now shows around the tin. Paper is the colour the drawing was made
    // for, so the splash reads as one surface; black would put a line drawing
    // meant for paper onto a dark screen.
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
    precache: [
      ...JAR_PRECACHE,
      // **ADR-0047 §11 binds this Facet** (ADR-0077 §4). That promise — "an app
      // whose case rests on keyless offline search must not need a network for
      // its first search" — was written when there was one app; there are two
      // now and only one of them has a case that rests on offline food. So
      // Rations owes all three artifacts whole, and never reaches the state
      // #307 built for the root: it has the files, so nothing fetches them.
      "usda/search-index.json",
      "usda/nutrient-store.json",
      "assets/zxing_reader-*.wasm",
      // Its own mark, at every size the manifest and `food/index.html` name,
      // plus the CC BY 3.0 clause 4(a) notice the drawing's licence asks to
      // travel with every copy of it (`docs/icon-provenance.md`).
      "food/icons/rations-*.png",
      "food/icons/CREDITS.txt",
    ],
    precacheBytes: 9_977_711,
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
 * The id of a Tracked Domain on the roster. A literal union rather than
 * `string`, so anything declaring which domain it belongs to — a log channel
 * naming the domain whose act writes it (ADR-0080 §2) — names one that exists,
 * or does not compile.
 */
export type TrackedDomainId = (typeof TRACKED_DOMAINS)[number]["id"];

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
 * The Tracked Domains a Facet holds, or none if nothing on the roster is that
 * Facet.
 *
 * Everything a Facet owns is the union of what its domains own — its entity
 * prefixes, its `localStorage` prefixes, its screens — so this is the one lookup
 * all of them go through. **Derived, never stored**: ADR-0080 §8's surviving
 * rule is that the registry carries no field re-recording a conclusion whose
 * reason is discarded, and a stored copy of any of these would drift the first
 * time a domain gained a prefix.
 */
export function domainsOf(facetId: string): TrackedDomain[] {
  const facet = FACETS.find((f) => f.id === facetId);
  if (!facet) return [];
  return TRACKED_DOMAINS.filter((d) =>
    (facet.domains as readonly string[]).includes(d.id)
  );
}

/** The entity prefixes a Facet owns: the union of its domains'. */
export function entityPrefixesOf(facetId: string): string[] {
  return domainsOf(facetId).flatMap((d) => [...d.entityPrefixes]);
}

/** The `localStorage` prefixes a Facet owns. Derived the same way, same reason. */
export function storagePrefixesOf(facetId: string): string[] {
  return domainsOf(facetId).flatMap((d) => [...d.storagePrefixes]);
}

/**
 * How far either side of {@link Facet.precacheBytes} a build may land before
 * `pnpm check:facets` fails it (ADR-0083 §3).
 *
 * **±5%**, which is about 450 KB at the 8–9 MiB the two Facets sit at. Measured
 * drift over a day of ordinary commits is 0.14%, so the band has roughly thirty
 * times the slack real movement needs while a 4 MB regression clears it by an
 * order of magnitude.
 *
 * One width for every Facet rather than a floor and a ceiling written out per
 * entry: the width is a single judgement about how much movement is ordinary,
 * not a fact about either Facet, and stating it twice is how the two come apart.
 * ADR-0083 §3 phrases it as each Facet declaring both edges; what each Facet
 * declares is the number a reviewer has to re-measure, and the edges are read
 * off it here.
 *
 * The weak joint is this number. A dependency bump can legitimately move more
 * than 450 KB — a font family, a WASM upgrade — and the response is to move the
 * Facet's measured figure in the same commit as the change that moved it.
 */
export const PRECACHE_BAND = 0.05;

/** The byte range a Facet's precache must land in. Derived, never declared. */
export function precacheBandOf(facet: Facet): {
  floor: number;
  ceiling: number;
} {
  return {
    floor: Math.round(facet.precacheBytes * (1 - PRECACHE_BAND)),
    ceiling: Math.round(facet.precacheBytes * (1 + PRECACHE_BAND)),
  };
}

/**
 * Where every screen and its components live, so a module outside it is not the
 * containment check's business at all.
 */
export const VIEWS_ROOT = "src/lib/views/";

/** A domain's screen: the lead entry of what it owns under {@link VIEWS_ROOT}. */
export function screenOf(domain: TrackedDomain): string {
  return domain.views[0];
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

/**
 * The screens a Facet's declared domains imply: what its built entry must reach,
 * all of them (ADR-0083 §5).
 *
 * Two domains may name one screen — habits and calendar events both draw through
 * `AgendaView` — so this deduplicates, and a Facet with six domains can imply
 * five screens.
 */
export function screensOf(facetId: string): string[] {
  return [...new Set(domainsOf(facetId).map(screenOf))].sort();
}

/**
 * The Facets whose scope sits inside this one's, which is the asymmetry every
 * nesting consequence turns on (ADR-0077 §1).
 *
 * A Facet with something nested inside it may not clean up outdated caches —
 * workbox filters cache names with a substring test, so the root would delete
 * the whole Rations install on every activation — and it needs a navigation
 * fallback denylist. Both are read off this rather than written down against
 * `root`, so a third Facet costs no edit (ADR-0083 §1).
 */
export function nestedFacetsOf(facetId: string): Facet[] {
  const facet = FACETS.find((f) => f.id === facetId);
  if (!facet) return [];
  return FACETS.filter(
    (f) => f.id !== facet.id && f.scope.startsWith(facet.scope)
  );
}
