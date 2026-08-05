<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  // The canonical action primitive. It carries the ADR-0038 brutalist frame
  // (hard edge, square corner, offset shadow) so call sites adopt one look
  // instead of re-deriving it. The opinionated axes are `variant` (the four
  // semantic looks — the green-commit / red-danger tones are folded IN, not a
  // free `tone` prop) and `size`; everything else about layout (width, margins)
  // is the caller's `class`. `...rest` is the a11y/semantics escape hatch
  // (aria-*, title, data-*), NOT a styling channel.
  let {
    id = undefined,
    variant = "primary",
    size = "md",
    disabled = false,
    loading = false,
    type = "button",
    onclick,
    children,
    class: className = "",
    ...rest
  }: {
    id?: string;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    class?: string;
  } & Omit<HTMLButtonAttributes, "type"> = $props();
</script>

<button
  {...rest}
  {id}
  {type}
  class="btn btn-{variant} btn-{size} {className}"
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
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    position: relative;
    overflow: hidden;
    /* The brutalist frame: hard edge, square corner (ADR-0038). */
    border: var(--edge);
    border-radius: var(--radius);
    transition:
      transform 0.1s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.1s cubic-bezier(0.4, 0, 0.2, 1),
      background 0.15s ease,
      color 0.15s ease;
  }

  /* One unified brutalist focus ring — a hard offset outline, shared with the
     pressable Card (ADR-0039). Not the old soft --accent glow. */
  .btn:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* ── Size axis ─────────────────────────────────────────────────────────── */
  .btn-sm {
    padding: var(--space-3xs) var(--space-2xs);
    font-size: var(--step-n2);
  }
  .btn-md {
    padding: var(--space-2xs) var(--space-m);
    font-size: var(--step-n1);
  }
  .btn-lg {
    padding: var(--space-xs) var(--space-l);
    font-size: var(--step-0);
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
    /* A geometric circle, not the brutalist square corner — stays literal. */
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Variant axis ──────────────────────────────────────────────────────── */
  /* The bordered variants carry a subtle offset shadow and press flush into the
     page on :active — the brutalist push. Ghost stays flat. */
  .btn-primary,
  .btn-secondary,
  .btn-danger {
    box-shadow: var(--shadow-1);
  }
  .btn-primary:active:not(:disabled),
  .btn-secondary:active:not(:disabled),
  .btn-danger:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  .btn-primary {
    background: var(--ink);
    color: var(--paper);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--paper);
    color: var(--ink);
  }

  .btn-secondary {
    background: var(--paper);
    color: var(--ink);
  }
  .btn-secondary:hover:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }

  /* Danger folds the red destructive tone into the variant. */
  .btn-danger {
    background: var(--red-bg);
    color: var(--paper);
  }
  .btn-danger:hover:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }

  /* Ghost is chromeless — no frame, no shadow — until interacted with. */
  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    border-color: transparent;
    box-shadow: none;
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--accent-glow);
    color: var(--text-primary);
  }
  .btn-ghost:active:not(:disabled) {
    transform: translate(1px, 1px);
  }
</style>
