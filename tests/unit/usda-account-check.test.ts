import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// generator whose account it reads.
// @ts-ignore
import { accountFromArtifacts } from "../../scripts/usda-account-check.mjs";

// The gate's own header carries why it exists (#437, and #156 behind it). These
// tests answer the other half of the ticket: that it FIRES. So they run the real
// script against a throwaway tree and watch it fail.
//
// A gate is only worth the failure it produces, and this repo has shipped two
// that produced none: #156's audit, and `docs-check.mjs`'s backlink rule, which
// printed `ok` for years over an obligation it could not see. An assertion that
// the script exists would reproduce both.

const SCRIPT = fileURLToPath(
  new URL("../../scripts/usda-account-check.mjs", import.meta.url)
);

const INDEX_PATH = "public/usda/search-index.json";
const CENSUS_PATH = "docs/research/usda-drop-census.json";
const ARM_INDEX_PATH = "public/usda/pairing-index.json";
const ARM_CENSUS_PATH = "docs/research/usda-pairing-collapse.json";
const ACCOUNT_PATH = "docs/research/190-corpus-account.md";

let repo: string;

const write = (rel: string, text: string) => {
  const path = join(repo, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
};

/** Runs the real gate in the throwaway tree and hands back what it said. */
const run = () => {
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: repo,
    encoding: "utf8",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};

/**
 * A corpus small enough to read, made of real USDA descriptions.
 *
 * Every group below is one of the four things the account counts, because a
 * fixture that exercises one of them proves a gate that reads one of them:
 *
 * - `Beef` and `Veal` merge and ship under their RESIDUAL name (§5's strip).
 * - `Lamb` is a COVERAGE HOLE: every record in the group states `separable lean
 *   only`, a non-preferred value, so none may represent it and the fullest panel
 *   ships under its own whole name.
 * - `Pork` is an ADR-0062 §3 REFUSAL: the representative was eligible and kept
 *   its segments anyway, which is what the corpus looks like when the residual
 *   name was already taken. It is the branch the shipped corpus does not
 *   exercise — 0 strips are refused today — so it is the branch a fixture owes.
 * - `Bread` and `Cheese` are the rest of the corpus: groups of one, which no
 *   rule here touches and which the account counts without naming.
 *
 * The four moving heads are the four `HEADS_THE_COLLAPSE_MOVES` names, and that
 * is not decoration: the gate asks `assertCollapseReach` before it compares
 * anything, so a fixture moving `Chicken` would fail for the wrong reason.
 */
const shipped = [
  { fdcId: 1, description: "Beef, flank, steak" },
  { fdcId: 4, description: "Lamb, loin, separable lean only" },
  { fdcId: 6, description: "Pork, loin, separable lean and fat" },
  { fdcId: 8, description: "Bread, white wheat" },
  { fdcId: 9, description: "Veal, shank" },
  { fdcId: 11, description: "Cheese, cheddar" },
];

const collapsed = [
  {
    fdcId: 2,
    description:
      'Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice',
    into: 1,
  },
  {
    fdcId: 3,
    description:
      'Beef, flank, steak, separable lean and fat, trimmed to 1/8" fat, select',
    into: 1,
  },
  { fdcId: 5, description: "Lamb, loin, separable lean only, choice", into: 4 },
  {
    fdcId: 7,
    description: "Pork, loin, separable lean and fat, choice",
    into: 6,
  },
  {
    fdcId: 10,
    description: "Veal, shank, separable lean and fat, choice",
    into: 9,
  },
];

const index = { artifact: "usda-search-index", foods: shipped };

/**
 * ADR-0113 §11's arm, at the same scale: the cooked records, collapsed among
 * themselves.
 *
 * `Beans` moves on SALT alone and `Beef` on butchery, which is the comparison
 * §12's honest edit rests on — the shipped fixture above states no salt at all,
 * so the account's two axis lines differ here exactly as they differ in the real
 * corpus. `Carrots` is the arm's group of one.
 */
const armShipped = [
  { fdcId: 20, description: "Beans, snap, green, cooked, boiled, drained" },
  { fdcId: 22, description: "Beef, chuck, cooked, braised" },
  { fdcId: 24, description: "Carrots, cooked, boiled, drained" },
];

const armCollapsed = [
  {
    fdcId: 21,
    description: "Beans, snap, green, cooked, boiled, drained, with salt",
    collapsed_into: 20,
  },
  {
    fdcId: 23,
    description: "Beef, chuck, cooked, braised, separable lean and fat, choice",
    collapsed_into: 22,
  },
];

const armIndex = { artifact: "usda-pairing-index", foods: armShipped };

const armCensus = {
  artifact: "usda-pairing-collapse",
  targets: armShipped.length,
  absorbed: armCollapsed.length,
  collapsed: armCollapsed,
};

/** The two arms, in the shape the gate reads them. */
const arms = () => ({
  shipped: { index, census },
  arm: { index: armIndex, census: armCensus },
});

/** The census, with one non-collapse drop to prove the stage filter is read. */
const census = {
  artifact: "usda-drop-census",
  drops: [
    {
      fdcId: 99,
      description: "Pillsbury Golden Layer Buttermilk Biscuits",
      stage: "food_kind",
      rule: "brand_specific",
    },
    ...collapsed.map((row) => ({
      fdcId: row.fdcId,
      description: row.description,
      stage: "collapse",
      rule: "collapsed_into",
      collapsed_into: row.into,
      collapsed_into_description: shipped.find((s) => s.fdcId === row.into)!
        .description,
    })),
  ],
};

const seed = (
  parts: {
    index?: unknown;
    census?: unknown;
    armIndex?: unknown;
    armCensus?: unknown;
    account?: string;
  } = {}
) => {
  write(INDEX_PATH, JSON.stringify(parts.index ?? index));
  write(CENSUS_PATH, JSON.stringify(parts.census ?? census));
  write(ARM_INDEX_PATH, JSON.stringify(parts.armIndex ?? armIndex));
  write(ARM_CENSUS_PATH, JSON.stringify(parts.armCensus ?? armCensus));
  if (parts.account !== undefined) write(ACCOUNT_PATH, parts.account);
  else write(ACCOUNT_PATH, accountFromArtifacts(arms()));
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "account-check-"));
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("accountFromArtifacts — the account the shipped rows prove", () => {
  const account = accountFromArtifacts(arms());

  it("counts rows in, rows out and absorbed, per head", () => {
    // `Beef` went in as three records and ships as one. The account reads
    // `after` off the index and `absorbed` off the census, so this is the one
    // arithmetic the whole gate rests on.
    expect(account).toMatch(/\|\s*`Beef`\s*\|\s*3\s*\|\s*1\s*\|\s*2\s*\|/);
    expect(account).toMatch(/\|\s*`Lamb`\s*\|\s*2\s*\|\s*1\s*\|\s*1\s*\|/);
    expect(account).toMatch(
      /\|\s*\*\*corpus\*\*\s*\|\s*\*\*11\*\*\s*\|\s*\*\*6\*\*\s*\|\s*\*\*5\*\*\s*\|/
    );
  });

  it("never lists a head the collapse did not move", () => {
    // The criterion #437 states as "the heads the collapse reaches are visible
    // as the four, and the 484 it does not are not padding the file". A table
    // row per head would bury the four in 484 zeroes.
    expect(account).not.toMatch(/\|\s*`Bread`/);
    expect(account).not.toMatch(/\|\s*`Cheese`/);
    expect(account).toContain("4 of the corpus's 6 head phrases move");
    // The prose is wrapped at 80 columns by the generator, so the sentence is
    // matched across the line break rather than as a literal.
    expect(account).toMatch(/The other 2 have\s+nothing to collapse/);
  });

  it("tells a coverage hole from a refused strip from a residual name", () => {
    // Three outcomes that all look like "the survivor kept its segments" from
    // outside, and the account states them as three numbers because they are
    // three different facts: no eligible record, no free name, and a strip that
    // happened.
    expect(account).toContain("4 groups hold more than one record");
    expect(account).toContain("1 of those groups hold no record eligible");
    expect(account).toContain("The other 2 ship their representative");
    expect(account).toMatch(/A further 1 are not among them/);
  });

  it("refuses a census whose survivor is not in the index", () => {
    // ADR-0051 §2's survivor assertion, asked from the committed side: a
    // collapse that lost its survivor is a deletion of 381 foods wearing a
    // collapse's name, and the generator's own copy of this assertion cannot
    // see two artifacts committed out of step.
    const orphaned = {
      ...census,
      drops: census.drops.map((drop) =>
        drop.fdcId === 2 ? { ...drop, collapsed_into: 4242 } : drop
      ),
    };
    expect(() =>
      accountFromArtifacts({ ...arms(), shipped: { index, census: orphaned } })
    ).toThrow(/collapsed into 4242, and no row of .* carries that fdcId/);
  });

  it("accounts for the pairing arm in a second table", () => {
    // ADR-0113 §12's second table. `Beans` went in as two records — one salted,
    // one not — and ships as one, which is the axis §12 coins and the reason the
    // arm's account is not a copy of the corpus's.
    const account = accountFromArtifacts(arms());
    expect(account).toContain("## The pairing arm");
    expect(account).toMatch(/\|\s*`Beans`\s*\|\s*2\s*\|\s*1\s*\|\s*1\s*\|/);
    expect(account).toMatch(
      /\|\s*\*\*arm\*\*\s*\|\s*\*\*5\*\*\s*\|\s*\*\*3\*\*\s*\|\s*\*\*2\*\*\s*\|/
    );
    expect(account).toMatch(/2 of the arm's 3 head phrases move/);
    expect(account).not.toMatch(/\|\s*`Carrots`/);
  });

  it("states each axis's reach in both arms, and salt is the difference", () => {
    // The honest edit §12 names, as two interpolated lines rather than as a
    // sentence: salt claims the one absorbed row here and none of the shipped
    // ones, so "purely butchery" stays exactly true above and is false below.
    const account = accountFromArtifacts(arms());
    expect(account).toMatch(
      /Of the 2 rows this collapse absorbed, separation 1, trim 0, grade 1 and\s+salt 1/
    );
    expect(account).toMatch(
      /of the 5 the shipped one absorbed, separation 5, trim 2, grade 5 and salt\s+0/
    );
    expect(account).toMatch(/Salt claims\s+nothing in the corpus that ships/);
  });

  it("refuses an arm whose collapse reached a row the Search index ships", () => {
    // The claim that licenses two tables instead of one. A group astride both
    // corpora makes the arm's absorbed count an account of neither.
    expect(() =>
      accountFromArtifacts({
        ...arms(),
        arm: {
          index: armIndex,
          census: {
            ...armCensus,
            collapsed: [{ ...armCollapsed[0], collapsed_into: 1 }],
          },
        },
      })
    ).toThrow(/collapsed into 1 in the Pairing arm/);
  });

  it("refuses a corpus in which a fifth head phrase moves", () => {
    // Not the byte comparison talking: the reach is named in
    // `usda-collapse.mjs` and asked before anything is compared, so a rule that
    // has started reaching `Chicken` reports itself as the roster question it
    // is rather than as a diff of a table.
    const wider = {
      foods: [...shipped, { fdcId: 12, description: "Chicken, broilers" }],
    };
    const widerCensus = {
      ...census,
      drops: [
        ...census.drops,
        {
          fdcId: 13,
          description: "Chicken, broilers, separable lean only",
          stage: "collapse",
          rule: "collapsed_into",
          collapsed_into: 12,
        },
      ],
    };
    expect(() =>
      accountFromArtifacts({
        ...arms(),
        shipped: { index: wider, census: widerCensus },
      })
    ).toThrow(/Chicken/);
  });
});

describe("the gate, run as pnpm check runs it", () => {
  it("passes over an account that matches the corpus", () => {
    seed();
    const { status, out } = run();
    expect(out).toContain("ok");
    expect(status).toBe(0);
  });

  it("fails on an account edited by hand", () => {
    // The edit a number-reading gate would bless, and the reason this one
    // compares bytes: every figure in the file is interpolated into a sentence,
    // so "correcting" one in place is indistinguishable from the file being
    // right unless the whole text is rebuilt.
    seed({
      account: accountFromArtifacts(arms()).replace(
        "4 groups hold more than one record",
        "5 groups hold more than one record"
      ),
    });
    const { status, out } = run();
    expect(status).not.toBe(0);
    expect(out).toContain("is not an account of the corpus that ships");
    expect(out).toContain("5 groups hold more than one record");
    expect(out).toContain("4 groups hold more than one record");
  });

  it("fails when the corpus moves and the account does not", () => {
    // The staleness the ticket names: a regeneration lands, the account is not
    // committed with it, and nothing else in the tree notices. Here a row
    // leaves the index, so `Cheese` is gone and the corpus row is one short.
    const account = accountFromArtifacts(arms());
    const moved = { ...index, foods: shipped.filter((f) => f.fdcId !== 11) };
    seed({ index: moved, account });
    const { status, out } = run();
    expect(status).not.toBe(0);
    expect(out).toContain("is not an account of the corpus that ships");
    expect(out).toContain("pnpm usda:bundle");
  });

  it("fails when the account is missing altogether", () => {
    write(INDEX_PATH, JSON.stringify(index));
    write(CENSUS_PATH, JSON.stringify(census));
    write(ARM_INDEX_PATH, JSON.stringify(armIndex));
    write(ARM_CENSUS_PATH, JSON.stringify(armCensus));
    const { status, out } = run();
    expect(status).not.toBe(0);
    expect(out).toContain("does not exist, and ADR-0103 §9 commits it");
  });

  it("names the line that moved, so the reader is not diffing by hand", () => {
    // The account cannot be regenerated without the archives, so a gate saying
    // only "out of date" would leave a contributor comparing a generated file
    // against nothing.
    seed({
      account: accountFromArtifacts(arms()).replace(
        "purely butchery",
        "purely beef"
      ),
    });
    const { out } = run();
    expect(out).toMatch(/line \d+/);
    expect(out).toContain("purely beef");
    expect(out).toContain("purely butchery");
  });
});

describe("the committed account", () => {
  // The gate over the real corpus, which the unit tests above deliberately do
  // not reach: everything else here runs against a fixture, and a fixture
  // cannot tell whether THIS repo's account is current.
  it("is the account of the corpus this repo ships", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const read = (rel: string) =>
      JSON.parse(readFileSync(join(root, rel), "utf8"));
    expect(
      accountFromArtifacts({
        shipped: { index: read(INDEX_PATH), census: read(CENSUS_PATH) },
        arm: { index: read(ARM_INDEX_PATH), census: read(ARM_CENSUS_PATH) },
      })
    ).toBe(readFileSync(join(root, ACCOUNT_PATH), "utf8"));
  });
});
