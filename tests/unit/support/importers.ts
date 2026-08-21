import { readdirSync, readFileSync } from "node:fs";

/**
 * Every file under `src/` that IMPORTS the named module.
 *
 * Three modules are reached only by the USDA generator, through the esbuild seam
 * in `scripts/usda-app-module.mjs`: the OFF deny-list, the twin-adjudication
 * ledger and the food-kind roster. Each keeps hundreds of lines of editorial
 * judgement out of the bundle a user downloads, and each has a test asserting
 * that the arrangement still holds. This is the question all of them ask.
 *
 * An IMPORT, not a mention: those modules name each other in the comments that
 * explain the arrangement, and a substring grep would read that as a dependency
 * and be satisfied by deleting the sentence doing the documenting.
 *
 * @param module - The module's basename, without extension.
 */
export function importersOf(module: string): string[] {
  const pattern = new RegExp(
    `^\\s*import[\\s\\S]*?from\\s+["'][^"']*${module}["']`,
    "m"
  );
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : /\.(ts|svelte)$/.test(entry.name)
          ? [`${dir}/${entry.name}`]
          : []
    );
  return walk("src")
    .filter((path) => !path.endsWith(`/${module}.ts`))
    .filter((path) => pattern.test(readFileSync(path, "utf8")));
}
