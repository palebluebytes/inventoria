/**
 * Let a plain-Node script `import()` an app module that imports its neighbours.
 *
 * Node strips types from a `.ts` file on its own, so a script has been able to
 * borrow `src/lib/facets/registry.ts` since #306 with no machinery at all. What
 * it cannot do is resolve that module's own `from "./manifest"` — the app is
 * written for a bundler, where an extensionless relative specifier is normal,
 * and Node's ESM resolver requires the extension. So the first module that
 * imports a second one fails with `ERR_MODULE_NOT_FOUND` on a file that is
 * plainly there.
 *
 * This is registered by the gates that read the roster
 * (`scripts/facet-checks.mjs`, `scripts/offline-boot-check.mjs`) and does one
 * thing: when a **relative, extensionless** specifier does not resolve, try it
 * again with `.ts`. Anything else — a bare package name, a real typo, a missing
 * dependency — is rethrown untouched, so a broken import still fails as a
 * broken import.
 *
 * The alternative was `esbuild --bundle` into a temp module, which
 * `scripts/usda-app-module.mjs` does for the USDA generators. That is right
 * there: those scripts borrow seven modules' worth of the food pipeline and pay
 * for a real bundler. A build gate borrowing the registry should not need a
 * subprocess and a scratch directory to read a list of two Facets.
 *
 * Writing `./manifest.ts` in the app's own imports would also work for Node and
 * is refused: `tsconfig.app.json` does not set `allowImportingTsExtensions`, so
 * it would be one extension the whole of `src/` does not use, adopted to suit a
 * script.
 */

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

/**
 * Synchronous, because `module.registerHooks` runs its hooks in-thread — which
 * is also why it replaces `module.register`, deprecated since Node 26 for
 * spinning up a hooks thread nothing here needs.
 */
export function resolve(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code !== "ERR_MODULE_NOT_FOUND" ||
      !RELATIVE.test(specifier) ||
      HAS_EXTENSION.test(specifier)
    ) {
      throw error;
    }
    return nextResolve(`${specifier}.ts`, context);
  }
}
