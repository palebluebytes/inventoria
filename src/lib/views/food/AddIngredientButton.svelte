<script lang="ts">
  // The one way an ingredient is added to a list of them: a dashed box the width
  // of the list, under the last row.
  //
  // It was the recipe builder's alone (`IngredientListEditor`'s `.add`) until the
  // Occasion fold needed the same act on the day (#462). The fold spelled it as a
  // plain text control at first, which made "add an ingredient" two affordances
  // wearing two shapes — and the shape is what the surfaces have in common, since
  // both are a list of ingredients with one act underneath.
  //
  // **The box declares the tap floor rather than reaching it on padding.** The
  // builder's cleared `--tap-min` by arithmetic alone, which is what
  // `tap-floor.test.ts` calls `drawn`: correct today, and correct only until
  // somebody edits the padding. One box declaring it is the whole point of there
  // being one box (ADR-0093, widened by ADR-0098).
  let {
    id,
    disabled = false,
    onclick,
  }: {
    /** `#add-ingredient-btn` is a shipped DOM contract: four e2e flows open the
     *  add sheet through it. It rides the caller so two of these on one screen
     *  never share an id. */
    id?: string;
    disabled?: boolean;
    onclick: () => void;
  } = $props();
</script>

<button type="button" class="add" {id} {disabled} {onclick}
  >+ Add ingredient</button
>

<style>
  .add {
    width: 100%;
    /* Its own clearance from the row above, which is the same relationship on
       both surfaces: a list of ingredients, then the act that extends it. */
    margin-top: var(--space-2xs);
    min-height: var(--tap-min);
    border: 2px dashed var(--ink);
    background: var(--paper);
    padding: var(--space-s);
    font: inherit;
    font-weight: 700;
    color: inherit;
    cursor: pointer;
  }
  .add:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
