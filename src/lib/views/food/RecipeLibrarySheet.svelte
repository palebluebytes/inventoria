<script lang="ts">
  import { getLocalFoodTwin } from "../../stores/calorie.store";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import CommitButton from "./CommitButton.svelte";
  import RecipeBuilder from "./RecipeBuilder.svelte";
  import RecipeHistory from "./RecipeHistory.svelte";
  import RecipeList from "./RecipeList.svelte";
  import ImpromptuRecipeList from "./ImpromptuRecipeList.svelte";
  import { isImpromptuTwin } from "../../food/recipe-ingredient";
  import type { MealType } from "../../food/meal-type";

  // The food screen's recipe library, opened from the header's recipe button.
  //
  // It is the log sheet's Recipe tab with a different verb. There, a browser sits
  // inside a meal, so picking a recipe means logging one. Here there is no meal:
  // picking opens the recipe to read and amend, and the new-recipe action writes
  // a template and nothing else (ADR-0022's `create`). Nothing on this surface
  // can put food on a day, which is the whole reason it exists apart from the
  // meal headers.
  //
  // `edit` is what "review" is made of: it seeds the builder from the template's
  // current ingredients and saves back to the same twin, logging nothing, so
  // opening a recipe to look at it and opening it to change it are one screen.
  //
  // Since ADR-0110 the screen browses two lists, not one: the library — the
  // twins you named — and below it the impromptu dishes you assembled and did
  // not (§6). Both pick into the same `openRecipe`, because both open the same
  // twin on the same screen (§7), which is why the second list is one prop and
  // not a second path.
  let {
    selectedDate,
    onClose,
    inline = false,
  }: {
    selectedDate: Date;
    onClose: () => void;
    inline?: boolean;
  } = $props();

  type RecipeTwin = { entity: string; attributes: Record<string, any> };
  type View =
    | { kind: "list" }
    | { kind: "build"; mode: "create" | "edit"; template: RecipeTwin | null };
  let view = $state<View>({ kind: "list" });

  // The builder takes a meal and a date because two of its four verbs log. The
  // two reachable here do not, so this is inert — passed to satisfy the shape,
  // never read down a path this sheet can take.
  const INERT_MEAL: MealType = "dinner";

  async function openRecipe(entity: string) {
    const twin = await getLocalFoodTwin(entity);
    if (twin) view = { kind: "build", mode: "edit", template: twin };
  }
  function newRecipe() {
    view = { kind: "build", mode: "create", template: null };
  }
  function backToList() {
    view = { kind: "list" };
  }

  // An Impromptu Recipe is not an unfinished recipe, so the screen it opens onto
  // does not say "Edit": there is nothing to edit but its name, and the heading
  // says what you are looking at instead (ADR-0110 §1, §7).
  let impromptu = $derived(
    view.kind === "build" &&
      view.mode === "edit" &&
      isImpromptuTwin(view.template)
  );

  let heading = $derived(
    view.kind === "list"
      ? "Recipes"
      : view.mode === "create"
        ? "New recipe"
        : impromptu
          ? "Impromptu recipe"
          : "Edit recipe"
  );

  // The builder's commit is driven from the sheet's docked button.
  let requestSave = $state<(() => void) | undefined>(undefined);
  let saveReady = $state(false);
  let saveLabel = $state("Save recipe");
</script>

<BottomSheet
  isOpen
  title={heading}
  class="recipe-library"
  {onClose}
  onBack={view.kind === "list" ? undefined : backToList}
  backLabel="Back to recipes"
  {inline}
>
  {#if view.kind === "build"}
    <RecipeBuilder
      meal_type={INERT_MEAL}
      {selectedDate}
      mode={view.mode}
      template={view.template}
      onCommitted={backToList}
      bind:requestSave
      bind:saveReady
      bind:saveLabel
    />
    {#if view.mode === "edit" && view.template}
      <!-- Every day this twin was made (ADR-0110 §7). It sits beside the
           builder rather than inside it because the builder edits a template
           and this reads events — and because the twin is the only thing the
           two have in common. Both kinds get it: the history is the same fact
           whether or not the dish has a name. -->
      <RecipeHistory entity={view.template.entity} />
    {/if}
  {:else}
    <RecipeList
      onPick={openRecipe}
      emptyHint="No saved recipes yet. Create one with the button below, or build one by selecting logged foods on the dashboard."
    />
    <ImpromptuRecipeList onPick={openRecipe} />
  {/if}

  {#snippet footer()}
    {#if view.kind === "list"}
      <CommitButton id="library-new-recipe-btn" onclick={newRecipe}
        >＋ New recipe</CommitButton
      >
    {:else}
      <CommitButton
        id="library-save-recipe-btn"
        disabled={!saveReady}
        onclick={() => requestSave?.()}
      >
        {saveLabel}
      </CommitButton>
    {/if}
  {/snippet}
</BottomSheet>
