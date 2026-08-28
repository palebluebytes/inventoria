<script lang="ts">
  import type { RecipeIngredient } from "../../food/recipe-ingredient";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import CommitButton from "./CommitButton.svelte";
  import RecipeBuilder from "./RecipeBuilder.svelte";

  // Standalone sheet wrapper around {@link RecipeBuilder}, for the flow that opens
  // fresh from the dashboard (Consolidate: build a recipe from selected foods).
  // The log-sheet Recipe tab embeds the same component directly for New / Edit,
  // and the recipe library (RecipeLibrarySheet) does for Create / Edit, so those
  // reuse their own host's header + dock.
  let {
    meal_type,
    selectedDate,
    onClose,
    mode = "consolidate",
    template = null,
    initialIngredients = [],
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
    /** Which verb this surface performs. Default: consolidate. */
    mode?: "consolidate" | "define" | "edit";
    /** The Recipe Twin being amended (edit mode only; getLocalFoodTwin shape). */
    template?: { entity: string; attributes: Record<string, any> } | null;
    /** Foods selected on the dashboard, seeded as ingredients (carry event_id). */
    initialIngredients?: RecipeIngredient[];
  } = $props();

  let heading = $derived(
    mode === "edit"
      ? "Edit recipe"
      : mode === "define"
        ? "New recipe"
        : "Build recipe"
  );

  // The builder's commit is driven from the sheet's docked button.
  let requestSave = $state<(() => void) | undefined>(undefined);
  let saveReady = $state(false);
  let saveLabel = $state("Log");
</script>

<BottomSheet isOpen title={heading} {onClose}>
  <RecipeBuilder
    {meal_type}
    {selectedDate}
    {mode}
    {template}
    {initialIngredients}
    onCommitted={onClose}
    bind:requestSave
    bind:saveReady
    bind:saveLabel
  />

  {#snippet footer()}
    <CommitButton
      id="save-recipe-btn"
      disabled={!saveReady}
      onclick={() => requestSave?.()}
    >
      {saveLabel}
    </CommitButton>
  {/snippet}
</BottomSheet>
