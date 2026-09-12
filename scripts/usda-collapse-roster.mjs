#!/usr/bin/env node
/**
 * The `Beef` pilot's roster of ADR-0100 §2 collapsing axes, and the residual
 * description it computes — shared by `usda-beef-pilot.mjs`, which produced it,
 * and `usda-filter-census.mjs`, which asks what it would have absorbed.
 *
 * **This is the PILOT's roster and not the shipped one.** ADR-0100 §9 puts the
 * shipped roster in a module under `src/lib/food/`, reached by the generator
 * through the esbuild seam so that no second copy of the answer exists; no such
 * module is written yet, because the record states the rule and deliberately
 * delivers no corpus. Living in `scripts/` is what keeps that true: a roster
 * here cannot become the generator's answer by accident.
 *
 * It is a module rather than a copy in each script for the ordinary reason — two
 * transcriptions of a roster drift, and this map has already watched a count
 * restated in three files drift (#162).
 */

/**
 * ADR-0100 §2's collapsing axes, as patterns over a whole comma-segment (§10).
 *
 * `preferred` is §5's second bullet made explicit: a record stating a
 * non-preferred value may not represent a group. The pilot's ruling is that
 * `preparation` and `separation` carry one — cooked beef is not the beef you
 * bought, and `separable lean only` is a dissected fraction rather than the
 * steak — while `trim` and `grade` carry none, because §2 collapsed those
 * precisely on the ground that they are the same food, and refusing them
 * re-imports the distinction the collapse just erased.
 */
export const ROSTER = [
  // preparation — what you did to it after you bought it
  { axis: "preparation", re: /^raw$/i, preferred: true },
  { axis: "preparation", re: /^raw or unheated$/i, preferred: true },
  {
    axis: "preparation",
    re: /^raw \(includes foods for usda's food distribution program\)$/i,
    preferred: true,
  },
  {
    axis: "preparation",
    re: /^(cooked|grilled|braised|roasted|broiled|pan-broiled|pan-browned|pan-fried|fried|fast fried|fast roasted|slow roasted|baked|simmered|boiled|stewed|microwaved|patty cooked)$/i,
    preferred: false,
  },
  // separation — the butcher's knife, not the counter
  {
    axis: "separation",
    re: /^(boneless )?separable lean and fat$/i,
    preferred: true,
  },
  {
    axis: "separation",
    re: /^((boneless )?separable lean only|lean only|separable fat)$/i,
    preferred: false,
  },
  // trim — a trade specification, and no value of it refuses
  { axis: "trim", re: /^trimmed to (0|1\/8|1\/4)" ?fat$/i, preferred: true },
  // grade — likewise. `Grade A` is a different sense and is not matched:
  // ADR-0100 §10's standing warning about `Eggs, Grade A, Large, egg white`.
  { axis: "grade", re: /^(usda )?(choice|select|prime)$/i, preferred: true },
  { axis: "grade", re: /^aust\. marble score /i, preferred: true },
];

export const claim = (segment) =>
  ROSTER.find((entry) => entry.re.test(segment)) ?? null;

export const segments = (description) => {
  const parts = description.split(",").map((part) => part.trim());
  return { head: parts[0], tail: parts.slice(1) };
};

/**
 * §3's residual description, with the pilot's normalisation clause applied:
 * punctuation and whitespace only. `Beef, round, top round, steak` and
 * `Beef, round, top round steak` are one food and USDA spells it both ways; the
 * key ignores the comma, and ignores nothing that carries meaning.
 */
export const residual = (description) => {
  const { head, tail } = segments(description);
  return [head, ...tail.filter((segment) => !claim(segment))].join(", ");
};

export const groupingKey = (description) =>
  residual(description)
    .toLowerCase()
    .replace(/[,\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
