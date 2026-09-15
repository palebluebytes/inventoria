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
    onLogged,
    template = null,
    edit = null,
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
    /** What the editor logged, so the day can reveal it (#440). This sheet does
     *  both jobs — a fresh instantiation and a correction — and the editor
     *  reports only the first, so nothing here has to tell them apart. */
    onLogged?: (ids: string[]) => void;
    /** A Recipe Twin (getLocalFoodTwin shape) to instantiate. */
    template?: { entity: string; attributes: Record<string, any> } | null;
    /** A past Recipe Instantiation event to correct. */
    edit?: ConsumptionEvent | null;
  } = $props();

  // The editor's commit is driven from the sheet's docked button.
  let requestSave = $state<(() => void) | undefined>(undefined);
  let saveReady = $state(false);
</script>

<!-- The header names the thing, not the verb: correcting a logged recipe is
     still just its recipe on screen, and "Correct" read as an instruction. -->
<BottomSheet isOpen title={edit ? "Recipe" : "Log recipe"} {onClose}>
  <RecipeInstantiator
    {meal_type}
    {selectedDate}
    {template}
    {edit}
    onCommitted={(logged) => {
      if (logged?.length) onLogged?.(logged);
      onClose();
    }}
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
