<script lang="ts" generics="T extends string">
  import { RadioGroup } from "bits-ui";

  // The one brutalist single-choice control (ADR-0036): a horizontal row of
  // mutually-exclusive cells over bits-ui RadioGroup, so the roles
  // (radiogroup/radio), aria-checked, and arrow-key *selection* live in one
  // place instead of being re-hand-rolled at each call site. Headless behaviour,
  // custom brutalist skin — the same split QuantityGrams' Slider already proves.
  //
  // It owns a visible label above the row (also the group's accessible name) and
  // nothing else; callers keep whatever chrome sits around it (a hint below, a
  // conditional input beside). Selection never falls back to none once made —
  // that is exactly RadioGroup's contract, and why it backs this rather than a
  // ToggleGroup. `value` is `T | null` so a picker may start empty (bind a `T`
  // for one that always has a default; bind `T | null` for one that starts blank).
  let {
    options,
    value = $bindable(),
    label,
    required = false,
    testid,
  }: {
    options: { value: T; label: string }[];
    value: T | null;
    /** Visible heading rendered above the row and used as the group's a11y name. */
    label: string;
    /** Marks the group aria-required — for a picker that starts empty (e.g. sex). */
    required?: boolean;
    /** Forwarded as data-testid on the group root. */
    testid?: string;
  } = $props();

  // A stable id to tie the visible label to the radiogroup as its accessible
  // name (localhost/PWA is always a secure context, so randomUUID is available).
  const labelId = `seg-${crypto.randomUUID()}`;
</script>

<div class="segmented-field">
  <span class="segmented-label" id={labelId}>{label}</span>
  <RadioGroup.Root
    class="seg-row"
    value={value ?? ""}
    onValueChange={(v) => (value = v as T)}
    orientation="horizontal"
    {required}
    aria-labelledby={labelId}
    data-testid={testid}
    data-cols={options.length}
    style="--cols: {options.length}"
  >
    {#each options as opt (opt.value)}
      <RadioGroup.Item class="seg" value={opt.value} data-value={opt.value}>
        {opt.label}
      </RadioGroup.Item>
    {/each}
  </RadioGroup.Root>
</div>

<style>
  /* Own container so the many-column narrow fallback below can query our own
     width rather than depending on an ancestor being a container. */
  .segmented-field {
    display: block;
    /* Fill the container even inside a flex parent that doesn't stretch its
       items (e.g. a column with align-items: flex-start), so the cell grid never
       collapses to content width. */
    width: 100%;
    container-type: inline-size;
  }
  .segmented-label {
    display: block;
    margin-bottom: var(--space-2xs);
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: #000;
  }

  /* bits-ui renders these elements itself, so target them with :global.
     Brutalist segmented control: black-bordered cells, the selected one inverts
     to black-on-white (bits sets data-state="checked"). */
  :global(.seg-row) {
    display: grid;
    gap: var(--space-2xs);
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  }
  /* Four or more cells wrap to two columns on a narrow sheet, expanding to the
     full row once there's room — preserving the old .segmented.four behaviour. */
  @container (max-width: 26rem) {
    :global(.seg-row[data-cols="4"]),
    :global(.seg-row[data-cols="5"]),
    :global(.seg-row[data-cols="6"]) {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  :global(.seg-row .seg) {
    padding: var(--space-2xs) var(--space-xs);
    border: var(--edge);
    background: #fff;
    color: #000;
    font-family: inherit;
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    cursor: pointer;
  }
  :global(.seg-row .seg:hover[data-state="unchecked"]) {
    background: var(--track, #f4f4f5);
  }
  :global(.seg-row .seg[data-state="checked"]) {
    background: #000;
    color: #fff;
  }
  :global(.seg-row .seg:focus-visible) {
    outline: 2px solid #000;
    outline-offset: 2px;
  }
</style>
