/**
 * The four claims `pnpm check:facets` carries, as rules rather than as a script
 * (ADR-0083 §3, §5, §7 and ADR-0084 §8).
 *
 * `scripts/facet-checks.mjs` does the reading — the build metadata artifact, the
 * emitted service workers, the emitted manifests — and hands what it read to
 * these. Nothing here touches a file system, which is what lets every rule be
 * handed a build that does not exist and checked in a unit test.
 *
 * That split is not tidiness. ADR-0083's subject is a gate that goes green over
 * the thing it exists to catch, and a rule that is quietly wrong is exactly that
 * gate: the script failing is loud, and `checkViewContainment` accidentally
 * asserting a subset is silent forever. The half that can be wrong in silence is
 * the half that gets tests.
 *
 * **Every claim names the Facet it is about** (ADR-0083 §1). A gate that reports
 * "the app does not start offline" when it means Rations sends the reader to the
 * wrong build, and that is how a gate gets switched off rather than fixed.
 */
import {
  nestedFacetsOf,
  ownerOfViewModule,
  precacheBandOf,
  screensOf,
  VIEWS_ROOT,
  type Facet,
} from "./registry";
import type { FacetBundle, FacetPrecache } from "./precache";

/** One claim's verdict, and the sentence a reader gets when it fails. */
export interface Claim {
  readonly ok: boolean;
  /** What was proved, or what was found instead. Always names its Facet. */
  readonly message: string;
}

const bytes = (n: number) => `${n.toLocaleString("en-GB")} B`;

/**
 * A Facet's precache weighs what it is declared to, within the band.
 *
 * Both edges hard-fail, printing the measured bytes, the band and which side it
 * fell out of. The floor is the half a ceiling cannot do: a derived manifest
 * failing open ships a Facet that installs and then cannot work, and the offline
 * gate cannot see it because the USDA statics are read after `mount()`.
 */
export function checkPrecacheBand(
  facet: Facet,
  precache: FacetPrecache | undefined
): Claim {
  const { floor, ceiling } = precacheBandOf(facet);
  const band = `${bytes(floor)}–${bytes(ceiling)}`;

  if (!precache) {
    return {
      ok: false,
      message:
        `${facet.name}: the build recorded no precache at all. Either the ` +
        `service worker for ${facet.scope} was not generated or the metadata ` +
        `artifact is from a build that did not have this Facet.`,
    };
  }
  if (precache.bytes < floor) {
    return {
      ok: false,
      message:
        `${facet.name}: precache is ${bytes(precache.bytes)} over ` +
        `${precache.count} URLs, which is **below** the band ${band}. A ` +
        `manifest that collapsed installs and then cannot work — the USDA ` +
        `statics are read after mount(), so nothing else in the roster looks ` +
        `at this. Fix the derivation, or move precacheBytes in the registry ` +
        `in the same commit as whatever removed the weight.`,
    };
  }
  if (precache.bytes > ceiling) {
    return {
      ok: false,
      message:
        `${facet.name}: precache is ${bytes(precache.bytes)} over ` +
        `${precache.count} URLs, which is **above** the band ${band}. Check ` +
        `the Facet's own \`precache\` declaration in the registry for a ` +
        `pattern that has widened, or move precacheBytes in the same commit ` +
        `as whatever added the weight.`,
    };
  }
  return {
    ok: true,
    message:
      `${facet.name} precaches ${bytes(precache.bytes)} over ` +
      `${precache.count} URLs, inside ${band}`,
  };
}

/**
 * Every view module a Facet's built entry reaches belongs to a domain it
 * declares, and every domain it declares has its screen in there.
 *
 * **Two halves, because there are two failures.** A crossing — anything under
 * `src/lib/views/` owned by a domain this Facet does not hold — is the failure
 * ADR-0078 §8 names, and it is judged over the whole surface rather than over
 * the six screens: the screens are six of ninety modules, and a population of
 * screens alone passes an `ItemCard` imported into a food component, which is
 * the same crossing one file down. A *missing* screen is the other failure, and
 * it is caught by nothing else: a Rations build whose food screen tree-shook
 * away ships as an installed app that opens on nothing. Only the screens can be
 * checked that way round, because only they are enumerable from the registry.
 *
 * **Against the built entry, never a source-level import walk** (ADR-0083 §5). A
 * walk over `import` statements would be cheaper and would need no `dist/`, and
 * it would false-positive on every Facet: ADR-0076 §6 makes identity a
 * build-time constant precisely so the bundler drops the other Facets' code, and
 * a source walk sees every module behind every dropped branch.
 *
 * What no domain owns is **counted, not passed in silence**. `SettingsView` and
 * the ledger, log and storage blocks are the jar-wide surface, and which Facet
 * carries one is the judgement ADR-0083 §10 declined to gate — so the number
 * goes in the passing message, where a reader can see the size of what this
 * check is not looking at.
 */
export function checkViewContainment(
  facet: Facet,
  bundle: FacetBundle | undefined
): Claim {
  if (!bundle) {
    return {
      ok: false,
      message:
        `${facet.name}: the build recorded no module graph, so what its entry ` +
        `reaches is unknown rather than correct.`,
    };
  }

  const declared = new Set(facet.domains);
  const reached = bundle.modules.filter((m) => m.startsWith(VIEWS_ROOT));
  const owners = reached.map(
    (module) => [module, ownerOfViewModule(module)] as const
  );

  const crossings = owners
    .filter(([, owner]) => owner && !declared.has(owner.id))
    .map(([module, owner]) => `${module} (${owner!.name})`)
    .sort();
  const unowned = owners.filter(([, owner]) => !owner).length;

  const expected = screensOf(facet.id);
  const missing = expected.filter((screen) => !reached.includes(screen));

  if (crossings.length === 0 && missing.length === 0) {
    return {
      ok: true,
      message:
        `${facet.name} reaches ${reached.length} view module` +
        `${reached.length === 1 ? "" : "s"} from ${bundle.entryChunk}, all ` +
        `${expected.length} of its screens and nothing another domain owns ` +
        `(${unowned} jar-wide, unjudged)`,
    };
  }

  const lines = [];
  if (crossings.length > 0) {
    lines.push(
      `${facet.name}: its built entry reaches ${crossings.length} view module` +
        `${crossings.length === 1 ? "" : "s"} belonging to a domain it does ` +
        `not declare, which is a way out of the Facet (ADR-0078 §1):\n` +
        crossings.map((m) => `    + ${m}`).join("\n")
    );
  }
  if (missing.length > 0) {
    lines.push(
      `${facet.name}: its built entry reaches none of ${missing.length} screen` +
        `${missing.length === 1 ? "" : "s"} its declared domains imply, so the ` +
        `install opens on nothing:\n` +
        missing.map((m) => `    − ${m}`).join("\n")
    );
  }
  return { ok: false, message: lines.join("\n  ") };
}

/**
 * A Facet cleans up outdated precaches only where nothing nests inside it.
 *
 * `workbox-precaching@7.4.1`'s `deleteOutdatedCaches` filters cache names with
 * `cacheName.includes(self.registration.scope)`, a substring test, and the
 * root's scope is a substring of every nested Facet's cache name — so with the
 * option on, **the root service worker deletes the entire Rations offline
 * install on every activation**.
 *
 * Read off the roster rather than written down against `root`, exactly as
 * `vite.config.ts` sets it, so the gate and the config cannot come apart and a
 * third Facet costs no edit here. Asserted on the emitted `sw.js` rather than on
 * the config, because a workbox major changing the default needs no source
 * change at all — which is what makes this the cheapest of the four and the only
 * one an upgrade can break on its own.
 */
export function checkOutdatedCacheCleanup(
  facet: Facet,
  serviceWorker: string
): Claim {
  const nested = nestedFacetsOf(facet.id);
  const expected = nested.length === 0;
  const found = /cleanupOutdatedCaches\s*\(/.test(serviceWorker);

  if (found === expected) {
    return {
      ok: true,
      message:
        `the ${facet.name} service worker ${found ? "cleans up" : "leaves"} ` +
        `outdated caches, which is right for a scope ` +
        (expected
          ? "nothing nests inside"
          : `holding ${nested.map((f) => f.name).join(", ")}`),
    };
  }
  if (found) {
    return {
      ok: false,
      message:
        `the ${facet.name} service worker calls cleanupOutdatedCaches(), and ` +
        `${nested.map((f) => f.scope).join(", ")} sit${
          nested.length === 1 ? "s" : ""
        } inside its scope ${facet.scope}. Workbox filters cache names by ` +
        `substring, so on every activation this deletes the whole ` +
        `${nested.map((f) => f.name).join(", ")} offline install. Turn ` +
        `cleanupOutdatedCaches off for this Facet in vite.config.ts.`,
    };
  }
  return {
    ok: false,
    message:
      `the ${facet.name} service worker does not call ` +
      `cleanupOutdatedCaches(), ` +
      `and nothing nests inside ${facet.scope}, so it has nothing to protect ` +
      `and keeps a stale precache forever after a workbox precache-version ` +
      `bump. Turn it back on for this Facet.`,
  };
}

/** One rostered Facet's emitted manifest, as parsed JSON. */
export interface RosteredManifest {
  readonly facet: Facet;
  readonly manifest: unknown;
}

/**
 * At most one rostered manifest declares a `share_target` (ADR-0084 §8).
 *
 * **At most one, not exactly one.** Which Facet owns a hand-off is ADR-0084 §1's
 * argument — the root owns this one because what it carries is a URL to a
 * physical item — and a gate asserting the root keeps it would re-record that
 * conclusion with its reason discarded, which is the registry field §8 refused.
 * The roster supplies identity; the invariant supplies the claim.
 *
 * It proves the **declaration** and explicitly not that any browser registered
 * it. Nothing in a build can see a share sheet (ADR-0084 §9).
 */
export function checkShareTargets(
  manifests: readonly RosteredManifest[]
): Claim {
  const declaring = manifests.filter(
    (m) =>
      typeof m.manifest === "object" &&
      m.manifest !== null &&
      "share_target" in m.manifest
  );

  if (declaring.length <= 1) {
    return {
      ok: true,
      message:
        declaring.length === 0
          ? `no rostered manifest declares a share target`
          : `only ${declaring[0].facet.name} declares a share target, of ` +
            `${manifests.length} rostered manifests`,
    };
  }
  return {
    ok: false,
    message:
      `${declaring.length} rostered manifests declare a share target — ` +
      `${declaring.map((m) => m.facet.name).join(", ")}. A hand-off belongs ` +
      `to exactly one Facet (ADR-0084 §1), and two manifests declaring one at ` +
      `two scopes forward nothing to each other. Whichever is new was ` +
      `acquired by copying a manifest rather than by arguing ownership.`,
  };
}
