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
// **The generator does not call it yet.** This is the expand half of the
// hand-off from the #186 map: the roster stops being a pilot artifact and
// becomes the app's, and `public/usda/search-index.json` is unchanged. Its whole
// readership today is `scripts/usda-beef-pilot.mjs`, which produced it, and
// `scripts/usda-filter-census.mjs`, which asks what it would have absorbed.
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
 * (2,418 rows, schema 9), because a roster entry whose reach nobody measured is
 * a hole nobody can see. 603 rows — a quarter of the corpus — carry at least one
 * of the three, under seven head phrases: `Beef` 374, `Lamb` 97, `Pork` 94,
 * `Veal` 30, and eight between `Game meat` (6), `Pork loin` (1) and `Chicken`.
 */
export const COLLAPSING_AXES: readonly CollapsingAxis[] = [
  // ── separation: the butcher's knife, not the counter ─────────────────────
  // 595 rows. USDA dissects a cut and assays the parts, so one steak arrives as
  // three records. You cannot buy any of them but the first.
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
  // 373 rows: 183 at 0", 166 at 1/8", 24 at 1/4". The optional space is §10's,
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
  // 263 rows: choice 140, select 101, prime 6, Australian marble score 16.
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
      "vocabulary. It reaches the corpus on sixteen `Beef, Wagyu` records and " +
      "nothing else.",
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
