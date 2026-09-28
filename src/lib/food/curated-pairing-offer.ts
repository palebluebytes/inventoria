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
//  - A pre-selection never displaces a person's own pick ({@link preselect}),
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
 * The Declared state a row asserts (§§11, 14).
 *
 * Read off `set`, which §14 writes down and never derives: a row naming a
 * Pairing target **is** the assertion that the pack is sold cooked, because the
 * target's own `fdc:` id is the state and there is nowhere else for it to live.
 */
export function declaredStateOf(row: CuratedPairing): DeclaredState {
  return row.set === "pairing-target" ? "cooked" : "as-bought";
}

/**
 * The words a person reads a Declared state under, taken from the one list the
 * question itself is asked from (§11).
 *
 * A screen spelling the two states out again would be a third place a value
 * could be coined, and a third option is precisely what §11 refuses. The value
 * stands in for its own label where the list somehow does not carry it, which it
 * always does: a screen is not the place to discover otherwise, and a throw here
 * would take the search down with the caption.
 */
export function declaredStateLabel(state: DeclaredState): string {
  return (
    DECLARED_STATES.find((option) => option.value === state)?.label ?? state
  );
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

/**
 * The curated row as something pickable, or `undefined` where there is nothing
 * to offer right now.
 *
 * Three things have to hold at once, and each is a §14 clause rather than a
 * convenience:
 *
 *  - there is a row, which {@link curatedPairingOffer} decided;
 *  - the set it names could **describe** it, which is §9's condition — a row
 *    whose id has left that set has nothing a person could check, and the honest
 *    surface for one is no offer at all rather than a bare id. On a device with
 *    no network that also covers every cooked row, because §11 has neither Facet
 *    precaching the Pairing index: the pack falls back to the search it would
 *    have had, rather than to a claim nobody can read;
 *  - the person's Declared state is the one the row asserts. It is withdrawn
 *    when they move off it and restored when they move back, because a
 *    pre-selection is not an answer and withdrawing one records nothing.
 */
export function curatedPick(
  row: CuratedPairing | undefined,
  name: string | undefined,
  declared: DeclaredState
): PairingPick | undefined {
  if (!row || !name) return undefined;
  if (declared !== declaredStateOf(row)) return undefined;
  return { entity: curatedReference(row), name };
}

/**
 * What is armed once an offer appears: the offer, unless the person has already
 * picked something themselves.
 *
 * **This is §2 read from the far end.** Pre-selecting is allowed, so an offer
 * arriving to an empty screen arms the button. Pre-*accepting* is not, and
 * neither is pre-*overruling*: a curated row's description is resolved out of an
 * artifact, so the offer can appear a fetch after the sheet opened — long after
 * somebody has typed a query and tapped a row of their own. Silently moving what
 * the accept button would write, under a person who has already chosen, is the
 * same collapse in a smaller window.
 *
 * A function rather than a condition inside an effect, because the rule is the
 * decision and an effect is where it would go untested.
 */
export function preselect(
  chosen: PairingPick | undefined,
  offer: PairingPick | undefined
): PairingPick | undefined {
  return chosen ?? offer;
}

/**
 * The USDA row's **own description**, out of whichever shipped set the row's
 * `set` names — or `undefined` where that set cannot answer for it.
 *
 * **This is §9's condition, and it is what makes a curated row showable at
 * all.** Validating an id against the corpus catches one wrong-food error in
 * seven (#247), so the clause the whole design rests on — *a wrong pairing names
 * a food you can read and reject* — holds only where the row's own words are on
 * screen. A curated row is not a person's typed query, so it owes that condition
 * more rather than less: a caller that cannot name the food must offer nothing,
 * which is {@link curatedPick}'s second clause.
 *
 * **It reads the set the row names, and only it**, which is §11's partition
 * binding a prior exactly as it binds a search. A row asserting the pack is
 * cooked is named out of the Pairing index or not at all — naming it out of the
 * Search index would be the forward error the partition exists to refuse,
 * arriving through the one door that skips the question.
 *
 * **The index and never the Nutrient store.** §11 splits the two cooked
 * artifacts by act — the index when a person declares cooked, the store when
 * they accept a row — and looking at a curated row is the first of those, so the
 * megabyte stays off it. For an as-bought row the corpus is the shipped one,
 * memoised and warmed at startup, so the ordinary case costs nothing.
 *
 * **It never rejects.** The offer sits beside a search box that already works,
 * so an artifact that would not load costs the offer and nothing else — which is
 * the state every unseeded pack is already in.
 */
export async function curatedPairingName(
  row: CuratedPairing,
  loadCorpus: () => Promise<SearchCorpus> = loadSearchCorpus,
  loadCooked: () => Promise<PairingIndex> = loadPairingIndex
): Promise<string | undefined> {
  const reference = curatedReference(row);
  try {
    if (declaredStateOf(row) === "cooked") {
      const index = await loadCooked();
      return describedReferenceFood(index.foods, reference);
    }
    return referenceFoodName(await loadCorpus(), reference);
  } catch {
    return undefined;
  }
}
