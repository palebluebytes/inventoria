// ---------------------------------------------------------------------------
// The collapsing-axis roster: what was done to a food is not another food
// (ADR-0103 §2, §3, §9, §10)
// ---------------------------------------------------------------------------
//
// A USDA head phrase carries a ladder of records that differ along AXES —
// preparation, trim, grade, separation, variety, part, state. §2 sorts every
// axis into one of two kinds, corpus-wide, on the as-bought line:
//
//   A DISTINGUISHING axis names something true of the food when you BOUGHT it.
//   A COLLAPSING axis names something done to it AFTER you bought it, or a
//   trade specification you never see.
//
// This module is the roster of the second kind, plus §3's two derived keys: the
// RESIDUAL DESCRIPTION a name reads as once its collapsing segments are struck
// out, and the COLLAPSE GROUP KEY that decides which records are one food.
//
// It is a module of its own rather than an entry in `usda-food-kind.ts` or
// `usda-variant-drops.ts` because it moves on a THIRD trigger (§9): those move
// when an escape is measured and when a head phrase is read, and this one moves
// when an AXIS IS CLASSIFIED. Nothing here asks what a record is or what it is a
// variant of; it asks which direction a segment points in time.
//
// **The generator calls it** (#435). `scripts/usda-collapse.mjs` groups the
// finished corpus on `collapseGroupKey`, picks one record per group by §4's
// chain, and refuses a generation in which a collapsed row's survivor is not in
// the shipped index. The two instruments beside it — `scripts/usda-beef-pilot.mjs`,
// which produced this roster, and `scripts/usda-filter-census.mjs`, which asks
// what it absorbs — read the same entries through the same seam.
//
// NOTHING IN THE APP IMPORTS THIS FILE. The corpus is filtered once, at
// generation time, and what ships is the survivors; the scripts reach these
// through the esbuild seam in `scripts/usda-app-module.mjs` rather than keeping
// a second copy of the answer (ADR-0047 §4). That is the arrangement
// `usda-food-kind.ts`, `usda-variant-drops.ts` and `food-vocabulary.ts` all use,
// and `usda-collapse-roster.test.ts` pins it.
//
// Two rules govern every entry below, and both are §10's:
//
//   1. AN ENTRY MATCHES A COMPLETE COMMA-SEGMENT AND NEVER A SUBSTRING.
//      `primavera` carries `prime`, `selected` carries `select`, and USDA's egg
//      records carry `Grade A`, which is a different sense of the word
//      altogether. An entry reading the word rather than the segment renames
//      three egg rows.
//   2. AN ENTRY IS A PATTERN, NOT A LITERAL. USDA's spelling of one segment is
//      not stable — the SR Legacy archive writes `trimmed to 1/8" fat` 399 times
//      and `trimmed to 1/8"fat`, with no space, once.
//
// And §3 governs what the roster's ignorance costs: a segment no entry claims
// leaves two rows where there should be one, so the corpus UNDER-collapses.
// **The roster's ignorance always costs coverage, never correctness**, which is
// why a distinguishing axis is recorded here by being ABSENT rather than by an
// entry saying so — an entry that struck nothing out would be inert, and the
// list is short enough to read.
//
// ---------------------------------------------------------------------------
// The preparation axis is deliberately absent, and ADR-0104 is why
// ---------------------------------------------------------------------------
//
// ADR-0103 §2 classified cooking as the founding example of a collapsing axis,
// and the `Beef` pilot's roster carried fourteen preparation spellings. The
// classification still stands; what changed is that
// `0104-the-corpus-is-ingredients-as-bought-and-not-yet-cooked.md` replaced the
// collapse as the MECHANISM for it — the cooked records are removed at
// generation time rather than merged — and ADR-0104 §4 strips every spelling of
// the uncooked state out of the names that remain.
//
// So a preparation entry now reaches EIGHT segments in the whole shipped corpus,
// and all eight are rows ADR-0104 §2's shop test deliberately KEEPS:
//
//     Nuts, chestnuts, japanese, roasted
//     Nuts, chestnuts, european, roasted
//     Nuts, chestnuts, chinese, roasted
//     Seeds, breadfruit seeds, roasted
//     Seeds, pumpkin and squash seeds, whole, roasted, with salt added
//     Seeds, pumpkin and squash seed kernels, roasted, with salt added
//     Seeds, pumpkin and squash seeds, whole, roasted, without salt
//     Seeds, pumpkin and squash seed kernels, roasted, without salt
//
// Nobody roasts their own macadamias: you scoop roasted pumpkin seeds out of a
// bin and carry them home, so they are an ingredient as bought. Carrying the
// pilot's regex across would collapse three of them — japanese chestnut, chinese
// chestnut and breadfruit seed — onto the plain row beside them, and because
// `roasted` is a stated non-preferred value the roasted record would lose §4's
// chain and DISAPPEAR. A collapse that deletes a row ADR-0104 argued for is that
// decision reversed silently, which is the one thing §3's mechanical grouping is
// not allowed to do.
//
// The axis is therefore dropped whole rather than narrowed. Narrowing it — an
// entry for `roasted` outside `Nut and Seed Products`, say — would need the
// category, which is a fact about the record and not about the segment, and
// would put ADR-0104 §2's exemption in a second place to drift from.
// ---------------------------------------------------------------------------

/** The axes this roster classifies. A fourth costs an ADR (§2). */
export type CollapsingAxisName = "separation" | "trim" | "grade";

/**
 * One roster entry: a pattern over a whole comma-segment, and the argument for
 * it.
 *
 * `kind` and `because` are §9's first requirement made structural — every entry
 * names which of §2's two kinds it claims, and why, and **an entry that cannot
 * say is not ready to ship**. The field is a literal rather than a union because
 * the other kind is recorded by absence; see the header.
 */
export interface CollapsingAxis {
  /** The axis the segment belongs to. */
  axis: CollapsingAxisName;
  /** Which of §2's two kinds this entry claims. */
  kind: "collapsing";
  /** Why it claims it — the as-bought argument, in one sentence. */
  because: string;
  /** The whole-segment pattern (§10). */
  re: RegExp;
  /**
   * Whether a record STATING this value may still represent its group (§5).
   *
   * §5 refuses a record that "positively states a non-preferred value on a
   * collapsing axis", because the group's name would then claim less than the
   * record's panel measures. Saying nothing about an axis is not the same as
   * stating a value on it, which is what keeps intact every row naming no
   * separation at all.
   */
  preferred: boolean;
}

/**
 * ADR-0103 §2's collapsing axes, as patterns over a whole comma-segment.
 *
 * Tallies below are rows of `public/usda/search-index.json` as it ships today
 * (2,037 rows, schema 9), because a roster entry whose reach nobody measured is
 * a hole nobody can see. 224 rows carry at least one of the three, under the
 * same seven head phrases the roster has always reached: `Beef` 99, `Pork` 56,
 * `Lamb` 45, `Veal` 16, and eight between `Game meat` (6), `Pork loin` (1) and
 * `Chicken`.
 *
 * **These are SURVIVORS' segments, and that is not a contradiction.** The
 * generator collapses on these entries and then ships the representative under
 * the name USDA published, so the winner of a flank-steak group still says
 * `separable lean and fat, trimmed to 0" fat, choice`. Taking those words out of
 * the shipped name is ADR-0103 §5's strip and is #436's; until it lands, a
 * count here is a count of groups that collapsed rather than of rows that will.
 */
export const COLLAPSING_AXES: readonly CollapsingAxis[] = [
  // ── separation: the butcher's knife, not the counter ─────────────────────
  // 218 rows of the shipped corpus, 189 of them the undissected value. USDA
  // dissects a cut and assays the parts, so one steak arrives as three records.
  // You cannot buy any of them but the first.
  {
    axis: "separation",
    kind: "collapsing",
    because:
      "Dissecting a cut into lean and fat is something a laboratory did to the " +
      "sample after it was bought, not a choice at the counter. This is the " +
      "undissected value, so the group's name stays true of it.",
    re: /^(boneless )?separable lean and fat$/i,
    preferred: true,
  },
  {
    axis: "separation",
    kind: "collapsing",
    because:
      "The same act, stated from the other side: `separable lean only` is a " +
      "fraction of the cut. Collapsing, because you did not buy the fraction — " +
      "but non-preferred, because a name with the separation struck out would " +
      "claim a whole steak over a panel that measured part of one (§5).",
    re: /^((boneless )?separable lean only|lean only|separable fat)$/i,
    preferred: false,
  },
  // ── trim: a trade specification, and no value of it refuses ──────────────
  // 95 rows: 44 at 1/8", 39 at 0", 12 at 1/4". The optional space is §10's,
  // written for the one SR Legacy row spelling it `1/8"fat`; that row was
  // `cooked, broiled` and left with ADR-0104's, so the entry reaches three
  // spellings today and the `?` is insurance against the archive, not the index.
  {
    axis: "trim",
    kind: "collapsing",
    because:
      "A depth of fat left on by the butcher is a trade specification written " +
      'for the trade — no reader of this app has ever chosen between a 0" and ' +
      'a 1/8" trim, and no British butcher states one. Nothing refuses: the ' +
      "group exists precisely on the ground that these are one food, and " +
      "refusing a record for stating a trim would re-import the distinction " +
      "the collapse just erased (§2).",
    re: /^trimmed to (0|1\/8|1\/4)" ?fat$/i,
    preferred: true,
  },
  // ── grade: likewise, in two countries' vocabularies ──────────────────────
  // 60 rows: choice 39, select 14, prime 1, Australian marble score 6.
  {
    axis: "grade",
    kind: "collapsing",
    because:
      "A carcass grade is the other trade specification: it grades the animal " +
      "at the abattoir, and the shopper sees a price rather than the word. " +
      "Nothing refuses, for the trim entry's reason.",
    // §10's standing warning. `Grade A` is a different sense of the word and is
    // not matched: it appears in `Eggs, Grade A, Large, egg white`, and an entry
    // reading the word rather than the segment renames three egg rows.
    re: /^(usda )?(choice|select|prime)$/i,
    preferred: true,
  },
  {
    axis: "grade",
    kind: "collapsing",
    because:
      "Australia's marble score is the same specification in another country's " +
      "vocabulary. It reaches the corpus on `Beef, Wagyu` records and nothing " +
      "else.",
    // Anchored at the head of the segment rather than at both ends, because the
    // score itself is free-form — USDA writes `4/5` and `9`. A segment carries
    // no comma, so this still cannot match inside one.
    re: /^aust\. marble score /i,
    preferred: true,
  },
];

/**
 * Which axis claims this segment, or `null` where none does.
 *
 * The segment is matched WHOLE (§10). An unclaimed segment survives into the
 * residual description, which under-collapses rather than mis-collapsing — §3's
 * direction of failure, and the argument for grouping mechanically at all.
 */
export const claimingAxis = (segment: string): CollapsingAxis | null =>
  COLLAPSING_AXES.find((entry) => entry.re.test(segment)) ?? null;

/**
 * A USDA description split into the head phrase that names the food and the
 * trailing segments that qualify it.
 *
 * Splitting precedes matching (§10), and only the tail is offered to the roster:
 * the head is what the group is a group OF, so it is never a candidate however
 * it reads.
 */
export const descriptionSegments = (
  description: string
): { head: string; tail: string[] } => {
  const parts = description.split(",").map((part) => part.trim());
  return { head: parts[0], tail: parts.slice(1) };
};

/**
 * §3's residual description: the name with every collapsing segment struck out.
 *
 * Nothing displays it. It exists to decide which records are one food, and — for
 * a group that actually merged — to be the name the survivor ships under, which
 * is the strip ADR-0056 §1 performs once the collapse has licensed it (§5).
 */
export const residualDescription = (description: string): string => {
  const { head, tail } = descriptionSegments(description);
  return [head, ...tail.filter((segment) => !claimingAxis(segment))].join(", ");
};

/**
 * The key records are grouped on: the residual description with §3's
 * normalisation clause applied.
 *
 * Punctuation and whitespace ONLY. `Beef, round, top round, steak` and
 * `Beef, round, top round steak` are one food and USDA spells it both ways, so
 * the key ignores the comma — and ignores nothing that carries meaning. #191
 * measured the wider normalisations (dropping `boneless`, `bone-in`, `lip-on`)
 * and they are refused: this clause is a correctness lever, not a size one.
 */
export const collapseGroupKey = (description: string): string =>
  residualDescription(description)
    .toLowerCase()
    .replace(/[,\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * §5's eligibility test: may this record stand for the group it belongs to?
 *
 * A record is refused when it **positively states a non-preferred value** on a
 * collapsing axis, because the group's name would then claim a food the
 * record's panel did not measure — `separable lean only` is a dissected
 * fraction, not the steak. Saying NOTHING about an axis is not the same as
 * stating a value on it, which is what keeps intact every row naming no
 * separation at all.
 *
 * Only `separation` carries a non-preferred value today. ADR-0103's 2026-09-12
 * Amendment settled which axes do: preparation and separation, because a cooked
 * record and a dissected fraction are not the food you bought — and **trim and
 * grade carry none**, because §2 collapsed them on the express ground that they
 * are the same food, so refusing a record for stating one would re-import the
 * distinction the collapse has just erased. The preparation axis then left with
 * ADR-0104 (see the header), leaving one.
 *
 * An UNCLAIMED segment is not refused here, and does not need to be: it survives
 * into the residual description, so a row carrying one is in a group of its own
 * and never stands for anything else. §5's `with added solution` clause is
 * carried by {@link collapseGroupKey} rather than by this predicate.
 *
 * Where a group of more than one has no eligible record it does not block its
 * head: it ships its fullest-panel record under that record's whole, unstripped
 * name, exactly as a group of one does (the same Amendment).
 */
export const mayRepresentGroup = (description: string): boolean =>
  descriptionSegments(description).tail.every((segment) => {
    const entry = claimingAxis(segment);
    return entry === null || entry.preferred;
  });
