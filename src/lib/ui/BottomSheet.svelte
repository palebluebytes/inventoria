<script lang="ts">
  import type { Snippet } from "svelte";
  import Modal from "./Modal.svelte";

  let {
    isOpen = $bindable(false),
    title = "",
    // Renamed to `body` so it isn't shadowed by Modal's own `children` snippet.
    children: body,
  }: {
    isOpen?: boolean;
    title?: string;
    children?: Snippet;
  } = $props();
</script>

<Modal
  bind:open={isOpen}
  overlayBg="rgba(0, 0, 0, 0.4)"
  overlayBlur="blur(2px)"
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
    </div>
  {/snippet}
</Modal>

<style>
  /* The backdrop is owned by Modal; the sheet pins itself to the bottom one
     z-index above it. */
  .bottom-sheet-content {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
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

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
    }
    to {
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
