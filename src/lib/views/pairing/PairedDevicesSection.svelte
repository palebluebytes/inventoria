<script lang="ts">
  import { onMount } from "svelte";
  import Button from "../../ui/Button.svelte";
  import Card from "../../ui/Card.svelte";
  import EndingLine from "../EndingLine.svelte";
  import ReadPairingCode from "./ReadPairingCode.svelte";
  import ShowPairingCode from "./ShowPairingCode.svelte";
  import { handPairingSecret, takePairingSecret } from "../../p2p/pairing-act";
  import type { PairingCode } from "../../p2p/pairing-code";
  import {
    DEVICES_MET,
    pairingEndingWords,
    type PairingWords,
  } from "../../p2p/pairing-words";
  import { enterRoom, type Room } from "../../p2p/relay-room";
  import { burnRoomCode, mintRoomCode } from "../../p2p/room-code";

  // **Paired devices**, and the act that makes one (ADR-0096 §8, ADR-0084 §6).
  //
  // **It expands in place rather than opening a second surface**, on ADR-0074
  // §3's *the panel turns into the code*: choosing a way in replaces the two
  // controls with the code itself, and there is no second screen to lose your
  // place on. ADR-0075 §4's Devices screen went with the same amendment.
  //
  // **The user picks; capability decides only what is offered.** Both controls
  // are always here — "Read a code" works from a paste on every platform — and
  // the live camera inside the reader is the only part any device can lack.
  //
  // **The list is empty and there is no row to draw yet.** A pairing is not
  // complete until its first sync completes (§2), and #395 is the ticket that
  // completes one; until then nothing is written down on either side, which is
  // guard 1 rather than an omission. So this section ends at *the two devices
  // have met*, and the chains it derived are dropped with the room — an
  // incomplete pairing deposits nothing and collects nothing.

  /** Which face is up: nothing, the code being shown, or the reader. */
  let act = $state<"none" | "showing" | "reading">("none");
  let code = $state<PairingCode | null>(null);
  let ended = $state<PairingWords | null>(null);

  /** Live while an act is. Aborting it is §8's cancel, and it burns the code. */
  let session: AbortController | null = null;

  // Leaving the page ends a live act, the way closing the meal panel ends a
  // send. This card is mounted under every tab and merely hidden, so a tab
  // change is *not* one of those routes and a code survives it — which is
  // right: the person is still in the app, still holding the other device up.
  onMount(() => () => stop());

  function begin(next: "showing" | "reading") {
    // Whatever was live ends first, and it takes its own code with it. The
    // order is the whole of it: a stop after the new code was minted would burn
    // the code it just drew.
    stop();
    ended = null;
    code = null;
    act = next;
    if (next === "showing") {
      const drawn = mintRoomCode();
      code = drawn;
      void run(drawn, (room) => handPairingSecret(room, drawn));
    }
  }

  /** The reader hands up a code the moment it has one, and the act starts. */
  function readACode(read: PairingCode) {
    code = read;
    void run(read, (room) => takePairingSecret(room, read));
  }

  /**
   * One act, in one room, from the dial to whichever ending arrives.
   *
   * The room is entered here and left here because it is this surface's, not
   * `pairing-act.ts`'s: §8's act runs on past the leg below — a vector
   * exchange, chunks both ways, a closing vector — in the *same* room, and the
   * room id is spent, so there is nothing to reopen. #395 continues inside this
   * `try` rather than opening a second room.
   */
  async function run(
    acting: PairingCode,
    leg: (room: Room) => Promise<unknown>
  ) {
    const pulled = new AbortController();
    session = pulled;
    let room: Room | null = null;
    try {
      room = await enterRoom(acting.room, { signal: pulled.signal });
      await leg(room);
      ended = DEVICES_MET;
    } catch (failure) {
      ended = pairingEndingWords(failure);
    } finally {
      room?.leave();
      if (session === pulled) session = null;
    }
  }

  /**
   * §8's cancel: it ends the act and spends the code, wherever it came from.
   *
   * **It burns whether or not a session is live**, which is `SendFace`'s rule
   * and for its reason: a code drawn and shown while the socket was still being
   * dialled comes back as an unreachable relay, which ADR-0072 §6 deliberately
   * does not treat as a use — and it must not outlive the card that showed it
   * either. What stops that burning the code it has *just* minted is the order
   * in {@link begin}, not a guard here.
   */
  function stop() {
    session?.abort();
    session = null;
    if (code) burnRoomCode(code);
  }

  /** The same way in again, whichever one this was. */
  function retry() {
    if (act === "none") return;
    begin(act);
  }

  function close() {
    stop();
    act = "none";
    code = null;
    ended = null;
  }
</script>

<Card class="mt-4">
  <h2>Paired devices</h2>
  <p class="lead">
    Your own devices, kept in step with each other. Nothing here goes through an
    account, and no device is in charge.
  </p>

  {#if act === "none"}
    <!-- No row is drawn because none exists: a pairing writes nothing down on
         either side until its first sync completes (§2). -->
    <p class="empty">No devices are paired.</p>
    <div class="actions">
      <Button id="pair-show-btn" onclick={() => begin("showing")}>
        Show a code
      </Button>
      <Button
        id="pair-read-btn"
        variant="secondary"
        onclick={() => begin("reading")}
      >
        Read a code
      </Button>
    </div>
  {:else if ended}
    <EndingLine words={ended} ok={ended.ending === "met"} />
    <div class="actions">
      {#if ended.retry}
        <Button variant="secondary" onclick={retry}>Try again</Button>
      {/if}
      <Button variant="ghost" onclick={close}>Done</Button>
    </div>
  {:else if act === "showing" && code}
    <div class="face">
      <ShowPairingCode {code} />
      <p class="waiting" role="status">Waiting for your other device…</p>
      <!-- A live code has no back button, because an affordance that looked
           like undo would be one (ADR-0074 §3). What is offered is the cancel
           §8 already has: it ends the act and spends the code. -->
      <Button variant="ghost" onclick={close}>Stop</Button>
    </div>
  {:else if act === "reading"}
    <div class="face">
      {#if code}
        <p class="waiting" role="status">Pairing…</p>
      {:else}
        <ReadPairingCode oncode={readACode} />
      {/if}
      <Button variant="ghost" onclick={close}>Stop</Button>
    </div>
  {/if}
</Card>

<style>
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
    text-transform: uppercase;
    margin: 0;
  }
  .lead {
    margin: var(--space-2xs) 0 0;
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .empty {
    margin: var(--space-s) 0 0;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-style: italic;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-s);
  }
  .face {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }
  .waiting {
    margin: 0;
    color: var(--text-muted);
  }
</style>
