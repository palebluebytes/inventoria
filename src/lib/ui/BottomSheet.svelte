<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";

  let {
    isOpen = $bindable(false),
    title = "",
    children,
  }: {
    isOpen: boolean;
    title?: string;
    children?: Snippet;
  } = $props();

  function close() {
    isOpen = false;
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="bottom-sheet-backdrop"
    onclick={close}
    transition:fade={{ duration: 150 }}
    role="dialog"
    aria-modal="true"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="bottom-sheet-content" onclick={(e) => e.stopPropagation()}>
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
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}

<style>
  .bottom-sheet-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .bottom-sheet-content {
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
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
