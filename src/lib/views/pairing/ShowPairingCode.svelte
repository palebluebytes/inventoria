<script lang="ts">
  import Button from "../../ui/Button.svelte";
  import CodeSymbol from "../CodeSymbol.svelte";
  import { writePairingCode, type PairingCode } from "../../p2p/pairing-code";

  // The **Pairing code** as the other device has to see it: a symbol to point a
  // camera at, and the same code in writing to copy (ADR-0096 §8).
  //
  // **Two carriers and no link.** There is no distance to cross between two
  // devices you are holding, and a link would charge the root a receive route,
  // a URL fragment and an ADR-0082 handover page for reach nobody needs. What
  // is drawn and what is written are the same string, so there is one code
  // shape with two carriers rather than two shapes.
  //
  // It draws a code and nothing else. Whether a room is open, what is being
  // waited for and how it ended belong to the section above, which owns the act.
  let { code }: { code: PairingCode } = $props();

  let copied = $state<"yes" | "no" | null>(null);

  const written = $derived(writePairingCode(code));

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(written);
      copied = "yes";
    } catch {
      // Refused permission, or no clipboard at all. The code is on screen
      // either way, so this says so rather than claiming a copy that did not
      // happen.
      copied = "no";
    }
  }
</script>

<div class="centre" data-testid="pairing-code">
  <CodeSymbol text={written} />
  <p class="say">Read this on your other device.</p>
  <div class="coderow">
    <code class="written">{written}</code>
    <Button variant="secondary" size="sm" onclick={copyCode}>
      {copied === "yes" ? "Copied" : copied === "no" ? "Cannot copy" : "Copy"}
    </Button>
  </div>
  <p class="fine">
    This is not a link. It carries no secret of its own, and it works once.
  </p>
</div>

<style>
  .centre {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    text-align: center;
  }
  .say {
    margin: 0;
    font-weight: 700;
  }
  .coderow {
    display: flex;
    gap: var(--space-2xs);
    align-items: center;
    width: 100%;
  }
  .written {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    background: var(--bg-input);
    border: var(--edge-thin);
    padding: var(--space-3xs) var(--space-2xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fine {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
</style>
