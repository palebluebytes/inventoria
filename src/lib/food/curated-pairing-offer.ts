// ---------------------------------------------------------------------------
// What the Curated pairing table may say about the pack in front of you
// (ADR-0113 §§2, 14)
// ---------------------------------------------------------------------------
//
// `curated-pairings.ts` is the table. It is type-import-only on purpose, so a
// bare runner's Node loads it with no install step, which is what buys the
// offline gate and the quarterly job. This module is the half that has to know
// about the app: which entity id a row is keyed on, what a twin has already
// asserted, which shipped set names the row, and when the offer stands.
//
// **Every §14 rule about the offer is here, and none of it is on a screen.** The
// sheet draws what this hands it and decides nothing, which is what keeps one
// decision in one layer rather than half of it in a component.
//
// All of it is one sentence applied five times: **the table is a prior, never a
// fact.**
//
//  - It pre-SELECTS and never accepts (§2), so nothing here writes and nothing
//    it returns is a datom. What it hands a screen is a row to show.
//  - A pre-selection never displaces a person's own pick — `chosen ?? offered`
//    in `PackPairingSheet`'s arming effect, where the rule is pinned,
//    which is the same sentence read from the other end.
//  - It never overwrites a live `food/pairing` (§14). A person's assertion about
//    their own jar wins, and a pack already carrying one is not a pack with a
//    question open on it.
//  - A cleared `food/pairing` is a refusal of the PROPOSAL, not of the food, so
//    the row is not re-offered and the clear means one thing ledger-wide. The
//    pairing search stays one deliberate act away, which is what makes that a
//    tap rather than a nag.
//  - It is withdrawn where the person's Declared state is not the one the row
//    asserts (§11), because a cooked claim left standing under somebody who has
//    just said their pack is as they bought it is one tap from the pairing the
//    partition exists to refuse.
//
// The third and fourth are why {@link curatedPairingOffer} reads the ATTRIBUTE
// rather than `readFoodPairing`: that reader answers *which reference food is
// this paired with*, and folds a clear and a live pairing into the same
// `undefined`. The question here is a different one — *has anybody spoken to
// this pack's pairing* — and the two arms of yes are the two rules above.
// ---------------------------------------------------------------------------

import { mintEntity } from "../facets/entity-id";
import type { EntityPayload } from "../ingestion/ingest";
import { CURATED_PAIRINGS, type CuratedPairing } from "./curated-pairings";
import {
  describedReferenceFood,
  FOOD_PAIRING_ATTR,
  readFoodPairing,
  referenceFoodName,
} from "./pairing";
import {
  DECLARED_STATES,
  loadPairingIndex,
  type DeclaredState,
  type PairingIndex,
} from "./pairing-targets";
import { loadSearchCorpus, type SearchCorpus } from "./usda-corpus";

/**
 * The curated row a screen may offer for this twin, or `undefined` where the
 * table has nothing to say about it (§14).
 *
 * **Keyed on the entity id** rather than on the raw code, which is
 * `curatedStandInFor`'s discipline and is kept for its reason: the twin a scan
 * stages is byte-comparable with the one the ledger hands back, and both are
 * `gtin:<code>`. It also means this cannot reach past §15's refusals — a
 * `recipe:`, an `fdc:` or a `food:custom_` twin is not a `gtin:` one, so no row
 * is ever keyed to one.
 *
 * **Gated on the presence of `food/pairing`**, in any form, and both arms of
 * that are decisions rather than one implementation:
 *
 *  - a live pairing is the person's own assertion, which wins over a prior;
 *  - a cleared one is their refusal of this proposal, and a refusal re-offered
 *    is the nag §14 forbids.
 *
 * A value that is neither — which `withPairing` cannot write, so it arrives only
 * from an older build, a hand-edited import or one of your own devices — is
 * taken as the second. Somebody's datom is on this pack either way, and a value
 * this app cannot read is never grounds for asserting something else, which is
 * the discipline `readFoodPairing` keeps at the other end of the same attribute.
 *
 * It takes the whole twin because both questions are about one food: a caller
 * free to pass one twin's entity beside another's attributes is a caller that
 * can offer a row over a pairing it never looked at.
 */
export function curatedPairingOffer(
  twin: EntityPayload | undefined
): CuratedPairing | undefined {
  if (!twin || FOOD_PAIRING_ATTR in twin.attributes) return undefined;
  return CURATED_PAIRINGS.find(
    (row) => mintEntity("gtin:", row.gtin) === twin.entity
  );
}

/**
 * The reference a curated row is **accepted as** on a pack that has said nothing
 * about pairing yet — or `undefined` where the table has nothing for it.
 *
 * **This is the amended §2** (#552). The record's original rule was that only a
 * person's explicit act makes a pairing a fact, and a curated row could arm the
 * accept button and nothing more. It now applies itself, and the act a person
 * performs is the **refusal** rather than the acceptance.
 *
 * Every guard that made the offer safe still holds, because they are all
 * {@link curatedPairingOffer}'s and it is the gate here too: a live pairing is the
 * person's own assertion and wins, and a **cleared** one is their refusal of this
 * very proposal — which is why the opt-out needs nothing built. The `✕` on the
 * card writes `PAIRING_CLEARED`, the gate reads that as a refusal, and a refusal
 * re-offered is the nag §14 already forbade. The opt-out is therefore durable, and
 * it syncs between your own devices like any other datom.
 *
 * **What moved is the ORDER of §9's read, not whether it happens.** §9 rests on a
 * wrong pairing naming a food you can read and reject, because validating an id
 * against the corpus catches one wrong-food error in seven (#247). Before, the
 * row's description had to resolve before the button armed. Now the pairing lands
 * and the card names it — live, under the reference food's own source tag, beside
 * a one-tap clear — so the read is after the write instead of before it. That is a
 * real weakening and is recorded as one: §5 sends a borrowed figure to the day's
 * meters as measured, so a wrong row moves a real number until somebody looks.
 * What is traded for it is the 25 rows actually reaching the packs they were
 * adjudicated for, rather than waiting behind a confirmation on a screen most
 * people never open.
 *
 * **It is a function rather than two calls at each host** for the reason
 * `withPairing` is one writer: there are two paths a `food/pairing` reaches the
 * ledger by, and a rule spelled at both is a rule that can differ at one.
 *
 * No `name` is required, unlike {@link curatedPick}. A sheet could not offer a
 * food it was unable to name, because the name WAS the whole of what made the
 * offer rejectable at that moment. Here the card does the naming a moment later,
 * and where the corpus cannot answer the bare id stands — which §7 already holds
 * to be honest, and which keeps this decision synchronous so the staged arm can
 * take it inside the payload it is about to commit.
 */
export function curatedAcceptance(
  twin: EntityPayload | undefined
): string | undefined {
  const row = curatedPairingOffer(twin);
  return row ? curatedReference(row) : undefined;
}

/**
 * The curated row a twin's **live** pairing came from, or `undefined` where the
 * pairing is the person's own choice, absent, or refused.
 *
 * The other end of {@link curatedAcceptance}, and what lets a card say where a
 * pairing nobody chose came from. §7 keeps `food/pairing` a bare live id carrying
 * no field list and no name, so the datom itself cannot say who asserted it; what
 * CAN be said is that the table would have proposed exactly this, which is the
 * honest claim and the one a reader needs in order to go and check the `ground`.
 *
 * It reads the table rather than the offer gate, because by construction the gate
 * has already closed: the twin has a pairing, so {@link curatedPairingOffer}
 * returns nothing for it forever after.
 */
export function curatedPairingApplied(
  twin: EntityPayload | undefined
): CuratedPairing | undefined {
  const live = twin ? readFoodPairing(twin.attributes) : undefined;
  if (!live) return undefined;
  return CURATED_PAIRINGS.find(
    (row) =>
      mintEntity("gtin:", row.gtin) === twin?.entity &&
      curatedReference(row) === live
  );
}

/**
 * The `fdc:` id a curated row names — the entity a Pack pairing would hold, and
 * the one thing an acceptance writes (§7).
 *
 * Minted rather than spelled, because `mintEntity` is the one door an entity id
 * is built through (ADR-0086 §7), and a lookup reconstructing an id has to build
 * the same string the mint did.
 */
export function curatedReference(row: CuratedPairing): string {
  return mintEntity("fdc:", row.fdcId);
}

/**
 * What a pairing surface has armed: the `fdc:` id the act would write, and the
 * description the person read before arming it.
 *
 * Two fields rather than a search result, because a Curated pairing is pickable
 * too and is not one — it has no panel, no macros and no twin. These are the two
 * a pick actually needs: §2's act writes the id, and §9 requires the row's own
 * words to have been on screen beside it.
 */
export interface PairingPick {
  entity: string;
  name: string;
}
