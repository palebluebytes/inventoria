<script lang="ts">
  import {
    buildManualEntry,
    type ManualEntryKind,
  } from "../../food/provenance";
  import { emptyPlateEstimate } from "../../food/plate-estimator";
  import { readImageAsDataUrl } from "../../food/image-file";
  import type { FoodChoice, ManualEntrySeed } from "../../food/food-staging";

  // The Custom tab's intent chooser and its three purpose-built mini-forms
  // (ADR-0035). The label form is NOT reached here — it stays on the barcode
  // doors. Each intent is calories-only (no macros); on Save this builds the
  // widened custom {@link FoodChoice} carrying a `food/manual_entry` envelope and
  // hands it to the host through {@link onCommit}, which routes it to
  // `saveManualFood` + a calories-only Consumption Event.
  //
  //   ⚡ quick estimate — calories fast; name defaults to the meal; photo optional;
  //      one-off (excluded from Recent/Search).
  //   📋 from a menu     — name + calories required; Place → twin/brand, Ingredients
  //      → food/ingredients (descriptive only), photo optional; reusable.
  //   🍽️ from a photo    — capture a plate photo, then a BLANK menu-style form with
  //      the photo attached; the PlateEstimator seam is wired but v1 uses its empty
  //      variant (no model, no fabricated numbers); one-off.
  let {
    /** Allows attaching a photo (the direct-log flow only). */
    allowPhoto = false,
    /** The meal this sheet logs into ("lunch"/"dinner") — the quick-estimate name
     *  default when the user leaves the name blank. */
    mealName = "",
    /** True while the host's commit is in flight — disables Save. */
    busy = false,
    /** Extra disable for Save (e.g. the DB not being ready yet). */
    disabled = false,
    /** DOM ids so the host keeps the selectors its e2e expects. */
    nameId = "custom-name",
    calId = "custom-cal",
    /**
     * Edit-mode pre-population (ADR-0035 edit path): jumps straight to the seeded
     * intent's mini-form, skipping the chooser, with its fields filled. Applied
     * once when it first becomes non-null (it may resolve after a twin fetch). */
    seed = null,
    /** Commits the built choice; the host maps it to a save + log. */
    onCommit,
    /**
     * The commit button lives in the host's shared dock (so a manual entry's CTA
     * is pinned at the bottom like every other flow, not scrolled inline). These
     * three bindables surface what the dock needs: which mini-form is open (null =
     * the intent chooser, where there is nothing to commit), the save handler to
     * fire, and whether the current fields are complete enough to save. The
     * `requestBack` handler returns a mini-form to the chooser, so the host's
     * shared header back button drives it (no bespoke inline back link). */
    activeIntent = $bindable(null),
    requestSave = $bindable(),
    saveReady = $bindable(false),
    requestBack = $bindable(),
  }: {
    allowPhoto?: boolean;
    mealName?: string;
    busy?: boolean;
    disabled?: boolean;
    nameId?: string;
    calId?: string;
    seed?: ManualEntrySeed | null;
    onCommit: (choice: FoodChoice) => void | Promise<void>;
    activeIntent?: ManualEntryKind | null;
    requestSave?: () => void;
    saveReady?: boolean;
    requestBack?: () => void;
  } = $props();

  const INTENTS: {
    kind: ManualEntryKind;
    icon: string;
    title: string;
    blurb: string;
  }[] = [
    {
      kind: "quick_estimate",
      icon: "⚡",
      title: "Quick estimate",
      blurb: "Log a calorie figure, fast",
    },
    {
      kind: "menu",
      icon: "📋",
      title: "From a menu",
      blurb: "A named dish with the menu's calories",
    },
    {
      kind: "plate_estimate",
      icon: "🍽️",
      title: "From a photo",
      blurb: "Snap the plate, fill in the details",
    },
  ];

  let intent = $state<ManualEntryKind | null>(null);

  // Shared mini-form state. Blanked on every intent switch so no field bleeds
  // across intents (a menu's Place must not haunt a later quick estimate).
  let name = $state("");
  let calories = $state("");
  let place = $state("");
  let ingredients = $state("");
  let photo = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let readError = $state("");

  function reset() {
    name = "";
    calories = "";
    place = "";
    ingredients = "";
    photo = null;
    readError = "";
  }

  // Edit mode: land directly on the seeded intent's mini-form, filled. Applied
  // once when `seed` first arrives (it resolves after the twin fetch), so the
  // user never sees the chooser when re-opening a saved manual entry.
  let seeded = false;
  $effect(() => {
    if (!seed || seeded) return;
    seeded = true;
    intent = seed.manualKind;
    name = seed.name;
    calories = seed.calories;
    place = seed.place;
    ingredients = seed.ingredients;
    photo = seed.photo_base64;
  });

  function choose(kind: ManualEntryKind) {
    reset();
    intent = kind;
    // The plate flow is photo-first: v1 opens the BLANK menu-style form from the
    // EMPTY estimate (the seam is wired here; a real estimatePlate() would prefill
    // the same fields under confirm-before-save, ADR-0035 §5). No model call.
    if (kind === "plate_estimate") {
      const est = emptyPlateEstimate();
      name = est.name ?? "";
      calories = est.calories != null ? String(est.calories) : "";
      ingredients = est.ingredients.join(", ");
    }
  }

  function back() {
    intent = null;
    reset();
  }

  async function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = Array.from(input.files ?? []).find((f) =>
      f.type.startsWith("image/")
    );
    input.value = "";
    if (!file) return;
    readError = "";
    try {
      photo = await readImageAsDataUrl(file);
    } catch {
      readError = "Couldn’t read that image file.";
    }
  }

  // A parsed positive kcal figure, or null while the field is blank/unparseable.
  let kcal = $derived.by<number | null>(() => {
    const n = Number(calories.trim());
    return calories.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
  });

  // The quick-estimate name shown/saved when the field is left blank — the meal
  // name capitalised ("Lunch"), so the day's list is never an anonymous figure.
  let mealDefault = $derived(
    mealName ? mealName.charAt(0).toUpperCase() + mealName.slice(1) : "Custom"
  );

  // Menu / plate need a name AND calories; quick needs only calories (its name
  // defaults). The plate form also needs the photo that opened it.
  let canSave = $derived.by(() => {
    if (kcal == null) return false;
    if (intent === "quick_estimate") return true;
    if (intent === "menu") return name.trim() !== "";
    if (intent === "plate_estimate") return name.trim() !== "" && !!photo;
    return false;
  });

  // Surface the mini-form state to the host's dock, which renders the pinned
  // commit button (the intent chooser has no button — nothing to commit yet).
  $effect(() => {
    activeIntent = intent;
  });
  $effect(() => {
    saveReady = canSave;
  });
  requestSave = save;
  requestBack = back;

  function save() {
    if (!canSave || kcal == null || !intent || busy || disabled) return;
    const isMenu = intent === "menu";
    const resolvedName =
      intent === "quick_estimate" && name.trim() === ""
        ? mealDefault
        : name.trim();
    const ing = intent === "quick_estimate" ? "" : ingredients.trim();
    const brand = isMenu ? place.trim() : "";
    const fields = [
      "name",
      "calories",
      ...(ing ? ["ingredients"] : []),
      ...(brand ? ["brand"] : []),
      ...(photo ? ["photo"] : []),
    ];
    const choice: FoodChoice = {
      kind: "custom",
      name: resolvedName,
      calories: kcal,
      // Calories-only: no macros. The host logs the event with these omitted, so
      // the macro meters never move for a manual entry (ADR-0035 §7).
      protein: 0,
      fat: 0,
      carbs: 0,
      photo_base64: photo,
      labelPhotos: photo ? [photo] : undefined,
      brand: brand || undefined,
      ingredients: ing || undefined,
      manualEntry: buildManualEntry({ kind: intent, fields }),
    };
    void onCommit(choice);
  }
</script>

<!-- The one calorie field every intent leads with (the only number a manual
     entry carries), so quick/menu/plate never assemble it three ways. -->
{#snippet kcalField()}
  <label class="kcal-label" for={calId}>Calories</label>
  <div class="kcal-field">
    <input
      id={calId}
      class="kcal-input"
      inputmode="numeric"
      autocomplete="off"
      placeholder="0"
      aria-label="Calories in kcal"
      bind:value={calories}
    />
    <span class="kcal-unit">kcal</span>
  </div>
{/snippet}

{#if intent === null}
  <!-- The chooser: three eating-out / estimation intents. The label form is not
       an option here (ADR-0035 §1) — it lives on the barcode doors. -->
  <div class="chooser" data-testid="manual-intent-chooser">
    {#each INTENTS as opt (opt.kind)}
      <button
        type="button"
        class="intent"
        data-testid={`intent-${opt.kind}`}
        onclick={() => choose(opt.kind)}
      >
        <span class="intent-ico" aria-hidden="true">{opt.icon}</span>
        <span class="intent-text">
          <span class="intent-title">{opt.title}</span>
          <span class="intent-blurb">{opt.blurb}</span>
        </span>
        <span class="intent-go" aria-hidden="true">›</span>
      </button>
    {/each}
  </div>
{:else}
  <div class="mini" data-testid={`manual-form-${intent}`}>
    <!-- Back to the intent chooser is driven by the host's shared header back
         button (via requestBack), so there is no bespoke inline back link. -->

    <!-- Rendered unconditionally: the plate intent is photo-FIRST and needs this
         input even where the optional quick/menu photo attach (gated by
         `allowPhoto`) is off. -->
    <input
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden-file-input"
      bind:this={fileInput}
      onchange={handleFile}
    />

    {#if intent === "plate_estimate" && !photo}
      <!-- Photo-first: capture/pick a plate photo, then the blank form opens. -->
      <button
        type="button"
        class="plate-cta"
        data-testid="plate-capture"
        onclick={() => fileInput?.click()}
      >
        <span class="plate-cta-ico" aria-hidden="true">📷</span>
        <span>Take or choose a photo of the plate</span>
      </button>
      {#if readError}<p class="mini-err">{readError}</p>{/if}
    {:else}
      {#if intent === "quick_estimate"}
        <!-- Fastest path: calories lead, name optional. -->
        {@render kcalField()}
        <input
          id={nameId}
          class="mini-name"
          placeholder={`Name — defaults to “${mealDefault}”`}
          aria-label="Name"
          bind:value={name}
        />
      {:else}
        <!-- Menu / plate share the review shape: name + calories, ingredients,
             (menu only) Place. Photo attaches on both. -->
        <input
          id={nameId}
          class="mini-name mini-name-req"
          placeholder="Dish name"
          aria-label="Dish name"
          bind:value={name}
        />
        {@render kcalField()}
        {#if intent === "menu"}
          <label class="mini-flabel" for="manual-place">Place — optional</label>
          <input
            id="manual-place"
            class="mini-name"
            placeholder="e.g. Nando’s"
            aria-label="Place"
            bind:value={place}
          />
        {/if}
        <label class="mini-flabel" for="manual-ingredients"
          >Ingredients — optional</label
        >
        <textarea
          id="manual-ingredients"
          class="mini-ingredients"
          rows="2"
          placeholder="For memory & allergens — doesn’t change the calories"
          aria-label="Ingredients"
          bind:value={ingredients}
        ></textarea>
      {/if}

      {#if allowPhoto}
        <div class="mini-photo">
          {#if photo}
            <img src={photo} alt="" class="mini-thumb" />
            <button
              type="button"
              class="mini-photo-btn"
              onclick={() => (photo = null)}>Remove photo</button
            >
          {:else}
            <button
              type="button"
              class="mini-photo-btn"
              data-testid="manual-add-photo"
              onclick={() => fileInput?.click()}>📷 Add a photo</button
            >
          {/if}
        </div>
        {#if readError}<p class="mini-err">{readError}</p>{/if}
      {/if}
      <!-- The commit button is pinned in the host's shared dock (FoodStager),
           driven by the activeIntent / requestSave / saveReady bindables above,
           so a manual entry's CTA sits at the bottom like every other flow. -->
    {/if}
  </div>
{/if}

<style>
  .chooser {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .intent {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    width: 100%;
    background: #fff;
    border: 2px solid #000;
    padding: var(--space-m);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    min-height: 64px;
  }
  .intent:hover {
    background: #f4f4f5;
  }
  .intent:active {
    box-shadow: 4px 4px 0 #000;
  }
  .intent-ico {
    font-size: var(--step-3);
    line-height: 1;
    flex-shrink: 0;
  }
  .intent-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: var(--space-3xs);
  }
  .intent-title {
    font-weight: 800;
    font-size: var(--step-0);
  }
  .intent-blurb {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .intent-go {
    font-size: var(--step-2);
    font-weight: 800;
    flex-shrink: 0;
  }

  .mini {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .kcal-label,
  .mini-flabel {
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .kcal-field {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-2xs);
    border: 3px solid var(--border-accent);
    padding: var(--space-2xs) var(--space-xs);
  }
  .kcal-input {
    width: 100%;
    border: none;
    outline: none;
    text-align: center;
    font-family: inherit;
    font-size: var(--step-4);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    background: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .kcal-unit {
    font-size: var(--step-1);
    font-weight: 700;
    flex-shrink: 0;
  }
  .mini-name,
  .mini-ingredients {
    width: 100%;
    box-sizing: border-box;
    border: 2px solid #000;
    padding: var(--space-s);
    font-family: inherit;
    font-size: var(--step-0);
    background: #fff;
  }
  .mini-name-req {
    font-weight: 700;
  }
  .mini-ingredients {
    font-size: var(--step-n1);
    resize: vertical;
  }
  .plate-cta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-s);
    width: 100%;
    border: 2px dashed #000;
    background: #fff;
    padding: var(--space-l);
    font-family: inherit;
    font-weight: 700;
    font-size: var(--step-n1);
    cursor: pointer;
  }
  .plate-cta:hover {
    background: #f4f4f5;
  }
  .plate-cta-ico {
    font-size: var(--step-4);
    line-height: 1;
  }
  .mini-photo {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }
  .mini-thumb {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border: 2px solid #000;
  }
  .mini-photo-btn {
    background: #fff;
    border: 2px solid #000;
    padding: var(--space-2xs) var(--space-s);
    font-family: inherit;
    font-weight: 700;
    font-size: var(--step-n2);
    cursor: pointer;
  }
  .mini-photo-btn:hover {
    background: #f4f4f5;
  }
  .mini-err {
    font-size: var(--step-n2);
    color: var(--red-text, #b00);
  }
  .hidden-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    border: 0;
  }
</style>
