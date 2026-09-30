<script lang="ts">
  import { onMount } from "svelte";
  import { getLocalFoodTwin } from "../../stores/calorie.store";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import CommitButton from "./CommitButton.svelte";
  import RecipeBuilder from "./RecipeBuilder.svelte";
  import RecipeHistory from "./RecipeHistory.svelte";
  import RecipeList from "./RecipeList.svelte";
  import ImpromptuRecipeList from "./ImpromptuRecipeList.svelte";
  import { isImpromptuTwin } from "../../food/recipe-ingredient";
  import { warmUsdaCorpus } from "../../food/usda-corpus";
  import type { MealType } from "../../food/meal-type";

  // The Recipes face's screen (ADR-0114 §4).
  //
  // **It takes no props at all, and that is the whole of what #536 changed here.**
  // It was the food screen's recipe library, opened from a pot in that screen's
  // header and shown as a page above the shell breakpoint or a sheet below it,
  // *and* the Recipes face on the root at the same time — one surface with two
  // controls, which ADR-0091 §1 allows an action one of. The face is what survived,
  // so both shells now mount this the same way and the three props it used to take
  // are gone with the page:
  //
  // - `inline` was the page/sheet switch (#341). A face is a screen at every
  //   width, so the surface is inline always — which is what takes the ✕ and the
  //   Back stop off it (`BottomSheet`): a page is left by going somewhere else.
  //   What that costs is the phone shape: the library used to be a sheet over the
  //   day down there and is a screen you switch to now, the same trade the other
  //   four faces already made.
  // - `onClose` had nothing left to call it once nothing here can close.
  // - `selectedDate` was the day the food screen was on, and it was **already**
  //   inert: the root handed a fresh `new Date()` and said so. It is `INERT_DATE`
  //   below now, beside the meal it already kept there, so the shape `RecipeBuilder`
  //   demands is satisfied in one place instead of being threaded through two
  //   shells that both had nothing honest to put in it.
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

  // **The second face that can search food, and §13 only counted the first.**
  //
  // ADR-0114 §13 warms the Search index "on entering the Rations face", which is
  // `FoodView`'s `onMount` — but on the root, Recipes is a face of its own (§4)
  // and mounts this surface with no food screen anywhere near it. Building or
  // amending a recipe reaches `AddIngredientSheet`, which is `FoodStager`, which
  // searches the corpus: so a reader who went straight to Recipes would have hit
  // a ~800 KB fetch inside their first ingredient search. (~800, not the ~960 the
  // ticket said: #535 measured the index at 812,093 B and found §13's own figure
  // stale — do not quote either number from memory.)
  //
  // Since #536 that is **both** shells: the food screen is unmounted while this
  // face is up on Rations too, so there is no longer any width at which reaching
  // the library also mounted the screen that warms the index. The general rule is
  // the one on the function — a face that can search food warms what it searches —
  // and a second call costs nothing, because the loads are memoised on success and
  // a failure is deliberately forgotten so the next search retries.
  onMount(warmUsdaCorpus);

  type RecipeTwin = { entity: string; attributes: Record<string, any> };
  type View =
    | { kind: "list" }
    | { kind: "build"; mode: "create" | "edit"; template: RecipeTwin | null };
  let view = $state<View>({ kind: "list" });

  // The builder takes a meal and a date because two of its four verbs log
  // (`consolidate` and `define`). The two reachable here are `create` and `edit`,
  // so both of these are inert — they satisfy the shape and are never read down a
  // path this screen can take.
  //
  // The date was a prop until #536, threaded from whichever shell drew the
  // surface, and both of them had nothing honest to thread: the root handed a
  // fresh `new Date()` and the food screen handed the day it was on, which no
  // path here could reach. One clock read at mount is the same inertness stated
  // once.
  const INERT_MEAL: MealType = "dinner";
  const INERT_DATE = new Date();

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

  // **A face's screen never draws the face's name** (ADR-0114 §15). The three
  // headings below name *sub-screens* — a builder you went into — and the list
  // state is the face's screen itself, which the shell's header already names
  // off the roster (§3). So the list passes nothing and `BottomSheet` draws no
  // header row at all; the word "Recipes" has left this file, and the face is
  // spelled once, in `src/lib/facets/registry.ts`.
  //
  // Nothing is lost by deleting it, because it was the top of three stacked
  // headings: `RecipeList` says "Your recipes" and `ImpromptuRecipeList` says
  // its own, so the body labels both lists where they are.
  let heading = $derived(
    view.kind === "list"
      ? undefined
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
  onBack={view.kind === "list" ? undefined : backToList}
  backLabel="Back to recipes"
  inline
>
  {#if view.kind === "build"}
    <RecipeBuilder
      meal_type={INERT_MEAL}
      selectedDate={INERT_DATE}
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
