/**
 * PROTOTYPE — see README.md. Throwaway; not reached by the app.
 *
 * The one thing this prototype computes: given the rows USDA publishes under a
 * single ingredient, WHICH AXES do they vary along, and does each axis move the
 * number enough to be worth a control on the staging screen.
 *
 * Everything here is deliberately hand-written. The axis roster below is not a
 * proposal for the real rule — #190 owns that — it is the smallest thing that
 * makes four real populations legible so the forms-versus-rows question can be
 * looked at rather than argued.
 *
 * The measurement is the part that has to be honest, so it is PAIRED. A marginal
 * mean per axis value is confounded by the unbalanced design USDA actually
 * published, and over these four populations it is not off by a little:
 *
 *   beef top sirloin, `trim`   marginal  0%   paired median 12%
 *   beef top sirloin, `grade`  marginal 18%   paired median  6%
 *
 * The marginal reading says trim is free and grade is the price. The paired
 * reading says the reverse. Only pairs identical on every OTHER axis are
 * compared, which is the same shape as the map's own "596 groups differing only
 * by raw-vs-cooked" figure.
 */

import type { UsdaIndexRow } from "../usda-corpus";

/**
 * What an axis IS, which is the adjudication's whole argument.
 *
 * The dial measures how far an axis moves the calories. The four hand-worked
 * populations came back saying that is the wrong question: `cultivar` moves the
 * number 2 % on wine and is wanted as a choice, while `preparation` moves it
 * 34 % on beef and is not. What separates them is not size, it is KIND.
 *
 *   form      what the food IS — a variety, a part, a fat content. Its own row.
 *   collapse  what was DONE to it, or a trade spec nobody logs. Never a row.
 *
 * A third disposition, DROP, exists but is deliberately not an axis kind — see
 * {@link Population.drops}.
 */
export type AxisKind = "form" | "collapse";

/** One dimension a group of USDA rows varies along. */
export interface AxisSpec {
  id: string;
  /** What a picker would be labelled, if this axis became a form. */
  label: string;
  /** The value carried by a row that says nothing about this axis. */
  fallback: string;
  kind: AxisKind;
  /**
   * The value a collapse prefers for its representative, where USDA published
   * one. `raw` beats a cooked sibling because it is the state the food is
   * bought and weighed in, not because its panel is fuller.
   */
  prefer?: string;
  rules: [RegExp, string | null][];
}

/**
 * The axes, in the order a description tends to spell them.
 *
 * A rule's second element is the value to record; `null` means "take capture
 * group 1, lowercased". First matching rule per segment wins, and an axis keeps
 * its FIRST value, so order within a rule list is the tiebreak.
 */
export const AXES: AxisSpec[] = [
  {
    id: "state",
    label: "State",
    fallback: "fresh",
    kind: "collapse",
    prefer: "fresh",
    rules: [[/^dried$/i, "dried"]],
  },
  {
    id: "cut",
    label: "Cut",
    fallback: "—",
    kind: "form",
    rules: [
      [/^(steak|roast|tri-tip roast|cap steak|petite roast|filet)$/i, null],
    ],
  },
  {
    id: "separation",
    label: "Lean or lean-and-fat",
    fallback: "—",
    kind: "form",
    rules: [[/^separable (lean only|lean and fat)$/i, null]],
  },
  {
    id: "skin",
    label: "Skin",
    fallback: "—",
    kind: "form",
    rules: [
      // `skinless` and `meat only` are one value, not two: USDA's one skinless
      // row also says `meat only` in the same description.
      [/^skinless$/i, "meat only"],
      [/^(with skin|without skin|meat and skin|meat only|skin only)$/i, null],
    ],
  },
  {
    id: "trim",
    label: "Trim",
    fallback: "—",
    kind: "collapse",
    rules: [[/^trimmed to (.+) fat$/i, null]],
  },
  {
    id: "grade",
    label: "Grade",
    fallback: "—",
    kind: "collapse",
    rules: [[/^(choice|select|prime)$/i, null]],
  },
  {
    id: "style",
    label: "Style",
    fallback: "table",
    kind: "collapse",
    prefer: "table",
    rules: [[/^late harvest$/i, "late harvest"]],
  },
  {
    id: "preparation",
    label: "Preparation",
    fallback: "—",
    kind: "collapse",
    prefer: "raw",
    rules: [
      [/^(raw|uncooked)$/i, "raw"],
      [/^cooked, (.+)$/i, null],
      [
        /^(broiled|roasted|grilled|pan-fried|fried|stewed|boiled|braised|baked|microwave)$/i,
        null,
      ],
    ],
  },
  {
    id: "treatment",
    label: "Treatment",
    fallback: "—",
    kind: "collapse",
    rules: [[/^(sulfured|unsulfured)$/i, null]],
  },
  {
    id: "sweetening",
    label: "Sweetening",
    fallback: "—",
    kind: "collapse",
    rules: [[/^(with added sugar|without added sugar)$/i, null]],
  },
  {
    id: "production",
    label: "Production",
    fallback: "—",
    kind: "form",
    rules: [[/^(grass-fed|organic)$/i, null]],
  },
  {
    id: "cultivar",
    label: "Variety",
    fallback: "—",
    // Named rather than pattern-matched: a grape is not spellable as a regex,
    // and pretending otherwise would hide how much hand-work a real rule needs.
    kind: "form",
    rules: [
      [
        /^(red delicious|fuji|gala|granny smith|honeycrisp|golden delicious|chenin blanc|fume blanc|muller thurgau|riesling|sauvignon blanc|chardonnay|pinot gris|gewurztraminer|semillon|pinot blanc|muscat)$/i,
        null,
      ],
    ],
  },
];

export interface Population {
  id: string;
  /** What the user would type. */
  query: string;
  /** The single row this ingredient becomes under shapes (b) and (c). */
  ingredient: string;
  match: RegExp;
  /** How many leading comma-segments are the ingredient's own name. */
  head: number;
  /** Why this population is in the prototype. */
  why: string;
  /**
   * Rows this head does not want at all, named by an axis value.
   *
   * DROP is per head and never per axis, and the corpus is why. A blanket rule
   * on the word `dried` takes 80 rows and wipes seven heads out completely —
   * `apricots` (all 3 rows are dried), `goji berries` (1 row, dried), dried
   * shiitake, dried pasilla. Under `apple`, `dried` names a different product;
   * under `apricots` it names the only way the food exists. The same word, two
   * meanings, and only a human reading the head can tell them apart.
   *
   * This is the map's hand-adjudication in miniature, and #190 owns both halves
   * of it: the 25 heads worked by hand and the mechanical rule for the 462-head
   * tail.
   */
  drops?: { axis: string; value: string }[];
}

export const POPULATIONS: Population[] = [
  {
    id: "chicken-breast",
    query: "chicken breast",
    ingredient: "Chicken breast",
    match: /^Chicken, broilers or fryers, breast/i,
    head: 3,
    why: "The strongest case FOR forms: the user knows which preparation they mean, and weighing food on the plate under shape (a) mis-logs them.",
  },
  {
    id: "beef-sirloin",
    query: "beef top sirloin steak",
    ingredient: "Beef top sirloin steak",
    match: /^Beef, top sirloin, steak,/i,
    head: 3,
    why: "The case AGAINST: trim and grade are distinctions the user will never make, and a picker for them has moved the noise rather than removed it.",
  },
  {
    id: "apple",
    query: "apple",
    ingredient: "Apple",
    match: /^Apples,/i,
    head: 1,
    drops: [{ axis: "state", value: "dried" }],
    why: "Varietals that barely differ, mixed into the same head as a preparation that differs enormously. Tests whether one head can want two treatments at once.",
  },
  {
    id: "white-wine",
    query: "white wine",
    ingredient: "White wine",
    match: /^Alcoholic beverage, wine, table, white/i,
    head: 4,
    drops: [{ axis: "style", value: "late harvest" }],
    why: "ADR-0055's trap, kept as a tripwire: `late harvest` is a dessert wine wearing a table wine's name, and any rule shaped “drop what follows the plain form” deletes it.",
  },
];

/** One USDA row, decomposed into the axes it spells. */
export interface Decomposed {
  row: UsdaIndexRow;
  /** axis id → value, every axis present, fallbacks filled in. */
  values: Map<string, string>;
  /** Segments no rule claimed. Shown, never hidden — they are the roster's debt. */
  unclaimed: string[];
}

function segmentsOf(description: string, head: number): string[] {
  return description
    .replace(/\s*\([^)]*\)/g, "") // "(Includes foods for USDA's ... Program)"
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(head);
}

export function decompose(row: UsdaIndexRow, head: number): Decomposed {
  const segs = segmentsOf(row.description, head);
  const values = new Map<string, string>();
  const unclaimed: string[] = [];

  for (let i = 0; i < segs.length; i++) {
    let seg = segs[i];
    // "cooked, broiled" is one fact wearing two commas.
    if (/^cooked$/i.test(seg) && segs[i + 1]) seg = `cooked, ${segs[++i]}`;

    let claimed = false;
    for (const axis of AXES) {
      for (const [re, fixed] of axis.rules) {
        const m = seg.match(re);
        if (!m) continue;
        if (!values.has(axis.id))
          values.set(axis.id, (fixed ?? m[1] ?? m[0]).toLowerCase());
        claimed = true;
        break;
      }
      if (claimed) break;
    }
    if (!claimed) unclaimed.push(seg);
  }

  for (const axis of AXES)
    if (!values.has(axis.id)) values.set(axis.id, axis.fallback);
  return { row, values, unclaimed };
}

/** What one axis costs the reader, measured over matched pairs. */
export interface AxisMeasure {
  axis: AxisSpec;
  values: string[];
  /** Rows differing on this axis and identical on every other. */
  pairs: number;
  /** Median |Δkcal| / lower, across those pairs. Null where none exist. */
  median: number | null;
  max: number | null;
  /** The widest pair, for naming the worst case on screen. */
  widest: [Decomposed, Decomposed] | null;
}

export interface Reading {
  population: Population;
  rows: Decomposed[];
  /** Only the axes this population actually varies along, widest first. */
  measures: AxisMeasure[];
  unclaimed: string[];
}

export function read(population: Population, index: UsdaIndexRow[]): Reading {
  const rows = index
    .filter((r) => population.match.test(r.description))
    .map((r) => decompose(r, population.head));

  const varying = AXES.filter(
    (axis) => new Set(rows.map((r) => r.values.get(axis.id))).size > 1
  );

  const signature = (r: Decomposed, skip: string) =>
    varying
      .filter((a) => a.id !== skip)
      .map((a) => r.values.get(a.id))
      .join("") +
    "" +
    r.unclaimed.join("+");

  const measures = varying.map((axis) => {
    const buckets = new Map<string, Decomposed[]>();
    for (const r of rows) {
      const key = signature(r, axis.id);
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r);
    }
    const deltas: { pct: number; pair: [Decomposed, Decomposed] }[] = [];
    for (const group of buckets.values())
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const [a, b] = [group[i], group[j]];
          if (a.values.get(axis.id) === b.values.get(axis.id)) continue;
          // ADR-0048: an absent measurement is not a zero, so a pair missing
          // either figure is not a delta of nothing — it is not a delta at all.
          const [x, y] = [a.row.macros.calories, b.row.macros.calories];
          if (x == null || y == null) continue;
          const [lo, hi] = x < y ? [x, y] : [y, x];
          if (lo > 0) deltas.push({ pct: (hi - lo) / lo, pair: [a, b] });
        }
    deltas.sort((p, q) => p.pct - q.pct);
    return {
      axis,
      values: [...new Set(rows.map((r) => r.values.get(axis.id)!))].sort(),
      pairs: deltas.length,
      median: deltas.length ? deltas[Math.floor(deltas.length / 2)].pct : null,
      max: deltas.length ? deltas[deltas.length - 1].pct : null,
      widest: deltas.length ? deltas[deltas.length - 1].pair : null,
    };
  });

  // Widest first, and the unmeasurable axes last rather than first: an axis with
  // no matched pair is a question, not a winner.
  measures.sort((a, b) => (b.median ?? -1) - (a.median ?? -1));

  return {
    population,
    rows,
    measures,
    unclaimed: [...new Set(rows.flatMap((r) => r.unclaimed))],
  };
}

/**
 * The row that represents a collapsed group — ADR-0056 §3's existing tiebreak,
 * reused rather than restated: the fullest nutrient panel wins.
 *
 * The shipped index carries only four macros per row, so "fullest" here counts
 * the macros that are present and breaks the remaining tie on `Foundation`
 * before `SR Legacy` and then on the lowest `fdcId`. That is a PROXY, and a
 * deliberately visible one: the real rule reads the whole panel, which the
 * search index does not carry.
 */
export function representative(rows: Decomposed[]): Decomposed | null {
  // Present, not non-zero: ADR-0048 again — a measured 0 g of fat is a fuller
  // panel than a fat figure USDA never published.
  const score = (d: Decomposed) =>
    Object.values(d.row.macros).filter((v) => v != null).length;

  const eligible = rows.filter((d) => {
    // An unclaimed qualifier refuses the row. Without this,
    // `breast, skinless, boneless, meat only, with added solution, raw` — the
    // only raw meat-only row USDA published — stands for plain chicken breast
    // and hands the reader a brine-diluted 108 kcal. A row the roster could not
    // read in full is a row whose identity is not established, and an
    // unestablished identity cannot stand for a group.
    if (d.unclaimed.length) return false;
    // A row that positively says it was COOKED is refused too. A collapse of
    // `preparation` exists to move the food off its cooked variants, so
    // electing the fried one to represent the group defeats the collapse.
    // Saying nothing about preparation is not the same as saying "fried": only
    // a stated non-preferred value is refused.
    return AXES.filter((a) => a.prefer).every((a) => {
      const value = d.values.get(a.id);
      return value === a.prefer || value === a.fallback;
    });
  });

  // Null, not a fallback. Every row refused means USDA published no usable
  // panel for this form — a coverage hole, which is ADR-0046's curated
  // stand-ins' business and must never be papered over with a wrong number.
  if (!eligible.length) return null;

  return eligible.sort(
    (a, b) =>
      score(b) - score(a) ||
      Number(b.row.dataType === "Foundation") -
        Number(a.row.dataType === "Foundation") ||
      a.row.fdcId - b.row.fdcId
  )[0];
}

/** Rows matching a chosen value on every axis in `picked`. */
export function matching(
  rows: Decomposed[],
  picked: Map<string, string>
): Decomposed[] {
  return rows.filter((r) =>
    [...picked].every(([axis, value]) => r.values.get(axis) === value)
  );
}
