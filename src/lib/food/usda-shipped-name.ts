import { qualifiersOf, stemOf, wordsOf } from "./reference-food-ranking";

// ---------------------------------------------------------------------------
// The rename: taking out of a name the parts that do not name the food
// (ADR-0056)
// ---------------------------------------------------------------------------
//
// USDA writes three kinds of thing where a food's name belongs. Where an
// imported carcass came from — `Lamb, New Zealand, imported, loin chop,
// separable lean and fat, raw`; its own trade category — `Beef, variety meats
// and by-products, liver, raw`; and what was added to it after it was made —
// `Milk, fluid, 1% fat, without added vitamin A and vitamin D`. Nobody searching
// for lunch types any of them, and all three push the cut a person IS looking
// for past the width of a result row. This module takes them out.
//
// Three rosters, because they are the same KIND of thing but do different work.
// The first two are stripped unconditionally, and only an origin decides who
// loses when two names come out the same, since only an origin was telling one
// row from the other. The third is stripped only into a name no other row
// already answers to (ADR-0062 §3), because there is no origin here to break a
// tie and an ugly name beats two foods filed under one.
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
 * The eight cultural designation tags — `(Alaska Native)` on 100 rows,
 * `(Navajo)` 16, `(Northern Plains Indians)` 14, `(Shoshone Bannock)` 8,
 * `(Hopi)` 5, `(Apache)` 3, `(Southwest)` 3 and `(Klamath)` 2, which together
 * are the whole 151-row `American Indian/Alaska Native Foods` category — are
 * absent for a different reason. ADR-0055 §4 demotes that category on an exact tie and §1
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

/**
 * What was added to a food after it was made, as USDA writes it where a name
 * belongs: `Milk, fluid, 1% fat, without added vitamin A and vitamin D`
 * (ADR-0062 §2).
 *
 * Nobody types six words of statutory fortification to find a pint of milk, and
 * both halves of each pair say the same thing about the food — that it is milk
 * of that fat level. The phrase eats the width of a result row and tells no two
 * milks apart.
 *
 * **Both polarities, deliberately.** Stripping only `with added …` would leave
 * the `without` rows carrying a phrase whose whole meaning is the contrast with
 * a row that no longer states it, which reads as a warning rather than a fact.
 *
 * **`fortified` is deliberately absent**, in either of USDA's spellings
 * (`vitamin D fortified`, `fortified with vitamin D`) and in the wider
 * `protein fortified` and `calcium-fortified`. It names a DIFFERENT food:
 * `Milk, reduced fat, fluid, 2% milkfat, protein fortified, with added vitamin A
 * and vitamin D` carried 3.95 g of protein against the plain 2% row's 3.30, and
 * a roster reaching it would file two foods under one name. `Cheese,
 * pasteurized process, American` is the case still in the corpus — 371 kcal and
 * 18.1 g of protein on the row this roster renames, 366 and 18.0 on the
 * `vitamin D fortified` row beside it.
 *
 * **Unlike the two rosters above, this one is applied conditionally.** It is
 * removed only where the name it leaves is free (ADR-0062 §3), so unlike
 * `new zealand` these words do NOT leave the corpus: six margarine rows keep
 * them. See {@link stripFortificationQualifier} and {@link resolveShippedNames}.
 *
 * Not `usda-variant-drops.ts`'s `FORTIFICATION_PART`, which DOES reach
 * `fortified` and is not a contradiction: that predicate asks which rows are
 * fortifications of one food so ADR-0061 §4 can keep one rung of the ladder,
 * and over-reaching there groups two rows that a later rule then chooses
 * between. This roster REWRITES a name, where over-reaching files two foods
 * under one and nothing downstream can tell.
 */
export const FORTIFICATION_QUALIFIERS: ReadonlySet<string> = new Set([
  "with added vitamin a and vitamin d",
  "without added vitamin a and vitamin d",
  "with added vitamin d",
  "without added vitamin d",
]);

/**
 * The populations USDA publishes designated reference composition for, as the
 * parenthesised tag it puts at the END of a description.
 *
 * All eight, which together are the whole 151-row
 * `American Indian/Alaska Native Foods` category.
 *
 * These are removed from the NAME and from nothing else. The designation is not
 * lost by that: every one of these rows carries the category on `foodCategory`,
 * and ADR-0055 §4's `designated` ranking key reads that field and says in as
 * many words that it is "keyed on `foodCategory`, never on the parenthesised
 * name tags". So the tag in the name is a second copy of a fact the row already
 * states structurally, and dropping the copy leaves the fact.
 *
 * Removing the tag can leave two rows with one name, and then one of them goes.
 * {@link resolveShippedNames} settles that on panel completeness — never on
 * whose food it is, which is the claim ADR-0055 §1 forbids and which in two of
 * the six contested groups could not be made anyway, both sides being
 * designated.
 */
export const DESIGNATION_TAGS: ReadonlySet<string> = new Set([
  "alaska native",
  "navajo",
  "northern plains indians",
  "shoshone bannock",
  "hopi",
  "apache",
  "southwest",
  "klamath",
]);

/**
 * A description without its trailing designation tag, or unchanged if it has
 * none.
 *
 * Anchored to the END, and matched against the roster rather than any bracketed
 * text, because USDA's brackets do other work in the same names: `Seal, bearded
 * (Oogruk), meat, raw (Alaska Native)` has to keep the Oogruk and lose the
 * designation, and `Acerola, (west indian cherry), raw` has to keep everything.
 */
export function stripDesignationTag(description: string): string {
  const match = description.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!match) return description;
  return DESIGNATION_TAGS.has(match[2].trim().toLowerCase())
    ? match[1].trim()
    : description;
}

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

/**
 * One name adjudicated by reading: the `fdcId`, the description USDA published,
 * the name the corpus ships it under, and why.
 *
 * Both names are carried for the reason `SupersededRecord` carries its two —
 * they are what the verdict was reached by READING — and the published one is
 * checked at generation, so a mirror refresh that rewrites it stops the build
 * rather than renaming a row nobody re-read.
 */
export type AdjudicatedName = readonly [
  fdcId: number,
  published: string,
  shipped: string,
  why: string,
];

/**
 * The names no rule reaches, adjudicated one row at a time (ADR-0061 §5).
 *
 * **One.** Everything else in this module is positional and general: a roster
 * phrase occupying a whole comma-part comes out wherever it sits. This is the
 * other kind of thing entirely — a judgement that USDA's word for a food is not
 * the food's name — and it is a written list precisely because no property of
 * the string says so. If it grows past a handful, the question is whether a rule
 * was missed, and that is a measurement rather than another entry.
 *
 * Applied by `scripts/usda-bundle.mjs` BEFORE {@link resolveShippedNames}, so
 * the collision key, the origin tiebreak and the designation pass all read the
 * name the corpus will actually ship.
 */
export const ADJUDICATED_NAMES: readonly AdjudicatedName[] = [
  [
    171266,
    "Milk, producer, fluid, 3.7% milkfat",
    "Milk, whole, 3.7% milkfat",
    "`producer` is USDA's word for raw bulk-tank milk before standardisation — the supply chain rather than the food — and this is the row ADR-0061 §5 keeps as full-fat cow's milk, both 3.25% rows having gone. 3.7% is nearer the UK compositional figure than 3.25%, and a shopper looking for whole milk types `whole`. The rename is safe only because those two rows leave: under the corpus that preceded ADR-0061 it would have collided with `Milk, whole, 3.25% milkfat`, which is the order ADR-0062 §3 calls load-bearing.",
  ],
];

/** Why a row left the corpus when the rename ran. */
export type NameDropReason =
  | "collision"
  | "preparation_sibling"
  | "designation_collision";

/** The identity and name of one candidate row, as the generator holds it. */
export interface ShippedNameRow {
  fdcId: number;
  description: string;
  /**
   * How many nutrients USDA reports for this record.
   *
   * Read only to settle a {@link DESIGNATION_TAGS} collision, where the rows in
   * contention are two populations' records of one food and no fact about
   * PROVENANCE may choose between them. Panel completeness is a claim about the
   * record, which is the only kind of claim ADR-0055 §1 admits.
   */
  panelFields?: number;
  /**
   * The other names this row answers to: the descriptions the twin merge
   * discarded (ADR-0050 §4).
   *
   * Read only by the fortification freedom check, and it has to be: an alias is
   * a name in every sense that matters here, because `bestNameKey` ranks a
   * query against it exactly as against a description. A guard that asked only
   * about descriptions would call a name free while a second row still answered
   * to it — which is the same argument ADR-0056 §3 makes when it renames the
   * aliases along with the descriptions.
   */
  also?: readonly string[];
}

/** What the rename decided about a whole corpus. */
export interface ShippedNameVerdict {
  /** Surviving rows whose name changes, by `fdcId`. */
  renamed: ReadonlyMap<number, string>;
  /** Rows that leave, and which rule took them. */
  dropped: ReadonlyMap<number, NameDropReason>;
  /**
   * How the fortification strip went: names it freed, and names it refused
   * because another row already answered to them (ADR-0062 §3).
   *
   * Counted because the refusals are otherwise INVISIBLE. Every other rule here
   * reports itself by what it changed — a rename in `renamed`, a drop in
   * `dropped` — but a refused rename leaves the corpus byte-for-byte as it was,
   * so a roster entry that reached nothing and a roster entry the whole corpus
   * blocked look identical from outside. A rule whose reach nobody measured is
   * a hole nobody can see (ADR-0056 §5).
   */
  fortification: FortificationTally;
}

/** How far the fortification strip reached, and how far it was refused. */
export interface FortificationTally {
  /** Rows whose name lost the phrase. */
  stripped: number;
  /** Rows that kept it, because another row already answered to the shorter name. */
  refused: number;
}

/** One qualifier part, twice: as a roster is asked, and as USDA typed it. */
interface NamedPart {
  /** Lowercased and whitespace-collapsed, which is the form a roster holds. */
  lookup: string;
  /** USDA's own text, trimmed and nothing more. */
  text: string;
}

/**
 * A description's qualifier parts, each paired with the text it was written as.
 *
 * The pairing is the invariant both strips below rest on, and it is stated once
 * here rather than re-derived at each of them: {@link qualifiersOf} and the
 * split beside it drop a part on exactly the same condition — empty once
 * trimmed — so the two lists are aligned by construction and an index means the
 * same part in both.
 *
 * Both halves are needed and neither will do alone. A roster lookup has to ask
 * the normalised form, because USDA ships `Game meat , bison, ground, raw` with
 * a space before its comma and 59 rows turn on that. A name being REWRITTEN has
 * to be rebuilt from the original, because rejoining `qualifiersOf`'s output
 * would ship `beef, wagyu, …` in place of USDA's casing.
 */
const namedParts = (description: string): NamedPart[] => {
  // Asked of the ONE qualifier splitter, so "is this part an origin" is decided
  // by the same boundaries and the same whitespace collapse the ranking uses. A
  // second spelling here would be a second answer, free to drift silently.
  const lookups = qualifiersOf(description);
  const originals = description
    .split(",")
    .filter((part) => part.trim() !== "")
    .map((part) => part.trim());
  return lookups.map((lookup, index) => ({
    lookup,
    text: originals[index],
  }));
};

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
 * by passing through a splitter. The kept parts are read off USDA's own text
 * for the same reason, which is what {@link namedParts} is.
 */
export function stripNonNamingQualifiers(description: string): string {
  const parts = namedParts(description);
  const keep = parts.map(
    ({ lookup }, index) => index === 0 || !STRIPPED_QUALIFIERS.has(lookup)
  );
  if (keep.every(Boolean)) return description;
  return parts
    .filter((_, index) => keep[index])
    .map(({ text }) => text)
    .join(", ");
}

/**
 * A qualifier part read as a phrase and the parenthetical gloss trailing it, if
 * it carries one.
 *
 * One row needs this and the roster below is why it is worth having:
 * `Milk, nonfat, fluid, without added vitamin A and vitamin D (fat free or
 * skim)` is written with no comma before its bracket, so USDA's own punctuation
 * makes the fortification phrase and the gloss ONE part. A part-exact rule
 * misses it, and missing it is not neutral — that gloss is the food's own name,
 * and `skim` inside it is the word ADR-0049's `skimmed milk` vocabulary key
 * expands to.
 */
const GLOSSED_PART = /^(.*?)\s*(\([^()]*\))$/;

/**
 * A description with its fortification qualifier removed, or unchanged if it
 * carries none (ADR-0062 §2).
 *
 * Positional on ADR-0056 §2's terms — a whole comma-delimited part, never the
 * head phrase — and byte-for-byte unchanged where nothing matches, for the
 * reason {@link stripNonNamingQualifiers} gives.
 *
 * A gloss left behind by the strip joins the part BEFORE it rather than
 * standing as a part of its own, because USDA wrote no comma there: the bracket
 * glosses the food, not the fortification, and `Milk, nonfat, fluid (fat free or
 * skim)` is the name it is a gloss on.
 *
 * Whether the result may actually be shipped is not a fact about the string —
 * see {@link resolveShippedNames}, which asks whether the name is free before it
 * applies this to anything.
 */
export function stripFortificationQualifier(description: string): string {
  const kept: string[] = [];
  let stripped = false;
  namedParts(description).forEach(({ lookup, text }, index) => {
    const glossed = lookup.match(GLOSSED_PART);
    const phrase = glossed ? glossed[1] : lookup;
    if (index === 0 || !FORTIFICATION_QUALIFIERS.has(phrase)) {
      kept.push(text);
      return;
    }
    stripped = true;
    // Matched again against USDA's OWN text, never the lowercased lookup, so a
    // gloss keeps its casing the way a kept qualifier does.
    const gloss = text.match(GLOSSED_PART);
    if (gloss) kept[kept.length - 1] += ` ${gloss[2]}`;
  });
  return stripped ? kept.join(", ") : description;
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
 * A name as every collision in this module is judged on it: every word,
 * stemmed, IN ORDER.
 *
 * Stems rather than the literal string, because USDA writes the plain organ
 * `kidneys` and its import `kidney`. Those differ as text, but {@link stemOf}
 * drops the trailing `s` and the search already treats them as one word — so
 * shipping both would put two rows a single letter apart side by side, which is
 * the duplicate every guard below exists to prevent.
 *
 * In order, and never sorted. A sorted word set is a multiset, and two names
 * built from the same words in different arrangements are not the same name:
 * `Nuts, mixed nuts, oil roasted, without peanuts, with salt added` and
 * `…, with peanuts, without salt added` collide under a sort and are opposite
 * foods.
 *
 * All three collision rules ask THIS, so "are these two rows one name" has one
 * answer: the origin tiebreak, the designation pass and the fortification
 * freedom check cannot come apart on what counts as a duplicate.
 */
const stemmedName = (name: string): string =>
  wordsOf(name).map(stemOf).join(" ");

/**
 * The key USDA's own description is grouped by, before any rename has run.
 *
 * The origin rule's entry point, and the one place the strip is applied inside
 * the key rather than before it: rule 1 is asked of archived text, where the
 * later rules are asked of names this module has already settled.
 */
const collisionKey = (description: string): string =>
  stemmedName(stripNonNamingQualifiers(description));

/**
 * What the rename does to a whole corpus: which rows get a new name, and which
 * leave because the new name was already taken.
 *
 * Corpus-wide by necessity — whether a name is free is not a fact about the
 * name — so it runs at generation time beside `plainSiblingsOf`, for the reason
 * ADR-0055 §6 gives.
 *
 * Four rules, in the order the body numbers them, and the order is load-bearing:
 * rule 4 asks whether a name is FREE, which is a question about the corpus the
 * three before it have already finished with.
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
 * 3. **Designation collision.** The population tag comes off every name, and
 *    where that leaves two rows with one name the FULLER PANEL stays. Settled on
 *    the record rather than on whose food it is, for the reason
 *    {@link DESIGNATION_TAGS} gives (ADR-0056's Amendment).
 * 4. **Fortification, only into a free name.** A
 *    {@link FORTIFICATION_QUALIFIERS} phrase comes off a name only where no
 *    other surviving row already answers to what is left. Nothing is dropped on
 *    this ground — where the name is taken, the row simply keeps the one it has
 *    (ADR-0062 §3). Rules 1 and 2 have no counterpart here because there is no
 *    origin to break the tie, and a fortification phrase distinguishes nothing
 *    that would let one row lose to another.
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

  // 3. The designation tag goes off every name. Where that leaves two rows with
  //    the same name, one of them goes — and the FULLER PANEL stays.
  //
  //    Not "the undesignated row stays". Measured, that rule is both wrong and
  //    unstatable: the Alaska Native chum salmon carries 112 nutrient fields
  //    against the general row's 70, and two of the six contested groups are
  //    designated on BOTH sides — two tribes' records of frybread, and two of
  //    chokecherries — where no fact about provenance chooses between them.
  //    Panel completeness is a claim about the record, which is the only kind
  //    ADR-0055 §1 admits, and it does not systematically delete anybody's food.
  const survivors = rows.filter((row) => !dropped.has(row.fdcId));
  const nameOf = (row: ShippedNameRow) =>
    stripDesignationTag(renamed.get(row.fdcId) ?? row.description);
  const byUntagged = new Map<string, ShippedNameRow[]>();
  for (const row of survivors) {
    const key = stemmedName(nameOf(row));
    const group = byUntagged.get(key);
    if (group) group.push(row);
    else byUntagged.set(key, [row]);
  }
  for (const group of byUntagged.values()) {
    if (group.length > 1) {
      // Deepest panel first; `fdcId` breaks a tie so the answer is stable across
      // regenerations rather than dependent on corpus order.
      const ranked = [...group].sort(
        (a, b) =>
          (b.panelFields ?? 0) - (a.panelFields ?? 0) || a.fdcId - b.fdcId
      );
      for (const row of ranked.slice(1))
        dropped.set(row.fdcId, "designation_collision");
      renamed.set(ranked[0].fdcId, nameOf(ranked[0]));
      continue;
    }
    const [row] = group;
    if (nameOf(row) !== (renamed.get(row.fdcId) ?? row.description))
      renamed.set(row.fdcId, nameOf(row));
  }
  for (const fdcId of dropped.keys()) renamed.delete(fdcId);

  // 4. The fortification phrase leaves a name, but only where the name it
  //    leaves is FREE (ADR-0062 §3).
  //
  //    The point where ADR-0062 departs from ADR-0056 §4. There, a rename that
  //    made two names identical was settled by dropping the row that carried an
  //    origin; here there is no origin to break the tie and nothing else about
  //    these rows may, so the rename is simply not made. An ugly name is
  //    preferred to two foods filed under one — six margarine rows keep
  //    `with salt, with added vitamin D` for exactly that reason, and no rule
  //    ever deletes a row on this ground.
  //
  //    A name is free when no OTHER surviving row could answer to it, and both
  //    words are load-bearing. **Could**: a candidate whose own proposal is
  //    refused keeps the name it has, so it still holds that name against
  //    everyone else, and counting only proposed names would let two candidates
  //    step aside into each other. **Answer to**: an alias is a name too, since
  //    `bestNameKey` ranks a query against it exactly as against a description.
  //
  //    Asked of the rows still standing after the designation pass, not of
  //    `survivors` above, which was read before it took its six.
  const standing = rows.filter((row) => !dropped.has(row.fdcId));
  const claimants = new Map<string, Set<number>>();
  const claim = (name: string, fdcId: number) => {
    const key = stemmedName(name);
    const holders = claimants.get(key);
    if (holders) holders.add(fdcId);
    else claimants.set(key, new Set([fdcId]));
  };
  const proposals = new Map<number, string>();
  for (const row of standing) {
    const shipped = renamed.get(row.fdcId) ?? row.description;
    const proposed = stripFortificationQualifier(shipped);
    if (proposed !== shipped) proposals.set(row.fdcId, proposed);
    claim(shipped, row.fdcId);
    claim(proposed, row.fdcId);
    // The alias as it will SHIP, not as the archive wrote it: ADR-0056 takes
    // the origin words out of both kinds of name, so a check reading the raw
    // alias would compare against a string nothing answers to.
    for (const alias of row.also ?? [])
      claim(stripNonNamingQualifiers(alias), row.fdcId);
  }
  const fortification: FortificationTally = { stripped: 0, refused: 0 };
  for (const [fdcId, proposed] of proposals) {
    if (claimants.get(stemmedName(proposed))?.size !== 1) {
      fortification.refused++;
      continue;
    }
    renamed.set(fdcId, proposed);
    fortification.stripped++;
  }

  return { renamed, dropped, fortification };
}
