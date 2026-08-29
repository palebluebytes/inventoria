<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // VARIANT A — a way out in the header.
  //
  // The premise: sending is per-meal and receiving is not, so the two live in
  // different places and the app says so. A sixth square joins the meal header
  // — set apart from the five ways in by a rule, because it is the only one
  // that takes something away — and receiving is a standing control beside
  // Recipes, since a meal arriving is not an event any one meal owns.
  //
  // Its refusal call: ONE line for all of #197 §5's seven, with the technical
  // cause behind a disclosure. The security refusal (#199 §9, the seal) is the
  // one exception, because "someone else answered" is not the same news as
  // "this file is malformed".
  import BottomSheet from "../ui/BottomSheet.svelte";
  import Button from "../ui/Button.svelte";
  import QrBlock from "./QrBlock.svelte";
  import MealBrief from "./MealBrief.svelte";
  import { sum } from "./proto-fixture";
  import { proto, ONE_LINE, INBOX_DEPTH, REFUSALS } from "./proto-state.svelte";

  let showCause = $state(false);
  let copied = $state(false);

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* a prototype does not need a fallback */
    }
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }
</script>

<!-- ── SEND ──────────────────────────────────────────────────────────────── -->
{#if proto.send}
  {@const s = proto.send}
  <BottomSheet
    isOpen
    title="Hand this {s.meal_type} over"
    onClose={() => proto.closeSend()}
  >
    {#if s.phase === "showing"}
      <p class="lead">
        {s.rows}
        {s.rows === 1 ? "food" : "foods"} · {s.calories} kcal · {s.day}
      </p>
      <div class="centre">
        <QrBlock link={s.code.link} size="16rem" />
      </div>
      <p class="say">Let them scan this.</p>
      <p class="or">or, if they are not with you</p>
      <div class="linkrow">
        <code class="link">{s.code.link}</code>
        <Button
          variant="secondary"
          size="sm"
          onclick={() => copyLink(s.code.link)}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p class="fine">
        The link carries the key that opens the meal, so send it the way you
        would send them anything else. It works once, for this send only.
      </p>
      <p class="waiting" role="status">Waiting for them…</p>
    {:else if s.phase === "delivered"}
      <div class="outcome ok">
        <p class="big">They have it.</p>
        <p class="fine">
          Whether they add it to their day is up to them, and Inventoria will
          not tell you either way.
        </p>
      </div>
    {:else if s.phase === "inbox-full"}
      <div class="outcome bad">
        <p class="big">Their inbox is full.</p>
        <p class="fine">
          They have {INBOX_DEPTH} meals waiting already. Nothing was lost — ask them
          to deal with those, then send this again.
        </p>
      </div>
    {:else if s.phase === "relay-down"}
      <div class="outcome bad">
        <p class="big">Inventoria could not reach the relay.</p>
        <p class="fine">
          Nothing has left this device. You can hand the meal over as a file
          instead — they open it from Settings › Import.
        </p>
      </div>
    {:else if s.phase === "refused"}
      <div class="outcome bad">
        <p class="big">They could not read it.</p>
        <p class="fine">
          The code is spent. Send again and Inventoria will make a new one.
        </p>
        <button
          type="button"
          class="cause-toggle"
          aria-expanded={showCause}
          onclick={() => (showCause = !showCause)}
        >
          {showCause ? "Hide" : "Show"} what their device said
        </button>
        {#if showCause}
          <p class="cause">{s.refusal?.cause}</p>
        {/if}
      </div>
    {/if}

    {#snippet footer({ close }: { close: () => void })}
      <div class="dock">
        {#if s.phase === "showing"}
          <Button variant="ghost" onclick={close}>Cancel</Button>
        {:else if s.phase === "delivered"}
          <Button variant="primary" onclick={close}>Done</Button>
        {:else if s.phase === "relay-down"}
          <Button variant="secondary" onclick={close}>
            Export this {s.meal_type} as a file
          </Button>
          <Button variant="primary" onclick={() => proto.sendAgain()}>
            Try again
          </Button>
        {:else}
          <Button variant="ghost" onclick={close}>Close</Button>
          <Button variant="primary" onclick={() => proto.sendAgain()}>
            Send again
          </Button>
        {/if}
      </div>
    {/snippet}
  </BottomSheet>
{/if}

<!-- ── INBOX / RECEIVE ───────────────────────────────────────────────────── -->
{#if proto.uiOpen === "inbox"}
  <BottomSheet
    isOpen
    title="Meals sent to you"
    fillHeight
    onClose={() => {
      proto.uiOpen = null;
      proto.closeReceive();
    }}
  >
    {#if proto.receivePhase === "entry"}
      <p class="lead">Two ways in, and neither of them is typing.</p>
      <div class="doors">
        <button type="button" class="door" onclick={() => proto.codeTaken()}>
          <span class="door-title">Scan their code</span>
          <span class="door-sub">When you are in the same room.</span>
        </button>
        <button type="button" class="door" onclick={() => proto.codeTaken()}>
          <span class="door-title">Paste the link they sent</span>
          <span class="door-sub">When you are not.</span>
        </button>
      </div>
      <button
        type="button"
        class="cause-toggle"
        onclick={() => proto.codeTaken(REFUSALS[2])}
      >
        (rig) paste something that is not a meal
      </button>
    {:else if proto.receivePhase === "verifying"}
      <p class="waiting" role="status">Reading it…</p>
    {:else if proto.receivePhase === "refused"}
      <div class="outcome bad">
        <p class="big">
          {proto.receiveRefusal?.id === "seal"
            ? proto.receiveRefusal.plain
            : proto.receiveRefusal?.id === "inbox-full"
              ? proto.receiveRefusal.plain
              : ONE_LINE}
        </p>
        <p class="fine">Nothing was added to your day.</p>
        <button
          type="button"
          class="cause-toggle"
          aria-expanded={showCause}
          onclick={() => (showCause = !showCause)}
        >
          {showCause ? "Hide" : "Show"} why
        </button>
        {#if showCause}
          <p class="cause">{proto.receiveRefusal?.cause}</p>
        {/if}
      </div>
    {:else}
      {#if proto.inbox.length === 0}
        <p class="lead">Nothing is waiting.</p>
      {:else}
        <ul class="held">
          {#each proto.inbox as p (p.id)}
            <li>
              <button
                type="button"
                class="held-row"
                onclick={() => proto.read(p)}
              >
                <span class="held-head">
                  <span class="held-title">A {p.meal_type}</span>
                  <span class="held-kcal">{sum(p.rows)} kcal</span>
                </span>
                <span class="held-sub">
                  {p.rows.map((r) => r.name.split(",")[0]).join(" · ")}
                </span>
              </button>
            </li>
          {/each}
        </ul>
        <p class="fine">
          {proto.inbox.length} of {INBOX_DEPTH}. A fourth is refused rather than
          pushing one of these out.
        </p>
      {/if}
    {/if}

    {#snippet footer({ close }: { close: () => void })}
      <div class="dock">
        {#if proto.receivePhase === null}
          <Button variant="primary" onclick={() => proto.openReceive()}>
            Receive a meal
          </Button>
        {:else if proto.receivePhase === "held"}
          <Button variant="primary" onclick={() => proto.openReceive()}>
            Receive another
          </Button>
        {:else if proto.receivePhase === "refused"}
          <Button variant="primary" onclick={() => proto.openReceive()}>
            Try another code
          </Button>
        {:else}
          <Button variant="ghost" onclick={close}>Cancel</Button>
        {/if}
      </div>
    {/snippet}
  </BottomSheet>
{/if}

<!-- ── READING ONE, BEFORE ACCEPTING ─────────────────────────────────────── -->
{#if proto.reading}
  {@const p = proto.reading}
  <BottomSheet
    isOpen
    title="A {p.meal_type}"
    elevated
    onBack={() => (proto.reading = null)}
    backLabel="Back"
    onClose={() => (proto.reading = null)}
  >
    <p class="lead">They logged this on {p.senderDay}.</p>
    <MealBrief payload={p} />
    <p class="fine">
      Accepting logs this as your {p.meal_type}, today, at these amounts. The
      recipe comes with it and joins your recipes.
    </p>
    {#snippet footer({ close: _close }: { close: () => void })}
      <div class="dock">
        <Button variant="ghost" onclick={() => proto.discard(p)}>Discard</Button
        >
        <Button variant="primary" onclick={() => proto.accept(p, p.meal_type)}>
          Add to my {p.meal_type}
        </Button>
      </div>
    {/snippet}
  </BottomSheet>
{/if}

<style>
  .lead {
    margin: 0 0 var(--space-2xs);
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }
  .centre {
    display: grid;
    place-items: center;
    margin: var(--space-2xs) 0;
  }
  .say {
    margin: var(--space-2xs) 0 0;
    text-align: center;
    font-weight: 600;
  }
  .or {
    margin: var(--space-xs) 0 var(--space-3xs);
    text-align: center;
    font-size: var(--step-n2);
    color: var(--text-muted);
    text-transform: lowercase;
  }
  .linkrow {
    display: flex;
    gap: var(--space-2xs);
    align-items: center;
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
    margin: var(--space-xs) 0 0;
    text-align: center;
    font-size: var(--step-n1);
    color: var(--text-muted);
  }
  .outcome {
    padding: var(--space-s) 0;
  }
  .big {
    margin: 0;
    font-size: var(--step-1);
    font-weight: 700;
    line-height: 1.15;
  }
  .outcome.ok .big {
    background: var(--green-bg);
    display: inline;
    box-decoration-break: clone;
    padding: 0 var(--space-3xs);
  }
  .outcome.bad .big {
    background: var(--amber-bg);
    display: inline;
    box-decoration-break: clone;
    padding: 0 var(--space-3xs);
  }
  .cause-toggle {
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
  .doors {
    display: grid;
    gap: var(--space-2xs);
  }
  .door {
    display: grid;
    gap: var(--space-3xs);
    text-align: left;
    padding: var(--space-xs);
    background: var(--paper);
    border: var(--edge);
    box-shadow: var(--shadow-1);
    cursor: pointer;
  }
  .door-title {
    font-weight: 700;
  }
  .door-sub {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .held {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2xs);
  }
  .held-row {
    width: 100%;
    display: grid;
    gap: var(--space-3xs);
    text-align: left;
    padding: var(--space-xs);
    background: var(--paper);
    border: var(--edge);
    box-shadow: var(--shadow-1);
    cursor: pointer;
  }
  .held-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2xs);
  }
  .held-title {
    font-weight: 700;
  }
  .held-kcal {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
  }
  .held-sub {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .dock {
    display: flex;
    gap: var(--space-2xs);
    justify-content: flex-end;
  }
</style>
