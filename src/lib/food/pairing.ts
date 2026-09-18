// ---------------------------------------------------------------------------
// The pairing act: what a pack's twin holds, and what refuses it (ADR-0113)
// ---------------------------------------------------------------------------
//
// A **Pack pairing** is one person's assertion that a named USDA reference food
// describes the substance in their jar well enough to stand in for what the
// label left silent (§1). The Open Food Facts product stays the food. The
// reference food is shown beside it, named, with its own source tag, and the
// two are never merged into one record.
//
// This module is the attribute half of that. It holds:
//
//  - where the assertion lives (`food/pairing`, on the `gtin:` twin),
//  - how it is read back and how it is cleared (§7),
//  - which twins refuse the act at all (§15),
//
// and it stops there. What a pairing FILLS is not here and is not a property of
// this attribute: the datom carries no field list and no name, because which
// reference food you chose is the whole of your assertion, and what it fills is
// computed at read time from whichever panel rows are silent now (§7).
//
// **It is a property of a capture, not of the corpus** (§3). Two people can be
// right about one barcode — drained against in-brine, this year's recipe against
// last year's — so nothing here holds a fact of the form *barcode X is food Y*,
// and the twin's own datom is the whole of the same-barcode cache.
// ---------------------------------------------------------------------------

import { mintEntity } from "../facets/entity-id";
import type { SearchCorpus } from "./usda-corpus";

/** Where a pack's Pack pairing lives on its twin. */
export const FOOD_PAIRING_ATTR = "food/pairing";

/**
 * What clears a pairing: an empty string, appended like any other assertion
 * (§7).
 *
 * Clearing is not a deletion and could not be one — the ledger is append-only,
 * and the superseded datom stays in it. What makes the pack unpaired is that a
 * later datom wins and names nobody.
 */
export const PAIRING_CLEARED = "";

/** Why a twin may not be paired (§15). */
export type PairingRefusalReason =
  | "recipe"
  | "reference"
  | "hand-entered"
  | "not-a-pack";

/**
 * A refusal, and why this food is one.
 *
 * The reason rides as a sentence rather than as a code alone because a screen
 * does not say it: the affordance is simply absent, the way every present-only
 * mark on a food card is. It is what a caller that tries anyway is told, and it
 * is the one place §15's three arguments are written next to the predicate that
 * enforces them, so neither can move without the other being read.
 */
export interface PairingRefusal {
  reason: PairingRefusalReason;
  /** Why this food refuses, in the ADR's own terms. */
  because: string;
}

/**
 * The three twins §15 names, keyed by the prefix that identifies each, plus the
 * catch-all below them.
 *
 * Written as a table over prefixes rather than three `if`s so the last test in
 * `pack-pairing.test.ts` can close it over the Food domain's own prefix list: a food
 * prefix coined later arrives refused and named, rather than falling through
 * into the affordance because nobody remembered to add a branch.
 */
const REFUSALS: readonly { prefix: string; refusal: PairingRefusal }[] = [
  {
    prefix: "recipe:",
    refusal: {
      reason: "recipe",
      // 0 of the ledger's 239 `nutrition/info` panels sit on a recipe twin,
      // because `recipe/ingredients` is pure references and the nutrition
      // derives. There is no silence for a pairing to fill.
      because:
        "a recipe's nutrition derives from its ingredients, so there is no silence to fill",
    },
  },
  {
    prefix: "fdc:",
    refusal: {
      reason: "reference",
      because:
        "a reference food is the authority a pack is paired with, and the relationship has no second end",
    },
  },
  {
    prefix: "food:custom_",
    refusal: {
      reason: "hand-entered",
      // The ledger's most silent food — 22 hand-entered panels carrying 2 or 9
      // keys of a possible 24, every one silent on all twelve micronutrients —
      // so pairing would fill MORE meters than a pack does. Refused because
      // §4's partition does not transfer: that rule is built on what a label
      // could have carried, and a hand-entered silence is you not typing rather
      // than a manufacturer not declaring.
      because:
        "a hand-entered silence is the user not typing rather than a manufacturer not declaring, so §4's partition does not transfer",
    },
  },
];

/** The catch-all, so nothing reaches the act by having no prefix anyone knows. */
const NOT_A_PACK: PairingRefusal = {
  reason: "not-a-pack",
  because: "a pairing annotates a packaged food, and this is not one",
};

/**
 * Why this twin may not be paired, or `null` where the act is offered.
 *
 * The predicate is `gtin:` and the rest is a refusal, which is §1 read as a
 * test rather than as a sentence: a pairing annotates a **packaged food**, and
 * a twin that is not one has no pack for the assertion to be about.
 */
export function pairingRefusalOf(entity: string): PairingRefusal | null {
  if (entity.startsWith("gtin:")) return null;
  return (
    REFUSALS.find(({ prefix }) => entity.startsWith(prefix))?.refusal ??
    NOT_A_PACK
  );
}

/**
 * True for a bare live `fdc:` id — the whole of what `food/pairing` may hold
 * (§7).
 *
 * The digits are checked as well as the prefix, because the id is written into
 * the ledger and read back by a corpus lookup: `fdc:` with nothing after it
 * would be an assertion that names nobody, which is what {@link PAIRING_CLEARED}
 * already says unambiguously.
 */
export function isReferenceFoodEntity(entity: string): boolean {
  return /^fdc:\d+$/.test(entity);
}

/**
 * The reference food this twin is paired with, or `undefined` where it is
 * paired with nobody.
 *
 * Guarded once, here, rather than trusted: this value crosses the ledger as
 * JSON and can arrive from an older build, a hand-edited import or one of your
 * own devices. A malformed one reads as *no pairing*, which is the standing
 * state every pack is already in and never a wrong reference food — the
 * discipline `readFoodDensity` keeps for the same reason (ADR-0108 §6).
 */
export function readFoodPairing(
  attributes: Record<string, unknown> | undefined
): string | undefined {
  const raw = attributes?.[FOOD_PAIRING_ATTR];
  if (typeof raw !== "string") return undefined;
  return isReferenceFoodEntity(raw) ? raw : undefined;
}

/**
 * The paired row's own description, or `undefined` where this corpus does not
 * carry it.
 *
 * **The description is the whole of what makes a pairing checkable** (§9). #247
 * measured why: handed the whole corpus, a model emitted six ids that are real
 * rows naming a different food while its own stated reason named the food
 * correctly, so validating an id against the corpus catches one error in seven.
 * A surface that shows the id, or a reason, and not the row's own words launders
 * the other six — which is why the name is read out of the corpus here rather
 * than copied onto the twin beside the id.
 *
 * Nobody is named where the row is gone, and that is §7 rather than a failure:
 * a pairing keeps standing when the name has left the corpus, so an unresolvable
 * id is an unnamed pairing and never an absent one.
 */
export function referenceFoodName(
  corpus: SearchCorpus,
  reference: string
): string | undefined {
  if (!isReferenceFoodEntity(reference)) return undefined;
  return corpus.foods.find(
    (food) => mintEntity("fdc:", food.row.fdcId) === reference
  )?.row.description;
}
