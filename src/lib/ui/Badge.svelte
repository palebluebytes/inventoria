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
    border-radius: 0;
    font-size: var(--step-n2);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .badge-default {
    background: #000;
    color: #fff;
    border: 1px solid #000;
  }

  .badge-success {
    background: var(--green-bg);
    color: var(--green);
    border: 1px solid #000;
  }

  .badge-error {
    background: var(--red-bg);
    color: var(--red);
    border: 1px solid #000;
  }

  .badge-warning {
    background: var(--amber-bg);
    color: var(--amber);
    border: 1px solid #000;
  }
</style>
