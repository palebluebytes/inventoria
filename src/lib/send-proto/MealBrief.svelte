<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // What a recipient can be shown BEFORE accepting, which #197 fixed exactly:
  // the foods, the amounts, the frozen nutrition and the recipe if one is
  // involved — and no photos at all, because `food/label_photos` and
  // `food/photo_base64` never cross (#197 §1.3). So a label-captured food
  // arrives with nothing to look at, and this says so rather than leaving a
  // gap where an image would be.
  //
  // There is no "from" line, anywhere, deliberately (#199 §11): the recipient
  // knows who it is from because they started the receive.
  //
  // Shared by all three variants because it is content, not layout — each
  // variant places it in a surface of its own choosing.
  import Badge from "../ui/Badge.svelte";
  import { sum, type ProtoPayload } from "./proto-fixture";

  let { payload }: { payload: ProtoPayload } = $props();
</script>

<ul class="brief">
  {#each payload.rows as row (row.name)}
    <li class="brief-row">
      <span class="brief-name">
        {row.name}
        {#if row.recipe}
          <Badge variant="default">recipe</Badge>
        {/if}
        {#if row.notRated}
          <Badge variant="default">not rated</Badge>
        {/if}
        {#if row.photoStripped}
          <Badge variant="default">no photo</Badge>
        {/if}
      </span>
      <span class="brief-amt">{row.amount}</span>
      <span class="brief-kcal">{row.calories} kcal</span>
    </li>
  {/each}
</ul>

<p class="brief-total">
  <strong>{sum(payload.rows)} kcal</strong>
  <span
    >{payload.protein_g} g protein · {payload.carbs_g} g carbs · {payload.fat_g}
    g fat</span
  >
</p>

<style>
  .brief {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: var(--edge-thin);
  }
  .brief-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--space-2xs);
    align-items: baseline;
    padding: var(--space-2xs) 0;
    border-bottom: var(--edge-thin);
  }
  .brief-name {
    font-size: var(--step-n1);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3xs);
  }
  .brief-amt,
  .brief-kcal {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .brief-kcal {
    min-width: 5ch;
    text-align: right;
  }
  .brief-total {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2xs);
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .brief-total strong {
    font-family: var(--font-mono);
    color: var(--text-primary);
  }
</style>
