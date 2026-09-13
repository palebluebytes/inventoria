/**
 * When the two syncs run inside one wake (ADR-0096 §3's 2026-09-06 Amendment,
 * as extended on 2026-09-12).
 *
 * > **A wake is one app-open, and a session syncs as often as it has reason to:
 * > it deposits whenever its delta grows, and it collects on open and then no
 * > more than hourly.**
 *
 * The requirement this answers to, which is nowhere in ADR-0096's Decision and
 * is what every number below is set by:
 *
 * > **A user may close any device at any moment, and a device opened later
 * > picks up exactly where they left off.**
 *
 * That rules out the obvious reading, which is the one `wake-errand.ts` shipped
 * at #396. There is no dependable end of a session — `pagehide` is unreliable
 * and a 16 MiB `PUT` will not complete inside one — so a deposit fired at
 * **open** goes out before that session's meals exist. Three meals logged at
 * 09:13 and a laptop opened at 14:00 would converge on nothing.
 *
 * ### Deposit and collect are different problems, and only one is a cadence
 *
 * **A deposit is triggered by the delta growing**, debounced by seconds, with a
 * best-effort flush on hide. It **costs no unlinkability whatever**, which is
 * the fact the whole repair rests on: the lane's index advances on
 * **collection**, so every rewrite made before the peer takes one lands on the
 * same address. Depositing at 09:13, 09:20 and 09:27 is three writes to one
 * key — it merges no components of §4's address chain and spends nothing of it.
 * What it costs is three Class A operations, set by how often a person actually
 * logs something rather than by a clock.
 *
 * **The residual is named rather than hidden:** a device closed inside the
 * debounce window defers to its next open, which is #396's promise rather than
 * a regression.
 *
 * **A collection is the only real cadence, because a device cannot know its
 * peer deposited without asking.** At open it is unconditional and free and it
 * is the whole of the requirement above. After that it is a **floor rather
 * than a schedule** — a rate limit, not the clock ADR-0096 refused — and it
 * skips when nothing has changed locally and nothing is owed.
 *
 * ### What "changed locally" is taken to mean, and the residual it leaves
 *
 * **Rows a collection imported are a local change like any other.** The signal
 * is the ledger growing, by an append or by an import, which is why
 * {@link openWake} clears the mark **before** a collection rather than after:
 * the rows that collection brings re-set it, and the pair keeps collecting
 * while it keeps exchanging. That is what buys the thing the amendment says the
 * floor is for — the propped-open tablet refreshing while you log on the phone
 * beside it.
 *
 * **It does not buy all of it, and the gap is stated.** A tablet whose ledger
 * has been still for an hour skips, so a phone that starts logging *after* that
 * skip is not seen until the tablet is opened again. The amendment's own rule —
 * _skips when nothing has changed locally_ — is what forbids the poll that
 * would catch it, and it is written twice (the record and #397), so it is
 * deliberate rather than an oversight to route around here.
 *
 * ### One sync at a time
 *
 * Every trigger queues onto one chain. Two syncs at once would put two `PUT`s
 * at one lane's address with one etag between them, so the second would be
 * refused by its own predecessor and answered by a recreate — a self-inflicted
 * orphan, from a race nothing outside this module can see.
 *
 * ### What this module is not
 *
 * It holds no store, no ledger and no pairing list: `wake-errand.ts` is where
 * those come from, and `wake.ts` is what a sync actually does. And **it counts
 * nothing**: §11's K is `wake-counter.ts`'s, folded in `wake-errand.ts` where
 * one counter is made per open and handed every sync of it. This module's part
 * of _K is counted in wakes, never in syncs_ is that one {@link openWake} is
 * one wake however many times it reaches {@link WakeWork.converge}.
 */

/**
 * How long a burst of logging is waited out before its deposit goes out.
 *
 * Seconds, because the amendment says seconds: long enough that adding three
 * foods to a meal is one write rather than three, short enough that closing the
 * laptop straight afterwards usually still catches it. The flush on hide is
 * what covers the rest.
 */
export const DEPOSIT_DEBOUNCE_MS = 5_000;

/**
 * The floor under a second collection in one wake.
 *
 * A rate limit rather than a schedule: nothing is collected *because* an hour
 * passed, and a wake that skips every tick is the ordinary case. §4's property
 * is a **frequency** property, so a bounded re-sync is affordable and only an
 * unbounded one is not.
 */
export const COLLECTION_FLOOR_MS = 60 * 60 * 1_000;

/**
 * What one sync across every pairing reports back to the cadence.
 *
 * **One field, because one field is all this module reads.** A sync also says
 * which pairings produced something, and that goes to §11's counter in
 * `wake-errand.ts` without passing through here — a round shaped by what the
 * cadence needs is what keeps _it counts nothing_ true of the type as well as
 * of the code.
 */
export interface WakeRound {
  /**
   * Whether any pairing was left owing its peer an acknowledgement: a take that
   * did not settle, or a sync that failed part way.
   *
   * It is the second half of the skip rule. A collection commits on its
   * acknowledgement, so a wake that skips while a take is outstanding leaves
   * the peer rewriting at an index nobody has said the word for, and the next
   * wake repeats that sync identically.
   */
  owed: boolean;
}

/** The two syncs and the two signals, handed in so this module reaches nothing. */
export interface WakeWork {
  /** One full sync across every pairing: collect, deposit, settle. */
  converge: () => Promise<WakeRound>;
  /** One deposit across every pairing, with no collection. */
  deposit: () => Promise<void>;
  /** Calls back whenever the local ledger grows; returns the unsubscribe. */
  onLedgerGrowth: (grew: () => void) => () => void;
  /** Calls back when the app is hidden; returns the unsubscribe. */
  onHide: (hidden: () => void) => () => void;
}

/** Both bounds, overridable so a test need not wait an hour for one tick. */
export interface WakeTuning {
  depositDebounceMs?: number;
  collectionFloorMs?: number;
}

export interface OpenWake {
  /** Ends the wake: both timers and both signals go. */
  close(): void;
}

/**
 * Opens a wake: collects once now, then deposits and collects as it has reason
 * to until the app goes.
 *
 * The collection at open is the promise and is unconditional. Everything after
 * it is a trigger with a bound on it.
 */
export function openWake(
  work: WakeWork,
  {
    depositDebounceMs = DEPOSIT_DEBOUNCE_MS,
    collectionFloorMs = COLLECTION_FLOOR_MS,
  }: WakeTuning = {}
): OpenWake {
  let changed = false;
  let owed = false;
  let closed = false;
  let waiting: ReturnType<typeof setTimeout> | null = null;
  let depositQueued = false;
  // One chain, because two syncs at once would race one lane's etag. A
  // rejection is swallowed here and nowhere else: `wake-errand.ts` already
  // reports a pairing's failure and a poisoned chain would silence every
  // trigger after it for the rest of the wake.
  let queue: Promise<void> = Promise.resolve();

  const run = (job: () => Promise<void>): void => {
    queue = queue.then(job).catch(() => {});
  };

  const collect = (): void =>
    run(async () => {
      if (closed) return;
      // Cleared **before** the sync and not after: the rows it imports are a
      // local change, and so is a meal logged while it is in flight.
      changed = false;
      const round = await work.converge();
      owed = round.owed;
    });

  const deposit = (): void => {
    if (depositQueued) return;
    depositQueued = true;
    run(async () => {
      depositQueued = false;
      if (!closed) await work.deposit();
    });
  };

  // Named for the wait and not for a settlement: CONTEXT.md's **Collection**
  // owns _settled_ for the commit point, and two meanings of it in one
  // subsystem is one too many.
  const waitOut = (): void => {
    if (waiting !== null) clearTimeout(waiting);
    waiting = setTimeout(() => {
      waiting = null;
      deposit();
    }, depositDebounceMs);
  };

  const stopWatchingLedger = work.onLedgerGrowth(() => {
    changed = true;
    waitOut();
  });

  // **Best-effort, and only with something pending.** A hide with no growth
  // still waiting behind it would be a bare rewrite bought with a Class A
  // operation and nothing to carry.
  const stopWatchingHide = work.onHide(() => {
    if (waiting === null) return;
    clearTimeout(waiting);
    waiting = null;
    deposit();
  });

  const floor = setInterval(() => {
    if (changed || owed) collect();
  }, collectionFloorMs);

  collect();

  return {
    close(): void {
      if (closed) return;
      closed = true;
      if (waiting !== null) clearTimeout(waiting);
      waiting = null;
      clearInterval(floor);
      stopWatchingLedger();
      stopWatchingHide();
    },
  };
}
