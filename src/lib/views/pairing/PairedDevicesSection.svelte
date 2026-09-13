<script lang="ts">
  import { onMount } from "svelte";
  import Button from "../../ui/Button.svelte";
  import Card from "../../ui/Card.svelte";
  import Input from "../../ui/Input.svelte";
  import Row from "../../ui/Row.svelte";
  import { listOf } from "../../ui/words";
  import EndingLine from "../EndingLine.svelte";
  import ReadPairingCode from "./ReadPairingCode.svelte";
  import ShowPairingCode from "./ShowPairingCode.svelte";
  import { handPairingSecret, takePairingSecret } from "../../p2p/pairing-act";
  import type { PairedChains } from "../../p2p/pairing-chain";
  import type { PairingCode } from "../../p2p/pairing-code";
  import {
    DEVICES_PAIRED,
    pairingEndingWords,
    type PairingReach,
    type PairingWords,
  } from "../../p2p/pairing-words";
  import { enterRoom, type Room } from "../../p2p/relay-room";
  import { burnRoomCode, mintRoomCode } from "../../p2p/room-code";
  import { runFirstSync, type FirstSyncProgress } from "../../p2p/first-sync";
  import { appSyncLedger } from "../../p2p/sync-ledger";
  import {
    namePairedDevice,
    pairedDevices,
    readMet,
    rememberPairedDevice,
    type PairedDevice,
  } from "../../stores/paired-devices";
  import {
    unpairClaim,
    unpairDevice,
    withdrawRevoked,
    UNPAIRING_WORDS,
  } from "../../p2p/unpair";
  import { isStopped } from "../../p2p/wake-counter";
  import { writeDate } from "../../p2p/send-date";

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
  // **A row appears only when a first sync completes**, which is guard 1
  // (ADR-0096 §2) rather than a rendering rule: *a pairing is not complete
  // until its first sync completes, and an incomplete pairing deposits nothing
  // and collects nothing.* So the act runs on past the secret — a vector
  // exchange, chunks both ways, a closing vector — in the same room, and
  // {@link rememberPairedDevice} is reached from exactly one line below.
  //
  // **The progress is ADR-0075 §11's**, and so is the sentence under it. A
  // first sync moves tens of megabytes over a foreground-only socket that dies
  // the moment you switch tabs, and *a silent forty-second transfer that
  // vanishes when you look away is not silent, it is broken*. Steady state will
  // show nothing at all; this is the one case that does.

  /** Which face is up: nothing, the code being shown, or the reader. */
  let act = $state<"none" | "showing" | "reading">("none");
  let code = $state<PairingCode | null>(null);
  let ended = $state<PairingWords | null>(null);

  /** Live while an act is. Aborting it is §8's cancel, and it burns the code. */
  let session: AbortController | null = null;

  /** Live while rows are crossing, which is the only time anything is shown. */
  let syncing = $state<FirstSyncProgress | null>(null);

  /** Which device's name is being typed, and what has been typed so far. */
  let naming = $state<{ device_id: string; name: string } | null>(null);

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
    leg: (room: Room) => Promise<PairedChains>
  ) {
    const pulled = new AbortController();
    session = pulled;
    let room: Room | null = null;
    // How far the act got, which is what decides whether an ending means
    // *nobody came* or *the transfer stopped and what crossed is kept*.
    let reach: PairingReach = "code";
    try {
      // Read before the room, so the one fact the peer keys its whole record
      // by is in hand rather than fetched inside the five minutes.
      const ledger = await appSyncLedger();
      room = await enterRoom(acting.room, { signal: pulled.signal });
      const chains = await leg(room);

      reach = "sync";
      syncing = { rows_sent: 0, rows_received: 0 };
      const converged = await runFirstSync(room, acting, chains, ledger, {
        onProgress: (progress) => (syncing = progress),
      });

      // **A re-pairing settles the revocation it is replacing first.** The
      // record is keyed by `device_id` and pairing again replaces it, so the
      // line below overwrites both indices and the etag that are the only
      // things reaching a pending withdrawal's two objects (ADR-0096 §11). An
      // act is online by definition, which makes this the one moment such a
      // withdrawal is sure of a chance; where it still cannot land, what it
      // abandons is sealed under a chain nothing will use again and §1's
      // backstop reaps it.
      await withdrawRevoked();

      // Guard 1's one line: the record is written here and nowhere else.
      rememberPairedDevice({
        device_id: converged.device_id,
        chains,
        peer_vector: converged.peer_vector,
      });
      ended = DEVICES_PAIRED;
    } catch (failure) {
      ended = pairingEndingWords(failure, reach);
    } finally {
      syncing = null;
      room?.leave();
      if (session === pulled) session = null;
    }
  }

  /**
   * How long a `device_id` reads as on a row: enough to tell two of your own
   * devices apart, and not the whole opaque string.
   */
  const SHORT_ID_CHARS = 8;

  const shortId = (device: PairedDevice) =>
    device.device_id.slice(0, SHORT_ID_CHARS);

  /** A row reads by short `device_id` until somebody names it (§9). */
  const callSign = (device: PairedDevice) => device.name ?? shortId(device);

  /**
   * What a device last said **it** is paired with, beside this one (§6).
   *
   * **It is a list you go and look at, and never an event.** ADR-0075 §14.6
   * refuses a revocation *message* because an instruction may be missed while
   * the surface reports success; a roster claims no success, so that refusal
   * does not transfer to it — **but only while it sits here**. A notification
   * or a badge would deliver by observation the very thing the design refuses
   * to deliver by message, so there is neither.
   *
   * **Typed names do not cross.** What arrives is ids, and each one resolves
   * against the rows on this screen, which are the only devices this one has a
   * name for. Where it does not resolve, the device is one you are not paired
   * with and the honest sentence **names nobody** — a raw id in prose would be
   * the closest thing to a name that never crossed.
   *
   * `null` is a peer that has not deposited yet, and it says nothing at all:
   * *nothing stated* is not *paired with nobody*.
   */
  function rosterLine(device: PairedDevice, held: PairedDevice[]): string {
    const stated = device.peer_roster;
    if (stated === null) return "";

    const named: string[] = [];
    let strangers = 0;
    for (const device_id of stated) {
      const known = held.find((row) => row.device_id === device_id);
      if (known) named.push(callSign(known));
      else strangers += 1;
    }
    if (named.length === 0 && strangers === 0) {
      return "Paired with no other device.";
    }
    if (strangers > 0) {
      named.push(
        strangers === 1
          ? "one device you are not paired with"
          : `${strangers} devices you are not paired with`
      );
    }
    return `Also paired with ${listOf(named)}.`;
  }

  /**
   * When these two devices last produced something for each other, coarsened
   * to the day (ADR-0096 §9 and §11).
   *
   * **This is the only thing the design ever says about staleness, and this is
   * the only place it says it.** No spinner, no toast and no badge anywhere
   * else: the stale device cannot know what it has not got, and opening it *is*
   * the collection, so a mark could only ever appear on the device that needs
   * it least.
   *
   * A record written before the date existed says nothing rather than claiming
   * the devices have never met.
   */
  const lastMetLine = (device: PairedDevice) =>
    device.last_met === null
      ? ""
      : `Last met ${writeDate(readMet(device.last_met))}.`;

  /**
   * §11's one-sided state: this pairing has produced nothing for K = 200
   * consecutive wakes, so its keys are no longer touched.
   *
   * **It says the pairing is one-sided and never that the network failed** —
   * ADR-0075 §12's two pieces of news, of which only one is actionable. The
   * two actions are the two that exist: unpair it here too, or pair again. It
   * is not a warning about data, because none was lost: both ledgers are
   * intact, the store still holds the outstanding delta, and a peer that comes
   * back collects it.
   *
   * **Nothing here unpairs on its own.** Hitting K is a pause a timer noticed;
   * removing the row would be an irreversible act a timer took, and the user
   * cannot re-pair without the other device in the room.
   */
  const ONE_SIDED =
    "This pairing is one-sided. Nothing has come back from this device for a " +
    "long time, so it is no longer being synced with. Unpair it here, or pair " +
    "the two devices again.";

  /** Which row is being asked about, before anything is marked. */
  let unpairing = $state<string | null>(null);

  function confirmUnpair(device: PairedDevice) {
    unpairing = null;
    // The mark lands synchronously and the two deletes do not, which is what
    // {@link UNPAIRING_WORDS} is for. Nothing is awaited here: the row redraws
    // off the store either way, and a withdrawal that could not land has
    // already logged and left its mark for the next open. The `catch` is what
    // makes dropping the promise legitimate rather than an unhandled
    // rejection; there is nothing for it to say.
    void unpairDevice(device.device_id).catch(() => {});
  }

  function saveName() {
    if (!naming) return;
    namePairedDevice(naming.device_id, naming.name);
    naming = null;
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
    <!-- Every row here is a completed first sync. A pairing writes nothing down
         on either side until one finishes (§2). -->
    {#if $pairedDevices.length === 0}
      <p class="empty">No devices are paired.</p>
    {:else}
      <ul class="paired">
        {#each $pairedDevices as device (device.device_id)}
          <li>
            {#if naming?.device_id === device.device_id}
              <div class="rename">
                <Input
                  bind:value={naming.name}
                  placeholder="What do you call this device?"
                  onkeydown={(e) => e.key === "Enter" && saveName()}
                />
                <Button onclick={saveName}>Save</Button>
                <Button variant="ghost" onclick={() => (naming = null)}>
                  Cancel
                </Button>
              </div>
            {:else}
              <Row
                title={callSign(device)}
                subtitle={device.name ? shortId(device) : ""}
              >
                {#snippet trailing()}
                  <!-- A severed pairing offers neither action. Renaming a row
                       on its way out is busywork, and a second Unpair on a
                       withdrawal already under way would be a control that
                       promises a second act where there is only one. -->
                  {#if !device.revoked}
                    <span class="row-actions">
                      <!-- The name is typed here, about the peer, after the act,
                           and never sent (§6). -->
                      <Button
                        variant="ghost"
                        onclick={() =>
                          (naming = {
                            device_id: device.device_id,
                            name: device.name ?? "",
                          })}
                      >
                        Rename
                      </Button>
                      <!-- ADR-0075 §4 and §12: severing a pairing is unilateral,
                           needs no coordination, and sends no message — silence is
                           the only revocation signal that cannot be forged. What
                           it achieves is claimed before it is done, because the
                           claim is what the user is deciding on. -->
                      <Button
                        variant="ghost"
                        onclick={() => (unpairing = device.device_id)}
                      >
                        Unpair
                      </Button>
                    </span>
                  {/if}
                {/snippet}
              </Row>
              {#if device.revoked}
                <!-- Phase 1 has landed and the deletes have not. The pairing is
                     severed from here on either way; what is pending is the
                     withdrawal (§11). -->
                <p class="one-sided">{UNPAIRING_WORDS}</p>
              {:else}
                {#if unpairing === device.device_id}
                  <div class="confirm">
                    <p class="claim">{unpairClaim(callSign(device))}</p>
                    <div class="row-actions">
                      <Button onclick={() => confirmUnpair(device)}>
                        Unpair
                      </Button>
                      <Button
                        variant="ghost"
                        onclick={() => (unpairing = null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                {/if}
                <!-- Two devices' rosters disagreeing is legitimate under pairwise
                     pairing, so this is what *that* device said and is never
                     merged with the list it sits in (§6). -->
                {@const stated = rosterLine(device, $pairedDevices)}
                {#if stated}
                  <p class="roster">{stated}</p>
                {/if}
                <!-- §11's two lines, and the whole of what this design says
                     about staleness. The date is on every row; the one-sided
                     state is on the rows that ran out. -->
                {@const met = lastMetLine(device)}
                {#if met}
                  <p class="roster">{met}</p>
                {/if}
                {#if isStopped(device)}
                  <p class="one-sided">{ONE_SIDED}</p>
                {/if}
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
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
    <EndingLine words={ended} ok={ended.ending === "paired"} />
    <div class="actions">
      {#if ended.retry}
        <Button variant="secondary" onclick={retry}>Try again</Button>
      {/if}
      <Button variant="ghost" onclick={close}>Done</Button>
    </div>
  {:else if syncing}
    <!-- ADR-0075 §11: a first sync moves tens of megabytes over a socket that
         dies the moment you switch tabs, so it says so. It is counts rather
         than a bar, because neither side knows the total until the walk ends
         and a bar that guessed would be a bar that lies. -->
    <div class="face" data-testid="first-sync-progress">
      <p class="waiting" role="status">
        Swapping what each device was missing…
      </p>
      <p class="counts">
        Sent {syncing.rows_sent} · Received {syncing.rows_received}
      </p>
      <p class="stay">Keep this tab open until this finishes.</p>
      <Button variant="ghost" onclick={close}>Stop</Button>
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
  .counts {
    margin: 0;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .stay {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--step-n1);
    text-align: center;
  }
  .paired {
    list-style: none;
    margin: var(--space-s) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .row-actions {
    display: flex;
    gap: var(--space-2xs);
  }
  .roster {
    margin: var(--space-3xs) 0 0;
    padding-inline: var(--space-xs);
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  /* Louder than the roster beside it and quieter than an error, because it is
     news rather than a failure: nothing was lost and nothing is broken. */
  .one-sided {
    margin: var(--space-3xs) 0 0;
    padding-inline: var(--space-xs);
    color: var(--ink);
    font-size: var(--step-n1);
  }
  .rename {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs);
  }
  /* The claim reads at the weight of the one-sided line beside it: what the
     act achieves is news the user is deciding on, not a warning. */
  .confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
    padding-inline: var(--space-xs);
  }
  .claim {
    margin: 0;
    color: var(--ink);
    font-size: var(--step-n1);
  }
</style>
