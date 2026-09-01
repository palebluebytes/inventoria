<script lang="ts">
  import { onMount } from "svelte";
  import Button from "../../ui/Button.svelte";
  import EndingLine from "./EndingLine.svelte";
  import SendCodeSymbol from "./SendCodeSymbol.svelte";
  import { formatCalories } from "../../food/nutrient-display";
  import { buildMealPayload } from "../../p2p/meal-payload";
  import { ledgerEntityRows } from "../../p2p/ledger-rows";
  import { sendMealPayload } from "../../p2p/meal-send";
  import {
    burnSendCode,
    mintSendCode,
    sendCodeLink,
    type SendCode,
  } from "../../p2p/send-code";
  import { writeDate } from "../../p2p/send-date";
  import {
    MEAL_DELIVERED,
    sendEndingWords,
    type SendWords,
  } from "../../p2p/send-words";

  // **What a nutrition panel turns into while it is being handed over**
  // (ADR-0074 §2 and §3): the code, the wait, and the one line that ends it.
  //
  // Two panels mount this and neither owns it — a meal's own panel, and the
  // full day's. That is the point of the file rather than a convenience: the
  // day's way out has to show the *same* code face, and a second copy of a live
  // secret's lifecycle is the last thing to keep in step by hand.
  //
  // **Mounting starts the send and unmounting cancels it.** The session is this
  // component's whole life, so every route out of the panel above — the close
  // button, Escape, the backdrop, a Tab change that unmounts the food screen —
  // ends it without any of them knowing they did. Cancelling burns the code
  // (ADR-0072 §6.3), which is why the teardown does it rather than trusting the
  // session: a code drawn and shown while the socket was still being dialled
  // comes back as an unreachable relay, which is deliberately not a burn there,
  // and it must not outlive the screen that showed it.
  let {
    roots,
    foods,
    calories,
    date,
    calorieDecimals,
  }: {
    /** The Consumption Events being handed over: one meal's, or a whole day's. */
    roots: string[];
    /** How many foods are in them, and their total, for the line above the code. */
    foods: number;
    calories: number;
    /** The day they were logged on — what the face writes (ADR-0074 §7). */
    date: Date;
    calorieDecimals: number;
  } = $props();

  let code = $state<SendCode | null>(null);
  let ended = $state<SendWords | null>(null);
  let copied = $state<"yes" | "no" | null>(null);

  /** Live while a send is. */
  let session: AbortController | null = null;

  let link = $derived(code ? sendCodeLink(code, location.origin) : null);

  onMount(() => {
    void handOver();
    return () => endSession();
  });

  async function handOver() {
    // A send at a time. Nothing on screen can start a second one while one is
    // live — the way out is gone and "Send again" only exists once a session
    // has ended — so this is the invariant stated rather than a case handled.
    endSession();
    const pulled = new AbortController();
    session = pulled;
    code = null;
    ended = null;
    copied = null;
    try {
      // The roots are the Consumption Events themselves; everything else in the
      // payload is reached by walking what they point at.
      const payload = await buildMealPayload(roots, ledgerEntityRows);
      // The code is drawn once there is something to hand over, and not before.
      // The measured shape is gather, then the code, then a human: a symbol on
      // screen while the ledger is still being read is a live secret standing
      // in for work that may yet fail.
      const drawn = mintSendCode();
      code = drawn;
      await sendMealPayload(drawn, payload, { signal: pulled.signal });
      ended = MEAL_DELIVERED;
    } catch (failure) {
      ended = sendEndingWords(failure);
    }
  }

  function endSession() {
    session?.abort();
    session = null;
    if (code) burnSendCode(code);
  }

  async function copyLink(carrier: string) {
    try {
      await navigator.clipboard.writeText(carrier);
      copied = "yes";
    } catch {
      // Refused permission, or no clipboard at all. The link is on screen
      // either way, so this says so rather than claiming a copy that did not
      // happen.
      copied = "no";
    }
  }
</script>

<div class="inset centre" data-testid="meal-send">
  <!-- What is being handed over, once the figures have gone. It writes a date
       rather than "Today" or "Tuesday" (ADR-0074 §7): a second person is looking
       at this screen, and a weekday names nothing across two devices while
       "Today" is a claim about whose day. -->
  <p class="kicker">
    {foods}
    {foods === 1 ? "food" : "foods"} · {formatCalories(
      calories,
      calorieDecimals
    )} · {writeDate(date)}
  </p>

  {#if !ended}
    <!-- The symbol's own placeholder stands in while the ledger is read, which
         is the whole of the 155 ms before a code exists. -->
    <SendCodeSymbol {link} />
    {#if link}
      <p class="say">Let them scan this.</p>
      <div class="linkrow">
        <code class="link">{link}</code>
        <Button variant="secondary" size="sm" onclick={() => copyLink(link)}>
          {copied === "yes"
            ? "Copied"
            : copied === "no"
              ? "Cannot copy"
              : "Copy"}
        </Button>
      </div>
      <p class="fine">The link carries the key that opens it. It works once.</p>
      <p class="waiting" role="status">Waiting for them…</p>
    {/if}
  {:else}
    <!-- One line, in the app's voice, with the technical cause behind a "show
         why" (ADR-0074 §6) — the shape both ends of a send print. -->
    <EndingLine words={ended} ok={ended.ending === "delivered"} />
    {#if ended.retry}
      <button type="button" class="plain" onclick={handOver}>
        Send again
      </button>
    {/if}
  {/if}
</div>

<style>
  /* The shared panel's body carries no padding, so a section that is prose
     rather than a card grid insets itself. */
  .inset {
    padding: var(--space-xs) var(--space-m) var(--space-s);
  }
  .centre {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    text-align: center;
  }
  .kicker {
    margin: 0 0 var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .say {
    margin: 0;
    font-weight: 700;
  }
  .linkrow {
    display: flex;
    gap: var(--space-2xs);
    align-items: center;
    width: 100%;
  }
  .link {
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
  .waiting {
    margin: var(--space-2xs) 0 0;
    color: var(--text-muted);
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
</style>
