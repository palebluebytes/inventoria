<script lang="ts">
  import {
    ESTIMATED_MARK,
    ESTIMATED_MEANING,
  } from "../../food/nutrient-display";

  // The `est` mark (ADR-0113 §5): the one word that tells a figure a **Pack
  // pairing**'s reference food supplied from one the manufacturer printed, and
  // the sole carrier of provenance on a panel.
  //
  // It is one component rather than two copies because a Marked panel is ONE
  // list split two ways — the grid holds what the user tracks and the disclosure
  // the rest — so the two halves may not come to draw the mark differently. The
  // word is already held in one place for that reason; this is the rest of it,
  // the glyph's own measurements included.
  //
  // It lives here and not in `src/lib/ui/` deliberately. ADR-0100 asks what
  // earns a member of the interface vocabulary, and this does not: it means one
  // thing about one kind of figure on one kind of panel, and a primitive that
  // can only ever be used by food is a food component wearing a general name.
  //
  // The lighter weight is the mark's other half and is NOT here: it belongs to
  // the figure, not to the word beside it, so each surface sets it on its own
  // value element (`dd.est`, `strong.est`).
  //
  // What IS here is that the word never outweighs the figure. Drawn bold, a
  // small uppercase `est` beside a 400-weight number becomes the heaviest thing
  // on the line, which is the at-a-glance provenance cue ADR-0041's amendment
  // removed and §5 re-applies rather than revives. It is small, quiet and
  // secondary; the figure is still what the row is for.
</script>

<span class="est-mark" data-testid="est-mark" title={ESTIMATED_MEANING}
  >{ESTIMATED_MARK}</span
>

<style>
  .est-mark {
    margin-left: var(--space-3xs);
    font-size: 0.75em;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
  }
</style>
