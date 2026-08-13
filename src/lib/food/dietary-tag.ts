import type { DietaryVerdict } from "./off-signals";

/**
 * The dietary-tags presentation model (ADR-0043 §2) — the pure, table-testable
 * mapping from a {@link DietaryVerdict} to the short-form tags the staged card's
 * tags row draws (vegan / vegetarian / organic), each with a placeholder glyph.
 * The selector (`deriveDietaryVerdict`) has already imposed the canonical order
 * and the `vegan ⟹ suppress vegetarian` rule, so this is a straight lookup: it
 * only attaches a glyph + short form and drops any tag it has no symbol for.
 *
 * PLACEHOLDER GLYPHS. 🌱 / Ⓥ / 🏵️ stand in for the real iconography (the
 * trademarked V-Label / EU-organic marks vs a monochrome custom set), which is
 * settled by standalone research
 * [#100](https://github.com/inkpot-monkey/inventoria/issues/100) — swap these
 * three when it lands; nothing else in the row changes.
 */

/** One dietary tag, ready to render: its `en:` tag, placeholder glyph, and word. */
export interface DietaryTagView {
  /** The canonical `en:` tag (e.g. `en:vegan`) — the identity, not shown. */
  tag: string;
  /** Placeholder symbol glyph (research #100 replaces these). */
  glyph: string;
  /** Human short form, e.g. "Vegan" — the tag's visible text + a11y label. */
  shortForm: string;
}

// Placeholder glyph + short form per recognised dietary tag (ADR-0043 §2). A tag
// with no entry here is silently dropped rather than rendered bare — the selector
// only emits vegan/vegetarian/organic today, so that path is defensive.
const DIETARY_SYMBOLS: Record<string, { glyph: string; shortForm: string }> = {
  "en:vegan": { glyph: "🌱", shortForm: "Vegan" },
  "en:vegetarian": { glyph: "Ⓥ", shortForm: "Vegetarian" },
  "en:organic": { glyph: "🏵️", shortForm: "Organic" },
};

/**
 * Map a {@link DietaryVerdict} to its render-ready tag list (ADR-0043 §2).
 * Absent (or a tag with no known glyph) yields an empty list — the row simply
 * renders no dietary tags and degrades to just the source + NOVA marks. Preserves
 * the selector's canonical order.
 */
export function dietaryTagsView(verdict: DietaryVerdict): DietaryTagView[] {
  if (verdict.state !== "present") return [];
  return verdict.tags.flatMap((tag) => {
    const symbol = DIETARY_SYMBOLS[tag];
    return symbol
      ? [{ tag, glyph: symbol.glyph, shortForm: symbol.shortForm }]
      : [];
  });
}
