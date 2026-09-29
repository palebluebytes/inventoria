<script lang="ts">
  /**
   * The first-use explanation of the app's one readable egress (ADR-0115 §3.2).
   *
   * **It interrupts exactly once and then stays reachable.** The persisted flag
   * decides whether it blocks, never whether it exists — because its retention
   * paragraph is the only place in the app where that disclosure is ever
   * stated, and a strictly one-time sheet would make the app's single honest
   * sentence about its single egress unreachable by design.
   *
   * Built on `ExplainerSheet`, which is the house pattern for a reachable,
   * re-openable explanation. What is different here is that this one can also
   * be the gate: shown before the first send, it carries the two buttons and
   * the send only happens on the affirmative one. Re-opened later from the mark
   * beside the control, it carries neither and is just the explanation.
   */
  import Button from "../../ui/Button.svelte";
  import ExplainerSheet from "./ExplainerSheet.svelte";
  import { MODEL_EGRESS_SHEET } from "../../food/model-copy";

  const {
    gating,
    hasKey,
    onAccept,
    onClose,
  }: {
    /** True on the first-use pass, where this sheet is what stands before a send. */
    gating: boolean;
    /** Whether this device holds an operator key at all. */
    hasKey: boolean;
    onAccept: () => void;
    onClose: () => void;
  } = $props();
</script>

<ExplainerSheet title={MODEL_EGRESS_SHEET.title} class="model-egress" {onClose}>
  <div data-testid="model-egress-sheet">
    <h3>{MODEL_EGRESS_SHEET.heading}</h3>
    {#each MODEL_EGRESS_SHEET.paragraphs as paragraph (paragraph)}
      <p>{paragraph}</p>
    {/each}

    {#if !hasKey}
      <!-- Pressing the control with no key opens this sheet rather than meeting
           a disabled button, which deliberately refuses TMDB's standing Alert:
           that one gates a whole screen, this sits beside a label form that is
           complete without it (ADR-0115 §9.2). -->
      <p class="model-egress-nokey" data-testid="model-egress-nokey">
        {MODEL_EGRESS_SHEET.noKey}
      </p>
    {/if}

    {#if gating && hasKey}
      <div class="model-egress-acts">
        <Button variant="secondary" onclick={onClose}>
          {MODEL_EGRESS_SHEET.decline}
        </Button>
        <Button
          variant="primary"
          data-testid="model-egress-accept"
          onclick={onAccept}
        >
          {MODEL_EGRESS_SHEET.accept}
        </Button>
      </div>
    {/if}
  </div>
</ExplainerSheet>

<style>
  h3 {
    font-size: var(--step-0);
    font-weight: 800;
    color: var(--ink);
    margin: 0 0 var(--space-s);
  }
  p {
    margin: 0 0 var(--space-s);
    line-height: 1.45;
  }
  .model-egress-nokey {
    font-weight: 700;
  }
  .model-egress-acts {
    display: flex;
    gap: var(--space-s);
    justify-content: flex-end;
    margin-top: var(--space-m);
  }
</style>
