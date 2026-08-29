<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // VARIANT B — one handover, two doors.
  //
  // The premise: handing a meal over is ONE thing the app does, learned once,
  // in one place. The meal header keeps its five ways in and gains nothing;
  // a single control beside Recipes opens a sheet whose whole subject is the
  // exchange, and which meal you are sending is chosen inside it — from your
  // real history, in the shape the past-meal picker already taught (ADR-0058).
  //
  // Its refusal call: the smallest honest GROUPING — four lines, not nine and
  // not one. "It did not arrive whole" and "it is not a meal" are different
  // news to a person even though both are #197 §5 refusals.
  import BottomSheet from "../ui/BottomSheet.svelte";
  import Button from "../ui/Button.svelte";
  import Badge from "../ui/Badge.svelte";
  import QrBlock from "./QrBlock.svelte";
  import MealBrief from "./MealBrief.svelte";
  import { sum } from "./proto-fixture";
  import {
    proto,
    GROUP_LINE,
    INBOX_DEPTH,
    REFUSALS,
  } from "./proto-state.svelte";
  import { consumptionStore } from "../stores/calorie.store";
  import { pastMealsFor, dayLabel } from "../food/past-meals";
  import { MEAL_TYPES } from "../food/meal-type";

  /** Which door of the handover sheet is open, if any. */
  let door = $state<null | "send" | "receive">(null);
  let copied = $state(false);

  // Every meal in history, newest first — the thing a sender picks from. Built
  // from the real ledger projection so the picker has the density the shipped
  // past-meal sheet has, rather than a fixture's tidy three rows.
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

  function closeAll() {
    proto.uiOpen = null;
    door = null;
    proto.closeSend();
    proto.closeReceive();
  }
</script>

{#if proto.uiOpen === "handover"}
  <BottomSheet
    isOpen
    title={door === null
      ? "Handover"
      : door === "send"
        ? "Send a meal"
        : "Receive a meal"}
    fillHeight
    onBack={door === null
      ? undefined
      : () => {
          door = null;
          proto.closeSend();
          proto.closeReceive();
        }}
    backLabel="Handover"
    onClose={closeAll}
  >
    <!-- ── the two doors ─────────────────────────────────────────────────── -->
    {#if door === null}
      <p class="lead">
        A meal crosses from one phone to another while you are both here. It
        never touches an account, and nothing about it is stored anywhere in
        between.
      </p>
      <div class="doors">
        <button
          type="button"
          class="door"
          onclick={() => {
            door = "send";
            proto.openPicker();
          }}
        >
          <span class="door-title">Send a meal <span class="chev">›</span></span
          >
          <span class="door-sub">
            Pick one you have logged. They get a code to scan, or a link.
          </span>
        </button>
        <button
          type="button"
          class="door"
          onclick={() => {
            door = "receive";
            if (proto.inbox.length === 0) proto.openReceive();
          }}
        >
          <span class="door-title">
            Receive a meal <span class="chev">›</span>
            {#if proto.inbox.length}
              <Badge variant="default">{proto.inbox.length} waiting</Badge>
            {/if}
          </span>
          <span class="door-sub">
            Scan their code, or open the link they sent you.
          </span>
        </button>
      </div>

      <!-- ── SEND ─────────────────────────────────────────────────────────── -->
    {:else if door === "send"}
      {#if proto.send?.phase === "picking"}
        {#if allMeals.length === 0}
          <p class="lead">You have not logged a meal yet.</p>
        {:else}
          <ul class="picker">
            {#each allMeals.slice(0, 20) as meal (meal.date.getTime() + meal.meal_type)}
              <li>
                <button
                  type="button"
                  class="pick-row"
                  onclick={() =>
                    proto.startSend(
                      meal.meal_type,
                      dayLabel(meal.date),
                      meal.items.length,
                      Math.round(meal.calories)
                    )}
                >
                  <span class="pick-head">
                    <span class="pick-when">
                      {dayLabel(meal.date)} · {meal.meal_type}
                    </span>
                    <span class="pick-kcal">
                      {Math.round(meal.calories)} kcal
                    </span>
                  </span>
                  <span class="pick-sub">
                    {meal.items
                      .map((i) => i.foodName || "Unknown food")
                      .join(" · ")}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if proto.send?.phase === "showing"}
        {@const s = proto.send}
        <p class="lead">{s.day} · {s.meal_type} · {s.calories} kcal</p>
        <div class="centre"><QrBlock link={s.code.link} size="15rem" /></div>
        <p class="say">Let them scan this.</p>
        <div class="linkrow">
          <code class="link">{s.code.link}</code>
          <Button
            variant="secondary"
            size="sm"
            onclick={() => copyLink(s.code.link)}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <p class="fine">
          The link opens the meal, so treat it as the meal. It works once.
        </p>
        <p class="waiting" role="status">Waiting for them…</p>
      {:else if proto.send}
        {@const s = proto.send}
        <div class="outcome" class:ok={s.phase === "delivered"}>
          <p class="big">
            {#if s.phase === "delivered"}They have it.
            {:else if s.phase === "inbox-full"}Their inbox is full.
            {:else if s.phase === "relay-down"}Inventoria could not reach the
              relay.
            {:else}They could not read it.{/if}
          </p>
          <p class="fine">
            {#if s.phase === "delivered"}
              What they do with it is theirs. Inventoria will not tell you.
            {:else if s.phase === "inbox-full"}
              {INBOX_DEPTH} meals are already waiting on their device. Nothing was
              lost — ask them to clear it and send again.
            {:else if s.phase === "relay-down"}
              Nothing left this device. Hand it over as a file instead, and they
              open it from Settings › Import.
            {:else}
              {GROUP_LINE[s.refusal?.group ?? "not-a-meal"]} The code is spent.
            {/if}
          </p>
        </div>
      {/if}

      <!-- ── RECEIVE ──────────────────────────────────────────────────────── -->
    {:else if proto.receivePhase === "entry"}
      <p class="lead">Scan it, or paste the link. There is nothing to type.</p>
      <div class="doors">
        <button type="button" class="door" onclick={() => proto.codeTaken()}>
          <span class="door-title">Scan their code</span>
          <span class="door-sub">You are both in the same room.</span>
        </button>
        <button type="button" class="door" onclick={() => proto.codeTaken()}>
          <span class="door-title">Paste their link</span>
          <span class="door-sub">You are not.</span>
        </button>
      </div>
      <button
        type="button"
        class="rig"
        onclick={() => proto.codeTaken(REFUSALS[3])}
      >
        (rig) paste something that did not arrive whole
      </button>
    {:else if proto.receivePhase === "verifying"}
      <p class="waiting" role="status">Reading it…</p>
    {:else if proto.receivePhase === "refused"}
      <div class="outcome">
        <p class="big">
          {proto.receiveRefusal?.id === "inbox-full"
            ? proto.receiveRefusal.plain
            : GROUP_LINE[proto.receiveRefusal?.group ?? "not-a-meal"]}
        </p>
        <p class="fine">Nothing was added to your day.</p>
      </div>
    {:else if proto.inbox.length === 0}
      <p class="lead">Nothing is waiting.</p>
    {:else}
      <ul class="picker">
        {#each proto.inbox as p (p.id)}
          <li>
            <button
              type="button"
              class="pick-row"
              onclick={() => proto.read(p)}
            >
              <span class="pick-head">
                <span class="pick-when">A {p.meal_type}</span>
                <span class="pick-kcal">{sum(p.rows)} kcal</span>
              </span>
              <span class="pick-sub">
                {p.rows.map((r) => r.name.split(",")[0]).join(" · ")}
              </span>
            </button>
          </li>
        {/each}
      </ul>
      <p class="fine">
        {proto.inbox.length} of {INBOX_DEPTH} waiting. A fourth is refused rather
        than pushing one of these out.
      </p>
    {/if}

    {#snippet footer({ close }: { close: () => void })}
      <div class="dock">
        {#if door === null}
          <Button variant="ghost" onclick={close}>Close</Button>
        {:else if door === "send" && proto.send?.phase === "showing"}
          <Button variant="ghost" onclick={() => proto.openPicker()}>
            Pick another meal
          </Button>
        {:else if door === "send" && proto.send && proto.send.phase !== "picking"}
          {#if proto.send.phase === "relay-down"}
            <Button variant="secondary" onclick={close}>Export as a file</Button
            >
          {/if}
          {#if proto.send.phase === "delivered"}
            <Button variant="primary" onclick={close}>Done</Button>
          {:else}
            <Button variant="primary" onclick={() => proto.sendAgain()}>
              Send again
            </Button>
          {/if}
        {:else if door === "receive" && proto.receivePhase === "refused"}
          <Button variant="primary" onclick={() => proto.openReceive()}>
            Try another code
          </Button>
        {:else if door === "receive" && proto.receivePhase !== "entry"}
          <Button variant="secondary" onclick={() => proto.openReceive()}>
            Receive another
          </Button>
        {/if}
      </div>
    {/snippet}
  </BottomSheet>
{/if}

<!-- Reading one, over the handover sheet. -->
{#if proto.reading}
  {@const p = proto.reading}
  <BottomSheet
    isOpen
    title="A {p.meal_type}"
    elevated
    onBack={() => (proto.reading = null)}
    onClose={() => (proto.reading = null)}
  >
    <p class="lead">They logged this on their {p.senderDay}.</p>
    <MealBrief payload={p} />
    <p class="fine">
      This becomes your {p.meal_type}, today, at these amounts — yours to edit
      or remove like anything else you log.
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
    margin: 0 0 var(--space-xs);
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }
  .doors {
    display: grid;
    gap: var(--space-xs);
  }
  .door {
    display: grid;
    gap: var(--space-3xs);
    text-align: left;
    padding: var(--space-s);
    background: var(--paper);
    border: var(--edge);
    box-shadow: var(--shadow-2);
    cursor: pointer;
  }
  .door-title {
    font-size: var(--step-0);
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
  }
  .chev {
    color: var(--text-muted);
  }
  .door-sub {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .picker {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2xs);
  }
  .pick-row {
    width: 100%;
    display: grid;
    gap: var(--space-3xs);
    text-align: left;
    padding: var(--space-xs);
    background: var(--paper);
    border: var(--edge-thin);
    cursor: pointer;
  }
  .pick-row:hover {
    box-shadow: var(--shadow-1);
  }
  .pick-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2xs);
    font-weight: 700;
  }
  .pick-when {
    text-transform: capitalize;
  }
  .pick-kcal {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    font-weight: 400;
  }
  .pick-sub {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .centre {
    display: grid;
    place-items: center;
    margin: var(--space-2xs) 0;
  }
  .say {
    margin: var(--space-2xs) 0 var(--space-xs);
    text-align: center;
    font-weight: 600;
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
    background: var(--amber-bg);
    display: inline;
    box-decoration-break: clone;
    padding: 0 var(--space-3xs);
  }
  .outcome.ok .big {
    background: var(--green-bg);
  }
  .rig {
    margin-top: var(--space-s);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n3);
    color: var(--text-muted);
    text-decoration: underline;
    cursor: pointer;
  }
  .dock {
    display: flex;
    gap: var(--space-2xs);
    justify-content: flex-end;
  }
</style>
