<script lang="ts">
  import type { ReceiveOpening } from "../../p2p/receive-link";
  import { sendCodeLink } from "../../p2p/send-code";
  import { mealCodeBrokenWords } from "../../p2p/receive-words";
  import Button from "../../ui/Button.svelte";
  import EndingLine from "./EndingLine.svelte";

  // **A Safari tab on iOS never accepts a meal. It shows the code and says
  // where to put it** (ADR-0082 §2).
  //
  // The link cannot reach the installed app's Ledger — WebKit 181849 and 318623
  // are unchanged, and a Home Screen web app's storage is a separate jar — so
  // this page does not try. It hands the code to a door that already exists.
  //
  // **One wording, no branch, no question** (§5). The page never establishes
  // whether an install exists, because nothing exposes that and nothing will;
  // it shows the same thing to somebody who has the app and to somebody who
  // does not, and the second sentence is addressed to a reader it has not
  // identified, which is why it costs nothing when it is unnecessary. There is
  // no fork here to refuse.
  //
  // **Three things it does not do**, each forced by a rule that already exists:
  //
  //   - **It joins no room.** Nothing on the receive path may touch the relay
  //     before the platform test has run: a page that had opened a socket would
  //     burn one of ADR-0072 §11.1's two and fail the send for a reason the
  //     sender cannot see. That is why this component imports no transport.
  //   - **It opens no Ledger and asks for no persistence** (§8). That one is
  //     the caller's — `App.svelte` skips `dbClient.init` ahead of mounting
  //     this, because the page must not ask the browser to durably keep a jar
  //     it is in the middle of telling you is not yours.
  //   - **The URL is cleaned** (§9), which `takeCodeHandover` did before this
  //     mounted.
  //
  // **No Ledger export here** (§11.8) and **no countdown** (§11.12). The export
  // is refused because the surface has a working path, and a second route
  // offered beside a working one reads as doubt about the first. That reason is
  // this page's own and still holds: the sender's failure surface no longer
  // offers one either (ADR-0072's 2026-09-01 amendment), so §11.8 is now true
  // of every surface rather than of this one. The countdown is not
  // constructible anyway: the code carries a room and a key and no timestamp,
  // so this page cannot know when the room opened.
  let {
    opening,
    /**
     * Where the link is re-minted against — `window.location.origin`, passed in
     * rather than read, because the URL this page was opened on has already
     * been cleaned and a component that reached for a global could not be
     * rendered in a test.
     */
    origin,
  }: {
    /** The code this tab was handed, or the reason it is not one. */
    opening: ReceiveOpening;
    origin: string;
  } = $props();

  // The whole link rather than the bare code, because the field it is going
  // into accepts a full link shape only (ADR-0082 §12): `readSendCode` refuses
  // anything that is not a URL carrying both halves with an exactly-32-byte
  // key.
  const link = $derived(
    opening.kind === "code" ? sendCodeLink(opening.code, origin) : null
  );

  let copied = $state(false);
  let copyFailed = $state(false);

  /**
   * Puts the link on the pasteboard.
   *
   * **Writing only.** `navigator.clipboard.readText()` is refused outright
   * (ADR-0082 §11.10) — the programmatic read is gated three ways and carries
   * two residuals no public source can close, while manual paste is ungated in
   * WebKit and is the mechanism the other end is built on. Nothing in this app
   * reads the pasteboard.
   */
  async function copy() {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      copyFailed = false;
    } catch {
      // A pasteboard that refused, or a browser with no Clipboard API. The code
      // is on screen and selectable, so the recovery is to say so.
      copyFailed = true;
    }
  }
</script>

<main class="handover" data-testid="code-handover">
  <h1 class="title">A MEAL</h1>

  {#if link !== null}
    <p class="code" data-testid="handover-code">{link}</p>

    <Button variant="primary" onclick={copy} data-testid="handover-copy">
      {copied ? "Copied" : "Copy the code"}
    </Button>

    <!-- **A third line the record does not list, and it is a failure line
         rather than a third sentence.** §2 enumerates the code, a control that
         copies it, and two sentences; this appears only when the one control on
         the page did nothing, which is the case ADR-0074 §6 governs everywhere
         else in the flow. Without it the button is a silent dead end, and the
         recovery it names is already built into the markup: the code selects in
         one gesture. -->
    {#if copyFailed}
      <p class="fine">
        Copying did not work here. Select the code above and copy it by hand.
      </p>
    {/if}

    <!-- The two sentences, and there are exactly two. The first is what to do;
         the second is addressed to somebody this page has not identified and
         may not be talking to at all. The app is named rather than called "the
         app", and the name follows whichever Facet holds the meal (§14). -->
    <p class="say">Open Inventoria and paste this into Scan.</p>
    <p class="say">
      If you have not installed it yet, add it to the Home Screen first and come
      back.
    </p>
  {:else if opening.kind === "broken"}
    <!-- Read locally before saying anything, because `readSendCode` is pure and
         touches nothing, and a truncated link should be refused where it is
         read rather than after a person has carried it into another app. One
         line with the cause behind a disclosure, which is ADR-0074 §6's shape
         unchanged. -->
    <EndingLine words={mealCodeBrokenWords(opening.reason)} />
  {/if}
</main>

<style>
  .handover {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    max-width: 32rem;
    margin: 0 auto;
    padding: var(--space-l) var(--space-m);
    text-align: center;
  }
  .title {
    margin: 0 0 var(--space-xs);
    font-size: var(--step-2);
    letter-spacing: 0.02em;
  }
  /* The code is the thing on this page, so it reads as a code: monospaced,
     wrapping rather than truncating (a link with half its key hidden is a link
     somebody will copy wrong by hand), and selectable in one gesture for the
     browser that refused the copy button. */
  .code {
    width: 100%;
    margin: 0 0 var(--space-s);
    padding: var(--space-xs);
    border: var(--edge-thin);
    background: var(--bg-input);
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    line-height: 1.4;
    overflow-wrap: anywhere;
    user-select: all;
  }
  .say {
    margin: var(--space-xs) 0 0;
  }
  .fine {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
</style>
