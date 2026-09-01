<script lang="ts">
  import { readPastedLink } from "../../p2p/pasted-link";
  import type { SendCode } from "../../p2p/send-code";
  import Alert from "../../ui/Alert.svelte";
  import Input from "../../ui/Input.svelte";

  // **The paste affordance on the Scan way in** (ADR-0082 §13).
  //
  // A pasted code is neither a boot URL nor something a camera saw, so it needs
  // somewhere; it joins the Scan way in, which already accepts a code that
  // turns out not to be a barcode. **On every platform, not iOS alone** — a
  // platform conditional is two behaviours to build, test and explain, and what
  // it would save is a text field.
  //
  // **No placeholder** (ADR-0082 §12). The label says a link is pasted here;
  // nothing invites anyone to type a code, because the narrowed rule is that no
  // code a human is expected to reproduce may exist, and a placeholder showing
  // one is exactly that invitation.
  //
  // **Nothing reads the pasteboard** (§11.10). There is no "paste for me"
  // button, and `navigator.clipboard.readText()` is not called anywhere in this
  // app. The person pastes; this reads the field.
  let {
    onMealCode,
  }: {
    /** Opens the Receiving surface on a pasted code, as a scan does. */
    onMealCode: (code: SendCode) => void;
  } = $props();

  // localhost/PWA is always a secure context, so randomUUID exists. The id is
  // minted here rather than taken from `StagerIds`, because the label needs one
  // and no host has an e2e selector pointed at it — `data-testid` is what the
  // suite reaches for.
  const fieldId = `meal-link-${crypto.randomUUID()}`;

  let pasted = $state("");
  let refused = $state("");

  /**
   * Reads on every input rather than on Enter or a button.
   *
   * A paste from the platform's own menu fires no key event, and a phone's
   * keyboard has no reliable Enter here, so a field that waited for one would
   * be a field that silently did nothing for the gesture it exists to serve.
   * The value is read off the event rather than off the bound state, because
   * the binding and this handler both run on the same event and their order is
   * not a thing to depend on.
   */
  function read(e: Event & { currentTarget: HTMLInputElement }) {
    const link = readPastedLink(e.currentTarget.value);
    if (link.kind === "meal") {
      refused = "";
      // The field is emptied before the surface opens: it holds a live
      // single-use secret, and the code has left for somewhere that owns it.
      pasted = "";
      e.currentTarget.value = "";
      onMealCode(link.code);
      return;
    }
    refused = link.kind === "refused" ? link.line : "";
  }
</script>

<div class="meal-link" data-testid="meal-link-field">
  <label for={fieldId}>Handed a meal link? Paste it here.</label>
  <Input id={fieldId} bind:value={pasted} oninput={read} />
  {#if refused}
    <Alert variant="warning">{refused}</Alert>
  {/if}
</div>

<style>
  .meal-link {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    margin-top: var(--space-s);
    text-align: left;
  }
  label {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
</style>
