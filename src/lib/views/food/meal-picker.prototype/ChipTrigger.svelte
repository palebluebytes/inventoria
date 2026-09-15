<script lang="ts">
  import type { MealType } from "../../../food/meal-type";

  // THROWAWAY. The tile all three variants are opened from, so that what differs
  // between them is the surface and not the thing you tap. Deliberately shared:
  // the chip is this bar's subject either way — ink ground, paper letters, the
  // one inverted tile on the line — and three copies of it would be three
  // chances for the comparison to be about the trigger instead.
  //
  // The caret is drawn rather than typed, for `ui/Select`'s own reason: `▾` falls
  // outside every unicode-range Epilogue is served in, so a glyph would be
  // whatever fallback the device has. This is #317's population, one more mark.
  let {
    target,
    open,
    onToggle,
  }: {
    target: MealType;
    /** Drawn as pressed while its surface is up, which is the only thing the
     *  three variants' triggers have to say differently. */
    open: boolean;
    onToggle: () => void;
  } = $props();
</script>

<button
  type="button"
  class="chip"
  aria-haspopup="true"
  aria-expanded={open}
  aria-label="Which meal these land in"
  onclick={onToggle}
>
  <span class="chip-word">{target.toUpperCase()}</span>
  <svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 6 L17 12 L7 18 Z" fill="currentColor" />
  </svg>
</button>

<style>
  .chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3xs);
    min-height: var(--tap-min);
    padding: 0 var(--space-2xs);
    background: var(--ink);
    border: 0;
    border-radius: 0;
    color: var(--paper);
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
  }
  .chip-word {
    white-space: nowrap;
  }
  /* Quarter-turned while the surface is up, which is the disclosure reading
     every caret in this app carries. `--turn-mark` is the shared transition. */
  .chip-mark {
    width: 0.8rem;
    height: 0.8rem;
    transform: rotate(90deg);
    transition: var(--turn-mark);
  }
  .chip[aria-expanded="true"] .chip-mark {
    transform: rotate(-90deg);
  }
  .chip:focus-visible {
    outline: 2px solid var(--paper);
    outline-offset: -4px;
  }
</style>
