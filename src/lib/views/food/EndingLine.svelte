<script lang="ts">
  import type { EndingWords } from "../../p2p/ending-words";

  // How a Meal send ended, on either side of it (ADR-0074 §6).
  //
  // **One line, with the technical cause behind a "show why".** The words are
  // `send-words.ts`'s on the sender's screen and `receive-words.ts`'s on the
  // recipient's, and the two say different things on purpose; the shape they
  // are printed in is one shape, because the argument for it — read by somebody
  // standing in front of the other person, who needs to know it did not work
  // rather than which clause fired — is the same argument on both screens.
  //
  // The disclosure is closed on arrival and forgets it was opened, because each
  // of these is mounted for one ending and replaced rather than updated.
  let {
    words,
    /** Whether this is the good ending, which is the only thing that varies. */
    ok = false,
  }: {
    words: EndingWords;
    ok?: boolean;
  } = $props();

  let showCause = $state(false);
</script>

<div class="outcome" class:ok>
  <p class="big" role="status">{words.line}</p>
</div>
<p class="fine">{words.detail}</p>
{#if words.cause}
  <button
    type="button"
    class="plain"
    aria-expanded={showCause}
    onclick={() => (showCause = !showCause)}
  >
    {showCause ? "Hide" : "Show"} why
  </button>
  {#if showCause}
    <p class="cause">{words.cause}</p>
  {/if}
{/if}

<style>
  .outcome {
    padding: var(--space-s) 0 0;
  }
  .big {
    margin: 0;
    font-size: var(--step-1);
    font-weight: 700;
    line-height: 1.15;
    background: var(--amber-bg);
    padding: 0 var(--space-3xs);
  }
  .outcome.ok .big {
    background: var(--green-bg);
  }
  .fine {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .plain {
    margin-top: var(--space-2xs);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n2);
    color: var(--text-secondary);
    text-decoration: underline;
    cursor: pointer;
  }
  .cause {
    margin: var(--space-3xs) 0 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    color: var(--text-muted);
  }
</style>
