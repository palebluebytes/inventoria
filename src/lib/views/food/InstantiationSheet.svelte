<script lang="ts">
  import type { ConsumptionEvent } from "../../stores/calorie.store";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import CommitButton from "./CommitButton.svelte";
  import RecipeInstantiator from "./RecipeInstantiator.svelte";

  // Standalone sheet wrapper around {@link RecipeInstantiator}, for the flows that
  // open fresh from the dashboard (correcting a past instantiation). The log-sheet
  // Recipe tab embeds the same component directly instead, so the instantiate flow
  // reuses the log sheet's own header + dock (LogFoodSheet).
  let {
    meal_type,
    selectedDate,
    onClose,
    template = null,
    edit = null,
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
    /** A Recipe Twin (getLocalFoodTwin shape) to instantiate. */
    template?: { entity: string; attributes: Record<string, any> } | null;
    /** A past Recipe Instantiation event to correct. */
    edit?: ConsumptionEvent | null;
  } = $props();

  // The editor's commit is driven from the sheet's docked button.
  let requestSave = $state<(() => void) | undefined>(undefined);
  let saveReady = $state(false);
</script>

<BottomSheet isOpen title={edit ? "Correct" : "Log recipe"} {onClose}>
  <RecipeInstantiator
    {meal_type}
    {selectedDate}
    {template}
    {edit}
    onCommitted={onClose}
    bind:requestSave
    bind:saveReady
  />

  {#snippet footer()}
    <CommitButton
      id="save-instantiation-btn"
      disabled={!saveReady}
      onclick={() => requestSave?.()}
    >
      Log
    </CommitButton>
  {/snippet}
</BottomSheet>
