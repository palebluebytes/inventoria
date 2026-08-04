<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id = undefined,
    variant = "default",
    children,
    class: className = "",
  }: {
    id?: string;
    variant?: "default" | "success" | "error" | "warning";
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<span {id} class="badge badge-{variant} {className}">
  {@render children?.()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    padding: var(--space-3xs) var(--space-2xs);
    border-radius: var(--radius);
    font-size: var(--step-n2);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .badge-default {
    background: var(--ink);
    color: var(--paper);
    border: var(--edge-thin);
  }

  .badge-success {
    background: var(--green-bg);
    color: var(--ink);
    border: var(--edge-thin);
  }

  .badge-error {
    background: var(--red-bg);
    color: var(--paper);
    border: var(--edge-thin);
  }

  .badge-warning {
    background: var(--amber-bg);
    color: var(--ink);
    border: var(--edge-thin);
  }
</style>
