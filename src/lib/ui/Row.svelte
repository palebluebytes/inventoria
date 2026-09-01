<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  // The one horizontal row this app keeps drawing (#319): an optional lead
  // mark, a title over a muted subtitle, a trailing mark on the right, and an
  // optional corner tucked into the top-right. It is the flat, thin-edged
  // sibling of Card — a list line rather than a surface, so it carries no
  // radius, no drop shadow and no press-flush.
  //
  // **The element is chosen from the row's own contents, not from a flag.** A
  // row that is clickable and holds no corner is a native `<button>`: real
  // press semantics, the platform's keyboard path, the shared focus ring. A row
  // that draws a remove ✕ or takes `corner` content cannot be one — HTML
  // forbids a button inside a button, and the recipe list's line is clickable
  // *and* removable at once — so it falls back to a `div role="button"` with the
  // Enter/Space handler that has always sat under `FoodItemRow`. Nothing about
  // an interactive `lead` is visible here, so a caller that puts a control there
  // (the dashboard's photo thumb) also passes the ✕ that keeps it a div.
  //
  // `...rest` is the a11y/semantics escape hatch (`aria-*`, `data-*`), NOT a
  // styling channel — same contract as Button and Card, and the named `class`
  // props below are the only way to reach a part. The HTML `title` attribute is
  // deliberately not reachable through `...rest`: `title` here is the row's own
  // heading, which is the word every call site wants.
  let {
    title,
    subtitle = "",
    lead,
    trailing,
    corner,
    onRemove,
    onclick,
    selected = false,
    class: className = "",
    titleClass = "",
    subtitleClass = "",
    removeClass = "",
    ...rest
  }: {
    title: string;
    /** The muted second line. Omit it and the row is a single line. */
    subtitle?: string;
    /** A mark ahead of the text: a photo thumb, an icon. */
    lead?: Snippet;
    /** The right-hand mark: a kcal figure, a chevron. The caller owns its
     *  alignment — a food line drops its kcal to the baseline to clear the ✕,
     *  a chooser tile centres its `›` because it has no corner to clear. */
    trailing?: Snippet;
    /** Top-right corner content. Takes the remove ✕'s place when given. */
    corner?: Snippet;
    onRemove?: () => void;
    /** Whole-row tap. Omit to make the row inert. */
    onclick?: () => void;
    selected?: boolean;
    class?: string;
    /** Class hooks on the three parts a caller may already address by name.
     *  `FoodItemRow`'s `.fi-name` / `.fi-qty` / `.fi-remove` are a shipped DOM
     *  contract — the recipe-list e2e locates all three — and #319 moved that
     *  row onto this primitive without changing what it renders. */
    titleClass?: string;
    subtitleClass?: string;
    removeClass?: string;
  } & Omit<HTMLAttributes<HTMLElement>, "title"> = $props();

  let clickable = $derived(!!onclick);
  // A ✕ or a corner mark is content a native <button> may not hold.
  let asButton = $derived(clickable && !corner && !onRemove);
</script>

{#snippet body()}
  {@render lead?.()}
  <!-- A span, not a div: one body serves both element modes, and a <button>
       may only hold phrasing content. `display: flex` makes it a column
       regardless. -->
  <span class="row-text">
    <span class="row-title {titleClass}">{title}</span>
    {#if subtitle}
      <span class="row-subtitle {subtitleClass}">{subtitle}</span>
    {/if}
  </span>
  {@render trailing?.()}
  {#if corner}
    <span class="row-corner">{@render corner()}</span>
  {:else if onRemove}
    <button
      class="row-remove {removeClass}"
      aria-label="Remove {title}"
      title="Remove"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => {
        e.stopPropagation();
        onRemove?.();
      }}>✕</button
    >
  {/if}
{/snippet}

{#if asButton}
  <button
    {...rest}
    type="button"
    class="row clickable {className}"
    class:selected
    {onclick}
  >
    {@render body()}
  </button>
{:else}
  <!-- `clickable` is written out rather than passed as the `class:clickable`
       shorthand: alongside a {...rest} spread the compiler hands the class
       directive the $derived identifier itself, which is always truthy. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    {...rest}
    class="row {className}"
    class:selected
    class:clickable={!!onclick}
    role={clickable ? "button" : undefined}
    tabindex={clickable ? 0 : undefined}
    {onclick}
    onkeydown={clickable
      ? (e) => (e.key === "Enter" || e.key === " ") && onclick?.()
      : undefined}
  >
    {@render body()}
  </div>
{/if}

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-s);
    background: var(--paper);
    /* Thin, flat and square: a line in a list, not a Card. */
    border: var(--edge-thin);
    padding: var(--space-s);
  }
  /* Reset the native <button> so a pressable row is identical to an inert one. */
  button.row {
    width: 100%;
    font: inherit;
    color: inherit;
    text-align: left;
  }
  .row.clickable {
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
  /* The one unified brutalist focus ring, shared with Button and Card
     (ADR-0039). It is scoped to the native-button mode because the div mode is
     the food line, whose rendered output #319 may not change: that row keeps
     the browser's own ring, as it has since it shipped. */
  button.row:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .row.selected {
    background: var(--highlight-bg);
    box-shadow: var(--shadow-2);
  }
  .row-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .row-title {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-primary);
  }
  .row-subtitle {
    font-size: var(--step-n2);
    color: var(--text-muted);
  }
  /* Borderless ✕ tucked into the row's top-right corner — and the same box for
     whatever `corner` puts there instead, so the two never shift the row. */
  .row-remove,
  .row-corner {
    position: absolute;
    top: var(--space-3xs);
    right: var(--space-3xs);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
  }
  .row-remove {
    padding: 0;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--step-n1);
    line-height: 1;
    cursor: pointer;
    transition:
      color 0.15s ease,
      transform 0.1s ease;
  }
  .row-remove:hover {
    color: var(--text-muted);
  }
  .row-remove:active {
    transform: scale(0.85);
  }
</style>
