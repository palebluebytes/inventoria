import { readFileSync } from "node:fs";

/**
 * Reading a module's own source, for the claims that cannot be rendered.
 *
 * Several suites pin structural claims — which module a value comes from, which
 * prop a component is handed, which call happens before which — against source
 * rather than behaviour, because the surfaces they are about need a browser, a
 * portal or a real OPFS file to render. They were each declaring their own
 * reader; this is the one they share.
 *
 * Paths are repo-relative, so a claim reads as the path a reader would open.
 */
const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

/** The file as it is written, comments included. */
export function readSource(path: string): string {
  return read(path);
}

/**
 * The file with its comments taken out, so a sentence in a doc comment cannot
 * satisfy a claim about code. Block comments, line comments and markup comments,
 * which is every kind a `.ts` or `.svelte` file has.
 *
 * **A block comment has to START somewhere**, and the opener is anchored rather
 * than searched for, because an unanchored one blinds far more than it strips:
 * `accept="image/*"` in `FoodStager.svelte` opens a comment that runs to the
 * next `*\/` — 36,060 characters and 764 lines of markup further down, the
 * pairing sheet's mount among them. Every claim a suite made about that region
 * passed against an empty string. So `/*` counts only where a comment can
 * actually begin: at the start of a line or after whitespace or a delimiter,
 * which is where every real one in this repo is written and where a MIME wildcard
 * inside a quoted attribute never is.
 */
export function readCode(path: string): string {
  return read(path)
    .replace(/(^|[\s{;(,=[])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}
