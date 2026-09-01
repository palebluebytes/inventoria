import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The backlink gate, which `docs/adr/README.md` calls "the highest-value rule
// here": if a record says it amends another, the older one's header must name
// the newer, because a reader landing on the overtaken record is the one who
// would otherwise implement a design that was explicitly overturned.
//
// Until #261 the gate could not see the way this repo actually declares an
// amendment. `**Amends:** [ADR-NNNN](…)` is a *header trailer*, and the scan ran
// over `body`, which is defined as everything after the header block. So the
// documented convention created no obligation at all and the gate printed `ok`
// for a backlink that was not there. Every backlink in the corpus had been added
// by hand.
//
// These tests run the real script against a throwaway repo, because the failure
// mode being fixed is one where the script cheerfully reports success: an
// assertion about its output is the only thing that can tell the two apart.

const SCRIPT = fileURLToPath(
  new URL("../../scripts/docs-check.mjs", import.meta.url)
);

let repo: string;

/** The four pages the prose checks read unconditionally. Empty is enough. */
const PROSE_PAGES = [
  "README.md",
  "docs/append-only-ledger.md",
  "docs/eavt-vocabulary.md",
  "docs/how-to-add-a-tracked-domain.md",
];

const write = (rel: string, text: string) => {
  const path = join(repo, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

/**
 * An ADR with the header block the README specifies: `**Status:**` and any
 * trailers, each line ending in the two spaces that make the block one
 * paragraph, then a blank line and the prose.
 */
const adr = (n: number, title: string, trailers: string[] = [], body = "") =>
  `# ADR ${String(n).padStart(4, "0")}: ${title}\n\n` +
  ["**Status:** Accepted", "**Date:** 2026-01-01", ...trailers]
    .map((l) => `${l}  `)
    .join("\n") +
  `\n\n## Context\n\n${body || "Nothing."}\n`;

/** Runs the real gate in the throwaway repo and hands back what it said. */
const run = () => {
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: repo,
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "docs-check-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
  for (const p of PROSE_PAGES) write(p, "# Placeholder\n");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("the backlink gate reads header trailers (#261)", () => {
  it("fails when a header-declared amendment has no backlink", () => {
    write("docs/adr/0001-older.md", adr(1, "The older decision"));
    write(
      "docs/adr/0002-newer.md",
      adr(2, "The newer decision", [
        "**Amends:** [ADR-0001](0001-older.md) (§1 is narrowed)",
      ])
    );

    const { code, out } = run();

    // The whole point: this used to pass.
    expect(code).toBe(1);
    expect(out).toContain("0001-older.md");
    expect(out).toContain("ADR-0002 declares it revises this record");
  });

  it("passes once the older record's header names the newer", () => {
    write(
      "docs/adr/0001-older.md",
      adr(1, "The older decision", [
        "**Amended by:** [ADR-0002](0002-newer.md) (§1 is narrowed)",
      ])
    );
    write(
      "docs/adr/0002-newer.md",
      adr(2, "The newer decision", [
        "**Amends:** [ADR-0001](0001-older.md) (§1 is narrowed)",
      ])
    );

    const { code, out } = run();

    expect(code).toBe(0);
    expect(out).toContain(
      "declared ADR relationships are linked from both ends"
    );
  });

  it("does not read an `Amended by:` trailer as a declaration", () => {
    // The shape that made a naive header scan wrong, taken from ADR-0049: its
    // trailer names *the #144 Amendment below* as the amending record, and
    // mentions a second ADR only in a subordinate clause describing which corpus
    // moved. A loose prose regex reads "Amended by … ADR-0003" as "0002 amends
    // 0003", which is false, and would demand a backlink for a relationship that
    // does not exist. Only `**Amends:**` declares.
    write("docs/adr/0003-a-third.md", adr(3, "A third decision"));
    write(
      "docs/adr/0002-newer.md",
      adr(2, "The newer decision", [
        "**Amended by:** the #144 Amendment below, which re-derives the map over " +
          "the corpus [ADR-0003](0003-a-third.md)'s own amendment left behind",
      ])
    );

    const { code, out } = run();

    expect(code).toBe(0);
    expect(out).not.toContain("0003-a-third.md");
  });
});

describe("the corpus includes records that are not committed yet (#261)", () => {
  it("sees an ADR that has never been git added", () => {
    // `git ls-files` alone passed an unstaged record by not knowing it existed,
    // which is silence at exactly the moment somebody is writing the thing the
    // checks are for. Nothing here is committed.
    write("docs/adr/0001-older.md", adr(1, "The older decision"));
    write(
      "docs/adr/0002-newer.md",
      adr(2, "The newer decision", [
        "**Amends:** [ADR-0001](0001-older.md) (§1 is narrowed)",
      ])
    );

    const { code, out } = run();

    expect(code).toBe(1);
    expect(out).toContain("2 ADR");
  });

  it("still honours .gitignore, so an ignored record stays out", () => {
    write(".gitignore", "docs/adr/0002-*\n");
    write("docs/adr/0001-older.md", adr(1, "The older decision"));
    write(
      "docs/adr/0002-newer.md",
      adr(2, "The newer decision", [
        "**Amends:** [ADR-0001](0001-older.md) (§1 is narrowed)",
      ])
    );

    const { code, out } = run();

    expect(code).toBe(0);
    expect(out).toContain("1 ADR");
  });
});
