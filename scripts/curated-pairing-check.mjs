/**
 * Does every Curated pairing still point at a food this app ships? (ADR-0113
 * §14, #523)
 *
 * The Curated pairing table is hand-authored and its curation is not provable:
 * a row needs a commit, and a generator could write that file tomorrow. What the
 * commitment rests on is the `ground` every row carries for a reviewer to read,
 * so a submission path scales only by deleting that field — a visible act in a
 * diff. This gate is the narrower thing that IS checkable, and the record is
 * honest about the difference.
 *
 * Three rules, the ones ADR-0113 §14 names:
 *
 *  - every `fdcId` resolves in the artifact its `set` names — and `set` is the
 *    row's own assertion rather than something derived from where the id turns
 *    up, so a row naming the wrong set is a finding and not a lookup that falls
 *    through;
 *  - every `gtin` is well-formed and appears once;
 *  - no `gtin` carries a Curated stand-in (ADR-0113 §15), because a stand-in is
 *    admitted on a proof that no reference table holds that food, and a Curated
 *    pairing for the same barcode would assert the negation of that evidence.
 *
 * It reads artifacts already in the repo, so like `density-class-check.mjs` it
 * needs no network and belongs in `pnpm check` rather than a scheduled job. The
 * quarterly `curated:check` is where the questions that need Open Food Facts go.
 *
 * Plain Node built-ins only, and every impure edge arrives as a parameter so the
 * rules can be tested without touching the filesystem.
 */

/** The GS1 lengths a retail barcode is issued at: EAN-8, UPC-A, EAN-13, ITF-14. */
const GTIN_LENGTHS = [8, 12, 13, 14];

/**
 * Why this string is not a barcode, or `null` when it is one.
 *
 * The check digit is the half worth having: length and digits catch a typo that
 * dropped a character, and the mod-10 sum catches the one that changed it. A
 * transposed pair inside a barcode is the classic hand-copying error, and it
 * survives every rule but this one.
 *
 * @param {string} gtin
 * @returns {string | null}
 */
export function gtinFault(gtin) {
  if (!/^[0-9]+$/.test(gtin)) return "not all digits";
  if (!GTIN_LENGTHS.includes(gtin.length))
    return `length ${gtin.length}, and GS1 issues ${GTIN_LENGTHS.join("/")}`;
  const digits = [...gtin].map(Number);
  const stated = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0);
  const computed = (10 - (sum % 10)) % 10;
  return computed === stated
    ? null
    : `check digit ${stated}, and the other ${digits.length} sum to ${computed}`;
}

/**
 * Everything the shipped artifacts no longer say about the Curated pairing
 * table, as `{ gtin, kind, detail }` findings.
 *
 * Five kinds, and each names a different thing a person has to do:
 *
 *  - `gtin` — the barcode is not one, so no pack can ever meet this row;
 *  - `duplicate` — two rows claim the same barcode, and the table has stopped
 *    being a statement about it;
 *  - `set` — the row names a set this app does not ship;
 *  - `fdcId` — the id does not resolve in the set the row names. The detail says
 *    where it DOES resolve, because the two answers ask for different fixes: an
 *    id in the other set is a row asserting the wrong Declared state, and an id
 *    in neither is a row pointing at a food a corpus regeneration has dropped.
 *  - `stand-in` — ADR-0113 §15's refusal.
 *
 * Nothing here rewrites a row. A curated row is a hand-made claim about a
 * barcode's substance, and the fix for every finding above is a person re-making
 * that claim or withdrawing it.
 *
 * @param {readonly { gtin: string, fdcId: number, set: string }[]} pairings
 * @param {{ rows: Record<string, Set<number>>, standInGtins: Set<string> }} shipped
 * @returns {Array<{ gtin: string, kind: string, detail: string }>}
 */
export function pairingFindings(pairings, { rows, standInGtins }) {
  const findings = [];
  /** @type {Map<string, number>} */
  const claimed = new Map();

  for (const row of pairings) {
    const say = (kind, detail) =>
      findings.push({ gtin: row.gtin, kind, detail });

    const fault = gtinFault(row.gtin);
    if (fault) say("gtin", fault);
    else if (claimed.has(row.gtin))
      say("duplicate", `already paired with fdcId ${claimed.get(row.gtin)}`);
    else claimed.set(row.gtin, row.fdcId);

    if (standInGtins.has(row.gtin))
      say(
        "stand-in",
        "the barcode carries a Curated stand-in, admitted on a proof that no " +
          "reference table holds this food (ADR-0113 §15)"
      );

    if (!Object.hasOwn(rows, row.set)) {
      say("set", `names the set "${row.set}", and this app ships no such set`);
      continue;
    }
    if (rows[row.set].has(row.fdcId)) continue;

    const elsewhere = Object.keys(rows).filter((set) =>
      rows[set].has(row.fdcId)
    );
    say(
      "fdcId",
      elsewhere.length
        ? `fdcId ${row.fdcId} is a row of ${elsewhere.join(" and ")}, not of ${row.set}`
        : `fdcId ${row.fdcId} is in neither shipped set`
    );
  }
  return findings;
}

/**
 * The findings as a human reads them, one line each.
 *
 * Every line has to name what a person must now decide, because the answer is
 * never "update the row": a Curated pairing is a hand-made claim about a
 * barcode's substance, and a claim that stopped resolving is withdrawn or
 * re-made by whoever can hold the pack.
 *
 * @param {readonly { gtin: string, kind: string, detail: string }[]} findings
 */
export function formatReport(findings) {
  return findings
    .map(({ gtin, kind, detail }) => `  ERR ${gtin} (${kind}): ${detail}`)
    .join("\n");
}

/**
 * Read both shipped sets and both curated tables, and fail the build on a row
 * that no longer resolves.
 *
 * @param {string} root the repository root
 */
async function main(root) {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");

  const module = (...path) => pathToFileURL(join(root, ...path)).href;
  const { CURATED_PAIRINGS } = await import(
    module("src", "lib", "food", "curated-pairings.ts")
  );
  const { CURATED_STAND_INS } = await import(
    module("src", "lib", "food", "curated-stand-ins.ts")
  );

  const idsIn = (artifact) =>
    new Set(
      JSON.parse(
        readFileSync(join(root, "public", "usda", artifact), "utf8")
      ).foods.map((food) => food.fdcId)
    );

  const findings = pairingFindings(CURATED_PAIRINGS, {
    rows: {
      reference: idsIn("search-index.json"),
      "pairing-target": idsIn("pairing-index.json"),
    },
    standInGtins: new Set(CURATED_STAND_INS.map((e) => e.snapshot.code)),
  });

  if (findings.length) {
    console.error(
      `\n${formatReport(findings)}\n\n` +
        `      ${findings.length} Curated pairing(s) no longer resolve against what\n` +
        `      this repo ships. Nothing here rewrites a row: ADR-0113 §14 makes a\n` +
        `      curated row a hand-made claim, so re-making or withdrawing one is a\n` +
        `      person's act. The judgement behind the seed is in\n` +
        `      scripts/pairing-adjudication.mjs.\n`
    );
    process.exit(1);
  }

  const targets = CURATED_PAIRINGS.filter(
    (row) => row.set === "pairing-target"
  ).length;
  console.log(
    `  ok  ${CURATED_PAIRINGS.length} Curated pairings resolve in the set each ` +
      `names (${targets} of them cooked), on ${CURATED_PAIRINGS.length} ` +
      `well-formed barcodes carrying no Curated stand-in`
  );
}

// Only when run, never on import: the rules above are unit-tested against
// fixtures, and reading two megabytes of artifact is not something they pay.
if (process.argv[1]) {
  const { pathToFileURL, fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  if (import.meta.url === pathToFileURL(process.argv[1]).href)
    await main(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
}
