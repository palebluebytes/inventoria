/**
 * PROTOTYPE — see README.md. Throwaway; not reached by the app.
 *
 * The four shapes. All four read the same cut (`cut.ts`) at the same threshold,
 * so what differs between them is only what they DO with a kept axis:
 *
 *   A  rows      a kept axis becomes a row per value, spelled in the name
 *   B  forms     every axis becomes a picker, threshold ignored
 *   C  measured  a kept axis becomes a picker, a dropped axis is decided
 *   D  nested    one row; its forms are the surviving COMBINATIONS, not the axes
 *
 * B is written as C with the threshold forced to zero rather than as its own
 * renderer, which is the point: the difference between "one row per ingredient
 * with forms" and "one row per ingredient with the forms that earn it" is a
 * number, and the number is draggable.
 *
 * D was built after the decision that a search must return one food per row.
 * A, B and C all leave something unanswered under that ruling — A contradicts
 * it outright, and B and C honour it but offer a cross-product 42–98 % of which
 * USDA never published. D offers the surviving combinations themselves, so
 * hollowness is zero by construction.
 */

import { h, clear, pct, kcal, grams, shown } from "./dom";
import {
  adjudicate,
  combinations,
  cutAt,
  hollowness,
  lost,
  nameFor,
  type Combination,
  type Cut,
} from "./cut";
import {
  representative,
  type AxisMeasure,
  type Decomposed,
  type Reading,
} from "./model";

export type Shape = "a" | "b" | "c" | "d" | "e" | "f";

export interface State {
  reading: Reading;
  shape: Shape;
  threshold: number;
  /** Under B and C: the value chosen on each picker axis. */
  picked: Map<string, string>;
  /** Under A: the row the reader clicked. */
  chosen: Decomposed | null;
  redraw(): void;
}

/** The threshold a shape actually reads. B ignores the slider by definition. */
export const thresholdFor = (state: State) =>
  state.shape === "b" ? 0 : state.threshold;

// ── shared pieces ───────────────────────────────────────────────────────────

function axisChip(m: AxisMeasure, kept: boolean, threshold: number) {
  const unmeasured = m.median === null;
  return h(
    "span",
    {
      class: `axis ${kept ? "axis-kept" : "axis-decided"}${unmeasured ? " axis-unmeasured" : ""}`,
      title: unmeasured
        ? `${m.axis.label}: USDA published no pair of rows differing only on this axis, so it cannot be measured. Kept rather than dropped — see README.`
        : `${m.axis.label}: ${m.pairs} matched pairs, median ${pct(m.median)}, worst ${pct(m.max)}. Threshold ${pct(threshold)}.`,
    },
    h("b", { text: m.axis.label }),
    " ",
    unmeasured ? "unmeasurable" : pct(m.median)
  );
}

function measurementStrip(cut: Cut, threshold: number) {
  return h(
    "div",
    { class: "strip" },
    h("span", {
      class: "strip-label",
      text: "Axes, by how far they move the calories",
    }),
    h(
      "span",
      { class: "chips" },
      cut.kept.map((m) => axisChip(m, true, threshold)),
      cut.decided.map((m) => axisChip(m, false, threshold))
    )
  );
}

/**
 * The panel a staged food would show.
 *
 * `missing` distinguishes the two ways there is nothing to draw, because they
 * are not the same fact. Under A nothing is picked yet; under B and C the
 * pickers are offering a combination USDA never published, which is the whole
 * price of a form.
 */
function panel(
  row: Decomposed | null,
  stands: number,
  missing: "unpicked" | "hollow"
) {
  if (!row)
    return missing === "unpicked"
      ? h("div", {
          class: "panel panel-unpicked",
          text: "Pick a row to see the panel it would stage.",
        })
      : h(
          "div",
          { class: "panel panel-empty" },
          h("b", { text: "No row behind this combination." }),
          h("p", {
            text: "USDA never published it. A picker that offers it must either dead-end here or quietly show a number for a different food.",
          })
        );
  const m = row.row.macros;
  return h(
    "div",
    { class: "panel" },
    h("div", { class: "panel-name", text: shown(row.row.description) }),
    h(
      "div",
      { class: "panel-figures" },
      h("span", {}, h("b", { text: kcal(m.calories) }), " kcal"),
      h("span", {}, h("b", { text: grams(m.protein_content) }), " g protein"),
      h("span", {}, h("b", { text: grams(m.fat_content) }), " g fat"),
      h(
        "span",
        {},
        h("b", { text: grams(m.carbohydrate_content) }),
        " g carbs"
      ),
      h("span", { class: "basis", text: "per 100 g" })
    ),
    stands > 1 &&
      h("div", {
        class: "panel-stands",
        text: `Stands for ${stands} USDA rows; the fullest panel represents them (ADR-0056 §3).`,
      })
  );
}

// ── A — variants stay separate rows ─────────────────────────────────────────

function shapeRows(state: State, cut: Cut) {
  const { reading } = state;
  const combos = combinations(reading, cut).filter((c) => c.rows.length);
  const dropped = reading.rows.length - combos.length;

  return h(
    "section",
    {},
    h("p", {
      class: "lede",
      text:
        `Consolidation by dropping. Every axis that moves the calories by ${pct(state.threshold)} or more keeps its rows; ` +
        `everything below it is collapsed onto the fullest panel and is no longer loggable.`,
    }),
    h(
      "div",
      { class: "tally" },
      h(
        "span",
        {},
        h("b", { text: String(reading.rows.length) }),
        " USDA rows"
      ),
      h("span", { class: "arrow", text: "→" }),
      h("span", {}, h("b", { text: String(combos.length) }), " shipped rows"),
      dropped > 0 &&
        h("span", { class: "tally-lost", text: `${dropped} dropped` })
    ),
    h(
      "ul",
      { class: "rows" },
      combos.map((combo) => {
        const stands = combo.stands;
        const range = lost(combo.rows);
        const chosen = !!stands && state.chosen?.row.fdcId === stands.row.fdcId;
        return h(
          "li",
          {
            class: `row${chosen ? " row-chosen" : ""}${combo.hole ? " row-hole" : ""}`,
            onclick: () => {
              if (!stands) return;
              state.chosen = stands;
              state.redraw();
            },
          },
          h("span", {
            class: "row-name",
            text: nameFor(reading.population.ingredient, cut, combo.values),
          }),
          h("span", {
            class: "row-kcal",
            text: stands
              ? `${kcal(stands.row.macros.calories)} kcal`
              : "no panel",
          }),
          combo.rows.length > 1 &&
            h("span", {
              class: "row-merged",
              text: range
                ? `${combo.rows.length} rows merged, ${range.lo}–${range.hi} kcal thrown away`
                : `${combo.rows.length} rows merged`,
            })
        );
      })
    ),
    panel(
      state.chosen,
      state.chosen
        ? (combos.find((c) => c.stands?.row.fdcId === state.chosen!.row.fdcId)
            ?.rows.length ?? 1)
        : 1,
      "unpicked"
    )
  );
}

// ── B and C — one row per ingredient, carrying forms ────────────────────────

function pickers(state: State, cut: Cut, combos: Combination[]) {
  const hollow = hollowness(combos);
  const current = combos.find((c) =>
    cut.kept.every(
      (m) => c.values.get(m.axis.id) === state.picked.get(m.axis.id)
    )
  );

  return h(
    "section",
    {},
    h("p", {
      class: "lede",
      text:
        state.shape === "b"
          ? "One row per ingredient, and every axis USDA varies is a control the reader operates. No axis is judged; the threshold slider is ignored."
          : `One row per ingredient. An axis becomes a control only where it moves the calories by ${pct(state.threshold)} or more; the rest are decided for the reader.`,
    }),
    h("div", {
      class: "ingredient",
      text: state.reading.population.ingredient,
    }),
    h(
      "div",
      { class: "forms" },
      cut.kept.length
        ? cut.kept.map((m) =>
            h(
              "div",
              { class: "form" },
              h(
                "div",
                { class: "form-label" },
                m.axis.label,
                h("span", {
                  class: "form-measure",
                  text:
                    m.median === null ? " unmeasurable" : ` ${pct(m.median)}`,
                })
              ),
              h(
                "div",
                { class: "form-options" },
                m.values.map((value) => {
                  const on = state.picked.get(m.axis.id) === value;
                  const reachable = combos.some(
                    (c) =>
                      c.rows.length &&
                      c.values.get(m.axis.id) === value &&
                      cut.kept.every(
                        (other) =>
                          other.axis.id === m.axis.id ||
                          c.values.get(other.axis.id) ===
                            state.picked.get(other.axis.id)
                      )
                  );
                  return h("button", {
                    class: `opt${on ? " opt-on" : ""}${reachable ? "" : " opt-hollow"}`,
                    text: value === "—" ? "unsaid" : value,
                    title: reachable
                      ? undefined
                      : "No USDA row for this choice given the others — the picker offers it anyway.",
                    onclick: () => {
                      state.picked.set(m.axis.id, value);
                      state.redraw();
                    },
                  });
                })
              )
            )
          )
        : h("p", {
            class: "note",
            text: "No axis clears the threshold. The ingredient is one row and the reader chooses nothing.",
          })
    ),
    panel(current?.stands ?? null, current?.rows.length ?? 0, "hollow"),
    cut.decided.length > 0 &&
      h(
        "details",
        { class: "decided" },
        h("summary", {
          text: `Decided for the reader: ${cut.decided.map((m) => m.axis.label.toLowerCase()).join(", ")}`,
        }),
        h(
          "ul",
          {},
          cut.decided.map((m) =>
            h("li", {
              text:
                `${m.axis.label} — ${m.values.length} values, median ${pct(m.median)} across ${m.pairs} matched pairs. ` +
                `Collapsed onto the fullest panel; the reader is never asked.`,
            })
          )
        )
      ),
    h(
      "div",
      { class: `hollow${hollow.share > 0.3 ? " hollow-bad" : ""}` },
      h("b", { text: `${hollow.empty} of ${hollow.offered}` }),
      ` combinations these controls offer have no USDA row behind them (${pct(hollow.share)}).`
    )
  );
}

// ── D — one row per ingredient, its REAL forms nested under it ──────────────

/**
 * The shape the user's decision implies, and the one that answers B and C's
 * hollowness.
 *
 * B and C draw an independent picker per axis, so what they offer is the
 * CROSS-PRODUCT of the axes — and USDA's design is unbalanced, so 42–98 % of
 * that product has no row behind it. D drops the per-axis controls and offers
 * the surviving COMBINATIONS themselves, the empty ones filtered out. Every
 * form the reader can pick is therefore a row USDA actually published, and
 * hollowness is zero by construction rather than by luck.
 *
 * The cost is that the axes stop being separable: the reader reads a list of
 * distinguished forms rather than turning two dials. The dial still governs how
 * long that list is, which is the thing to judge.
 */
function shapeNested(state: State, cut: Cut, combos: Combination[]) {
  const real = combos.filter((c) => c.rows.length);
  const chosen =
    real.find((c) => c.stands?.row.fdcId === state.chosen?.row.fdcId) ?? null;

  return h(
    "section",
    {},
    h("p", {
      class: "lede",
      text:
        `One row per ingredient in the search. Its forms are the combinations USDA actually published — ` +
        `not a control per axis, so nothing on offer is empty. An axis still has to move the calories by ` +
        `${pct(state.threshold)} to distinguish a form at all.`,
    }),
    h("div", {
      class: "ingredient",
      text: state.reading.population.ingredient,
    }),
    h(
      "ul",
      { class: "rows rows-nested" },
      real.length === 1
        ? h("li", {
            class: "row",
            text: "One form. The reader picks nothing and stages the ingredient.",
          })
        : real.map((combo) => {
            const stands = combo.stands;
            const range = lost(combo.rows);
            const said = cut.kept
              .map((m) => combo.values.get(m.axis.id))
              .filter((v) => v && v !== "—");
            return h(
              "li",
              {
                class:
                  `row${chosen === combo ? " row-chosen" : ""}` +
                  `${combo.hole ? " row-hole" : ""}`,
                onclick: () => {
                  if (!stands) return;
                  state.chosen = stands;
                  state.redraw();
                },
              },
              h("span", {
                class: "row-name",
                text: said.length ? said.join(", ") : "plain",
              }),
              h("span", {
                class: "row-kcal",
                text: stands
                  ? `${kcal(stands.row.macros.calories)} kcal`
                  : "no panel",
              }),
              combo.rows.length > 1 &&
                h("span", {
                  class: "row-merged",
                  text: range
                    ? `${combo.rows.length} rows merged, ${range.lo}–${range.hi} kcal thrown away`
                    : `${combo.rows.length} rows merged`,
                })
            );
          })
    ),
    panel(chosen?.stands ?? null, chosen?.rows.length ?? 0, "unpicked"),
    cut.decided.length > 0 &&
      h(
        "details",
        { class: "decided" },
        h("summary", {
          text: `Decided for the reader: ${cut.decided.map((m) => m.axis.label.toLowerCase()).join(", ")}`,
        }),
        h(
          "ul",
          {},
          cut.decided.map((m) =>
            h("li", {
              text:
                `${m.axis.label} — ${m.values.length} values, median ${pct(m.median)} across ${m.pairs} matched pairs. ` +
                `Collapsed onto the fullest panel; the reader is never asked.`,
            })
          )
        )
      ),
    h(
      "div",
      { class: "hollow" },
      h("b", {
        text: `${real.length} ${real.length === 1 ? "form" : "forms"}`,
      }),
      `, every one of them a row USDA published. ${combos.length - real.length} empty ` +
        `${combos.length - real.length === 1 ? "combination was" : "combinations were"} never offered.`
    )
  );
}

// ── E — the adjudicated rule, nested ──────────────────────────────────────

/**
 * The adjudicated cut with its variants NESTED under one row — kept for
 * comparison only. #189 ruled for the flat shape (F); this is what the same cut
 * looks like if a variant were a form picked at staging instead of a row.
 */
function shapeAdjudicated(state: State) {
  const { name, combos, forms } = adjudicate(state.reading);
  const chosenId = state.chosen?.row.fdcId;

  return h(
    "section",
    {},
    h("p", {
      class: "lede",
      text: "The same adjudicated cut as F, nested: one search row, its variants offered as forms at staging. Kept for comparison — #189 ruled for the flat shape.",
    }),
    h("div", { class: "ingredient", text: name }),
    h(
      "ul",
      { class: "rows rows-nested" },
      combos.map((combo) => {
        const stands = combo.stands;
        const range = lost(combo.rows);
        const said = forms
          .map((m) => combo.values.get(m.axis.id))
          .filter((v) => v && v !== "—");
        return h(
          "li",
          {
            class:
              `row${combo.hole ? " row-hole" : ""}` +
              `${stands && chosenId === stands.row.fdcId ? " row-chosen" : ""}`,
            onclick: () => {
              if (!stands) return;
              state.chosen = stands;
              state.redraw();
            },
          },
          h("span", {
            class: "row-name",
            text: said.length ? said.join(", ") : "plain",
          }),
          h("span", {
            class: "row-kcal",
            text: stands
              ? `${kcal(stands.row.macros.calories)} kcal`
              : "no panel",
          }),
          combo.rows.length > 1 &&
            !combo.hole &&
            h("span", {
              class: "row-merged",
              text: range
                ? `${combo.rows.length} rows merged, ${range.lo}–${range.hi} kcal thrown away`
                : `${combo.rows.length} rows merged`,
            })
        );
      })
    ),
    panel(
      state.chosen,
      combos.find((c) => c.stands?.row.fdcId === chosenId)?.rows.length ?? 0,
      "unpicked"
    )
  );
}

// ── F — the adjudicated rule, flat: a variant IS a food ────────────────────

/**
 * The answer to #189's binary, as ruled on 2026-09-11: **variants stay separate
 * rows**.
 *
 * Three dispositions, and only the first two are axis-wide:
 *
 *   form      what the food IS — variety, part, fat content. Distinguishes a row.
 *   collapse  what was DONE to it, or a trade spec. Merged onto the raw form.
 *   drop      per HEAD, never per axis: rows this food does not want at all.
 *
 * "One food per row" and "variants stay separate rows" are one ruling rather
 * than two: a variant IS a food, so it gets its row. There is no forms concept,
 * no picker at staging and no `schema_version` bump.
 */
function shapeFlat(state: State) {
  const { name, combos, forms, collapsed, dropped } = adjudicate(state.reading);
  const chosenId = state.chosen?.row.fdcId;
  const holeCount = combos.filter((c) => c.hole).length;

  return h(
    "section",
    {},
    h("p", {
      class: "lede",
      text:
        "Variants stay separate rows, and a variant is a food. What the food IS distinguishes a row; what was DONE to it collapses onto the raw form; " +
        "and a row this head does not want is dropped outright — per head, never by a rule on the word.",
    }),
    h(
      "div",
      { class: "tally" },
      h(
        "span",
        {},
        h("b", { text: String(state.reading.rows.length) }),
        " USDA rows"
      ),
      h("span", { class: "arrow", text: "→" }),
      h("span", {}, h("b", { text: String(combos.length) }), " shipped rows"),
      dropped.length > 0 &&
        h("span", {
          class: "tally-lost",
          text: `${dropped.length} dropped outright`,
        })
    ),
    h(
      "ul",
      { class: "rows" },
      combos.map((combo) => {
        const stands = combo.stands;
        const range = lost(combo.rows);
        const said = forms
          .map((m) => combo.values.get(m.axis.id))
          .filter((v): v is string => !!v && v !== "—");
        return h(
          "li",
          {
            class:
              `row${combo.hole ? " row-hole" : ""}` +
              `${stands && chosenId === stands.row.fdcId ? " row-chosen" : ""}`,
            onclick: () => {
              if (!stands) return;
              state.chosen = stands;
              state.redraw();
            },
          },
          h("span", {
            class: "row-name",
            text: [name, ...said].join(", "),
          }),
          h("span", {
            class: "row-kcal",
            text: stands
              ? `${kcal(stands.row.macros.calories)} kcal`
              : "no panel",
          }),
          combo.hole
            ? h("span", {
                class: "row-merged",
                text:
                  `Coverage hole: ${combo.rows.length} USDA rows here, every one cooked or carrying a ` +
                  `qualifier the roster could not read (${range ? `${range.lo}–${range.hi} kcal` : "one row"}). ` +
                  `A curated stand-in is owed (ADR-0046).`,
              })
            : combo.rows.length > 1 &&
                h("span", {
                  class: "row-merged",
                  text: range
                    ? `${combo.rows.length} rows merged, ${range.lo}–${range.hi} kcal thrown away`
                    : `${combo.rows.length} rows merged`,
                })
        );
      })
    ),
    panel(
      state.chosen,
      combos.find((c) => c.stands?.row.fdcId === chosenId)?.rows.length ?? 0,
      "unpicked"
    ),
    dropped.length > 0 &&
      h(
        "details",
        { class: "decided" },
        h("summary", {
          text: `${dropped.length} rows dropped outright — no longer loggable`,
        }),
        h(
          "ul",
          {},
          dropped.map((d) =>
            h("li", {
              text: `${kcal(d.row.macros.calories)} kcal · ${shown(d.row.description)}`,
            })
          )
        ),
        h("p", {
          class: "note",
          text:
            "ADR-0055 §1's third amendment, and the first that deletes a food for being a DIFFERENT food rather than a duplicate of a survivor. " +
            "The two earlier amendments each had a survivor to point at; this one does not.",
        })
      ),
    h(
      "div",
      { class: "hollow" },
      h("b", { text: `${combos.length} rows` }),
      `, no forms, no picker, no schema change. ` +
        (holeCount
          ? `${holeCount} ${holeCount === 1 ? "row is a coverage hole" : "rows are coverage holes"}.`
          : "Every row carries a panel.")
    ),
    h(
      "div",
      { class: "strip" },
      h("span", { class: "strip-label", text: "Axis kinds" }),
      h(
        "span",
        { class: "chips" },
        forms.map((m) =>
          h(
            "span",
            { class: "axis axis-kept" },
            h("b", { text: m.axis.label }),
            " distinguishes a row"
          )
        ),
        collapsed.map((m) =>
          h(
            "span",
            { class: "axis axis-decided" },
            h("b", { text: m.axis.label }),
            m.axis.prefer ? ` collapsed to ${m.axis.prefer}` : " collapsed"
          )
        )
      )
    )
  );
}

/** Every USDA row behind the current population, and the roster's debt. */
function corpusList(state: State) {
  return h(
    "details",
    { class: "corpus" },
    h("summary", {
      text: `The ${state.reading.rows.length} USDA rows behind this`,
    }),
    h(
      "ul",
      {},
      state.reading.rows.map((r) =>
        h("li", {
          text: `${kcal(r.row.macros.calories)} kcal · ${shown(r.row.description)}`,
        })
      )
    ),
    state.reading.unclaimed.length > 0 &&
      h("p", {
        class: "note",
        text: `Segments no axis rule claimed, left visible rather than hidden: ${state.reading.unclaimed.join(" · ")}`,
      })
  );
}

// ── the draw ────────────────────────────────────────────────────────────────

export function draw(host: HTMLElement, state: State) {
  const threshold = thresholdFor(state);
  const cut = cutAt(state.reading, threshold);
  const combos = combinations(state.reading, cut);

  // A picked value can stop existing when the cut changes under the slider.
  for (const m of cut.kept)
    if (!m.values.includes(state.picked.get(m.axis.id) ?? ""))
      state.picked.set(
        m.axis.id,
        representative(state.reading.rows)?.values.get(m.axis.id) ?? m.values[0]
      );

  if (state.shape === "e" || state.shape === "f") {
    clear(host).append(
      state.shape === "e" ? shapeAdjudicated(state) : shapeFlat(state),
      corpusList(state)
    );
    return;
  }

  clear(host).append(
    measurementStrip(cut, threshold),
    state.shape === "a"
      ? shapeRows(state, cut)
      : state.shape === "d"
        ? shapeNested(state, cut, combos)
        : pickers(state, cut, combos),
    corpusList(state)
  );
}
