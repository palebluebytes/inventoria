/**
 * Do the pinned Density Class figures still hold? (ADR-0108 §2 and §3, #429)
 *
 * ADR-0108 §3 pins each class figure as a written constant and refuses to
 * compute it at build time: the USDA corpus is regenerated from time to time,
 * and a computed figure would move between releases with nobody deciding that it
 * should — the silence ADR-0060 §2 objected to, relocated. Pinning makes the
 * figure a decision; this gate makes the decision provable.
 *
 * It reads `public/usda/search-index.json`, which is already in the repo, so
 * unlike ADR-0046 §4's snapshot check it needs no network and belongs in
 * `pnpm check` rather than a scheduled job. Regenerating the corpus can
 * therefore fail the build, which is the intent.
 *
 * Plain Node built-ins only, and every impure edge arrives as a parameter so the
 * rules can be tested without touching the filesystem.
 */

/**
 * Millilitres in each volume unit the corpus states a portion in.
 *
 * A unit must match one of these EXACTLY. `cup, chopped` is a heaped solid whose
 * grams measure how much fits in a cup once chopped — a packing density, not the
 * substance's — and admitting it would put 423 such portions into the figures.
 */
const MILLILITRES = {
  cup: 236.588,
  cups: 236.588,
  tbsp: 14.787,
  tablespoon: 14.787,
  tsp: 4.929,
  teaspoon: 4.929,
  "fl oz": 29.574,
  pint: 473.176,
  quart: 946.353,
};

/**
 * The density a single portion states, in g/ml, or `null` where it states none.
 *
 * @param {{ amount?: number, unit?: string, grams?: number }} portion
 * @returns {number | null}
 */
export function portionDensity(portion) {
  const millilitres = MILLILITRES[(portion.unit ?? "").trim().toLowerCase()];
  if (millilitres === undefined) return null;
  const volume = millilitres * (portion.amount ?? 0);
  if (!volume || !portion.grams) return null;
  return portion.grams / volume;
}

/** The middle value of an ascending list, splitting the difference when even. */
function median(ascending) {
  const mid = Math.floor(ascending.length / 2);
  return ascending.length % 2
    ? ascending[mid]
    : (ascending[mid - 1] + ascending[mid]) / 2;
}

/**
 * The density a food states, in g/ml, or `null` where it states none.
 *
 * A food counts once however many volume portions it carries, because ADR-0108
 * §2's n is a count of foods: `Oil, olive` states a cup, a tablespoon and a
 * teaspoon, and letting all three vote would weight it three times against a
 * food that states one. The median rather than the mean for the same reason one
 * rung down — a single rounded gram on a teaspoon moves a mean and not a middle.
 *
 * @param {{ portions?: Array<{ amount?: number, unit?: string, grams?: number }> }} food
 * @returns {number | null}
 */
export function foodDensity(food) {
  const densities = (food.portions ?? [])
    .map(portionDensity)
    .filter((d) => d !== null)
    .sort((a, b) => a - b);
  return densities.length ? median(densities) : null;
}

/**
 * How many volume portions a food stated its density in.
 *
 * @param {{ portions?: Array<{ amount?: number, unit?: string, grams?: number }> }} food
 */
function volumePortionCount(food) {
  return (food.portions ?? []).filter((p) => portionDensity(p) !== null).length;
}

/** A number at the precision the record states it to, for comparison. */
const to = (value, decimals) => Number(value.toFixed(decimals));

/**
 * The foods a class's match pattern selects out of the corpus.
 *
 * The pattern travels with the figure (ADR-0108 §2) rather than a list of names
 * doing so, and that is the half which makes the gate able to notice anything: a
 * pinned list stays a pinned list after the corpus drops a member, where a
 * pattern re-selects and the count moves.
 *
 * @param {readonly { description?: string, foodCategory?: string }[]} foods
 * @param {{ category?: string, name: RegExp, except?: RegExp }} pattern
 */
export function selectClass(foods, pattern) {
  return foods.filter((food) => {
    const name = food.description ?? "";
    if (pattern.category && food.foodCategory !== pattern.category)
      return false;
    if (pattern.except && pattern.except.test(name)) return false;
    return pattern.name.test(name);
  });
}

/**
 * The four numbers ADR-0108 §2 records beside a class figure, measured over the
 * foods that class selected.
 *
 * Two of them are decisions rather than arithmetic, and both are what make the
 * pinned figures reproducible at all:
 *
 *  - the SPREAD is measured against the lightest member, so it reads as "the
 *    heaviest member is this much more than the lightest" rather than as a
 *    distance from a middle that no member need sit at;
 *  - the CV is a POPULATION standard deviation. A class is not a sample of some
 *    larger set of oils being estimated — it is every oil the corpus states a
 *    volume portion for — and the sample correction would inflate every figure
 *    against a bar set at 2%.
 *
 * @param {readonly { portions?: readonly object[] }[]} foods
 * @returns {{ foods: number, portions: number, figure: number, spread: number, cv: number }}
 */
export function classStats(foods) {
  const densities = foods
    .map(foodDensity)
    .filter((d) => d !== null)
    .sort((a, b) => a - b);
  const mean = densities.reduce((a, b) => a + b, 0) / densities.length;
  const variance =
    densities.reduce((a, b) => a + (b - mean) ** 2, 0) / densities.length;
  return {
    foods: densities.length,
    portions: foods.reduce((a, f) => a + volumePortionCount(f), 0),
    figure: median(densities),
    spread: (densities.at(-1) - densities[0]) / densities[0],
    cv: Math.sqrt(variance) / mean,
  };
}

/**
 * Everything the corpus no longer says about a pinned class.
 *
 * Nothing here rewrites a figure. ADR-0108 §3's argument for pinning is that a
 * computed figure moves between releases with nobody deciding it should, and a
 * gate that quietly adopted the new measurement would be that same silence with
 * an extra step. So each kind of movement is reported and left for a human:
 *
 *  - `figure` — the class's g/ml, at the two decimals the app reads;
 *  - `members` — how many foods, or how many portions, the pattern now selects;
 *  - `spread` / `cv` — the evidence recorded beside the figure;
 *  - `bar` — the class no longer clears ADR-0108 §2's n >= 8 and CV <= 2%,
 *    which is a decision about whether it may ship at all rather than drift.
 *
 * @param {readonly object[]} foods every food in the corpus
 * @param {readonly object[]} classes the pinned table
 * @param {{ minFoods: number, maxCvPercent: number } | undefined} bar
 * @returns {Array<{ id: string, kind: string, pinned: unknown, measured: unknown }>}
 */
export function driftFindings(foods, classes, bar = undefined) {
  const findings = [];
  for (const pinned of classes) {
    const selected = selectClass(foods, pinned.pattern);
    const say = (kind, was, now) =>
      findings.push({ id: pinned.id, kind, pinned: was, measured: now });

    if (!selected.length) {
      say("members", pinned.evidence, { foods: 0, portions: 0 });
      continue;
    }

    const stats = classStats(selected);
    const spreadPercent = to(stats.spread * 100, 1);
    const cvPercent = to(stats.cv * 100, 2);

    if (to(stats.figure, 2) !== pinned.figure)
      say("figure", pinned.figure, to(stats.figure, 4));
    if (
      stats.foods !== pinned.evidence.foods ||
      stats.portions !== pinned.evidence.portions
    )
      say(
        "members",
        { foods: pinned.evidence.foods, portions: pinned.evidence.portions },
        { foods: stats.foods, portions: stats.portions }
      );
    if (spreadPercent !== pinned.evidence.spreadPercent)
      say("spread", pinned.evidence.spreadPercent, spreadPercent);
    if (cvPercent !== pinned.evidence.cvPercent)
      say("cv", pinned.evidence.cvPercent, cvPercent);

    const held = pinned.bar ?? bar;
    if (held && (stats.foods < held.minFoods || cvPercent > held.maxCvPercent))
      say("bar", held, { foods: stats.foods, cvPercent });
  }
  return findings;
}

/**
 * A refused class that the corpus would now admit.
 *
 * ADR-0108 §2 refused syrup and spirits on measurements, and kept both in the
 * record so a later reader finds the numbers that stopped them. Watching them is
 * the same argument as pinning the five that shipped, pointed the other way: a
 * refusal that quietly became wrong is as much a silence as a figure that
 * quietly moved. Clearing the bar does not admit a class — it says a decision is
 * available, and ADR-0108 §2's own admission is "statistical AND gated", so the
 * figure would still have to be pinned by hand.
 *
 * @param {readonly object[]} foods every food in the corpus
 * @param {readonly object[]} refused the classes ADR-0108 §2 measured and refused
 * @param {{ minFoods: number, maxCvPercent: number }} bar
 */
export function refusalFindings(foods, refused, bar) {
  const findings = [];
  for (const entry of refused) {
    const selected = selectClass(foods, entry.pattern);
    if (!selected.length) continue;
    const stats = classStats(selected);
    const cvPercent = to(stats.cv * 100, 2);
    if (stats.foods >= bar.minFoods && cvPercent <= bar.maxCvPercent)
      findings.push({
        id: entry.id,
        kind: "admissible",
        pinned: entry.refusedBecause,
        measured: {
          foods: stats.foods,
          cvPercent,
          figure: to(stats.figure, 4),
        },
      });
  }
  return findings;
}

/**
 * The findings as a human reads them, one block per class that moved.
 *
 * A finding has to name what a person must now decide, because the answer is
 * never "update the number": a figure that moved means the corpus regenerated
 * under a shipped class, and someone has to look at what joined or left it
 * before the class can be pinned again.
 *
 * @param {readonly { id: string, kind: string, pinned: unknown, measured: unknown }[]} findings
 */
export function formatReport(findings) {
  const show = (value) =>
    typeof value === "object" && value !== null
      ? Object.entries(value)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")
      : String(value);
  return findings
    .map(({ id, kind, pinned, measured }) =>
      kind === "admissible"
        ? `  ERR ${id} was refused and would now be admitted: ${show(measured)}\n` +
          `      it was refused because ${show(pinned)}\n` +
          `      Admitting it is a decision, not an update: ADR-0108 §2 admits a\n` +
          `      class statistically AND by hand.`
        : `  ERR ${id}: ${kind} was ${show(pinned)}, the corpus now states ${show(measured)}`
    )
    .join("\n");
}

/**
 * Read the corpus, measure every pinned class, and fail the build on movement.
 *
 * @param {string} root the repository root
 */
async function main(root) {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");

  const table = join(root, "src", "lib", "food", "density-class.ts");
  const { DENSITY_CLASSES, DENSITY_CLASS_BAR, REFUSED_DENSITY_CLASSES } =
    await import(pathToFileURL(table).href);

  const corpusPath = join(root, "public", "usda", "search-index.json");
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));

  const findings = [
    ...driftFindings(corpus.foods, DENSITY_CLASSES, DENSITY_CLASS_BAR),
    ...refusalFindings(
      corpus.foods,
      REFUSED_DENSITY_CLASSES,
      DENSITY_CLASS_BAR
    ),
  ];

  if (findings.length) {
    console.error(
      `\n${formatReport(findings)}\n\n` +
        `      ${findings.length} pinned Density Class figure(s) no longer match\n` +
        `      public/usda/search-index.json. Nothing here rewrites them: ADR-0108\n` +
        `      §3 pins a figure so that moving one is a decision somebody makes.\n`
    );
    process.exit(1);
  }

  const portions = DENSITY_CLASSES.reduce((a, c) => a + c.evidence.portions, 0);
  console.log(
    `  ok  ${DENSITY_CLASSES.length} Density Class figures still measure what ` +
      `they were pinned at (${portions} portions), and the ` +
      `${REFUSED_DENSITY_CLASSES.length} refused classes still fail the bar`
  );
}

// Only when run, never on import: the rules above are unit-tested against
// fixtures, and reading a megabyte of corpus is not something they should pay.
if (process.argv[1]) {
  const { pathToFileURL, fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  if (import.meta.url === pathToFileURL(process.argv[1]).href)
    await main(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
}
