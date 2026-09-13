/**
 * Unpairing: two phases, and **the ordering is the whole mechanism**
 * (ADR-0096 §11, as amended 2026-09-12).
 *
 * > 1. Mark the pairing revoked, **keeping the pairing state and both chain
 * >    indices**. Depositing and collecting stop immediately; that half was
 * >    always local, immediate and unforgeable.
 * > 2. Delete **both** lane objects — the revoker's outstanding deposit, and
 * >    the peer's deposit to it.
 * > 3. **Only then** remove the Paired Device record.
 *
 * Discarding the record first throws away the addresses, which is what would
 * make the withdrawal best-effort. Keeping it until the deletes land makes a
 * pending revocation **retryable on any later open**; a delete of an
 * already-collected key is a no-op that succeeds; and the peer's next rewrite
 * is refused by the etag precondition.
 *
 * ### The wall this is built against
 *
 * **The store cannot distinguish a revoked collector from a legitimate one**,
 * because the address derives from a secret both devices hold and revoking
 * cannot un-tell a peer what it knows. So *cannot collect* has three doors and
 * no fourth, and only one is taken here — **remove the bytes**. Having the
 * server refuse to serve is refused: per-pairing state at the store needs a
 * stable thing to address it by, which is exactly the join §4 forbids, and it
 * puts back an authority ADR-0075 §4 built the design without.
 *
 * ### Nothing is sent
 *
 * A revocation you can suppress is worse than none, because it reports success
 * (ADR-0075 §12). So this module has no fourth verb: it deletes twice and says
 * nothing, and the peer reaches the one-sided state on its own, by silence and
 * §11's counter.
 *
 * ### What the deletes achieve, and what they do not
 *
 * The residual window is **whatever the peer collected before the revocation,
 * plus anything between the tap and the deletes landing** — zero when the
 * revoker is online, which is when people revoke.
 *
 * And the emptiness is not permanent. Revocation is the **one deliberate
 * breach** of *a lane's object is deleted only after the acknowledgement for it
 * is deposited*: step 2 acknowledges nothing, and it is safe only because a
 * refused rewrite is answered by a recreate (§5's 2026-09-12 amendment), which
 * is what stops the peer's lane falling mute. So the peer may put **one more
 * sealed object** at its lane — under a chain this device has destroyed,
 * openable by nobody, reaped by the 30-day backstop, and stopped for good at K.
 * The surface says as much, because the sentence would otherwise claim more
 * than the delete achieves.
 */

import { appWarn } from "../logs/app-log";
import {
  forgetPairedDevice,
  laneChainOf,
  readPairedDevices,
  revokePairedDevice,
  type PairedDevice,
} from "../stores/paired-devices";
import { appStore, type Store } from "./deposit-store";
import { laneAddress } from "./pairing-chain";

/**
 * What unpairing achieves, said before it is done — and **claiming exactly
 * that much** (ADR-0096 §11).
 *
 * It is here rather than on the section for one reason: the sentence is a
 * claim about the mechanism above it, so a later change to what the deletes
 * reach meets the words in the same file rather than two screens away.
 *
 * Three things it deliberately does not say:
 *
 * - It does not claim to reach what the peer has **already collected**. The
 *   store cannot tell a revoked collector from a legitimate one, so the one
 *   door taken is removing the bytes that are left.
 * - It does not claim **household completeness**. An unpair is scoped to one
 *   pairing; at three devices the others go on syncing exactly as they were.
 * - It is not read as **permanent**. A peer that has not yet learned of the
 *   unpairing may put one more sealed object at its lane, under a chain this
 *   device has destroyed — openable by nobody, and cleared out by the store on
 *   its own.
 *
 * It names the device, because the row it sits under is not the only row.
 */
export const unpairClaim = (called: string): string =>
  `Unpairing removes anything this device has left for ${called} that has ` +
  `not been picked up yet. What it already collected stays on it, and this ` +
  `unpairs these two devices only. Until it notices, it may leave one more ` +
  `message here, which nothing can open and which the store clears out on ` +
  `its own.`;

/**
 * The pending state, carried until the deletes land.
 *
 * **Without it the claim above is a lie in precisely the window where it
 * matters**: the mark is local and immediate, the withdrawal is two round
 * trips, and a device that was offline when the user tapped carries the mark
 * until its next open. The pairing is severed from the tap either way —
 * nothing is deposited or collected on it again — so this reports the
 * withdrawal rather than the severing.
 */
export const UNPAIRING_WORDS =
  "Unpairing. What has not been picked up yet is being removed; if this " +
  "device is offline, that finishes the next time the app is opened.";

/**
 * Severs one pairing: the mark, then the withdrawal it makes retryable.
 *
 * It resolves whether or not the store could be reached, because a withdrawal
 * that did not land is not a failure of the act — the pairing is severed
 * either way, from the mark onward, and what is left is a **pending
 * revocation** the surface names and the next open retries.
 */
export async function unpairDevice(
  device_id: string,
  store: Store = appStore
): Promise<void> {
  revokePairedDevice(device_id);
  await withdrawRevoked(store);
}

/**
 * Finishes every pending revocation this device is carrying.
 *
 * **It sweeps the whole list rather than taking an id**, and that is not
 * incidental: each of these is a severed pairing owed a withdrawal, this
 * device is demonstrably online if any of them is being attempted, and the
 * three callers want the same thing. It runs on a wake (the retry), from
 * {@link unpairDevice} (the tap), and from the pairing act — which is the one
 * moment a pending withdrawal is *sure* of a chance, and the last moment its
 * addresses exist, because pairing again overwrites both indices.
 *
 * **One pairing's failure is its own**, as it is on a wake: a store call that
 * threw leaves that mark standing for the next open and does not hold up the
 * next row's deletes.
 */
export async function withdrawRevoked(store: Store = appStore): Promise<void> {
  for (const device of readPairedDevices().filter((row) => row.revoked)) {
    try {
      await withdraw(device, store);
    } catch (failure) {
      // Nothing reaches a screen from here. The row keeps its mark, the section
      // keeps saying the withdrawal is pending, and the next open tries again.
      appWarn(
        "[p2p] An unpaired device's lanes are not withdrawn yet",
        failure
      );
    }
  }
}

/**
 * Steps 2 and 3 for one pairing, in that order and in no other.
 *
 * The two addresses are derived from the lanes the mark kept, and the record
 * goes only once both deletes have returned — so a throw anywhere above leaves
 * a row that still reaches both objects.
 */
async function withdraw(device: PairedDevice, store: Store): Promise<void> {
  await store.discard(await laneAddress(laneChainOf(device.deposit)));
  await store.discard(await laneAddress(laneChainOf(device.collect)));
  forgetPairedDevice(device.device_id);
}
