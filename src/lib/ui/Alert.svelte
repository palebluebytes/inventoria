<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    variant = "info",
    children,
    class: className = "",
  }: {
    variant?: "success" | "error" | "info" | "warning";
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div class="alert alert-{variant} {className}" role="alert">
  <div class="icon">
    {#if variant === "success"}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><polyline points="20 6 9 17 4 12"></polyline></svg
      >
    {:else if variant === "error"}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><circle cx="12" cy="12" r="10"></circle><line
          x1="15"
          y1="9"
          x2="9"
          y2="15"
        ></line><line x1="9" y1="9" x2="15" y2="15"></line></svg
      >
    {:else if variant === "warning"}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path
          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        ></path><line x1="12" y1="9" x2="12" y2="13"></line><line
          x1="12"
          y1="17"
          x2="12.01"
          y2="17"
        ></line></svg
      >
    {:else}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><circle cx="12" cy="12" r="10"></circle><line
          x1="12"
          y1="16"
          x2="12"
          y2="12"
        ></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg
      >
    {/if}
  </div>
  <div class="content">
    {@render children?.()}
  </div>
</div>

<style>
  .alert {
    display: flex;
    align-items: flex-start;
    gap: var(--space-xs);
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius);
    font-size: var(--step-n1);
    margin-top: var(--space-xs);
    border: 1px solid transparent;
    border-left-width: 4px;
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .icon {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: 2px;
  }

  .content {
    flex: 1;
    line-height: 1.5;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .alert-error {
    background: var(--red-bg);
    color: var(--paper);
    border-color: var(--ink);
    border-left-color: var(--ink);
  }
  .alert-error .icon {
    color: var(--paper);
  }

  .alert-success {
    background: var(--green-bg);
    color: var(--ink);
    border-color: var(--ink);
    border-left-color: var(--ink);
  }
  .alert-success .icon {
    color: var(--ink);
  }

  .alert-warning {
    background: var(--amber-bg);
    color: var(--ink);
    border-color: var(--ink);
    border-left-color: var(--ink);
  }
  .alert-warning .icon {
    color: var(--ink);
  }

  .alert-info {
    background: #fafafa;
    color: var(--ink);
    border-color: var(--ink);
    border-left-color: var(--ink);
  }
  .alert-info .icon {
    color: var(--ink);
  }
</style>
