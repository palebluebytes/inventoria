<script lang="ts">
  import { untrack } from "svelte";
  import { dbClient } from "../../db/db.client";
  import { ingestEntity } from "../../ingestion/ingest";
  import {
    saveRecipe,
    logRecipeConsumption,
    retractConsumptionEvent,
  } from "../../stores/calorie.store";
  import {
    toReferenceIngredient,
    panelFromIngredients,
    nameFromIngredients,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import { sanitizeYield } from "../../food/recipe-nutrition";
  import Modal from "../../ui/Modal.svelte";
  import Alert from "../../ui/Alert.svelte";
  import IngredientListEditor from "./IngredientListEditor.svelte";

  // Recipe tracker. Builds a recipe from the selected foods and REPLACES the ones
  // that remain as ingredients (append-only: their consumption events are
  // retracted). Foods removed from the builder stay logged on their own. Lead with
  // Name + Ingredients + Yield and a live per-serving nutrition panel; Source /
  // Notes / Steps / Image are collapsible.
  let {
    meal_type,
    selectedDate,
    onClose,
    initialIngredients = [],
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
    /** Foods selected on the dashboard, seeded as ingredients (carry event_id). */
    initialIngredients?: RecipeIngredient[];
  } = $props();

  let recipeName = $state("");
  let ingredients = $state<RecipeIngredient[]>(
    untrack(() => initialIngredients.map((i) => ({ ...i })))
  );
  // How many servings the recipe makes (schema.org recipeYield, ADR-0021).
  // Held loosely so the field can be cleared while typing; yieldNum sanitises it
  // to a positive number for both the live derivation and the persisted value.
  let recipeYield = $state<number | string>(1);
  let yieldNum = $derived(sanitizeYield(recipeYield));

  let open = $state({
    source: false,
    notes: false,
    steps: false,
    image: false,
  });
  let source = $state("");
  let notes = $state("");
  let steps = $state<{ id: string; text: string }[]>([]);
  let image = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let stepSeq = 0;

  let status = $state<"idle" | "loading" | "error">("idle");
  let error = $state("");

  // Pure {ref, amount, unit} references — the shape the recipe twin stores and
  // the log-time snapshot reads (ADR-0021). The live per-serving/row derivation
  // and the ingredient editing live in IngredientListEditor; this modal only
  // needs the references and resolvers for the save/log step below.
  let referenceIngredients = $derived(ingredients.map(toReferenceIngredient));
  // Each ingredient's real nutrition panel / display name, resolved in memory
  // from its inlined twin payload — never mutating the food twin.
  const resolvePanel = (ref: string) => panelFromIngredients(ingredients, ref);
  const resolveName = (ref: string) => nameFromIngredients(ingredients, ref);

  function addStep() {
    steps = [...steps, { id: `step-${++stepSeq}`, text: "" }];
  }
  function removeStep(id: string) {
    steps = steps.filter((s) => s.id !== id);
  }
  function toggleSection(key: keyof typeof open) {
    const willOpen = !open[key];
    open = { ...open, [key]: willOpen };
    if (key === "steps" && willOpen && steps.length === 0) addStep();
  }

  function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => (image = ev.target?.result as string);
    reader.onerror = () => {
      status = "error";
      error = "Failed to read image file.";
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!recipeName.trim() || ingredients.length === 0) return;
    status = "loading";
    error = "";
    try {
      // 1. Ingest each ingredient's food twin so it exists in the ledger.
      for (const ing of ingredients) {
        await dbClient.append(ingestEntity(ing.payload));
      }
      // 2. Save the recipe twin: pure {ref, amount, unit} ingredient references
      //    and schema.org-faithful fields, including the user's yield (ADR-0021).
      //    UI labels Source/Notes/Steps map to recipe/url, recipe/description,
      //    recipe/instructions.
      const recipeId = await saveRecipe({
        name: recipeName.trim(),
        ingredients: referenceIngredients,
        url: source,
        description: notes,
        instructions: steps.map((s) => s.text.trim()).filter(Boolean),
        image: image ?? undefined,
        yield: yieldNum,
      });
      // 3. Log the recipe: the store derives its per-serving snapshot with the
      //    shared formula over each ingredient's REAL nutrition/info panel and
      //    the same yield, then freezes it. Same helper + panels + yield as the
      //    live display above and the projection's derivation, so the frozen
      //    snapshot equals what the builder showed at the moment it was logged.
      //    Panels are read in memory, so real food twins are never mutated.
      await logRecipeConsumption(
        recipeId,
        referenceIngredients,
        yieldNum,
        resolvePanel,
        resolveName,
        meal_type,
        selectedDate
      );
      // 5. Replace: retract the selection events that remain as ingredients.
      //    (Foods removed from the builder keep their event_id out of this loop,
      //    so they stay logged.)
      for (const ing of ingredients) {
        if (ing.event_id) await retractConsumptionEvent(ing.event_id, recipeId);
      }
      onClose();
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    }
  }

  const SECTIONS: {
    key: keyof typeof open;
    label: string;
    filled: () => boolean;
  }[] = [
    { key: "source", label: "Source", filled: () => !!source.trim() },
    { key: "notes", label: "Notes", filled: () => !!notes.trim() },
    {
      key: "steps",
      label: "Steps",
      filled: () => steps.some((s) => s.text.trim()),
    },
    { key: "image", label: "Image", filled: () => !!image },
  ];
</script>

<Modal {onClose} title="Build recipe">
  {#snippet children({ props, close })}
    <div {...props} class="sheet">
      <header class="head">
        <span class="hbtn" aria-hidden="true"></span>
        <h2>Build recipe</h2>
        <button class="hbtn x" onclick={close} aria-label="Close">✕</button>
      </header>

      <div class="body">
        <label class="fl" for="recipe-name">Name</label>
        <input
          id="recipe-name"
          class="tin big"
          placeholder="e.g. Overnight oats"
          bind:value={recipeName}
        />

        <IngredientListEditor bind:ingredients bind:recipeYield />

        <div class="sections">
          {#each SECTIONS as s (s.key)}
            <div class="section" class:open={open[s.key]}>
              <button
                class="sec-head"
                data-section={s.key}
                aria-expanded={open[s.key]}
                onclick={() => toggleSection(s.key)}
              >
                <span class="chev">{open[s.key] ? "▾" : "▸"}</span>
                <span class="sec-title">{s.label}</span>
                {#if s.filled()}<span class="dot" title="has content"
                  ></span>{/if}
              </button>
              {#if open[s.key]}
                <div class="sec-body">
                  {#if s.key === "source"}
                    <input
                      class="tin"
                      placeholder="Link or where it's from…"
                      bind:value={source}
                    />
                  {:else if s.key === "notes"}
                    <textarea
                      class="tarea"
                      rows="3"
                      placeholder="Any notes…"
                      bind:value={notes}
                    ></textarea>
                  {:else if s.key === "steps"}
                    <ol class="steps">
                      {#each steps as step, i (step.id)}
                        <li>
                          <span class="snum">{i + 1}</span>
                          <input
                            class="sin recipe-step"
                            placeholder="Describe step {i + 1}…"
                            bind:value={step.text}
                          />
                          <button
                            class="srm"
                            onclick={() => removeStep(step.id)}
                            aria-label="Remove step {i + 1}">✕</button
                          >
                        </li>
                      {/each}
                    </ol>
                    <button class="add-step" id="add-step-btn" onclick={addStep}
                      >+ Add step</button
                    >
                  {:else}
                    <input
                      type="file"
                      accept="image/*"
                      class="hidden-file"
                      bind:this={fileInput}
                      onchange={onFile}
                    />
                    {#if image}
                      <div class="img-prev">
                        <img src={image} alt="Recipe" />
                        <button
                          class="change"
                          onclick={() => fileInput?.click()}>Change</button
                        >
                      </div>
                    {:else}
                      <button class="photo" onclick={() => fileInput?.click()}
                        >📷 Add image</button
                      >
                    {/if}
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if status === "error"}
          <div class="err"><Alert variant="error">{error}</Alert></div>
        {/if}
      </div>

      <div class="foot">
        <button
          class="save"
          id="save-recipe-btn"
          disabled={!recipeName.trim() ||
            ingredients.length === 0 ||
            status === "loading"}
          onclick={handleSave}
        >
          {status === "loading" ? "Saving…" : "Save recipe"}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 1600;
    display: flex;
    flex-direction: column;
    background: #fff;
    animation: up 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes up {
    from {
      transform: translateY(6%);
      opacity: 0.6;
    }
  }
  .head {
    display: flex;
    align-items: center;
    padding: var(--space-2xs) var(--space-s);
    border-bottom: 2px solid #000;
  }
  .head h2 {
    flex: 1;
    text-align: center;
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
  }
  .hbtn {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    font-weight: 700;
  }
  .hbtn.x {
    cursor: pointer;
    font-size: var(--step-0);
  }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-s);
  }
  .fl {
    display: block;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    margin: var(--space-s) 0 var(--space-3xs);
  }
  .tin {
    width: 100%;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-size: var(--step-0);
    font-family: inherit;
    background: #fff;
  }
  .tin.big {
    border-width: 3px;
    padding: var(--space-s);
  }
  .tarea {
    width: 100%;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-size: var(--step-n1);
    font-family: inherit;
    resize: vertical;
  }

  .sections {
    margin-top: var(--space-m);
    border-top: 2px solid #000;
  }
  .section {
    border-bottom: 2px solid #000;
  }
  .sec-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-s);
    background: #fff;
    border: none;
    padding: var(--space-s) var(--space-2xs);
    cursor: pointer;
    text-align: left;
    min-height: 52px;
  }
  .section.open .sec-head {
    background: #f4f4f5;
  }
  .chev {
    font-size: var(--step-n1);
    width: 1rem;
  }
  .sec-title {
    font-weight: 700;
    text-transform: uppercase;
    font-size: var(--step-n1);
    flex: 1;
  }
  .dot {
    width: 9px;
    height: 9px;
    background: #000;
    border-radius: 50%;
  }
  .sec-body {
    padding: 0 var(--space-2xs) var(--space-s);
  }
  .hidden-file {
    display: none;
  }
  .photo {
    width: 100%;
    border: 2px dashed #000;
    background: #fff;
    padding: var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }
  .img-prev {
    position: relative;
    border: 2px solid #000;
    overflow: hidden;
    max-height: 220px;
  }
  .img-prev img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .change {
    position: absolute;
    bottom: var(--space-xs);
    right: var(--space-xs);
    background: #000;
    color: #fff;
    border: none;
    padding: var(--space-2xs) var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }

  .steps {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
  .snum {
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
    background: #000;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: var(--step-n2);
  }
  .sin {
    flex: 1;
    border: 2px solid #000;
    padding: var(--space-2xs) var(--space-xs);
    font-family: inherit;
    font-size: var(--step-n1);
    min-width: 0;
  }
  .srm {
    flex-shrink: 0;
    background: none;
    border: none;
    font-size: var(--step-n1);
    font-weight: 700;
    cursor: pointer;
  }
  .add-step {
    margin-top: var(--space-2xs);
    background: none;
    border: 2px dashed #000;
    padding: var(--space-2xs) var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }

  .err {
    margin-top: var(--space-s);
  }
  .foot {
    border-top: 2px solid #000;
    padding: var(--space-s);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
    background: #fafafa;
  }
  .save {
    width: 100%;
    background: #000;
    color: #fff;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-1);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 60px;
  }
  .save:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
