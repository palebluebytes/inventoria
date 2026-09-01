/**
 * What the two build-time Facet gates both need: the roster, the build's own
 * metadata artifact, and a way to spell a path inside a Facet's scope.
 *
 * `scripts/facet-checks.mjs` and `scripts/offline-boot-check.mjs` are two
 * commands with two exit-code contracts and no shared claim between them — but
 * they read the same three things, and a second copy of "which chunk is Rations'
 * entry" is exactly the drift ADR-0083 §6 refuses one level up. One artifact,
 * one reader.
 *
 * A library, not a command. It changes when the build's output layout does,
 * never when a claim does.
 */

import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolve } from "./ts-resolve-hook.mjs";

// The app is written for a bundler, so its modules import each other without a
// file extension and Node's resolver will not follow that. Registered here
// rather than in each gate, because importing this is what makes it necessary.
registerHooks({ resolve });

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const DIST = join(ROOT, "dist");

/**
 * Import an app module by project-relative path.
 *
 * **Dynamic, and it has to be.** A static `import … from "../src/…/checks.ts"`
 * is resolved at link time, before any module body runs — so the hook above
 * would be registered too late to help that module's own extensionless imports,
 * and the gate would die on a file that is plainly there.
 */
export const load = (module) => import(pathToFileURL(join(ROOT, module)).href);

export const { FACETS } = await load("src/lib/facets/registry.ts");
export const { manifestUrlOf } = await load("src/lib/facets/manifest.ts");
const { FACET_BUNDLE_METADATA_PATH } = await load("src/lib/facets/precache.ts");

/**
 * Stop, saying which gate and why. Exit 2 in both gates means the same thing —
 * *this check could not run* — as distinct from exit 1, a claim that failed.
 */
export const stopper = (gate) => (message) => {
  console.error(`${gate}: ${message}`);
  process.exit(2);
};

/**
 * The build's record of what each Facet reaches and precaches, or a stop.
 *
 * Both `dist/` and the artifact have to be there, and they have to be from the
 * same build — which nothing here can prove, so each caller checks the files it
 * is about to read still exist and says "stale artifact" rather than "broken
 * app" when one does not.
 */
export function readBuildMetadata(cannotRun) {
  const path = join(ROOT, FACET_BUNDLE_METADATA_PATH);
  if (!existsSync(DIST) || !existsSync(path)) {
    cannotRun(
      "no build to check. Run `pnpm build`, which writes both dist/ and\n" +
        `  ${FACET_BUNDLE_METADATA_PATH} and then runs this.`
    );
  }

  const metadata = JSON.parse(readFileSync(path, "utf8"));
  return {
    bundleOf: (facet) => metadata.facets.find((b) => b.facet === facet.id),
    precacheOf: (facet) => metadata.precaches.find((p) => p.facet === facet.id),
  };
}

/**
 * A path inside a Facet's own scope, as the build spells it: dist-relative, no
 * leading slash.
 *
 * Every per-Facet artifact sits inside the scope it serves — `vite.config.ts`
 * derives the service worker's filename and the entry HTML's location the same
 * way — so this is the one place a `dist/` path is built, and it is built from
 * the roster rather than written down (ADR-0083 §1).
 */
export const inScope = (facet, name) =>
  `${facet.scope.replace(/^\//, "")}${name}`;
