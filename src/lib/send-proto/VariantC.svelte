<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // VARIANT C — the exchange takes the screen.
  //
  // The premise: handing a meal over is a thing you do with the phone held up,
  // at arm's length, with someone else looking at it — so it is not a sheet
  // over the food screen, it is a mode the phone enters. Nothing is added to
  // the meal header; the affordances are plain lines of text in the flow of the
  // page, and the surfaces they open have no app chrome at all.
  //
  // Its refusal call: EVERY refusal in its own words. If the app knows why it
  // said no, it says why, and a person who reads nine different sentences over
  // a year learns nine different things about what a meal is.
  import Button from "../ui/Button.svelte";
  import QrBlock from "./QrBlock.svelte";
  import MealBrief from "./MealBrief.svelte";
  import { sum } from "./proto-fixture";
  import { proto, INBOX_DEPTH, REFUSALS } from "./proto-state.svelte";
  import { consumptionStore } from "../stores/calorie.store";
  import { pastMealsFor } from "../food/past-meals";
  import { formatDate } from "./proto-date";
  import { MEAL_TYPES } from "../food/meal-type";

  let copied = $state(false);
  const EPOCH = new Date(0);
  let allMeals = $derived(
    MEAL_TYPES.flatMap((m) => pastMealsFor($consumptionStore, m, EPOCH)).sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    )
  );

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* a prototype does not need a fallback */
    }
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  function leave() {
    proto.uiOpen = null;
    proto.closeSend();
    proto.closeReceive();
    proto.reading = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") leave();
  }
</script>

<svelte:window {onkeydown} />

{#if proto.send || proto.uiOpen === "receive" || proto.reading}
  <div class="takeover" role="dialog" aria-modal="true">
    <button type="button" class="leave" onclick={leave} aria-label="Leave">
      ✕
    </button>

    <!-- ── reading one before accepting ──────────────────────────────────── -->
    {#if proto.reading}
      {@const p = proto.reading}
      <div class="pane">
        <p class="kicker">Sent to you</p>
        <h2 class="title">A {p.meal_type}</h2>
        <p class="sub">They logged it on {p.senderDay}.</p>
        <MealBrief payload={p} />
        <p class="sub">
          Add it and it becomes your {p.meal_type}, today, at these amounts.
        </p>
      </div>
      <div class="bar">
        <Button variant="ghost" onclick={() => proto.discard(p)}>Discard</Button
        >
        <Button
          variant="primary"
          size="lg"
          onclick={() => proto.accept(p, p.meal_type)}
        >
          Add to my {p.meal_type}
        </Button>
      </div>

      <!-- ── SEND ─────────────────────────────────────────────────────────── -->
    {:else if proto.send?.phase === "picking"}
      <div class="pane">
        <h2 class="title">Which meal?</h2>
        <ul class="rows">
          {#each allMeals.slice(0, 20) as meal (meal.date.getTime() + meal.meal_type)}
            <li>
              <button
                type="button"
                class="row"
                onclick={() =>
                  proto.startSend(
                    meal.meal_type,
                    formatDate(meal.date),
                    meal.items.length,
                    Math.round(meal.calories)
                  )}
              >
                <span class="row-when">
                  {formatDate(meal.date)} · {meal.meal_type}
                </span>
                <span class="row-kcal">{Math.round(meal.calories)} kcal</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {:else if proto.send?.phase === "showing"}
      {@const s = proto.send}
      <div class="pane centre">
        <p class="kicker">{s.day} · {s.meal_type} · {s.calories} kcal</p>
        <QrBlock link={s.code.link} size="min(78vw, 22rem)" />
        <p class="hold">Hold it up.</p>
        <p class="sub">Waiting for them…</p>
      </div>
      <div class="bar">
        <Button variant="ghost" size="sm" onclick={() => copyLink(s.code.link)}>
          {copied ? "Link copied" : "Send a link instead"}
        </Button>
        <Button variant="secondary" onclick={leave}>Cancel</Button>
      </div>
    {:else if proto.send}
      {@const s = proto.send}
      <div
        class="pane centre shout"
        class:good={s.phase === "delivered"}
        class:bad={s.phase !== "delivered"}
      >
        <p class="shout-line">
          {#if s.phase === "delivered"}They have it.
          {:else if s.phase === "inbox-full"}Their inbox is full.
          {:else if s.phase === "relay-down"}No route to them.
          {:else}{s.refusal?.plain}{/if}
        </p>
        <p class="sub">
          {#if s.phase === "delivered"}
            You will not hear whether they keep it. That is theirs.
          {:else if s.phase === "inbox-full"}
            {INBOX_DEPTH} meals are already waiting on their device. Nothing was lost.
          {:else if s.phase === "relay-down"}
            Nothing left this phone. Hand it over as a file and they open it
            from Settings › Import.
          {:else}
            The code is spent. A new send makes a new one.
          {/if}
        </p>
      </div>
      <div class="bar">
        {#if s.phase === "relay-down"}
          <Button variant="secondary" onclick={leave}>Export as a file</Button>
        {/if}
        {#if s.phase === "delivered"}
          <Button variant="primary" size="lg" onclick={leave}>Done</Button>
        {:else}
          <Button variant="ghost" onclick={leave}>Close</Button>
          <Button variant="primary" onclick={() => proto.sendAgain()}>
            Send again
          </Button>
        {/if}
      </div>

      <!-- ── RECEIVE ──────────────────────────────────────────────────────── -->
    {:else if proto.receivePhase === "entry"}
      <div class="pane centre">
        <div class="viewfinder" aria-hidden="true">
          <span class="corner tl"></span>
          <span class="corner tr"></span>
          <span class="corner bl"></span>
          <span class="corner br"></span>
          <p class="vf-hint">Point this at their code.</p>
        </div>
      </div>
      <div class="bar column">
        <Button variant="primary" size="lg" onclick={() => proto.codeTaken()}>
          Use the camera
        </Button>
        <Button variant="secondary" onclick={() => proto.codeTaken()}>
          Paste a link instead
        </Button>
        <button
          type="button"
          class="rig"
          onclick={() => proto.codeTaken(REFUSALS[8])}
        >
          (rig) scan a code that is not the one you were shown
        </button>
      </div>
    {:else if proto.receivePhase === "verifying"}
      <div class="pane centre">
        <p class="hold">Reading it…</p>
      </div>
    {:else if proto.receivePhase === "refused"}
      <div class="pane centre shout bad">
        <p class="shout-line">{proto.receiveRefusal?.plain}</p>
        <p class="sub">Nothing was added to your day.</p>
        <p class="cause">{proto.receiveRefusal?.cause}</p>
      </div>
      <div class="bar">
        <Button variant="ghost" onclick={leave}>Close</Button>
        <Button variant="primary" onclick={() => proto.openReceive()}>
          Try again
        </Button>
      </div>

      <!-- ── the inbox as a place you land ─────────────────────────────────── -->
    {:else}
      <div class="pane">
        <h2 class="title">Sent to you</h2>
        {#if proto.inbox.length === 0}
          <p class="sub">Nothing is waiting.</p>
        {:else}
          <ul class="rows">
            {#each proto.inbox as p (p.id)}
              <li>
                <button type="button" class="row" onclick={() => proto.read(p)}>
                  <span class="row-when">A {p.meal_type}</span>
                  <span class="row-kcal">{sum(p.rows)} kcal</span>
                </button>
              </li>
            {/each}
          </ul>
          <p class="sub">
            {proto.inbox.length} of {INBOX_DEPTH}. A fourth is turned away — the
            sender is told, and nothing here is pushed out.
          </p>
        {/if}
      </div>
      <div class="bar">
        <Button variant="primary" size="lg" onclick={() => proto.openReceive()}>
          Receive a meal
        </Button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .takeover {
    position: fixed;
    inset: 0;
    z-index: 400;
    background: var(--paper);
    display: flex;
    flex-direction: column;
    padding: var(--space-m) var(--space-s) var(--space-s);
    overflow-y: auto;
  }
  .leave {
    position: absolute;
    top: var(--space-2xs);
    right: var(--space-2xs);
    width: 2.25rem;
    height: 2.25rem;
    background: none;
    border: 0;
    font-size: var(--step-1);
    line-height: 1;
    cursor: pointer;
  }
  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-height: 0;
  }
  .pane.centre {
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .kicker {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .title {
    margin: 0;
    font-size: var(--step-3);
    line-height: 1;
    text-transform: capitalize;
  }
  .sub {
    margin: 0;
    font-size: var(--step-n1);
    color: var(--text-secondary);
    max-width: 32ch;
  }
  .hold {
    margin: var(--space-s) 0 0;
    font-size: var(--step-2);
    font-weight: 700;
    line-height: 1;
  }
  .shout {
    gap: var(--space-s);
  }
  .shout-line {
    margin: 0;
    font-size: var(--step-3);
    font-weight: 800;
    line-height: 1;
    padding: var(--space-2xs) var(--space-xs);
    border: var(--edge-thick);
    box-shadow: var(--shadow-3);
    max-width: 20ch;
  }
  .shout.good .shout-line {
    background: var(--green-bg);
  }
  .shout.bad .shout-line {
    background: var(--amber-bg);
  }
  .cause {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    color: var(--text-muted);
    max-width: 40ch;
  }
  .rows {
    list-style: none;
    margin: var(--space-2xs) 0 0;
    padding: 0;
    display: grid;
    gap: var(--space-2xs);
  }
  .row {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2xs);
    padding: var(--space-xs);
    background: var(--paper);
    border: var(--edge);
    box-shadow: var(--shadow-1);
    cursor: pointer;
    text-align: left;
  }
  .row-when {
    font-weight: 700;
    text-transform: capitalize;
  }
  .row-kcal {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
  }
  .viewfinder {
    position: relative;
    width: min(76vw, 20rem);
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    background: var(--bg-input);
  }
  .corner {
    position: absolute;
    width: 2.5rem;
    height: 2.5rem;
    border: 0 solid var(--ink);
  }
  .tl {
    top: 0;
    left: 0;
    border-top-width: 4px;
    border-left-width: 4px;
  }
  .tr {
    top: 0;
    right: 0;
    border-top-width: 4px;
    border-right-width: 4px;
  }
  .bl {
    bottom: 0;
    left: 0;
    border-bottom-width: 4px;
    border-left-width: 4px;
  }
  .br {
    bottom: 0;
    right: 0;
    border-bottom-width: 4px;
    border-right-width: 4px;
  }
  .vf-hint {
    margin: 0;
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }
  .bar {
    display: flex;
    gap: var(--space-2xs);
    justify-content: center;
    align-items: center;
    padding-top: var(--space-s);
    border-top: var(--edge);
    margin-top: var(--space-s);
    flex-wrap: wrap;
  }
  .bar.column {
    flex-direction: column;
  }
  .rig {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n3);
    color: var(--text-muted);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
