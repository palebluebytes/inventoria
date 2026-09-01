#!/usr/bin/env node
/**
 * Entity ownership checks (ADR-0086 §7). Run with `pnpm check:entities`; also
 * chained into `pnpm check`.
 *
 * ADR-0079 §3 derives a Facet-scoped delete button's predicate from the entity
 * prefixes a Facet owns, and that is sound only where each prefix has exactly
 * one owner. ADR-0076 §4 had already documented the one-owner rule and `isbn:`
 * collided anyway, so the interesting half of this gate is not the registry: it
 * is `src/`. Every defect ADR-0086 found was a place where the **code** minted
 * something the documentation did not know about, and a gate reading only the
 * registry passes straight through all of them.
 *
 * So the invariant is made true by construction — `mintEntity` is the one door,
 * and its prefix argument is a compile-time union — and this asserts three
 * things a type cannot:
 *
 *   1. No prefix is contained by another **owner's** prefix. Same-owner nesting
 *      is legal and expected (`twin:gtin_` inside `twin:`); cross-owner nesting
 *      is the defect, and an equality check misses every instance of it.
 *   2. Nothing outside the chokepoint constructs an entity id.
 *   3. Every declared prefix is actually mintable, so the roster does not
 *      accumulate prefixes no code has used since 2026-06. That is not
 *      hypothetical: ADR-0014's 2026-08 amendment declared three live prefixes
 *      dead and the registry was built from that list.
 *
 * FAIL sets a non-zero exit.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
/** The one module allowed to build an entity id (ADR-0086 §7). */
const CHOKEPOINT = "src/lib/facets/entity-id.ts";
/** The registry is data about ids, not a construction site. */
const REGISTRY = "src/lib/facets/registry.ts";

let failures = 0;
const fail = (m) => {
  failures++;
  console.error(`FAIL  ${m}`);
};
const ok = (m) => console.log(`  ok  ${m}`);

const { TRACKED_DOMAINS, ENTITY_PREFIXES } = await import(
  pathToFileURL(join(ROOT, REGISTRY)).href
);

// ── 1. one owner per prefix, compared by containment ─────────────────────────

const owners = new Map();
for (const domain of TRACKED_DOMAINS) {
  for (const prefix of domain.entityPrefixes) {
    if (owners.has(prefix)) {
      fail(
        `entity prefix "${prefix}" is declared by both ${owners.get(prefix)} and ${domain.id}`
      );
    }
    owners.set(prefix, domain.id);
  }
}

let containmentViolations = 0;
for (const [outer, outerOwner] of owners) {
  for (const [inner, innerOwner] of owners) {
    if (outer === inner) continue;
    if (!inner.startsWith(outer)) continue;
    if (outerOwner === innerOwner) continue;
    containmentViolations++;
    fail(
      `entity prefix "${inner}" (${innerOwner}) sits inside "${outer}" (${outerOwner}), ` +
        `so a read scoped to "${outer}" takes ${innerOwner}'s rows`
    );
  }
}
if (!containmentViolations && owners.size === ENTITY_PREFIXES.length) {
  ok(
    `all ${owners.size} entity prefixes have exactly one owner, by containment`
  );
}

// ── the source corpus ────────────────────────────────────────────────────────

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|svelte)$/.test(path)) out.push(path);
  }
  return out;
}
const sources = walk(SRC).map((p) => [
  relative(ROOT, p),
  readFileSync(p, "utf8"),
]);

// ── 2. nothing outside the chokepoint constructs an entity id ────────────────

/**
 * A template literal whose first chunk starts with a declared prefix and which
 * interpolates something — that is a *construction*, as distinct from the many
 * legitimate comparisons (`entity.startsWith("isbn:")`, `LIKE 'twin:%'`) that
 * name a prefix without building an id.
 */
const CONSTRUCTION = /`([^`\\$]*)\$\{/g;

let strays = 0;
for (const [path, text] of sources) {
  if (path === CHOKEPOINT) continue;
  for (const match of text.matchAll(CONSTRUCTION)) {
    const head = match[1];
    // `head` is the literal text before the first interpolation. It is a
    // construction when the whole prefix is already there (`gtin:${code}`), and
    // also when the interpolation would *complete* a declared prefix
    // (`tmdb:${kind}:${id}`) — the second is the shape a scan looking only for
    // whole prefixes would wave through. The colon guard keeps a one-letter
    // head like `t${x}` from matching `tmdb:movie:` by accident.
    const prefix = ENTITY_PREFIXES.find(
      (p) => head.startsWith(p) || (head.includes(":") && p.startsWith(head))
    );
    if (!prefix) continue;
    const line = text.slice(0, match.index).split("\n").length;
    strays++;
    fail(
      `${path}:${line} builds an entity id ("${prefix}…") outside ${CHOKEPOINT}. ` +
        `Route it through mintEntity() so the registry stays the only roster.`
    );
  }
}
if (!strays) {
  ok(
    `no entity id is constructed outside ${CHOKEPOINT} (${sources.length} files)`
  );
}

// ── 3. every declared prefix is minted somewhere ─────────────────────────────

const mintArguments = new Set();
for (const [path, text] of sources) {
  if (path === REGISTRY) continue;
  for (const match of text.matchAll(/mintEntity\(\s*"([^"]+)"/g)) {
    mintArguments.add(match[1]);
  }
  // The scraper maps a discovered identifier to a prefix through a lookup, so
  // its eight are declared as values rather than passed as literals.
  for (const match of text.matchAll(/:\s*"(twin:[a-z_]+)"/g)) {
    mintArguments.add(match[1]);
  }
}
// `twin:` is owned whole and deliberately never minted bare: every item id
// carries a second segment naming where it came from. It is the roster's entry
// for a prefix-scoped read, so it is exempt rather than missing.
const NEVER_MINTED_BARE = new Set(["twin:"]);
const unminted = [...owners.keys()].filter(
  (p) => !mintArguments.has(p) && !NEVER_MINTED_BARE.has(p)
);
if (unminted.length) {
  fail(
    `declared but minted nowhere in src/: ${unminted.join(", ")}. ` +
      `A roster that outlives its call sites is how ADR-0014's list came to name three live prefixes as dead.`
  );
} else {
  ok(`every declared prefix has a minting site (${mintArguments.size} found)`);
}

console.log(
  `\nchecked ${owners.size} entity prefixes across ${TRACKED_DOMAINS.length} tracked domains.`
);
if (failures) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log("all checks passed.");
