// ---------------------------------------------------------------------------
// Freezing a Pack pairing onto the occasion it filled (ADR-0113 §6, §7)
// ---------------------------------------------------------------------------
//
// `marked-panel.ts` composes what a paired pack reads as, live, on every read.
// This module is the other tense: what a **logged occasion** keeps of that
// reading, at the moment it is logged, for ever.
//
// They are **two facts, not one fact serving two purposes** (§7), and the
// relationship needs no new principle — it is `recipe/batch_weight` standing
// beside `event/instantiation.batch_weight` exactly (ADR-0022). The twin's
// `food/pairing` is a bare live id, re-read each time and marking whatever is
// silent now; the occasion's copy names the reference food it actually borrowed
// from, under the name that food had then, and lists exactly the keys it
// supplied. Two consequences follow and are the two this module exists to make
// true:
//
//  - Re-pair the jar tomorrow and yesterday's meal keeps marking exactly the
//    rows yesterday's pairing supplied, under yesterday's reference food's name,
//    even if that name has since left the corpus.
//  - Unpair it and yesterday's meal changes not at all.
//
// **The numbers and the envelope are minted together, here, and never apart.**
// That is the whole discipline: borrowed figures reach `event/metrics`
// indistinguishable from printed ones (§5), so a caller that could widen a panel
// without naming what widened it is one refactor away from the honesty defect §6
// exists to prevent. {@link pairedSource} hands back both or neither.
// ---------------------------------------------------------------------------

import { readFoodDensity } from "./density";
import { markPanel, referenceFoodPanel } from "./marked-panel";
import { NUTRITION_INFO_ATTR, type NutritionInfo } from "./nutrition";
import { readFoodPairing, referenceFoodName } from "./pairing";
import {
  loadPairingTargetSet,
  pairingTargetName,
  type PairingTargetSet,
} from "./pairing-targets";
import type { FrozenPairing } from "./provenance";
import type { IngredientSource } from "./recipe-nutrition";
import { FDC_FOOD_BASE } from "./usda-fdc";
import {
  fdcIdFor,
  loadNutrientStore,
  loadSearchCorpus,
  type SearchCorpus,
  type UsdaCorpusNutrientStore,
} from "./usda-corpus";

/**
 * Where a logged food's frozen pairing lives, the sibling of `FOOD_PAIRING_ATTR`
 * and named beside it for the same reason: the attribute belongs with the module
 * that writes and reads it, not with the shape it holds. The shape itself is
 * {@link FrozenPairing}, in `provenance.ts`, because it is one of that module's
 * provenance envelopes rather than one of this module's mechanics.
 */
export const EVENT_PAIRING_ATTR = "event/pairing";

/**
 * What a reference food is worth to an occasion being frozen: its own figures,
 * and the name they were published under.
 *
 * Both are looked up rather than read off the pack, because §7 keeps the twin's
 * pairing a **bare live id** — the twin holds no field list and no name, so
 * everything a freeze needs beyond the id itself comes from the corpus at the
 * moment of the freeze. It is an interface rather than the two artifacts so a
 * caller assembles it once for a whole dish and so a test can state a reference
 * food in two lines.
 */
export interface ReferenceFoods {
  /** The reference food's own panel, on its own basis, or `undefined`. */
  panel(reference: string): NutritionInfo | undefined;
  /** How the corpus names it, or `undefined` where it no longer carries it. */
  name(reference: string): string | undefined;
}

/**
 * The bundled artifacts read as one lookup — **the shipped pair first, and the
 * cooked set only where they cannot answer** (ADR-0113 §11).
 *
 * Every argument is optional and no absence is a failure: the stores carry the
 * figures and the indexes carry the names, so a device holding some of the four
 * still says something true. A missing name falls back to the id, which is what
 * {@link FrozenPairing.name} already documents.
 *
 * **Shipped-first is the whole of how a set is decided**, because a Declared
 * state records nothing: the target's own `fdc:` id *is* the state (§11), so an
 * id the Nutrient store answers for is a Reference food and one it cannot is a
 * Pairing target. The two sets share no `fdcId`, so the order settles a question
 * that does not arise rather than picking a winner — and where it ever did, the
 * shipped row is the one ADR-0104's shopper test kept.
 */
export function referenceFoodsFrom(
  store: UsdaCorpusNutrientStore | undefined,
  corpus: SearchCorpus | undefined,
  cooked: PairingTargetSet = {}
): ReferenceFoods {
  return {
    panel: (reference) =>
      (store ? referenceFoodPanel(store, reference) : undefined) ??
      (cooked.store ? referenceFoodPanel(cooked.store, reference) : undefined),
    name: (reference) =>
      (corpus ? referenceFoodName(corpus, reference) : undefined) ??
      (cooked.index ? pairingTargetName(cooked.index, reference) : undefined),
  };
}

/**
 * The reference foods a set of twins needs, loaded only where one of them is
 * actually paired.
 *
 * The guard is the point rather than a nicety. The nutrient store is the
 * megabyte ADR-0047 §2 keeps off the act of looking at a food, and every log in
 * this app goes through a path that now asks this question — so an unpaired
 * food, which is nearly all of them, must pay nothing at all. A paired one pays
 * a parse it has almost certainly already paid: both loaders are memoised per
 * session and both artifacts are warmed at startup.
 *
 * A failed fetch degrades rather than throws. Logging a food is not something to
 * lose because an artifact would not load, and the honest result of not being
 * able to read the reference food is the panel the label already carried, with
 * no envelope beside it — which is exactly the state an unpaired pack is in.
 *
 * **The cooked set is a third fetch, and it is conditional on the first two.**
 * A pairing the shipped Nutrient store cannot answer for is a Pairing target,
 * because a Declared state records nothing and the id is the state (§11) — so
 * that, and only that, is what reaches for `loadCooked`. Every ordinary paired
 * pack resolves without it, which is ADR-0113 §11's promise kept at the one seam
 * that could break it.
 */
export async function loadReferenceFoods(
  twins: readonly (Record<string, unknown> | undefined)[],
  loadStore: () => Promise<UsdaCorpusNutrientStore> = loadNutrientStore,
  loadCorpus: () => Promise<SearchCorpus> = loadSearchCorpus,
  loadCooked: () => Promise<PairingTargetSet> = loadPairingTargetSet
): Promise<ReferenceFoods | undefined> {
  const references = new Set(
    twins
      .map((attributes) => readFoodPairing(attributes))
      .filter((reference): reference is string => reference !== undefined)
  );
  if (references.size === 0) return undefined;
  const [store, corpus] = await Promise.all([
    loadStore().catch(() => undefined),
    loadCorpus().catch(() => undefined),
  ]);
  // The cooked set is asked for only where the shipped store was read AND could
  // not answer for something, which is what keeps §11's promise that a person
  // who never declares a pack cooked never fetches either new artifact. A store
  // that did not load answers for nothing, and that is no evidence about any id
  // — so an offline device spends no second fetch discovering it is offline.
  const unresolved =
    store !== undefined &&
    [...references].some(
      (reference) => referenceFoodPanel(store, reference) === undefined
    );
  const cooked = unresolved ? await loadCooked() : {};
  if (!store && !corpus) return undefined;
  return referenceFoodsFrom(store, corpus, cooked);
}

/**
 * The envelope one occasion freezes, or `undefined` where there is nothing to
 * say.
 *
 * `filled_fields` empty is the whole of "nothing to say": a pairing that
 * supplied no key leaves no trace on the occasion, so absence means exactly one
 * thing ledger-wide (§6). That happens on every pack whose label is complete for
 * what a reference food may lawfully fill, and on every pairing whose reference
 * food has left the corpus — both of which freeze the label alone, which is what
 * they are.
 */
export function freezePairing(
  reference: string,
  name: string | undefined,
  filled_fields: readonly string[]
): FrozenPairing | undefined {
  const fdcId = fdcIdFor(reference);
  if (fdcId === null || filled_fields.length === 0) return undefined;
  return {
    ref: reference,
    name: name ?? reference,
    source_uri: `${FDC_FOOD_BASE}/${fdcId}`,
    filled_fields: [...filled_fields],
  };
}

/**
 * What a scaler reads off one food twin, and what a freeze writes beside the
 * numbers it produces — the panel a Pack pairing widened, and the envelope
 * naming what widened it.
 *
 * **This is the one place a pairing enters a logged occasion**, on every path: a
 * food logged from the sheet, a dish's ingredient row, an amount corrected, a
 * Selection scaled. A caller that wanted only the panel would be free to freeze
 * borrowed numbers with nothing naming them, which is the defect §6 exists to
 * prevent, so the two are one return value.
 *
 * `references` absent — because nothing here is paired, or because the artifacts
 * would not load — hands back the twin's stored panel untouched and no envelope,
 * which is the state every unpaired food is already in.
 */
export function pairedSource(
  attributes: Record<string, unknown> | undefined,
  references: ReferenceFoods | undefined
): IngredientSource {
  const panel = attributes?.[NUTRITION_INFO_ATTR] as NutritionInfo | undefined;
  const density = readFoodDensity(attributes);
  const reference = readFoodPairing(attributes);
  if (!panel || !reference || !references) return { panel, density };
  const marked = markPanel(panel, references.panel(reference), density);
  const pairing = freezePairing(
    reference,
    references.name(reference),
    marked.filled_fields
  );
  // `markPanel` hands back the very panel it was given when it filled nothing,
  // so the no-fill arm carries the label itself rather than a copy of it.
  return pairing
    ? { panel: marked.panel, density, pairing }
    : { panel, density };
}

/**
 * Every panel key any of these sources borrowed — the `est` set a dish's figures
 * are marked against (ADR-0113 §5).
 *
 * A union rather than a per-row account, because that is what the mark means on
 * a dish: *not every figure in this row was printed on a label*. A sum over
 * twelve ingredients of which one was paired is exactly as borrowed, in the keys
 * that one supplied, as a sum over one — and §5 refuses a second, softer mark
 * that would try to say how much.
 *
 * The frozen shape is the other one and is per row on purpose (§6): a reader
 * reconstructs the borrowed share by summing the marked rows, which a union
 * could not tell them.
 */
export function borrowedKeys(
  sources: Iterable<IngredientSource | undefined>
): Set<string> {
  const keys = new Set<string>();
  for (const source of sources)
    for (const key of source?.pairing?.filled_fields ?? []) keys.add(key);
  return keys;
}
