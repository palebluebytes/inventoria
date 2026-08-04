<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id = undefined,
    variant = "primary",
    disabled = false,
    loading = false,
    type = "button",
    onclick,
    children,
    class: className = "",
  }: {
    id?: string;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<button
  {id}
  {type}
  class="btn btn-{variant} {className}"
  {disabled}
  aria-disabled={disabled || loading}
  {onclick}
>
  {#if loading}
    <span class="spinner"></span>
  {/if}
  <span class="content" class:loading>
    {@render children?.()}
  </span>
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2xs);
    padding: var(--space-2xs) var(--space-m);
    border-radius: var(--radius);
    font-size: var(--step-n1);
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    position: relative;
    overflow: hidden;
    border: 1px solid transparent;
  }

  .btn:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--bg-base),
      0 0 0 4px var(--accent);
  }

  .btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .content {
    transition: opacity 0.2s;
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .content.loading {
    opacity: 0;
  }

  .spinner {
    position: absolute;
    width: 1rem;
    height: 1rem;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Variants */
  .btn-primary {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--paper);
    color: var(--ink);
  }

  .btn-secondary {
    background: transparent;
    border-color: var(--ink);
    color: var(--ink);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }

  .btn-danger {
    background: var(--paper);
    color: var(--ink);
    border-color: var(--ink);
  }
  .btn-danger:hover:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
  }
  .btn-ghost:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.05);
    color: var(--text-primary);
  }
</style>
