<script lang="ts">
  import { ToggleGroup } from "bits-ui";

  // The brutalist *deselectable* single-choice control (ADR-0040): a wrapping row
  // of mutually-exclusive cells over bits-ui ToggleGroup with type="single", so
  // the group role, aria state, roving tabindex, and arrow-key *selection* live
  // in one place instead of being re-hand-rolled at each call site. Headless
  // behaviour, custom brutalist skin — the same split Segmented (ADR-0036) proves.
  //
  // It is the sibling to Segmented, differing on exactly one axis:
  //   Segmented / RadioGroup — selection *must* persist once made.
  //   ToggleGroup            — selection *may* clear; clicking the active cell
  //                            deselects it (native click-to-clear).
  // On deselect, bits sets `value` back to the empty string `""` — so `""` is the
  // "nothing selected" state. A caller that models "all" as an item can give that
  // item `value: ""`; it is then pressed exactly when nothing else is (and
  // click-to-clear returns to it). It **wraps** (content-width items, flex-wrap)
  // rather than forcing equal columns, since the item list is dynamic and long.
  //
  // It exposes an accessible group name — pass a visible `label` (rendered above
  // the row and wired as the group's name) or, when surrounding chrome already
  // labels the control, an `ariaLabel` (mirroring Segmented's explicit-prop shape).
  let {
    options,
    value = $bindable(""),
    onValueChange,
    label,
    ariaLabel,
    testid,
  }: {
    options: { value: string; label: string }[];
    /** Selected item value; `""` means nothing selected. Bindable. */
    value?: string;
    /** Fires with the new value (`""` when cleared) on every change. */
    onValueChange?: (value: string) => void;
    /** Visible heading rendered above the row and used as the group's a11y name. */
    label?: string;
    /** Accessible group name when there is no visible `label`. */
    ariaLabel?: string;
    /** Forwarded as data-testid on the group root. */
    testid?: string;
  } = $props();

  // A stable id to tie a visible label to the group as its accessible name
  // (localhost/PWA is always a secure context, so randomUUID is available).
  const labelId = `tg-${crypto.randomUUID()}`;
</script>

<div class="togglegroup-field">
  {#if label}
    <span class="togglegroup-label" id={labelId}>{label}</span>
  {/if}
  <ToggleGroup.Root
    type="single"
    class="tg-row"
    {value}
    onValueChange={(v) => {
      value = v;
      onValueChange?.(v);
    }}
    aria-labelledby={label ? labelId : undefined}
    aria-label={label ? undefined : ariaLabel}
    data-testid={testid}
  >
    {#each options as opt (opt.value)}
      <ToggleGroup.Item class="tg" value={opt.value} data-value={opt.value}>
        {opt.label}
      </ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
</div>

<style>
  .togglegroup-field {
    display: block;
    width: 100%;
  }
  .togglegroup-label {
    display: block;
    margin-bottom: var(--space-2xs);
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ink);
  }

  /* bits-ui renders these elements itself, so target them with :global.
     Brutalist toggle group: black-bordered cells that WRAP (content width),
     the selected one inverting to paper-on-ink (bits sets data-state="on"). */
  :global(.tg-row) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  :global(.tg-row .tg) {
    padding: var(--space-3xs) var(--space-xs);
    border: var(--edge);
    background: var(--paper);
    color: var(--ink);
    font-family: inherit;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: var(--shadow-1);
  }
  :global(.tg-row .tg:hover[data-state="off"]) {
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-2);
  }
  :global(.tg-row .tg:active) {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 var(--ink);
  }
  :global(.tg-row .tg[data-state="on"]) {
    background: var(--ink);
    color: var(--paper);
  }
  :global(.tg-row .tg:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
</style>
