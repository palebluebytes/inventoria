import type { NovaVerdict } from "./nova-verdict";
import { novaBadgeView, type NovaTone } from "./nova-badge";

/**
 * The presentation model for the NOVA explainer sheet (ADR-0041 §6, ticket C/#92)
 * — the pure, table-testable mapping from a {@link NovaVerdict} to the three faces
 * the house `BottomSheet` draws. The Svelte sheet (`NovaExplainerSheet.svelte`) is
 * a thin skin over this: the face selection, the tier/word/tone, the four-group
 * scale, and — the load-bearing part — the SHAPING and graceful DEGRADATION of the
 * per-product OFF evidence all live here, tested in one place rather than in markup.
 */

/** One row of the static four-group NOVA scale shown on the rated + inferred faces. */
export interface NovaScaleRow {
  tier: 1 | 2 | 3 | 4;
  word: string;
  tone: NovaTone;
  blurb: string;
}

/**
 * The four NOVA groups, in order — the explainer's reference scale (ADR-0041 §1,
 * §6). NOVA is a public academic classification, not OFF data, so the scale itself
 * carries no OFF attribution; only the per-product OFF verdict + evidence does.
 */
export const NOVA_SCALE: readonly NovaScaleRow[] = [
  {
    tier: 1,
    word: "Unprocessed",
    tone: "unprocessed",
    blurb:
      "Whole or minimally processed — fruit, veg, grains, eggs, plain milk.",
  },
  {
    tier: 2,
    word: "Ingredient",
    tone: "ingredient",
    blurb:
      "Culinary ingredients — oils, butter, sugar, salt used to cook and season.",
  },
  {
    tier: 3,
    word: "Processed",
    tone: "processed",
    blurb:
      "Processed foods — group 1 preserved with group 2: tinned veg, cheeses, fresh bread.",
  },
  {
    tier: 4,
    word: "Ultra-processed",
    tone: "ultra",
    blurb:
      "Ultra-processed — industrial formulations with additives you wouldn't cook with.",
  },
];

/**
 * The OFF evidence behind a rated verdict, shaped for display (ADR-0041 §6, §7).
 * `additives` are the E-numbers OFF flagged (formatted from `additives_tags`);
 * `debug` is the `nova_group_debug` marker trail. `present` is false only when
 * BOTH are absent — a food captured before the #90 mapper widening — so the sheet
 * can thin the evidence section rather than show an empty heading. A rated verdict
 * NEVER depends on either: the tier still heads the face regardless.
 */
export interface NovaEvidenceView {
  additives: string[];
  debug?: string;
  present: boolean;
}

/**
 * What the explainer draws, keyed off the verdict's face (ADR-0041 §6):
 *
 * - **rated** — an OFF-authoritative tier 1–4: the hero tier, the four-group
 *   scale, this product's evidence, and (in the skin) visible ODbL attribution.
 * - **inferred** — the NOVA-1 `·est` estimate (ticket D/#93): our own call for a
 *   basic whole food, not OFF's; no OFF evidence, no OFF attribution.
 * - **not-rated** — the neutral coverage face; no tier, no OFF data.
 */
export type NovaExplainerView =
  | {
      face: "rated";
      tier: 1 | 2 | 3 | 4;
      word: string;
      tone: NovaTone;
      scale: readonly NovaScaleRow[];
      evidence: NovaEvidenceView;
    }
  | {
      face: "inferred";
      tier: 1;
      word: string;
      tone: NovaTone;
      scale: readonly NovaScaleRow[];
    }
  | { face: "not-rated" };

/**
 * Format an OFF `additives_tags` entry (e.g. `"en:e330"`) into a display E-number
 * (`"E330"`): drop the language prefix (`xx:`), uppercase the rest. A tag with no
 * prefix passes through uppercased.
 */
export function formatAdditive(tag: string): string {
  const bare = tag.includes(":") ? tag.slice(tag.lastIndexOf(":") + 1) : tag;
  return bare.toUpperCase();
}

/**
 * Map a {@link NovaVerdict} to its explainer presentation (ADR-0041 §6). Reuses
 * `novaBadgeView` for the word + tone so the sheet's hero matches the badge that
 * opened it. The rated face gathers and shapes its OFF evidence; the `present`
 * flag lets the skin degrade gracefully for pre-#90 foods (ADR-0041 §7).
 */
export function novaExplainerView(verdict: NovaVerdict): NovaExplainerView {
  if (verdict.state === "not-rated") return { face: "not-rated" };

  const { word, tone } = novaBadgeView(verdict);

  if (verdict.source === "inferred") {
    return { face: "inferred", tier: 1, word, tone, scale: NOVA_SCALE };
  }

  const additives = (verdict.evidence.additives ?? []).map(formatAdditive);
  const debug = verdict.evidence.debug;
  return {
    face: "rated",
    tier: verdict.tier,
    word,
    tone,
    scale: NOVA_SCALE,
    evidence: {
      additives,
      debug,
      present: additives.length > 0 || debug != null,
    },
  };
}
