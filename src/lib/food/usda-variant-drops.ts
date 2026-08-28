// ---------------------------------------------------------------------------
// Variants of a food the corpus already keeps (ADR-0061)
// ---------------------------------------------------------------------------
//
// `usda-food-kind.ts` next door asks what a record IS, which is the only kind
// of claim ADR-0055 §1 admits as a drop reason. The three rules here ask what a
// record is a VARIANT of, and §1 as written forbids them. ADR-0061 §1 amends it,
// and
// states the reason plainly rather than dressing it as a claim about the
// records, on ADR-0056 §5's precedent: SIMPLICITY PREFERRED TO COMPLETE
// COVERAGE. Typing `milk` returned fifty rows, which was the page cap, and what
// a reader saw first was dry whole milk, chocolate milk, dried buttermilk and
// hot cocoa; ordinary cow's milk was sixteen separate rows differing by whether
// vitamins had been added.
//
// Two guards keep the amendment narrower than it reads, and both are here:
//
//   1. A rule fires only under a head phrase whose EVERY ROW has been read and
//      adjudicated. Three have — `Milk`, `Yogurt` and `Soymilk`. `Beverages`,
//      `Cheese`, `Ice cream` and every other head carrying a flavour ladder are
//      deliberately NOT done, and a reader who assumes one of them was
//      considered and kept will be wrong: it was never looked at.
//   2. ADR-0055 §2's bar still applies in full — no drop here may break a lead
//      already measured correct, which `usda-corpus.test.ts` sweeps.
//
// Each rule takes the descriptions that share its row's head phrase, because
// every one of them is a question about SIBLINGS: does the head keep a plain
// row, a fluid one, a fortification-free one. That is the corpus-wide shape
// `plainSiblingsOf` and `resolveShippedNames` already have, and it is why these
// three are a module of their own rather than a sixth entry in the food-kind
// roster: they move when a head phrase is READ, where that file moves when
// somebody measures an escape (#146's split, for #146's reason).
//
// NOTHING IN THE APP IMPORTS THIS FILE. The corpus is filtered once, at
// generation time, and what ships is the survivors; `scripts/usda-bundle.mjs`
// reaches these through the esbuild seam in `scripts/usda-app-module.mjs`
// rather than keeping a second copy of the answer (ADR-0047 §4). That is the
// arrangement `usda-food-kind.ts`, `food-vocabulary.ts` and
// `usda-twin-ledger.ts` all use, and `usda-food-kind.test.ts` pins it.
// ---------------------------------------------------------------------------

import { qualifiersOf, wordsOf } from "./reference-food-ranking";

/** One corpus row as the variant rules read it. */
export interface VariantRow {
  fdcId: number;
  description: string;
}

/** Which rule took a row out as a variant of a food the corpus keeps. */
export type VariantDropReason =
  | "flavoured_variant"
  | "dehydrated_form"
  | "fortification_duplicate"
  | "adjudicated_variant";

/**
 * The head phrases whose every row has been read (ADR-0061's Scope).
 *
 * The whole of guard 1. A rule below that forgot to ask this would be a licence
 * to prune a corpus by intuition, which is the thing ADR-0055 §1 exists to
 * forbid.
 */
const ADJUDICATED_HEADS: ReadonlySet<string> = new Set([
  "milk",
  "yogurt",
  "soymilk",
]);

/** A description's head phrase, lowercased and whitespace-collapsed. */
const headPhrase = (description: string): string =>
  qualifiersOf(description)[0] ?? "";

/** A description's qualifiers past its head phrase. */
const beyondHead = (description: string): string[] =>
  qualifiersOf(description).slice(1);

/**
 * The flavours a variant may be named for (ADR-0061 §2).
 *
 * Three of the seven reach nothing under the three adjudicated heads today:
 * `carob`, `eggnog` and `malt` name only rows filed under `Beverages`, which is
 * out of scope. They are on the roster because the roster is a statement about
 * what a flavour word IS, not a hand-list of the rows it currently takes — and
 * because the next head somebody adjudicates will hold them.
 */
const FLAVOUR_WORDS: ReadonlySet<string> = new Set([
  "chocolate",
  "strawberry",
  "carob",
  "eggnog",
  "malt",
  "vanilla",
  "fruit",
]);

/** Which roster words a name carries in a qualifier past its head phrase. */
const flavoursOf = (description: string): Set<string> => {
  const carried = new Set<string>();
  for (const part of beyondHead(description))
    for (const word of wordsOf(part))
      if (FLAVOUR_WORDS.has(word)) carried.add(word);
  return carried;
};

/**
 * True when a row is a flavoured form of a food its head phrase keeps plain
 * (ADR-0061 §2).
 *
 * The exemption is the whole of the rule's subtlety and it was found by
 * measurement rather than foresight: **a roster word is not a flavour word
 * under a head where every plain row carries it.** A row is plain FOR A WORD
 * when the word is the only roster word it carries, and where every such row
 * carries it the word is the head's default name rather than a flavour.
 *
 * That is what protects `Soymilk, original and vanilla`, which is USDA's name
 * for plain soy milk. Under `Soymilk` the only rows carrying no roster word
 * besides `vanilla` are the four that carry it, so `vanilla` does not fire — and
 * `chocolate` does not fire there either, for the same reason. Under `Yogurt`
 * the plain tubs carry neither word and both fire. The naive roster would have
 * deleted the plain soymilk and kept the chocolate one.
 *
 * The compound alternative — a roster word AND ADR-0055 §3's `plain_sibling`
 * flag — was measured and refused: over the shipped corpus the roster reached 85
 * rows of which 8 carried `plain_sibling`, and they were the wrong eight.
 * `Vanilla extract, imitation, alcohol` carried it and `Soymilk, chocolate,
 * unfortified` did not, because `plain_sibling` is a strict qualifier-prefix
 * test and there is no `Soymilk` row to be a prefix of.
 *
 * Reaches 26 rows: 7 chocolate milks and 19 flavoured yogurts.
 *
 * @param siblings - Every description sharing this row's head phrase, this one
 *   included.
 */
export function isFlavouredVariant(
  description: string,
  siblings: readonly string[]
): boolean {
  if (!ADJUDICATED_HEADS.has(headPhrase(description))) return false;
  const plainRows = siblings.map(flavoursOf);
  for (const word of flavoursOf(description)) {
    const plain = plainRows.filter((carried) =>
      [...carried].every((other) => other === word)
    );
    if (plain.some((carried) => !carried.has(word))) return true;
  }
  return false;
}

/**
 * A powder, a granule or a dried solid — the form of a food rather than the
 * food.
 *
 * ADR-0055 §7 refused this marker BARE and that refusal is not reversed. Its
 * true reach was re-measured for ADR-0061 §3 and is larger than §7's note
 * suggested: read against a whole description it matches 294 corpus rows,
 * including walrus, caribou, prunes, sun-dried tomatoes, shiitake, cloud ears,
 * every dry pasta and noodle, parboiled rice, couscous, powdered sugar and the
 * dry-roasted nuts.
 */
const DEHYDRATION_MARKER = /\b(dry|dried|powder|powdered|dehydrated)\b/;

/** USDA's word for a food you can pour. */
const FLUID_FORM = /\bfluid\b/;

/**
 * True when a row is a dehydrated form of a food its head phrase keeps fluid
 * (ADR-0061 §3, amending ADR-0055 §7).
 *
 * The narrowing that makes the refused marker safe is that it is never asked of
 * the corpus. It is asked of one head phrase, and only where that head also
 * holds a row USDA describes as `fluid` — which no prune, pasta or cocoa powder
 * has, because none of those heads holds a fluid twin.
 *
 * Reaches **6 rows, all under `Milk`**: two dry whole, two dry nonfat regular,
 * one dry nonfat calcium reduced, and dried buttermilk. The fluid gate alone
 * would reach 8, taking `Whey, acid, dried` and `Whey, sweet, dried` under a
 * head nobody has read; ADR-0061 §1's adjudicated-head guard is what stops
 * them, and that is the measurement it is here for.
 *
 * @param siblings - Every description sharing this row's head phrase.
 */
export function isDehydratedForm(
  description: string,
  siblings: readonly string[]
): boolean {
  if (!ADJUDICATED_HEADS.has(headPhrase(description))) return false;
  if (!beyondHead(description).some((part) => DEHYDRATION_MARKER.test(part)))
    return false;
  return siblings.some((sibling) =>
    beyondHead(sibling).some((part) => FLUID_FORM.test(part))
  );
}

/**
 * A qualifier that names USDA's fortification apparatus rather than the food:
 * what was added, what was not, and the vitamins a neighbouring part named.
 *
 * `vitamins?` earns its place on one row's punctuation. USDA writes `Milk,
 * nonfat, fluid, with added nonfat milk solids, vitamin A and vitamin D (fat
 * free or skim)`, where the vitamins are a comma-part of their own with no verb
 * in them; without this the row would key apart from the four milks it is a
 * fortification of and survive as a food.
 */
const FORTIFICATION_PART =
  /\badded\b|\bfortified\b|\bvitamins?\b|\bnutrients\b/;

/**
 * A qualifier that names something PUT IN the food.
 *
 * `without added vitamin A and vitamin D` is not one of these, which is the
 * point: ADR-0061 §4's survivor is the row that names no addition, and USDA
 * spells "no addition" that way as often as it says nothing at all.
 */
const NAMES_AN_ADDITION = /\bwith added\b|\bfortified\b/;

/**
 * USDA's several spellings of one fat level, as a whole qualifier part.
 *
 * Needed because the ladder is not written consistently and the rule below has
 * to group a food with itself: the corpus holds `Milk, fluid, 1% fat` beside
 * `Milk, lowfat, fluid, 1% milkfat`, which are the same milk fortified two
 * ways and would key apart on their words alone.
 *
 * Whole parts rather than words, for the reason {@link qualifiersOf} exists: a
 * word rule would read `fat free or skim` inside a parenthetical, and `whole` in
 * `whole wheat`.
 */
const FAT_LEVEL: ReadonlyMap<string, string> = new Map([
  ["whole", "whole"],
  ["whole milk", "whole"],
  ["3.25% milkfat", "whole"],
  ["3.7% milkfat", "whole"],
  ["reduced fat", "2%"],
  ["2% milkfat", "2%"],
  ["2% fat", "2%"],
  ["lowfat", "1%"],
  ["low fat", "1%"],
  ["1% milkfat", "1%"],
  ["1% fat", "1%"],
  ["nonfat", "nonfat"],
  ["non-fat", "nonfat"],
  ["fat free", "nonfat"],
  ["skim", "nonfat"],
  ["skim milk", "nonfat"],
]);

/**
 * What two fortifications of one food have in common: the head phrase, the
 * qualifiers that are neither apparatus nor a fat level, and the fat level
 * itself.
 *
 * A SET of qualifiers rather than the sequence, because USDA orders them freely
 * — `Milk, nonfat, fluid` and `Milk, fluid, nonfat` are one milk — and a
 * canonical fat level rather than the words, because it spells that one part
 * four ways. The fat level is kept as a component rather than discarded, which
 * is what stops the whole ladder collapsing into a single group and the corpus
 * keeping one rung.
 */
const fortificationFreeIdentity = (description: string): string => {
  const levels = new Set<string>();
  const rest = new Set<string>();
  for (const part of beyondHead(description)) {
    if (FORTIFICATION_PART.test(part)) continue;
    const level = FAT_LEVEL.get(part);
    if (level) levels.add(level);
    else rest.add(part);
  }
  return [
    headPhrase(description),
    [...rest].sort().join("+"),
    [...levels].sort().join("+"),
  ].join("|");
};

/** Whether a name says something was put into the food. */
const namesAnAddition = (description: string): boolean =>
  beyondHead(description).some((part) => NAMES_AN_ADDITION.test(part));

/**
 * True when a row is one fortification of a food its head phrase records at
 * several, and not the one that survives (ADR-0061 §4).
 *
 * The survivor is the row that names NO addition — `without added vitamin A and
 * vitamin D` over `with added vitamin A and vitamin D`, and either over
 * `protein fortified` or `with added nonfat milk solids`. Those last two are
 * different FOODS rather than different paperwork, and taking them is the part
 * of this rule that costs real data: the surviving whole, 2%, 1% and nonfat rows
 * carry 107 to 128 nutrient fields where the Foundation twins they beat carry
 * 159. The trade is composition fidelity for a readable list, and a reader who
 * wants the fuller panels back should start here.
 *
 * It fires only where EXACTLY ONE row of a group names no addition. Two are not
 * a ladder — `Yogurt, plain, skim milk` and `Yogurt, plain, nonfat` are one
 * yogurt written twice, which is a different question and settled by hand below
 * — and none means the food has no unfortified form to prefer, which is why the
 * two commercial chocolate milks stay whole for {@link isFlavouredVariant} to
 * take.
 *
 * Reaches 18 rows, of which 6 are already gone: four flavoured yogurts and two
 * dry milks that the two rules above take first. Its own casualties are the 12
 * cow's-milk fortifications.
 *
 * @param siblings - Every description sharing this row's head phrase.
 */
export function isFortificationDuplicate(
  description: string,
  siblings: readonly string[]
): boolean {
  if (!ADJUDICATED_HEADS.has(headPhrase(description))) return false;
  if (!namesAnAddition(description)) return false;
  const identity = fortificationFreeIdentity(description);
  const unfortified = siblings.filter(
    (sibling) =>
      fortificationFreeIdentity(sibling) === identity &&
      !namesAnAddition(sibling)
  );
  return unfortified.length === 1;
}

// ---------------------------------------------------------------------------
// The rows adjudicated by hand (ADR-0061 §5)
//
// What is left when the three rules have run: rows a general predicate either
// cannot see or should not be widened to reach. They are written down one at a
// time, in the manner of `usda-twin-ledger.ts`'s superseded records, and checked
// at generation, so a mirror refresh that rewrites a description stops the build
// rather than silently voiding a verdict nobody re-read.
//
// Six of them are filed under `Beverages`, which is NOT an adjudicated head.
// They are here because the adjudicated unit is the milk drinks, not the shelf
// USDA filed them on: without them `chocolate milk` returns three malted drink
// powders, which is worse than returning nothing. An empty search is recorded
// locally (ADR-0053) and a wrong answer is not.
// ---------------------------------------------------------------------------

/**
 * One hand-adjudicated row: the `fdcId` that leaves, the description it leaves
 * under, and why.
 *
 * The description is carried for the reason `SupersededRecord` carries its two:
 * it is what the verdict was reached by READING. The reason travels with it
 * rather than in a table beside it, so a reader who arrives at an `fdcId` from
 * a generation failure has the whole verdict in one place.
 */
export type AdjudicatedVariant = readonly [
  fdcId: number,
  description: string,
  why: string,
];

/**
 * The rows one reason was reached about.
 *
 * Grouped in the source and flattened on the way out, because these verdicts
 * were reached a group at a time — nobody read `Soymilk (All flavors), lowfat`
 * on its own — and repeating one paragraph across four entries would invite
 * four paragraphs that drift.
 */
interface AdjudicatedVariantGroup {
  why: string;
  rows: readonly (readonly [fdcId: number, description: string])[];
}

const ADJUDICATED_VARIANT_GROUPS: readonly AdjudicatedVariantGroup[] = [
  {
    why: "A milkshake is a dessert drink. It is a food, and the reason for removing it is that it crowds a list of milks — stated plainly, because dressing it as a claim about the record would be the manoeuvre ADR-0056 §5 refused.",
    rows: [
      [170883, "Milk shakes, thick chocolate"],
      [170884, "Milk shakes, thick vanilla"],
    ],
  },
  {
    why: "USDA's own marker for a record published as a reference standard rather than as a food anyone buys. The phrase matches exactly one row in the whole corpus, so this drop satisfies ADR-0055 §1 honestly and needs no amendment.",
    rows: [[171279, "Milk, human, mature, fluid (For Reference Only)"]],
  },
  {
    why: "A formulated vegetable-fat product sold to stand in for dairy, which is a claim about what the record IS. `Milk substitutes` is filed under its own head phrase and is here for the same reason the Beverages rows are: the adjudicated unit is the milk drinks.",
    rows: [
      [167730, "Milk, imitation, non-soy"],
      [
        170861,
        "Milk, filled, fluid, with blend of hydrogenated vegetable oils",
      ],
      [170862, "Milk, filled, fluid, with lauric acid oil"],
      [171264, "Milk substitutes, fluid, with lauric acid oil"],
    ],
  },
  {
    why: "A record published for a designated population — milk formulated for a sodium-restricted diet — rather than the milk on a shelf.",
    rows: [[170875, "Milk, low sodium, fluid"]],
  },
  {
    why: "Full-fat cow's milk is the 3.7% row, kept and renamed (`usda-shipped-name.ts`). `producer` names the supply chain rather than the food, 3.7% is nearer the UK compositional figure than 3.25%, and keeping both would reproduce under two near-identical names exactly the duplication ADR-0061 exists to remove. Its 3.25% twin is a fortification duplicate and goes to the rule above; this row names no addition, so only a reading of the two names takes it.",
    rows: [
      [
        172217,
        "Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D",
      ],
    ],
  },
  {
    why: "Buttermilk is kept at one fat level, `Milk, buttermilk, fluid, whole`. These two are the same cultured drink at 2% and at 1%, one of them USDA's SR Legacy record and the other the Foundation row that answers to `Milk, buttermilk, fluid, cultured, lowfat`, and neither names an addition for the fortification rule to read.",
    rows: [
      [167697, "Milk, buttermilk, fluid, cultured, reduced fat"],
      [2259792, "Buttermilk, low fat"],
    ],
  },
  {
    why: "A chocolate milk drink filed under `Beverages`. Six rows name themselves one, and they leave with the seven chocolate milks so that `chocolate milk` returns nothing rather than returning a malted drink powder.",
    rows: [
      [
        171874,
        "Beverages, chocolate malt powder, prepared with 1% milk, fortified",
      ],
      [
        171879,
        "Beverages, chocolate-flavor beverage mix, powder, prepared with whole milk",
      ],
      [
        173184,
        "Beverages, chocolate malt, powder, prepared with fat free milk",
      ],
      [
        173187,
        "Beverages, chocolate almond milk, unsweetened, shelf-stable, fortified with vitamin D2 and E",
      ],
      [
        174159,
        "Beverages, chocolate-flavor beverage mix for milk, powder, with added nutrients",
      ],
      [
        174160,
        "Beverages, chocolate-flavor beverage mix for milk, powder, with added nutrients, prepared with whole milk",
      ],
    ],
  },
  {
    why: "A duplicate of `Yogurt, plain, nonfat` under USDA's other word for the same milk. Both name no addition, so the fortification rule declines to choose between them — deliberately, since two rows are not a ladder.",
    rows: [[170887, "Yogurt, plain, skim milk"]],
  },
  {
    why: "An average across flavours is a claim about the MEASUREMENT rather than a food: nobody eats an all-flavours soymilk. USDA files the four under their own head phrase, spelled two ways.",
    rows: [
      [173765, "Soymilk (All flavors), enhanced"],
      [
        173769,
        "Soymilk (All flavors), lowfat, with added calcium, vitamins A and D",
      ],
      [
        175215,
        "Soymilk (all flavors), unsweetened, with added calcium, vitamins A and D",
      ],
      [
        175216,
        "Soymilk (all flavors), nonfat, with added calcium, vitamins A and D",
      ],
    ],
  },
  {
    why: "A flavoured soy milk that the flavour rule cannot take: under `Soymilk` every row carries a roster word, so the exemption in `isFlavouredVariant` turns the rule off for the whole head. The rows are read instead. The plain soy milk the corpus keeps is the Foundation row `Soy milk, unsweetened, plain, shelf stable`, which carries the richer panel and the spelling people type; `original and vanilla` is USDA's name for that same drink and goes with the rest of the head.",
    rows: [
      [172446, "Soymilk, original and vanilla, unfortified"],
      [
        172456,
        "Soymilk, original and vanilla, with added calcium, vitamins A and D",
      ],
      [
        173766,
        "Soymilk, original and vanilla, light, with added calcium, vitamins A and D",
      ],
      [
        173767,
        "Soymilk, chocolate and other flavors, light, with added calcium, vitamins A and D",
      ],
      [
        173768,
        "Soymilk, original and vanilla, light, unsweetened, with added calcium, vitamins A and D",
      ],
      [174293, "Soymilk, chocolate, unfortified"],
      [174295, "Soymilk, chocolate, with added calcium, vitamins A and D"],
      [
        175217,
        "Soymilk, chocolate, nonfat, with added calcium, vitamins A and D",
      ],
    ],
  },
];

/**
 * Every row ADR-0061 §5 removes by hand, flattened out of the reasons above.
 *
 * Exported so `scripts/usda-bundle.mjs` can refuse a corpus that no longer holds
 * one of them under the description it was adjudicated by. A written drop list
 * whose evidence has moved is not a verdict, and the way it fails is silent.
 */
export const ADJUDICATED_VARIANTS: readonly AdjudicatedVariant[] =
  ADJUDICATED_VARIANT_GROUPS.flatMap((group) =>
    group.rows.map(
      ([fdcId, description]) => [fdcId, description, group.why] as const
    )
  );

/**
 * Which rows of a corpus are a variant of a food it already keeps, and which
 * rule took each (ADR-0061).
 *
 * Corpus-wide by necessity, like `resolveShippedNames`: whether a head keeps a
 * plain row is not a fact about any one description. The three rules are asked
 * in the order their tallies are reported, so a row two of them agree on is
 * counted once — the six dry and flavoured rows the fortification rule also
 * reaches are its neighbours' casualties, not its own.
 *
 * The hand list goes last for the same reason. A row it names that a rule
 * already took is not counted twice, which keeps the four tallies a partition of
 * the drops rather than an overlapping census.
 */
export function resolveVariantDrops(
  rows: readonly VariantRow[]
): ReadonlyMap<number, VariantDropReason> {
  const byHead = new Map<string, string[]>();
  for (const row of rows) {
    const head = headPhrase(row.description);
    const siblings = byHead.get(head);
    if (siblings) siblings.push(row.description);
    else byHead.set(head, [row.description]);
  }

  const drops = new Map<number, VariantDropReason>();
  for (const row of rows) {
    const siblings = byHead.get(headPhrase(row.description)) ?? [];
    if (isFlavouredVariant(row.description, siblings))
      drops.set(row.fdcId, "flavoured_variant");
    else if (isDehydratedForm(row.description, siblings))
      drops.set(row.fdcId, "dehydrated_form");
    else if (isFortificationDuplicate(row.description, siblings))
      drops.set(row.fdcId, "fortification_duplicate");
  }
  // Only over the rows handed in, so the verdict is about this corpus and not
  // about a list. Asked of a corpus the drops have already been applied to it
  // returns nothing, which is what makes it a tripwire as well as a rule.
  const present = new Set(rows.map((row) => row.fdcId));
  for (const [fdcId] of ADJUDICATED_VARIANTS)
    if (present.has(fdcId) && !drops.has(fdcId))
      drops.set(fdcId, "adjudicated_variant");

  return drops;
}
