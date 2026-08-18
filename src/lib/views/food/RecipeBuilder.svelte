<script lang="ts">
  import { untrack } from "svelte";
  import { dbClient } from "../../db/db.client";
  import { ingestEntity } from "../../ingestion/ingest";
  import {
    saveRecipe,
    logRecipeConsumption,
    retractConsumptionEvent,
    seedRowsFromTemplate,
  } from "../../stores/calorie.store";
  import {
    toReferenceIngredient,
    panelFromIngredients,
    nameFromIngredients,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import { sanitizeYield } from "../../food/recipe-nutrition";
  import { Accordion } from "bits-ui";
  import Alert from "../../ui/Alert.svelte";
  import IngredientListEditor from "./IngredientListEditor.svelte";

  // The Recipe Twin builder/editor body — sheet chrome removed so it can render
  // inside the log sheet's Recipe tab (via FoodStager) or wrapped in a BottomSheet
  // for the dashboard consolidate path. Three verbs share it (ADR-0022):
  //   • consolidate — build from selected foods and REPLACE the ones that remain
  //     as ingredients (their consumption events are retracted, append-only).
  //   • define — create a reusable template AND log one serving onto the day
  //     (ADR-0022 amended): a recipe you just built lands on the day you built it.
  //   • edit — amend an existing template in place; re-seeds only FUTURE
  //     instantiations (past snapshots never move), logs nothing.
  // Leads with Name + Ingredients + Servings + the live recipe total; Source /
  // Notes /
  // Steps / Image are collapsible. Its commit is driven by the host's shared dock:
  // it exposes `requestSave` / `saveReady` / `saveLabel` (ManualEntryFlow pattern)
  // and calls `onCommitted` on success.
  let {
    meal_type,
    selectedDate,
    mode = "consolidate",
    template = null,
    initialIngredients = [],
    onCommitted,
    requestSave = $bindable(),
    saveReady = $bindable(false),
    saveLabel = $bindable("Log"),
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    /** Which verb this surface performs (see above). Default: consolidate. */
    mode?: "consolidate" | "define" | "edit";
    /** The Recipe Twin being amended (edit mode only; getLocalFoodTwin shape). */
    template?: { entity: string; attributes: Record<string, any> } | null;
    /** Foods selected on the dashboard, seeded as ingredients (carry event_id). */
    initialIngredients?: RecipeIngredient[];
    /** Called once the recipe is saved (and logged for consolidate/define). */
    onCommitted: () => void;
    /** The host's dock fires this to commit; readiness/label drive its button. */
    requestSave?: () => void;
    saveReady?: boolean;
    saveLabel?: string;
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

  // Editing seeds asynchronously (each template ref resolves to its CURRENT
  // twin), so the editor is held behind `ready`. Other modes are ready at once.
  // `mode` is fixed for the component's life, so its initial read is the value.
  let ready = $state(untrack(() => mode !== "edit"));

  type SectionKey = "source" | "notes" | "steps" | "image";
  // Which optional schema.org sections are expanded. bits-ui Accordion
  // (type="multiple", #66) owns the disclosure semantics — role=heading
  // triggers, aria-expanded, roving arrow-key focus between headers, several
  // open at once — so this only holds the controlled set of open section keys.
  let openSections = $state<SectionKey[]>([]);
  let source = $state("");
  let notes = $state("");
  let steps = $state<{ id: string; text: string }[]>([]);
  let image = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let stepSeq = 0;

  // Stable per-instance ids so each header's aria-controls points at its region
  // and each region is aria-labelledby its header (bits' Accordion omits both
  // links). localhost/PWA is always a secure context, so randomUUID exists.
  const secUid = `rec-sec-${crypto.randomUUID()}`;
  const bodyId = (key: SectionKey) => `${secUid}-${key}`;
  const headId = (key: SectionKey) => `${secUid}-${key}-head`;

  let status = $state<"idle" | "loading" | "error">("idle");
  let error = $state("");

  // Seed the editor from the template once (edit mode). Each stored `{ ref,
  // amount, unit }` resolves to its CURRENT twin, so re-saving re-derives from
  // live ingredient data; the collapsible schema.org fields prefill too. A
  // dangling ref falls back to a self-contained placeholder (seedRowFromRef).
  let seeded = false;
  $effect(() => {
    if (mode !== "edit" || !template || seeded) return;
    seeded = true;
    void seedFromTemplate(template);
  });

  async function seedFromTemplate(t: {
    entity: string;
    attributes: Record<string, any>;
  }) {
    try {
      const a = t.attributes;
      recipeName = a["recipe/name"] ?? "";
      recipeYield = a["recipe/yield"] || 1;
      source = a["recipe/url"] ?? "";
      notes = a["recipe/description"] ?? "";
      image = a["recipe/image"] || null;
      const instr = (a["recipe/instructions"] ?? []) as string[];
      steps = instr.map((text) => ({ id: `step-${++stepSeq}`, text }));
      openSections = (
        [
          source ? "source" : null,
          notes ? "notes" : null,
          steps.length > 0 ? "steps" : null,
          image ? "image" : null,
        ] as (SectionKey | null)[]
      ).filter((k): k is SectionKey => k !== null);
      ingredients = await seedRowsFromTemplate(a);
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    } finally {
      ready = true;
    }
  }

  // Pure {ref, amount, unit} references — the shape the recipe twin stores and
  // the log-time snapshot reads (ADR-0021). The live per-serving/row derivation
  // and the ingredient editing live in IngredientListEditor; this component only
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
  // Accordion drives open/close (click, Enter/Space, arrow keys); we only react
  // to it, to keep the one behavioural nicety: opening Steps for the first time
  // seeds an empty row so the section isn't blank.
  function onSectionsChange(next: string[]) {
    const openingSteps =
      next.includes("steps") && !openSections.includes("steps");
    openSections = next as SectionKey[];
    if (openingSteps && steps.length === 0) addStep();
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

  async function save() {
    if (!recipeName.trim() || ingredients.length === 0 || status === "loading")
      return;
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
      //    recipe/instructions. In edit mode the twin's own id is passed, so this
      //    appends to it (latest-wins re-seeds only FUTURE instantiations).
      const recipeId = await saveRecipe(
        {
          name: recipeName.trim(),
          ingredients: referenceIngredients,
          url: source,
          description: notes,
          instructions: steps.map((s) => s.text.trim()).filter(Boolean),
          image: image ?? undefined,
          yield: yieldNum,
        },
        mode === "edit" ? template?.entity : undefined
      );
      // 3. Consolidate and Define both LOG the recipe onto the current day — a
      //    recipe you just built should appear on the day you built it (ADR-0022,
      //    amended). Edit stays template-only: it re-seeds only FUTURE
      //    instantiations, so it logs nothing.
      if (mode === "consolidate" || mode === "define") {
        // Log the recipe: the store derives its per-serving snapshot with the
        // shared formula over each ingredient's REAL nutrition/info panel and
        // the same yield, then freezes it. Same helper + panels + yield as the
        // live display above and the projection's derivation, so the frozen
        // snapshot equals what the builder showed at the moment it was logged.
        // Panels are read in memory, so real food twins are never mutated.
        await logRecipeConsumption(
          recipeId,
          referenceIngredients,
          yieldNum,
          resolvePanel,
          resolveName,
          meal_type,
          selectedDate
        );
        // Replace (consolidate only): retract the selection events that remain as
        // ingredients. Define builds from scratch, so it has no seeded event_ids
        // and nothing to retract — the guard keeps its fresh foods untouched.
        if (mode === "consolidate") {
          for (const ing of ingredients) {
            if (ing.event_id)
              await retractConsumptionEvent(ing.event_id, recipeId);
          }
        }
      }
      onCommitted();
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    }
  }

  const SECTIONS: {
    key: SectionKey;
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

  // Surface commit + readiness + label to the host's shared dock. Define and
  // Consolidate share the "Log" CTA (they log onto the day); Edit is a
  // template-only amendment, so it reads "Save changes"; "Saving…" while in
  // flight.
  requestSave = save;
  $effect(() => {
    saveReady =
      ready &&
      !!recipeName.trim() &&
      ingredients.length > 0 &&
      status !== "loading";
  });
  $effect(() => {
    saveLabel =
      status === "loading"
        ? "Saving…"
        : mode === "edit"
          ? "Save changes"
          : "Log";
  });
</script>

{#if !ready}
  <p class="loading">Loading recipe…</p>
{:else}
  <label class="fl" for="recipe-name">Name</label>
  <input
    id="recipe-name"
    class="tin big"
    placeholder="e.g. Overnight oats"
    bind:value={recipeName}
  />

  <IngredientListEditor bind:ingredients bind:recipeYield />

  <!-- Optional schema.org sections as a real accordion (#66): bits-ui supplies
       the role=heading trigger, aria-expanded, roving arrow-key focus between
       headers and multiple-open behaviour; the brutalist skin stays custom
       (`:global(.sec-*)` below), the same headless-behaviour-plus-owned-look
       split as Tabs/Segmented (ADR-0036/0037). bits omits the header↔region
       links, so aria-controls / role=region / aria-labelledby are wired by
       hand. `value` is controlled by `openSections`; every change funnels
       through `onSectionsChange`, so an arrow-key toggle seeds the first step
       exactly as a click does. -->
  <div class="rec-sections">
    <Accordion.Root
      type="multiple"
      value={openSections}
      onValueChange={onSectionsChange}
      class="sections"
    >
      {#each SECTIONS as s (s.key)}
        <Accordion.Item value={s.key} class="section">
          <Accordion.Header level={3} class="sec-heading">
            <Accordion.Trigger
              class="sec-head"
              id={headId(s.key)}
              data-section={s.key}
              aria-controls={bodyId(s.key)}
            >
              <span class="chev"
                >{openSections.includes(s.key) ? "▾" : "▸"}</span
              >
              <span class="sec-title">{s.label}</span>
              {#if s.filled()}<span class="dot" title="has content"></span>{/if}
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content
            class="sec-body"
            id={bodyId(s.key)}
            role="region"
            aria-labelledby={headId(s.key)}
          >
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
                  <button class="change" onclick={() => fileInput?.click()}
                    >Change</button
                  >
                </div>
              {:else}
                <button class="photo" onclick={() => fileInput?.click()}
                  >📷 Add image</button
                >
              {/if}
            {/if}
          </Accordion.Content>
        </Accordion.Item>
      {/each}
    </Accordion.Root>
  </div>
{/if}

{#if status === "error"}
  <div class="err"><Alert variant="error">{error}</Alert></div>
{/if}

<style>
  .loading {
    color: var(--text-muted);
    padding: var(--space-l) 0;
    text-align: center;
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
    border: var(--edge);
    padding: var(--space-xs);
    font-size: var(--step-0);
    font-family: inherit;
    background: var(--paper);
  }
  .tin.big {
    border-width: 3px;
    padding: var(--space-s);
  }
  .tarea {
    width: 100%;
    border: var(--edge);
    padding: var(--space-xs);
    font-size: var(--step-n1);
    font-family: inherit;
    resize: vertical;
  }

  /* bits-ui renders the accordion's Root/Item/Header/Trigger/Content itself, so
     the brutalist skin reaches them with :global, bounded under our own scoped
     .rec-sections wrapper (the .dock :global(.methods) precedent, ADR-0036). */
  .rec-sections :global(.sections) {
    margin-top: var(--space-m);
    border-top: var(--edge);
  }
  .rec-sections :global(.section) {
    border-bottom: var(--edge);
  }
  /* Header wraps the trigger in a role=heading div — keep it layout-inert. */
  .rec-sections :global(.sec-heading) {
    margin: 0;
  }
  .rec-sections :global(.sec-head) {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-s);
    background: var(--paper);
    border: none;
    padding: var(--space-s) var(--space-2xs);
    cursor: pointer;
    text-align: left;
    min-height: 52px;
  }
  /* bits sets data-state="open" on the open trigger (was `.section.open`). */
  .rec-sections :global(.sec-head[data-state="open"]) {
    background: var(--bg-input);
  }
  /* Roving arrow-key focus now moves between headers, so surface it clearly. */
  .rec-sections :global(.sec-head:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
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
    background: var(--ink);
    border-radius: 50%;
  }
  .rec-sections :global(.sec-body) {
    padding: 0 var(--space-2xs) var(--space-s);
  }
  .hidden-file {
    display: none;
  }
  .photo {
    width: 100%;
    border: 2px dashed var(--ink);
    background: var(--paper);
    padding: var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }
  .img-prev {
    position: relative;
    border: var(--edge);
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
    background: var(--ink);
    color: var(--paper);
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
    background: var(--ink);
    color: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: var(--step-n2);
  }
  .sin {
    flex: 1;
    border: var(--edge);
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
    border: 2px dashed var(--ink);
    padding: var(--space-2xs) var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }

  .err {
    margin-top: var(--space-s);
  }
</style>
