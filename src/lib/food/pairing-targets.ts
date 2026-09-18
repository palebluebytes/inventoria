import { fetchArtifact, loadedOncePerSession } from "./bundled-artifact";
import {
  loadSearchCorpus,
  readCorpusRows,
  type ArchiveSource,
  type SearchCorpus,
  type UsdaCorpusRow,
  type UsdaCorpusNutrientStore,
} from "./usda-corpus";

/**
 * The Pairing index and the Pairing nutrient store: USDA's cooked records, as a
 * second corpus reached only through a pairing (ADR-0113 §11).
 *
 * ADR-0104 keeps the Search index to foods as bought and not yet cooked, and the
 * shipped index says cooked on zero rows — which left the jar this map was
 * chartered on unpairable, because its label matches a boiled kidney bean and
 * nothing else. These 1,035 rows are that half of USDA's corpus, committed,
 * **fetched on demand and precached by neither Facet**: a person who never
 * declares a pack cooked never asks for either file.
 *
 * **This module owns the two artifacts' shape, their loading, and the one
 * question that reaches them.** The search over them is the shipped search, read
 * through {@link readPairingIndex}, and the **Declared state** below is the
 * whole of the route: {@link pairingSearchCorpus} is the partition, and a
 * Pairing target is never returned by the food search and never directly
 * loggable, so nothing here is reachable from the search path at all.
 */

/**
 * One Pairing index row: {@link UsdaCorpusRow}, from the corpus of records USDA
 * cooked before it measured them.
 *
 * **The same fields as a Search index row, and a different type.** Narrowing the
 * fields was measured and refused on bytes — the whole index is 27 KB brotli, so
 * dropping the ones a pairing never reads saves a fraction of that against a
 * second builder and a second set of tests. What earns the distinct type is not
 * bytes: with an identical one, `buildSearchCorpus` accepts a Pairing target, and
 * cooked rows reaching the Search index is the leak ADR-0113's Scope puts out of
 * scope. `set` is the phantom that makes it a compile error, and it is present on
 * no row — `UsdaIndexRow.set` in `usda-corpus.ts` carries the other half of it.
 */
export interface PairingTargetRow extends UsdaCorpusRow {
  readonly set?: "pairing-target";
}

/**
 * The committed Pairing index artifact.
 *
 * It carries no Vocabulary map and no state roster of its own, which is the
 * other half of why this type cannot be handed to `buildSearchCorpus`:
 * there is no path to declaring a pack cooked that has not already loaded the
 * shipped index's header, and two copies of one map would be two maps read as
 * one. One consequence falls out and is ADR-0113 §11's own: the shared roster
 * holds only the six UNCOOKED spellings, so nothing strips `cooked` or `boiled`
 * from a query, and a person searching this set may type the cooking word.
 */
export interface PairingIndex {
  artifact: "usda-pairing-index";
  schema_version: number;
  generated_from: ArchiveSource[];
  foods: PairingTargetRow[];
}

/**
 * The committed Pairing nutrient store, keyed by `fdcId` like its sibling, and
 * read by `storedPanelFor` like its sibling too.
 *
 * Naming a row of the index beside it is `describedReferenceFood`'s, in
 * `pairing.ts`: one predicate answers *what is this `fdc:` id called* over both
 * sets, because the set a row came from changes nothing about how it is named.
 */
export interface PairingNutrientStore extends UsdaCorpusNutrientStore {
  artifact: "usda-pairing-nutrient-store";
}

/**
 * The Pairing index in the form a keystroke searches, with the shipped corpus's
 * Vocabulary map and state roster borrowed whole.
 *
 * **The ranking is reused entire**, which is what ADR-0113 §11 decided and what
 * {@link readCorpusRows} is: the twelve keys that order a food search order this
 * set too. Two of them ride nearly inert over a corpus where every row is
 * cooked — `canonical`, whose roster is drawn from shipped rows and names none of
 * these, and `raw`, which USDA's own description sets and which fires on two rows
 * of the 1,035 because USDA writes `Apples, raw, without skin, cooked, boiled`.
 * `plainSibling` and `designated` do ordinary work, recomputed over this set at
 * generation time.
 *
 * `shared` is the loaded Search corpus, and the two fields taken off it are
 * taken by REFERENCE rather than copied: they are the same map, and a copy would
 * be a second thing to keep in step.
 */
export function readPairingIndex(
  index: PairingIndex,
  shared: SearchCorpus
): SearchCorpus {
  return {
    foods: readCorpusRows(index.foods),
    schema_version: index.schema_version,
    vocabulary: shared.vocabulary,
    state_qualifiers: shared.state_qualifiers,
  };
}

// ---------------------------------------------------------------------------
// The Declared state: the one question that reaches the cooked set (§11)
// ---------------------------------------------------------------------------

/**
 * A person's answer about the pack in their hand, which decides which set the
 * Pack pairing search reaches — and **is never recorded** (ADR-0113 §11).
 *
 * **Two values and no third.** An *I don't know* that showed both sets would
 * re-admit, by the option nobody reads carefully, the whole error this partition
 * exists to refuse.
 *
 * **Nothing is stored**, because every row in the Pairing index is a cooked
 * record by construction: the target's own `fdc:` id **is** the state, and it is
 * already the whole of what a Pack pairing holds. Storing the question beside
 * the answer would keep the question.
 *
 * It grades a **food-identity** claim about a person's own jar and never a
 * composition one, which is the line ADR-0034 §4 draws about what a person is
 * well placed to judge.
 */
export type DeclaredState = "as-bought" | "cooked";

/**
 * What a person is taken to have said before they say anything.
 *
 * As-bought, so the twins that already pair behave exactly as they do today, a
 * person never meets the question unless they reach for it, and the second
 * artifact's fetch stays off the common path. The declaration is a **widening
 * act, not a gate in front of pairing**.
 */
export const DECLARED_STATE_DEFAULT: DeclaredState = "as-bought";

/**
 * The two values and the words a person reads them under, as one list, because
 * a third option anywhere is the thing §11 refuses and a list is where one would
 * appear.
 *
 * The default leads, which is the order the question is answered in: a person
 * reaching for *cooked* is widening from where they already stand.
 */
export const DECLARED_STATES: { value: DeclaredState; label: string }[] = [
  { value: "as-bought", label: "As you bought it" },
  { value: "cooked", label: "Cooked" },
];

/**
 * The corpus a pairing search reads under one Declared state.
 *
 * **The partition is symmetric, and that is what makes it refuse both signs.**
 * Declaring cooked reaches the Pairing index and never the Search index; the
 * default reaches the Search index and never the Pairing index. So it refuses
 * §10's forward error — a cooked pack paired onto a dried row — by the same
 * construction as the reverse one, the 101 confusions #497 measured below ×0.7
 * where #489 found no signal at all.
 *
 * It hands back a **loader** rather than a corpus so the as-bought arm is
 * exactly the shipped one, memoised and warmed at startup, and so declaring
 * cooked and changing your mind again costs one fetch and not one per keystroke.
 *
 * Both loaders are parameters for the reason every impure edge in this module is
 * one: the partition is asserted without a fetch, and a test that had to stub
 * two artifacts to prove *which one was reached* would be proving it through the
 * thing it is measuring.
 */
export function pairingSearchCorpus(
  state: DeclaredState,
  cooked: () => Promise<SearchCorpus> = loadPairingCorpus,
  asBought: () => Promise<SearchCorpus> = loadSearchCorpus
): () => Promise<SearchCorpus> {
  return state === "cooked" ? cooked : asBought;
}

// ---------------------------------------------------------------------------
// Loading: on demand, and precached by neither Facet
// ---------------------------------------------------------------------------

const PAIRING_INDEX_URL = "/usda/pairing-index.json";
const PAIRING_NUTRIENT_STORE_URL = "/usda/pairing-nutrient-store.json";

/**
 * The Pairing index, fetched and parsed once per session — when a person
 * declares a pack cooked, and never before.
 *
 * There is no warm beside `warmUsdaCorpus`'s, deliberately. Declaring a state
 * defaults to as-bought, so the common path never reaches this file, and warming
 * it at idle would spend the fetch on every session to save it on the few.
 *
 * A failure is forgotten, for the reason {@link loadedOncePerSession} gives: a
 * held rejection would answer every later declaration for the rest of the
 * session, and the likeliest failure here is a network that comes back.
 */
export const loadPairingIndex: () => Promise<PairingIndex> =
  loadedOncePerSession(() =>
    fetchArtifact<PairingIndex>("The cooked foods", PAIRING_INDEX_URL)
  );

/**
 * The Pairing nutrient store, fetched once per session — when a person accepts a
 * Pairing target, not when they look at one.
 *
 * ADR-0047 §2's split, inherited: search never reads a nutrient and staging reads
 * all of them, so the panel's megabyte stays off the act of looking even for
 * somebody who declared a pack cooked and then changed their mind.
 */
export const loadPairingNutrientStore: () => Promise<PairingNutrientStore> =
  loadedOncePerSession(() =>
    fetchArtifact<PairingNutrientStore>(
      "The cooked foods' nutrition panel",
      PAIRING_NUTRIENT_STORE_URL
    )
  );

/**
 * The Pairing index read into words once per session — the corpus a keystroke
 * searches once a person has declared a pack cooked.
 *
 * Memoised beside the fetch rather than composed at the call site, because the
 * reading is the expensive half: {@link readCorpusRows} tokenises every row, and
 * a search sheet that rebuilt it per keystroke would pay a thousand rows of that
 * for every letter typed. It is the exact discipline `loadSearchCorpus` keeps
 * over `buildSearchCorpus`, and for the same reason.
 *
 * It awaits the shipped corpus for the Vocabulary map it borrows, which costs
 * nothing: §11's own observation is that there is no path to declaring a pack
 * cooked that has not already loaded the shipped index's header.
 */
export const loadPairingCorpus: () => Promise<SearchCorpus> =
  loadedOncePerSession(async () =>
    readPairingIndex(await loadPairingIndex(), await loadSearchCorpus())
  );

/**
 * As much of the cooked set as a device can get hold of — the two artifacts a
 * reference food is resolved out of when the shipped pair cannot answer for it.
 *
 * Both halves are optional and either can be missing alone, which is the shape
 * `referenceFoodsFrom` already gives the shipped pair: the store carries the
 * figures, the index carries the name, and a device that has one and not the
 * other still says something true.
 */
export interface PairingTargetSet {
  store?: PairingNutrientStore;
  index?: PairingIndex;
}

/**
 * Both cooked artifacts, fetched now, degrading to nothing rather than throwing.
 *
 * **This is the only thing that fetches either file outside a declaration**, and
 * the caller's guard is what keeps ADR-0113 §11's promise that a person who
 * never declares a pack cooked never asks for one: it is reached only for a
 * pairing the shipped Nutrient store could not answer for, which under a
 * Declared state that records nothing is exactly what a Pairing target looks
 * like — the id **is** the state (§11).
 *
 * That inference is the live twin's alone and is deliberately not the Curated
 * pairing table's, which writes its `set` down (§14): a curated row is a
 * standing claim, so a stale id there would fetch a thousand rows that will
 * never hold it on every session. Here the alternative is worse, because a twin
 * has nowhere to write it — and the case it costs, a pairing whose row has left
 * both sets, is one fetch per session for a pack already showing nothing.
 */
export async function loadPairingTargetSet(): Promise<PairingTargetSet> {
  const [store, index] = await Promise.all([
    loadPairingNutrientStore().catch(() => undefined),
    loadPairingIndex().catch(() => undefined),
  ]);
  return { store, index };
}
