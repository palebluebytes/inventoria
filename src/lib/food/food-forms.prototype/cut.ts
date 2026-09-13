/**
 * PROTOTYPE — see README.md. Throwaway; not reached by the app.
 *
 * The one cut all three shapes are built on, so that what separates them is
 * DISPOSAL and nothing else.
 *
 * Given a threshold, every axis a population varies along lands on one side or
 * the other. Shape (a) turns a kept axis into separate ROWS, shape (c) turns it
 * into a form PICKER, and shape (b) is shape (c) with the threshold at zero.
 * Reuse is the whole point: three renderings of one cut can be compared, three
 * hand-built mockups cannot.
 *
 * The awkward case is an axis with no matched pair. It is kept, never dropped:
 * "USDA never published the comparison" is not evidence that the axis is noise,
 * and a prototype that silently treated it as noise would be answering the
 * question by assumption. It is marked on screen wherever it survives.
 */

import {
  matching,
  representative,
  type AxisMeasure,
  type Decomposed,
  type Reading,
} from "./model";

export interface Cut {
  /** Axes that survive the threshold — rows under (a), pickers under (b)/(c). */
  kept: AxisMeasure[];
  /** Axes below it — decided for the reader, never shown as a choice. */
  decided: AxisMeasure[];
}

export function cutAt(reading: Reading, threshold: number): Cut {
  const kept: AxisMeasure[] = [];
  const decided: AxisMeasure[] = [];
  for (const m of reading.measures)
    (m.median === null || m.median >= threshold ? kept : decided).push(m);
  return { kept, decided };
}

/** One combination of values across the kept axes. */
export interface Combination {
  values: Map<string, string>;
  /** The rows USDA actually published for it. Empty is the interesting case. */
  rows: Decomposed[];
  /** The row that stands for them. Null when there are none, or when every
   * row was refused — {@link hole} is what tells those two apart. */
  stands: Decomposed | null;
  /**
   * Rows exist, but not one of them may represent the group: every candidate
   * either carries a qualifier the roster could not read, or positively says it
   * was cooked. A coverage hole, reported rather than filled.
   */
  hole: boolean;
}

/** Every combination the kept axes can express — including the empty ones. */
export function combinations(reading: Reading, cut: Cut): Combination[] {
  let out: Map<string, string>[] = [new Map()];
  for (const m of cut.kept)
    out = out.flatMap((base) =>
      m.values.map((value) => new Map(base).set(m.axis.id, value))
    );
  return out.map((values) => {
    const rows = matching(reading.rows, values);
    const stands = rows.length ? representative(rows) : null;
    return { values, rows, stands, hole: rows.length > 0 && !stands };
  });
}

/**
 * How much of the picker is a lie — the share of combinations with no row behind
 * them.
 *
 * USDA's design is unbalanced, so a control per axis offers a cross-product the
 * data never filled in. This is the number that prices shape (b): a picker that
 * lets you choose `select` × `pan-fried` when USDA measured only `choice` ×
 * `pan-fried` either shows the wrong panel or dead-ends the reader.
 */
export function hollowness(combos: Combination[]): {
  offered: number;
  empty: number;
  share: number;
} {
  const empty = combos.filter((c) => !c.rows.length).length;
  return {
    offered: combos.length,
    empty,
    share: combos.length ? empty / combos.length : 0,
  };
}

/** The spread of calories a collapse throws away, across the rows it merges. */
export function lost(rows: Decomposed[]): { lo: number; hi: number } | null {
  const cals = rows
    .map((r) => r.row.macros.calories)
    .filter((c): c is number => c != null);
  if (cals.length < 2) return null;
  const [lo, hi] = [Math.min(...cals), Math.max(...cals)];
  return lo === hi ? null : { lo, hi };
}

/** The name a combination would be shown under: the ingredient plus what it fixes. */
export function nameFor(
  ingredient: string,
  cut: Cut,
  values: Map<string, string>
): string {
  const said = cut.kept
    .map((m) => values.get(m.axis.id))
    .filter((v) => v && v !== "—");
  return said.length ? `${ingredient}, ${said.join(", ")}` : ingredient;
}

// ── the adjudicated cut: kind, not size ─────────────────────────────────────

/**
 * The cut the four hand-worked populations produced, which reads an axis's KIND
 * rather than the dial, plus the head's own list of rows it does not want.
 *
 * DROP is the disposition that costs something, and the cost is named here
 * rather than buried: a dropped row is a food that can no longer be logged.
 * `late harvest` white wine and `dried` apple both go, which makes this the
 * THIRD amendment to ADR-0055 §1 — and the first that deletes a food for being
 * a DIFFERENT food rather than for being a duplicate of a survivor. The two
 * earlier amendments both had a survivor to point at. This one does not.
 */
export interface Adjudicated {
  name: string;
  /** The surviving rows, as the search would list them. */
  combos: Combination[];
  forms: AxisMeasure[];
  collapsed: AxisMeasure[];
  /** Rows the head refused outright, kept here so the price stays visible. */
  dropped: Decomposed[];
}

/** The plainest row leads: fewest words said about it, then the lowest id. */
function plainestFirst(forms: AxisMeasure[]) {
  return (a: Combination, b: Combination) => {
    const said = (c: Combination) =>
      forms.filter((m) => {
        const v = c.values.get(m.axis.id);
        return v && v !== m.axis.fallback && v !== "—";
      }).length;
    return (
      said(a) - said(b) ||
      (a.stands?.row.fdcId ?? Number.MAX_SAFE_INTEGER) -
        (b.stands?.row.fdcId ?? Number.MAX_SAFE_INTEGER)
    );
  };
}

export function adjudicate(reading: Reading): Adjudicated {
  const drops = reading.population.drops ?? [];
  const refused = (d: Decomposed) =>
    drops.some(({ axis, value }) => d.values.get(axis) === value);

  const dropped = reading.rows.filter(refused);
  const kept = reading.rows.filter((d) => !refused(d));

  // Measured over the SURVIVORS: an axis that only the dropped rows varied
  // along is not an axis of this food at all.
  const survived: Reading = { ...reading, rows: kept };
  const varies = (m: AxisMeasure) =>
    new Set(kept.map((d) => d.values.get(m.axis.id))).size > 1;
  const forms = reading.measures.filter(
    (m) => m.axis.kind === "form" && varies(m)
  );
  const collapsed = reading.measures.filter(
    (m) => m.axis.kind === "collapse" && varies(m)
  );

  const combos = combinations(survived, { kept: forms, decided: collapsed })
    .filter((c) => c.rows.length)
    .sort(plainestFirst(forms));

  return {
    name: reading.population.ingredient,
    combos,
    forms,
    collapsed,
    dropped,
  };
}
