<script lang="ts">
  import type { EndingWords } from "../p2p/ending-words";
  import Disclosure from "../ui/Disclosure.svelte";

  // How an act in a room ended, whichever end of it you are (ADR-0074 §6).
  //
  // **One line, with the technical cause behind a "show why".** The words are
  // `send-words.ts`'s on the sender's screen, `receive-words.ts`'s on the
  // recipient's and `pairing-words.ts`'s on the root's, and the three say
  // different things on purpose; the shape they are printed in is one shape,
  // because the argument for it — read by somebody standing in front of the
  // other device, who needs to know it did not work rather than which clause
  // fired — is the same argument on every one of them.
  //
  // It is jar-wide rather than Rations' for that last reason: pairing is the
  // root's act (ADR-0096 §8) and prints this same shape.
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

  // The region's id. `ui/Disclosure` requires one, which is exactly the defect
  // this file had: it shipped `aria-expanded` with no `aria-controls` at all,
  // so the button announced itself as expanded while pointing at nothing.
  const causeId = `ending-cause-${crypto.randomUUID().slice(0, 8)}`;
</script>

<div class="outcome" class:ok>
  <p class="big" role="status">{words.line}</p>
</div>
<p class="fine">{words.detail}</p>
{#if words.cause}
  <!-- The wrapper is this file's scoped ancestor, and exists for that: a class
       handed to a component carries no scoping hash, so the rule dressing the
       trigger has to reach it through `:global` under a box written here. -->
  <div class="why-block">
    <Disclosure
      class="why"
      mark={null}
      title={showCause ? "Hide why" : "Show why"}
      open={showCause}
      controls={causeId}
      onToggle={() => (showCause = !showCause)}
    />
    <p id={causeId} class="cause" hidden={!showCause}>{words.cause}</p>
  </div>
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
  /* Placement and voice, not the control: `ui/Disclosure` carries the floor,
     the bare frame, the focus ring and the label's alignment. The mark is
     switched off here because the label *is* the mark — the words flip between
     Show and Hide, and a caret beside them would say the same thing twice. */
  .why-block :global(.why) {
    margin-top: var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
    text-decoration: underline;
  }
  /* `hidden` collapses the cause; the attribute is what the trigger's
     `aria-expanded` describes, so it leaves the accessibility tree with it.
     Before #316 this region was an `{#if}` and the trigger had no
     `aria-controls` to name it with. */
  .cause[hidden] {
    display: none;
  }
  .cause {
    margin: var(--space-3xs) 0 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    color: var(--text-muted);
  }
</style>
