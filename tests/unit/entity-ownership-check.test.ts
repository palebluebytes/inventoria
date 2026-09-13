import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The biconditional ADR-0096 §13 buys the Jar domain with: **a domain with
// views is declared by at least one Facet; a domain with no views is declared
// by none.**
//
// Its second half is the load-bearing one. `deletion:` has to sit outside every
// Facet's prefix set or a Facet-scoped wipe deletes its own record of itself,
// and that absence is arithmetic — `entityPrefixesOf` is the union of
// `domainsOf(facetId)` — so the only thing that can break it is somebody adding
// the Jar domain to a Facet's list. Nothing else in the build would object: the
// wipe would simply start taking the rows and report success.
//
// So the claim under test is that the gate *fails*, and the real script run
// against a throwaway repo is the only thing that can tell a refusal from the
// silent pass it replaced. Same arrangement as `docs-check.test.ts`, and for
// the same reason.

const SCRIPT = fileURLToPath(
  new URL("../../scripts/entity-ownership-check.mjs", import.meta.url)
);

let repo: string;

const write = (rel: string, text: string) => {
  const path = join(repo, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

/**
 * A registry with whatever roster the case needs. Only the three exports the
 * script reads are here; everything else about the real file is beside the
 * point of a gate that reads data.
 */
const registry = (
  domains: {
    id: string;
    entityPrefixes: string[];
    views: string[];
  }[],
  facets: { id: string; domains: string[] }[]
) => `
export const TRACKED_DOMAINS = ${JSON.stringify(
  domains.map((d) => ({ name: d.id, storagePrefixes: [], ...d })),
  null,
  2
)};
export const ENTITY_PREFIXES = TRACKED_DOMAINS.flatMap((d) => d.entityPrefixes);
export const FACETS = ${JSON.stringify(facets, null, 2)};
`;

/**
 * A minting site for every prefix these cases declare, so check 3 is satisfied
 * and the biconditional is the only thing a case can fail on.
 *
 * `deletion:` is here because #402 minted it: the prefactor exemption #392
 * earned is spent, so the Jar domain's prefix is now an ordinary declared
 * prefix with an ordinary minting site.
 */
const MINTS = `
import { mintEntity } from "./facets/entity-id";
export const one = () => mintEntity("gtin:", 1);
export const two = (key) => mintEntity("deletion:", key);
`;

const run = () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: repo,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "entity-ownership-"));
  write("src/lib/mints.ts", MINTS);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

/** A content domain: one prefix, one screen, and a Facet that declares it. */
const FOOD = {
  id: "food",
  entityPrefixes: ["gtin:"],
  views: ["src/lib/views/FoodView.svelte"],
};
/** The shape under test: a prefix, no screen, and no Facet. */
const JAR = { id: "jar", entityPrefixes: ["deletion:"], views: [] };
const ROOT = { id: "root", domains: ["food"] };

describe("the views/Facet biconditional (ADR-0096 §13)", () => {
  it("passes the arrangement the Jar domain actually ships in", () => {
    write("src/lib/facets/registry.ts", registry([FOOD, JAR], [ROOT]));

    const { status, output } = run();

    expect(output).toContain("every domain with a screen is in a Facet");
    expect(output).toContain("(1 with, 1 without)");
    expect(status).toBe(0);
  });

  it("refuses a Facet that declares a domain with no screen", () => {
    // The fatal move: `deletion:` inside a Facet's derived prefix set, which is
    // a wipe deleting its own record of itself. The message names the prefixes
    // that just entered the wipe, because that is the consequence rather than
    // the shape.
    write(
      "src/lib/facets/registry.ts",
      registry([FOOD, JAR], [{ id: "root", domains: ["food", "jar"] }])
    );

    const { status, output } = run();

    expect(output).toContain('tracked domain "jar" has no screen');
    expect(output).toContain("deletion:");
    expect(status).not.toBe(0);
  });

  it("refuses a domain with a screen that no Facet declares", () => {
    // The half that repairs a coverage nobody had asserted: every domain sat in
    // the root, so ADR-0083 §5 covered the roster incidentally and a content
    // domain with a forgotten Facet entry would get no install and no failure.
    write(
      "src/lib/facets/registry.ts",
      registry([FOOD, JAR], [{ id: "root", domains: [] }])
    );

    const { status, output } = run();

    expect(output).toContain('tracked domain "food"');
    expect(output).toContain("no Facet declares it");
    expect(status).not.toBe(0);
  });
});

describe("the prefactor exemption is spent (#392, #402)", () => {
  // `deletion:` was declared ahead of the code that minted it, so check 3 would
  // have read it as the rot it exists to catch. #402 mints it, the entry in
  // `DECLARED_BEFORE_ITS_MINT` went with the ticket that earned it, and what is
  // left is check 3 holding the Jar domain's prefix to the same rule as every
  // other one.
  it("refuses a declared prefix with no minting site again", () => {
    write("src/lib/facets/registry.ts", registry([FOOD, JAR], [ROOT]));
    write(
      "src/lib/mints.ts",
      `
import { mintEntity } from "./facets/entity-id";
export const one = () => mintEntity("gtin:", 1);
`
    );

    const { status, output } = run();

    expect(output).toContain("declared but minted nowhere");
    expect(output).toContain("deletion:");
    expect(status).not.toBe(0);
  });

  it("names no exemption at all on a passing run", () => {
    write("src/lib/facets/registry.ts", registry([FOOD, JAR], [ROOT]));

    const { status, output } = run();

    expect(output).not.toContain("declared ahead of its mint");
    expect(status).toBe(0);
  });
});
