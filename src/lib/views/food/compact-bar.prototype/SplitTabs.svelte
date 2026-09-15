<script lang="ts">
  import { MEAL_TYPES, type MealType } from "../../../food/meal-type";

  // THROWAWAY — variant C's first half: the meal strip, which does NOT live in
  // the bar.
  //
  // C's claim is that the shipped bar is tall because it answers two questions
  // in one box, and that the two belong at opposite ends of the screen: WHICH
  // MEAL is a fact about the day you are reading, so it rides at the head of
  // the day where the date and the week strip already are; WHICH DOOR is a
  // thing you do with your thumb, so it stays pinned at the band's edge. Split
  // that way, the pinned bar is one 48px row — the same 50px total as B — and
  // the meal keeps all four of its one-tap targets, which is what B sold.
  //
  // What it spends instead is the EYE: the target and the doors are as far
  // apart as the screen allows, so confirming where a tap lands means looking
  // away from your thumb. Sticky is what makes that survivable — the strip
  // never leaves — and sticky is also the variant's second bill, because it is
  // a second permanently-occupied band on a screen that already has a week
  // strip.
  //
  // Not `bits-ui Tabs` here: split in two, the strip has no panel under it to
  // claim, so a tab list would be exactly the costume ADR-0101 was careful not
  // to wear. It is a radio group in look and a set of buttons in fact; folding
  // C in means `ui/Segmented` (RadioGroup), whose sentence — "pick one of four
  // values, and it persists" — is the true one once the doors are elsewhere.
  let {
    target,
    onTarget,
    place,
  }: {
    target: MealType;
    onTarget: (m: MealType) => void;
    /** Where this copy is mounted: the day's head on a phone, the column above
     *  the doors on a desktop. Two mounts of one component, which is the cheap
     *  way to put a strip in two places and would be a single one if this
     *  shipped. */
    place: "head" | "column";
  } = $props();
</script>

<div class="strip {place}" role="group" aria-label="Which meal these land in">
  {#each MEAL_TYPES as meal_type (meal_type)}
    <button
      type="button"
      class="strip-tab"
      aria-pressed={meal_type === target}
      onclick={() => onTarget(meal_type)}>{meal_type.toUpperCase()}</button
    >
  {/each}
</div>

<style>
  .strip {
    /* `--edge`'s weight as a bare length, for the seams. The palette already
       has `--hairline` — 1px, `--edge-thin`'s weight, and `app.css` names this
       exact technique in its docblock ("a grid whose `gap` shows its own
       background through as a rule") — but no counterpart for `--edge`'s 2px,
       because nothing has drawn the HEAVY rule as a gap before. The seams here
       have to match the 2px every other edge on this screen wears, so the
       weight is derived from the token that exists rather than typed as a
       number. **Folding any variant in owes `app.css` that token.** */
    --rule: calc(var(--hairline) * 2);
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--rule);
    padding: var(--rule);
    background: var(--ink);
  }
  /* The head copy sticks under the shell's own top padding. A scroll
     container's START padding sits inside its scrollport, so `top: 0` would
     come to rest `--space-m` down the page and leave a strip of day showing
     above it; the offset restates the shell's token rather than measuring the
     gap (the same trick `.way-in-slot` plays at `--space-l` above 768). */
  .strip.head {
    position: sticky;
    top: calc(-1 * var(--space-m));
    z-index: 30;
    margin-bottom: var(--space-s);
  }
  .strip.column {
    display: none;
  }
  @media (min-width: 768px) {
    .strip.head {
      display: none;
    }
    .strip.column {
      display: grid;
      margin-bottom: var(--rule);
    }
  }

  .strip-tab {
    min-height: var(--tap-min);
    padding-inline: var(--space-3xs);
    background: var(--paper);
    border: 0;
    border-radius: 0;
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .strip-tab[aria-pressed="true"] {
    background: var(--ink);
    color: var(--paper);
  }
  .strip-tab:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -4px;
  }
</style>
