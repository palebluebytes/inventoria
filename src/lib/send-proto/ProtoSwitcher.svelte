<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // The rig. Deliberately ugly and obviously not part of the design under
  // review: it cycles the variant, and it decides what the far end DOES so a
  // reviewer can walk into any failure on purpose instead of waiting for one.
  //
  // ← / → cycle variants, except while typing.
  import {
    proto,
    VARIANTS,
    VARIANT_NAME,
    OUTCOME_LABEL,
    type Variant,
  } from "./proto-state.svelte";

  let { variant }: { variant: Variant } = $props();

  function go(step: number) {
    const i = VARIANTS.indexOf(variant);
    const next = VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length];
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.location.href = url.toString();
  }

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    )
      return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  }
</script>

<svelte:window {onkeydown} />

<div class="rig">
  <div class="rig-row">
    <button type="button" onclick={() => go(-1)} aria-label="Previous variant">
      ‹
    </button>
    <span class="rig-name">{VARIANT_NAME[variant]}</span>
    <button type="button" onclick={() => go(1)} aria-label="Next variant">
      ›
    </button>
  </div>
  <div class="rig-row">
    <label>
      far end:
      <select bind:value={proto.outcome}>
        {#each Object.entries(OUTCOME_LABEL) as [k, v] (k)}
          <option value={k}>{v}</option>
        {/each}
      </select>
    </label>
    <button type="button" onclick={() => proto.fillInbox()}>fill inbox</button>
    <button type="button" onclick={() => proto.reset()}>reset</button>
  </div>
</div>

<style>
  /* stylelint-disable color-no-hex, declaration-property-value-disallowed-list
     -- ADR-0038's tokens exist so the app looks like one thing. The rig must
     look like the opposite: a reviewer has to be able to tell at a glance that
     this bar is not part of the design being judged, and every token in the
     palette would make it blend in. Raw hex is the point, and this file is
     deleted with the rest of the prototype. */
  .rig {
    position: fixed;
    left: 50%;
    bottom: var(--space-2xs);
    transform: translateX(-50%);
    z-index: 900;
    display: grid;
    gap: 0.25rem;
    padding: 0.35rem 0.5rem;
    background: #ff3399;
    color: #fff;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 0 #000;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    max-width: calc(100vw - 1rem);
  }
  .rig-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }
  .rig-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button,
  select {
    font: inherit;
    background: #fff;
    color: #000;
    border: 1px solid #000;
    padding: 0 0.35rem;
    cursor: pointer;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>
