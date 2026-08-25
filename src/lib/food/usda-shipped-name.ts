import { qualifiersOf, stemOf, wordsOf } from "./reference-food-ranking";

// ---------------------------------------------------------------------------
// The rename: taking out of a name the parts that do not name the food
// (ADR-0056)
// ---------------------------------------------------------------------------
//
// USDA writes two kinds of thing where a food's name belongs. Where an imported
// carcass came from — `Lamb, New Zealand, imported, loin chop, separable lean
// and fat, raw` — and its own trade category — `Beef, variety meats and
// by-products, liver, raw`. Nobody searching for lunch types either, and both
// push the cut a person IS looking for past the width of a result row. This
// module takes them out.
//
// Two rosters, because they are the same KIND of thing but do different work.
// Both are stripped; only an origin decides who loses when two names come out
// the same, since only an origin was telling one row from the other.
//
// It is the first rule in this project that REWRITES what USDA wrote rather
// than filtering or ranking it, which is why it is its own record and its own
// module. `usda-food-kind.ts` answers "is this a reference food at all"; this
// answers "what is that reference food called", and the two move for different
// reasons.
//
// NOTHING IN THE APP IMPORTS THIS FILE. The corpus is renamed once, at
// generation time, and what ships is the finished names — `scripts/usda-bundle.mjs`
// reaches these through the esbuild seam in `scripts/usda-app-module.mjs`
// (ADR-0047 §4). That is the arrangement `usda-food-kind.ts`,
// `food-vocabulary.ts` and `usda-twin-ledger.ts` all use, and the last block of
// `usda-shipped-name.test.ts` pins it.
// ---------------------------------------------------------------------------

/**
 * The origin qualifiers a name may lose, lowercased for a whole-part lookup.
 *
 * Three, and deliberately only three. A general place-word rule is refused in
 * writing (ADR-0055 §7, and ADR-0056's Context): 639 of the corpus's rows carry a place
 * word and most of them are not origins at all — `Atlantic` on a cod names a
 * species with different fat from the Pacific one, `Boston butt` is a cut,
 * `Swiss` chard is neither Swiss nor optional, and `bengal gram` and `pe-tsai`
 * are the British and regional aliases ADR-0049's vocabulary exists to preserve.
 *
 * The six cultural designation tags — `(Alaska Native)`, `(Navajo)`, `(Apache)`,
 * `(Northern Plains Indians)`, `(Klamath)`, `(Hopi)` — are absent for a
 * different reason. ADR-0055 §4 demotes that category on an exact tie and §1
 * forbids dropping it; restating one of those rows without its tag would assert
 * it is a general-population reference value, which is not what USDA published.
 */
export const ORIGIN_QUALIFIERS: ReadonlySet<string> = new Set([
  "new zealand",
  "australian",
  "imported",
]);

/**
 * USDA's cataloguing apparatus: where it filed a row, and how wide the sample
 * behind it was. Neither says WHICH food the row is.
 *
 * Two kinds, and they are here together because they behave identically — both
 * are stripped, and neither decides anything when two names collide (see
 * {@link resolveShippedNames}). Only an origin does that.
 *
 * **Where it was filed.** `Beef, variety meats and by-products, liver, raw` is
 * USDA putting offal under its trade category; nobody calls it that, and the
 * five words sit between the animal and the organ in every result row.
 *
 * **How wide the sample was.** `all grades` averages USDA's beef grades where a
 * sibling row names `choice` or `select`; `all classes` does the same over
 * poultry classes — the bird's market category by age and sex, where a sibling
 * names `broilers or fryers` or `stewing`. Removing these makes a row look more
 * specific than USDA meant it, which is a real cost and the reason
 * `Aust. marble score` is NOT here: that one names a grade rather than
 * averaging over them, so it still tells two rows apart. These do not — measured
 * over the corpus, stripping both collides with nothing, because the rows that
 * name a single grade or class keep the word that names it.
 *
 * Not the same thing as `reference-food-ranking.ts`'s `SHELF_LABEL_HEAD`, which
 * is a set of HEAD phrases two ranking keys discount in place. These are mid-name
 * qualifiers and they are removed rather than discounted; ADR-0042's #153
 * Amendment refused letting the tier read that roster at any scope, and this
 * does not reopen it.
 */
export const CATALOGUE_QUALIFIERS: ReadonlySet<string> = new Set([
  "variety meats and by-products",
  "all grades",
  "all classes",
]);

/** Every qualifier part that is removed from a name, whatever its reason. */
const STRIPPED_QUALIFIERS: ReadonlySet<string> = new Set([
  ...ORIGIN_QUALIFIERS,
  ...CATALOGUE_QUALIFIERS,
]);

/**
 * The preparation words a food's name may differ by while still being the same
 * food, as stems, so {@link foodIdentity} can look past them.
 *
 * Only what USDA actually cooks these records by. `dry` and `moist` are absent
 * on purpose: they appear in `cooked, dry heat` but also in `Chickpeas, dry`
 * and `Fish, herring eggs, Pacific, dry`, where they name the food's state
 * rather than a method, and merging on them would fuse a dry pulse with a
 * boiled one.
 */
const PREPARATION: ReadonlySet<string> = new Set([
  "raw",
  "uncooked",
  "cooked",
  "boiled",
  "braised",
  "simmered",
  "stewed",
  "roasted",
  "broiled",
  "baked",
  "grilled",
  "fried",
  "pan",
  "steamed",
  "microwaved",
  // USDA writes New Zealand offal as `cooked, soaked and fried`. All seven rows
  // that say `soaked` say it that way, so it is a method here and never part of
  // a food's name — and without it the imported liver does not match the
  // imported liver it is a preparation of.
  "soaked",
]);

/**
 * A description with every {@link CATALOGUE_QUALIFIERS} phrase gone, wherever it
 * sits, for {@link foodIdentity} to compare on.
 *
 * Needed because USDA's punctuation is not reliable and the strip is part-exact.
 * `Beef, New Zealand, imported, variety meats and by-products liver, cooked,
 * boiled` has no comma before its organ, so the label and the organ are ONE
 * part, the roster does not match it, and the label survives on that row while
 * its raw sibling loses it.
 *
 * Phrase-wise rather than word-wise, deliberately. Filtering the WORDS would
 * drop `all` from `Wheat flour, white, all-purpose`, which is a food's name.
 */
const withoutCatalogueText = (description: string): string => {
  let text = description.toLowerCase();
  for (const phrase of CATALOGUE_QUALIFIERS)
    text = text.split(phrase).join(" ");
  return text;
};

/** Why a row left the corpus when the rename ran. */
export type NameDropReason = "collision" | "preparation_sibling";

/** The identity and name of one candidate row, as the generator holds it. */
export interface ShippedNameRow {
  fdcId: number;
  description: string;
}

/** What the rename decided about a whole corpus. */
export interface ShippedNameVerdict {
  /** Surviving rows whose name changes, by `fdcId`. */
  renamed: ReadonlyMap<number, string>;
  /** Rows that leave, and which rule took them. */
  dropped: ReadonlyMap<number, NameDropReason>;
}

/**
 * A description with its commercial origin qualifiers removed.
 *
 * **Positional, not lexical**, and that is the whole safety argument. An origin
 * word is removed only where it occupies a WHOLE comma-part, never where it
 * sits inside the head phrase — so `New Zealand spinach, raw` keeps its name,
 * because there the words are the plant. That row is *Tetragonia*, a different
 * species from *Spinacia* carrying a fifth of its iron, and the corpus holds no
 * `Spinach, raw` for a collision guard to notice: a word-list rule would rename
 * it to real spinach's name and nothing downstream could tell. Measured over
 * the corpus, `New Zealand` appears 168 times, 165 of them as a standalone
 * qualifier and 3 as that plant, and `imported` never appears without a country
 * before it.
 *
 * A name carrying no origin part is returned BYTE-FOR-BYTE, not merely
 * equivalent: {@link qualifiersOf} collapses whitespace and lowercases, and a
 * row that is not being renamed must not have USDA's own text quietly rewritten
 * by passing through a splitter. The kept parts are read off the original
 * string for the same reason — rejoining `qualifiersOf`'s output would ship
 * `beef, wagyu, …`.
 */
export function stripNonNamingQualifiers(description: string): string {
  // Asked of the ONE qualifier splitter, so "is this part an origin" is decided
  // by the same boundaries and the same whitespace collapse the ranking uses. A
  // second spelling here would be a second answer, free to drift silently.
  const parts = qualifiersOf(description);
  // Aligned with `parts` by construction: both drop a part only when it is
  // empty once trimmed.
  const original = description.split(",").filter((part) => part.trim() !== "");
  const keep = parts.map(
    (part, index) => index === 0 || !STRIPPED_QUALIFIERS.has(part)
  );
  if (keep.every(Boolean)) return description;
  return original
    .filter((_, index) => keep[index])
    .map((part) => part.trim())
    .join(", ");
}

/**
 * Whether a name says the food was imported, and from where.
 *
 * Asked ONLY of {@link ORIGIN_QUALIFIERS}, never of the shelf label, because
 * this is the predicate that decides who loses a collision. A row renamed for
 * carrying `variety meats and by-products` has lost USDA's filing category and
 * nothing about the food; a row renamed for carrying `New Zealand, imported`
 * has lost the only thing distinguishing it from its plain twin, and is
 * therefore the one that goes.
 */
export const carriesOriginQualifier = (description: string): boolean =>
  qualifiersOf(description).some(
    (part, index) => index > 0 && ORIGIN_QUALIFIERS.has(part)
  );

/**
 * The words of a name that say WHICH food it is, ignoring how it was cooked.
 *
 * A stemmed word list rather than a list of qualifier parts, because USDA's own
 * text is not reliably punctuated: `Beef, New Zealand, imported, variety meats
 * and by-products liver, cooked, boiled` is missing the comma before its organ,
 * and a part-wise key misses that it is the same liver as the raw row above it.
 *
 * A conjunction joining two preparations goes with them — USDA writes
 * `cooked, soaked and simmered`, and a stray `and` left behind stops that row
 * matching the raw row it is a preparation of. Only there: `and` is kept in
 * `Oil, corn, peanut, and olive`, where it joins ingredients rather than
 * methods, which is why this reads the FOLLOWING word instead of dropping every
 * conjunction.
 */
const foodIdentity = (description: string): string => {
  const words = wordsOf(
    withoutCatalogueText(stripNonNamingQualifiers(description))
  ).map(stemOf);
  return words
    .filter(
      (word, index) =>
        !PREPARATION.has(word) &&
        !(word === "and" && PREPARATION.has(words[index + 1] ?? ""))
    )
    .join(" ");
};

/**
 * The name a collision is judged on: every word, stemmed, IN ORDER.
 *
 * Stems rather than the literal string, because USDA writes the plain organ
 * `kidneys` and its import `kidney`. Those differ as text, but {@link stemOf}
 * drops the trailing `s` and the search already treats them as one word — so
 * shipping both would put two rows a single letter apart side by side, which is
 * the duplicate this guard exists to prevent.
 *
 * In order, and never sorted. A sorted word set is a multiset, and two names
 * built from the same words in different arrangements are not the same name:
 * `Nuts, mixed nuts, oil roasted, without peanuts, with salt added` and
 * `…, with peanuts, without salt added` collide under a sort and are opposite
 * foods.
 */
const collisionKey = (description: string): string =>
  wordsOf(stripNonNamingQualifiers(description)).map(stemOf).join(" ");

/**
 * What the rename does to a whole corpus: which rows get a new name, and which
 * leave because the new name was already taken.
 *
 * Corpus-wide by necessity — whether a name is free is not a fact about the
 * name — so it runs at generation time beside `plainSiblingsOf`, for the reason
 * ADR-0055 §6 gives.
 *
 * Two rules, in order:
 *
 * 1. **Collision.** Where two names come out the same, the row that carried an
 *    ORIGIN loses and the other wins. Note what the tiebreak asks: not "was this
 *    row renamed" — both sides may have been, since USDA files the same lamb
 *    organ once under `variety meats and by-products` and once as an import —
 *    but "did this row's name say where the animal came from", which is the only
 *    thing that distinguished it from the row it now duplicates. This is a drop
 *    caused by a rule this project adopted rather than by anything about the
 *    record, which is the narrow ground ADR-0055 §1's amendment admits and
 *    nothing wider.
 * 2. **Preparation sibling.** Every other origin-qualified record of the same
 *    food goes with it. Otherwise the corpus keeps a boiled liver measured in
 *    one national herd beside a raw liver measured in another, disagreeing
 *    several-fold with nothing on screen to explain why. Simplicity is
 *    preferred to complete coverage here, deliberately and at a cost ADR-0056
 *    §5 states.
 *
 * An origin-qualified row no plain row contests keeps its new name and stays —
 * which is what leaves New Zealand tripe in the corpus, and is the same line
 * that leaves mutton in it.
 */
export function resolveShippedNames(
  rows: readonly ShippedNameRow[]
): ShippedNameVerdict {
  const renamed = new Map<number, string>();
  const dropped = new Map<number, NameDropReason>();

  const byCollisionKey = new Map<string, ShippedNameRow[]>();
  for (const row of rows) {
    const key = collisionKey(row.description);
    const group = byCollisionKey.get(key);
    if (group) group.push(row);
    else byCollisionKey.set(key, [row]);
  }

  // 1. A renamed row loses its name to a row that never had to change.
  const contested = new Set<string>();
  for (const group of byCollisionKey.values()) {
    if (group.length < 2) continue;
    if (group.some((row) => !carriesOriginQualifier(row.description))) {
      for (const row of group) {
        if (!carriesOriginQualifier(row.description)) continue;
        dropped.set(row.fdcId, "collision");
        contested.add(foodIdentity(row.description));
      }
    }
  }

  // 2. The rest of that food's preparations follow it out.
  for (const row of rows) {
    if (dropped.has(row.fdcId)) continue;
    if (!carriesOriginQualifier(row.description)) continue;
    if (contested.has(foodIdentity(row.description)))
      dropped.set(row.fdcId, "preparation_sibling");
  }

  for (const row of rows) {
    if (dropped.has(row.fdcId)) continue;
    if (stripNonNamingQualifiers(row.description) !== row.description)
      renamed.set(row.fdcId, stripNonNamingQualifiers(row.description));
  }

  return { renamed, dropped };
}
