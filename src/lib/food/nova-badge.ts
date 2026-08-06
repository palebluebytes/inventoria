import type { NovaVerdict } from "./nova-verdict";

/**
 * The presentation model for the NOVA processing badge (ADR-0041 §1, §2) — the
 * pure, table-testable mapping from a {@link NovaVerdict} to what the badge draws.
 * The Svelte badge (`NovaBadge.svelte`) is a thin skin over this: it renders the
 * word, the tier pip and the tone class this returns, so the vocabulary lives in
 * one tested place rather than in markup.
 */

/**
 * The colour-weight bucket a badge wears (ADR-0041 §1). Backgrounds only, per the
 * ADR-0003 palette amendment: `unprocessed`/`ingredient` are lime/pale-lime,
 * `processed` amber, `ultra` the lone red caution, `not-rated` a quiet greyed
 * chip. Only `ultra` reads as caution — the badge informs, it does not scold.
 */
export type NovaTone =
  | "unprocessed"
  | "ingredient"
  | "processed"
  | "ultra"
  | "not-rated";

/**
 * What the badge draws for a verdict. `tier` is the numeral (null when unrated);
 * `tone` selects the colour weight. The badge itself renders the word only, but
 * the tier/tone remain part of the model for the explainer's hero + scale.
 */
export interface NovaBadgeView {
  word: string;
  tier: 1 | 2 | 3 | 4 | null;
  tone: NovaTone;
}

// The word + tone for each OFF tier (ADR-0041 §1). NOVA 2 is "Ingredient" (the
// group is culinary oils/salt/sugar — a pantry staple), not "processed".
const TIERS: Record<1 | 2 | 3 | 4, { word: string; tone: NovaTone }> = {
  1: { word: "Unprocessed", tone: "unprocessed" },
  2: { word: "Ingredient", tone: "ingredient" },
  3: { word: "Processed", tone: "processed" },
  4: { word: "Ultra-processed", tone: "ultra" },
};

/**
 * Map a {@link NovaVerdict} to its badge presentation (ADR-0041 §1, §2). A rated
 * OFF verdict yields its word + tone + tier; everything unrated collapses to the
 * neutral, greyed "not rated" chip — never a warning (ADR-0041 §2), always
 * present so absence is legible rather than blank.
 */
export function novaBadgeView(verdict: NovaVerdict): NovaBadgeView {
  if (verdict.state === "not-rated") {
    return {
      word: "not rated",
      tier: null,
      tone: "not-rated",
    };
  }
  const { word, tone } = TIERS[verdict.tier];
  return {
    word,
    tier: verdict.tier,
    tone,
  };
}
