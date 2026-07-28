<script lang="ts">
  import type { Snippet } from "svelte";
  import Modal from "./Modal.svelte";

  let {
    isOpen = $bindable(false),
    title = "",
    // Renamed to `body` so it isn't shadowed by Modal's own `children` snippet.
    children: body,
    footer,
  }: {
    isOpen?: boolean;
    title?: string;
    children?: Snippet;
    /**
     * Optional docked region pinned below the scrollable body — a method
     * switcher, a primary action, or both. It stays fixed while the body
     * scrolls (the sheet is a flex column; the body flexes, the dock doesn't).
     * Receives `close` so a "Done"/"Cancel" control can dismiss the sheet.
     */
    footer?: Snippet<[{ close: () => void }]>;
  } = $props();
</script>

<Modal
  bind:open={isOpen}
  overlayBg="rgba(0, 0, 0, 0.4)"
  overlayBlur="blur(2px)"
  overlayZ={1700}
  {title}
>
  {#snippet children({ props, close })}
    <div {...props} class="bottom-sheet-content">
      <div class="bottom-sheet-handle-bar">
        <div class="drag-handle"></div>
      </div>

      <div class="bottom-sheet-header">
        <h2>{title}</h2>
        <button class="close-btn" onclick={close} aria-label="Close"
          >&times;</button
        >
      </div>

      <div class="bottom-sheet-body">
        {@render body?.()}
      </div>

      {#if footer}
        <div class="bottom-sheet-footer">
          {@render footer({ close })}
        </div>
      {/if}
    </div>
  {/snippet}
</Modal>

<style>
  /* The backdrop is owned by Modal; the sheet pins itself one z-index above it.
     Both sit above the app's dialog-card layer (bits-ui dialogs render their
     card at 1600), so this sheet can be raised over a parent dialog and float —
     with its own backdrop — above that card. `pointer-events: auto` is the
     other half: an open bits-ui dialog sets `pointer-events: none` on <body>,
     which a nested sheet would otherwise inherit, leaving its buttons visually
     present but click-through. Absorbing both here means callers get correct
     over-dialog behaviour for free. (The hand-rolled food sheets that stack
     higher still — 1700/1800 — will fold onto this primitive later; ADR-0027.) */
  .bottom-sheet-content {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1701;
    pointer-events: auto;
    background: var(--bg-surface, #fff);
    border: 3px solid #000;
    border-bottom: none;
    box-shadow: 0 -8px 0 #000;
    width: 100%;
    max-width: 600px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .bottom-sheet-handle-bar {
    display: flex;
    justify-content: center;
    padding: var(--space-xs) 0 0 0;
    cursor: pointer;
  }

  .drag-handle {
    width: 40px;
    height: 5px;
    background: #000;
    border: 1px solid #000;
  }

  .bottom-sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding: 0 var(--space-m) var(--space-xs) var(--space-m);
    margin-top: var(--space-xs);
  }

  .bottom-sheet-header h2 {
    font-size: var(--step-1);
    font-weight: 700;
    margin: 0;
    text-transform: uppercase;
  }

  .close-btn {
    background: none;
    border: none;
    color: #000;
    font-size: 2rem;
    cursor: pointer;
    line-height: 1;
  }

  .close-btn:hover {
    transform: scale(1.1);
  }

  .bottom-sheet-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-m);
  }

  /* Pinned dock: sits below the body, never scrolls. Mirrors the hand-rolled
     `.dock` / `.foot` chrome in the food sheets so those can later fold onto
     this primitive. */
  .bottom-sheet-footer {
    flex-shrink: 0;
    border-top: 2px solid #000;
    background: #fafafa;
    padding: var(--space-s) var(--space-m);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
  }

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
    }
    to {
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
