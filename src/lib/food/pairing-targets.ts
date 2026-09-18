import { fetchArtifact, loadedOncePerSession } from "./bundled-artifact";
import {
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
 * **This module owns the two artifacts' shape and their loading, and stops
 * there.** The search over them is the shipped search, read through
 * {@link readPairingIndex}; which set a person's Declared state reaches is the
 * caller's; and a Pairing target is never returned by the food search and never
 * directly loggable, so nothing here is reachable from the search path at all.
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

/** The committed Pairing nutrient store, keyed by `fdcId` like its sibling. */
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
