#!/usr/bin/env node
/**
 * The four Facet claims that need a build (ADR-0083 §8). Runs with
 * `pnpm check:facets`; also chained onto `pnpm build`, which is the only moment
 * there is a `dist/` to check.
 *
 * ADR-0083's subject is a gate that goes green over the thing it exists to
 * catch, and four of the arc's claims were in that state: written down in a
 * record, true today, and checked by nothing.
 *
 *   1. **The precache band** (§3). Each Facet's total precache bytes land inside
 *      ±5% of the figure the registry declares. A band rather than a ceiling: a
 *      ceiling passes a manifest that has *collapsed*, and the offline gate
 *      cannot see one that merely dropped the USDA statics because they are read
 *      after `mount()`.
 *   2. **View containment** (§5, ADR-0078 §8). The screens a Facet's built entry
 *      reaches are *equal* to the set its declared domains imply. Equality
 *      because a crossing and a tree-shaken-away screen are both failures, and
 *      only one of them is caught by a subset check.
 *   3. **The outdated-cache cleanup** (§7). Off for the root, on for Rations,
 *      asserted on the emitted `sw.js`. The cheapest of the four and the only
 *      one a dependency upgrade can break with no source change.
 *   4. **At most one share target** (ADR-0084 §8), over the rostered manifests.
 *      The declaration, and explicitly not that any browser registered it.
 *
 * WHAT IT READS, AND WHY THAT IS ONE THING
 *
 * `.facets/bundle-metadata.json`, written by `vite.config.ts`'s `facet-bundles`
 * plugin out of the bundler's own `generateBundle` metadata, plus the emitted
 * service workers and manifests for the two claims that are about a *file* the
 * browser reads rather than about the graph. Three readers computing
 * "reachable" separately would drift, and the whole point of a band is that it
 * and the containment check are two readings of one number (ADR-0083 §6).
 *
 * **No gate here names a file under `dist/`** (ADR-0083 §1). The roster is
 * enumerated from `src/lib/facets/registry.ts` and every path is derived from a
 * Facet's own scope, so a third Facet costs one registry entry and no edit here.
 * The rules themselves live in `src/lib/facets/checks.ts` and are unit-tested:
 * this file fails loudly if it cannot read something, and a rule that is quietly
 * wrong is the failure mode that matters.
 *
 * Exit 0 pass, 1 a claim failed, 2 this check could not run.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIST,
  FACETS,
  inScope,
  load,
  manifestUrlOf,
  readBuildMetadata,
  stopper,
} from "./facet-build.mjs";

const {
  checkPrecacheBand,
  checkViewContainment,
  checkOutdatedCacheCleanup,
  checkShareTargets,
} = await load("src/lib/facets/checks.ts");

const cannotRun = stopper("facet-checks");
const { bundleOf, precacheOf } = readBuildMetadata(cannotRun);

/** Read an emitted file, or stop: a missing one is a build this cannot judge. */
const emitted = (facet, path, what) => {
  const full = join(DIST, path);
  if (!existsSync(full)) {
    cannotRun(
      `the ${facet.name} Facet has no ${what} at dist/${path}.\n` +
        "  Either the build did not finish or its metadata artifact is stale;\n" +
        "  `pnpm build` writes both together."
    );
  }
  return readFileSync(full, "utf8");
};

// ── the claims ───────────────────────────────────────────────────────────────

let failures = 0;
const report = (claim) => {
  if (claim.ok) {
    console.log(`  ok  ${claim.message}`);
    return;
  }
  failures++;
  console.error(`FAIL  ${claim.message}`);
};

for (const facet of FACETS) {
  report(checkPrecacheBand(facet, precacheOf(facet)));
  report(checkViewContainment(facet, bundleOf(facet)));
  report(
    checkOutdatedCacheCleanup(
      facet,
      emitted(facet, inScope(facet, "sw.js"), "service worker")
    )
  );
}

report(
  checkShareTargets(
    FACETS.map((facet) => ({
      facet,
      manifest: JSON.parse(
        emitted(facet, manifestUrlOf(facet).replace(/^\//, ""), "manifest")
      ),
    }))
  )
);

if (failures > 0) {
  console.error(
    `\nfacet-checks: ${failures} claim${failures === 1 ? "" : "s"} failed. ` +
      "Each one is a\n" +
      "  property of the built artifact rather than of the source, so a green\n" +
      "  `pnpm check` says nothing about it — see docs/adr/0083-a-gate-that-\n" +
      "  names-one-entry-point-proves-one-facet.md."
  );
  process.exit(1);
}
