<script lang="ts">
  import Modal from "./Modal.svelte";
  import BottomSheet from "./BottomSheet.svelte";

  // A dev/e2e-only harness (mounted via `?demo=bottomsheet`) that exercises the
  // two shapes issue #17 added to BottomSheet: a docked footer alongside the
  // scrollable body, and a sheet raised over a parent bits-ui dialog. It logs
  // nothing and touches no ledger — it only proves the primitive's new surface.
  let parentOpen = $state(false);
  let sheetOpen = $state(false);

  // Footer interactions. If the sheet were click-through (the bug the primitive
  // now absorbs), tapping these over the parent dialog would do nothing — so the
  // counters double as the interactivity assertion.
  const methods = ["search", "scan", "custom"] as const;
  let method = $state<(typeof methods)[number]>("search");
  let primaryCount = $state(0);

  // A parent-dialog button sitting behind the sheet: if a tap fell *through* the
  // sheet it would land here, so this counter staying at 0 proves it didn't.
  let parentHits = $state(0);

  const rows = Array.from({ length: 30 }, (_, i) => `Body row ${i + 1}`);
</script>

<div class="demo">
  <h1>BottomSheet demo</h1>
  <button id="demo-open-parent" onclick={() => (parentOpen = true)}
    >Open parent dialog</button
  >
</div>

{#if parentOpen}
  <Modal bind:open={parentOpen} title="Parent dialog">
    {#snippet children({ props, close })}
      <div {...props} class="parent-card">
        <header>
          <h2>Parent dialog</h2>
          <button onclick={close} aria-label="Close parent">✕</button>
        </header>
        <p>
          This is a bits-ui dialog. Raising the sheet over it puts
          <code>pointer-events: none</code> on the body — the sheet must stay live.
        </p>
        <button id="demo-open-sheet" onclick={() => (sheetOpen = true)}
          >Raise bottom sheet</button
        >
        <!-- Sits under where the sheet renders; a click-through would hit it. -->
        <button
          id="demo-parent-trap"
          class="trap"
          onclick={() => (parentHits += 1)}
          >Parent trap (hits: {parentHits})</button
        >
      </div>
    {/snippet}
  </Modal>
{/if}

<BottomSheet bind:isOpen={sheetOpen} title="Docked sheet">
  <ul class="body-list">
    {#each rows as row (row)}
      <li>{row}</li>
    {/each}
  </ul>

  {#snippet footer({ close })}
    <!-- A docked text field, because that is the shape ADR-0089 §8 guarantees:
         "the header and the dock's field are always visible". The food sheets'
         real dock is a search input above the method switcher (FoodStager's
         `.dock-input`), and the keyboard invariants (#333) assert against a
         field rather than against a button standing in for one. -->
    <label class="dock-input">
      <span class="sr-only">Search</span>
      <input id="demo-dock-field" type="text" placeholder="Search" />
    </label>
    <div class="switcher">
      {#each methods as m}
        <button
          class="method"
          class:on={method === m}
          data-method={m}
          onclick={() => (method = m)}>{m}</button
        >
      {/each}
    </div>
    <p id="demo-method-label">Method: {method}</p>
    <button
      id="demo-primary"
      class="primary"
      onclick={() => (primaryCount += 1)}
      >Primary action (count: {primaryCount})</button
    >
    <button id="demo-sheet-close" class="ghost" onclick={close}>Close</button>
  {/snippet}
</BottomSheet>

<style>
  .demo {
    padding: var(--space-l);
  }
  .parent-card {
    position: fixed;
    inset: 0;
    z-index: 1600;
    background: var(--paper);
    padding: var(--space-l);
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    align-items: flex-start;
  }
  .parent-card header {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  .trap {
    margin-top: auto;
    align-self: stretch;
  }
  .body-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .dock-input {
    display: block;
    margin-bottom: var(--space-2xs);
  }
  .dock-input input {
    width: 100%;
    border: var(--edge);
    background: var(--paper);
    color: var(--ink);
    padding: var(--space-2xs);
    /* 16px floor: under it, iOS Safari zooms the page on focus, which is a
       second way this screen leaves the edge (ADR-0089 §8). */
    font-size: 1rem;
    min-height: var(--tap-min);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .switcher {
    display: flex;
    gap: var(--space-2xs);
  }
  .method {
    flex: 1;
    border: var(--edge);
    background: var(--paper);
    padding: var(--space-2xs);
    text-transform: uppercase;
    font-weight: 700;
    cursor: pointer;
    min-height: 44px;
  }
  .method.on {
    background: var(--ink);
    color: var(--paper);
  }
  .primary {
    width: 100%;
    margin-top: var(--space-2xs);
    background: var(--green-bg);
    border: var(--edge-thick);
    padding: var(--space-s);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 52px;
  }
  .ghost {
    width: 100%;
    margin-top: var(--space-2xs);
    background: none;
    border: var(--edge);
    padding: var(--space-2xs);
    cursor: pointer;
  }
</style>
