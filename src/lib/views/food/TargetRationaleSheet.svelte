<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import type { TargetRationale } from "../../food/target-rationale";

  // The "Why these defaults?" info sheet (ADR-0033 §5, ticket #46): renders one
  // baked rationale — reasoning plus full citations and clickable source links —
  // in the same BottomSheet primitive the calculator uses. It is a pure reader:
  // it owns no state beyond its own open flag, and the parent unmounts it on close
  // (mirroring CalorieCalculatorSheet) so a fresh sheet slides in each time.
  let {
    rationale,
    onClose,
  }: {
    rationale: TargetRationale;
    onClose: () => void;
  } = $props();

  let open = $state(true);
</script>

<BottomSheet
  bind:isOpen={open}
  {onClose}
  title={rationale.title}
  class="target-rationale"
>
  {#snippet children()}
    <p class="lead">{rationale.lead}</p>

    {#each rationale.blocks as block, i (i)}
      {#if block.kind === "para"}
        <p class="para">{block.text}</p>
      {:else if block.kind === "heading"}
        <h3 class="subhead">{block.text}</h3>
      {:else if block.kind === "list"}
        <ul class="list">
          {#each block.items as item, j (j)}
            <li>{item}</li>
          {/each}
        </ul>
      {/if}
    {/each}

    <h3 class="subhead">Sources</h3>
    <ul class="sources">
      {#each rationale.sources as src, k (k)}
        <li>
          <a href={src.url} target="_blank" rel="noopener noreferrer"
            >{src.label}</a
          >
        </li>
      {/each}
    </ul>

    <p class="doc-note">
      Transcribed from <code>{rationale.referenceDoc}</code>.
    </p>
  {/snippet}
</BottomSheet>

<style>
  .lead {
    margin: 0 0 var(--space-m);
    font-size: var(--step-0);
    font-weight: 600;
    line-height: 1.45;
    color: #000;
  }
  .subhead {
    margin: var(--space-m) 0 var(--space-2xs);
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #000;
  }
  .para {
    margin: 0 0 var(--space-s);
    font-size: var(--step-n1);
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .list {
    margin: 0 0 var(--space-s);
    padding-left: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .list li {
    font-size: var(--step-n1);
    line-height: 1.45;
    color: var(--text-secondary);
  }
  /* Sources: a plain reference list with underlined, black links that open in a
     new tab. Brutalist — no chips, just cited text and a clickable primary link. */
  .sources {
    margin: 0 0 var(--space-m);
    padding-left: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .sources li {
    font-size: var(--step-n2);
    line-height: 1.4;
  }
  .sources a {
    color: #000;
    font-weight: 700;
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 2px;
    overflow-wrap: anywhere;
  }
  .sources a:hover {
    background: var(--green-bg, #ccff00);
  }
  .sources a:focus-visible {
    outline: 2px solid #000;
    outline-offset: 2px;
  }
  .doc-note {
    margin: var(--space-m) 0 0;
    font-size: var(--step-n2);
    font-style: italic;
    color: var(--text-muted);
  }
  .doc-note code {
    font-family: monospace;
    font-style: normal;
  }
</style>
