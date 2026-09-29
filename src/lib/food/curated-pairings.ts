import type { UsdaIndexRow } from "./usda-corpus";
import type { PairingTargetRow } from "./pairing-targets";

// ---------------------------------------------------------------------------
// The Curated pairing table (ADR-0113 §14)
// ---------------------------------------------------------------------------
//
// A Pack pairing contributes NOTHING back to Open Food Facts. #243 measured that
// 5 of 9 wrong proposals are the plausible kind, so publishing pairing-derived
// categories would launder plausible-but-wrong identity claims into a commons
// everyone reads. What carries the shared benefit instead is this table: a
// barcode a person meets is offered the reference food someone already
// adjudicated it against, rather than left to search for one.
//
// It is a PRIOR, never a fact. A person's own live `food/pairing` always wins,
// a row only ever pre-selects, and a cleared pairing is never re-offered.
//
// Three properties are load-bearing, and each is a decision in ADR-0113 §14:
//
//  - `set` is written, never derived. §11 made a Pairing target's own `fdc:` id
//    the Declared state, so a row naming one IS the assertion that the pack is
//    cooked. Deriving it instead — `absent from the Search index, so it must be
//    a Pairing target` — turns a stale id into a phantom fetch of an artifact
//    that will never hold it, paid by every holder of that pack every session.
//  - `ground` is what the commitment rests on, and the gates are honest about
//    being less. No check can prove a row was hand-authored: the source module
//    means a row needs a commit, but a generator could write this file tomorrow.
//    What a reviewer reads is the ground, so a submission path scales only by
//    deleting that field — a visible act in a diff. Beside it sit a ceiling
//    asserted by a test and an offline gate,
//    `scripts/curated-pairing-check.mjs`, in `pnpm check`.
//  - A barcode carrying a Curated stand-in (ADR-0046) may never appear here, in
//    the TABLE arm. A stand-in is admitted on an absence argued over the
//    mirrored archives — `5010251341352`'s is a proof that no table carries a
//    cream at the UK's 48% standard — so a Curated pairing for that barcode
//    would assert the negation of the evidence that admitted it. The refusal is
//    narrow and rules this table only: whether a person holding the tub may pair
//    it themselves is open (ADR-0113's fourth reopening clause).
//
// WHAT NOTHING HERE CATCHES. A Curated pairing claims the barcode's SUBSTANCE,
// so what invalidates one is reformulation or GTIN reuse. The quarterly
// `curated:check` job re-reads each barcode and reports one whose Open Food
// Facts record has come to name a different food, which is what reuse looks like
// from here. A barcode OFF does not list is not reported at all — several of
// these packs were typed from their labels and never had a record. What the job
// does NOT cover is REFORMULATION UNDER A STABLE GTIN: the recipe changes, the
// barcode does not, and nothing announces it. That blind spot is named rather than dressed as
// covered, and each row's `captured` date is what makes the claim's age
// auditable in the meantime. A panel-drift threshold would be an instrument
// nobody has aimed, and ADR-0113 §13's energy veto has just priced what a
// mis-aimed instrument costs.
//
// The table sits in its own module, like `curated-stand-ins.ts` and for the same
// reason: `scripts/curated-pairing-check.mjs` and the quarterly job import this
// file directly under a bare runner's Node — no install step, no bundler — which
// works only while every import here is a TYPE import. One runtime import would
// drag in the corpus loaders and a whole extensionless resolution chain Node
// will not follow. Keep it type-only.
//
// THE LIMIT, RECORDED. The seed is one person's shopping, read off #241's
// 15-day ledger export. A stranger's coverage depends on overlapping that
// basket, which is the real bound on the shared benefit and the thing most
// likely to trip ADR-0113's first reopening clause.
// ---------------------------------------------------------------------------

/** One hand-authored claim that a barcode's substance is a named USDA food. */
export interface CuratedPairing {
  /** The barcode, exactly as the pack carries it (no `gtin:` prefix). */
  gtin: string;
  /** The USDA record this pack is annotated from. */
  fdcId: number;
  /**
   * Which shipped set {@link fdcId} is a row of, and therefore the Declared
   * state this row asserts: `pairing-target` says the pack is sold cooked.
   *
   * Spelled off the two index rows' phantom `set` fields rather than written out
   * again, so the three places that name these sets cannot part company.
   */
  set: NonNullable<UsdaIndexRow["set"]> | NonNullable<PairingTargetRow["set"]>;
  /** The pack, as the ledger's capture of it reads (#241's export). */
  product: string;
  /** ISO date the claim below was made, which is what dates its staleness. */
  captured: string;
  /**
   * Why this pack is that food, for a reviewer to read.
   *
   * The field the whole commitment rests on: see the header. It says what the
   * pack is, which USDA record stands for it, and what makes the two the same
   * substance — including where the answer is a substitution a person has to
   * accept rather than an identity.
   */
  ground: string;
}

/**
 * The ceiling on this table (ADR-0113 §14, ADR-0046 §6's exact shape).
 *
 * Not enforced at runtime — it is a review-time signal, and a test asserts it —
 * because the decision it triggers is not "raise the number". Reaching 100 rows
 * means re-arguing ADR-0113's first reopening clause: whether a shared pairing
 * store is ours to hold at all, at which point a table travelling inside the app
 * is the wrong shape for it.
 */
export const CURATED_PAIRING_CEILING = 100;

/**
 * The seed: the 25 barcodes #243's hand adjudication paired, out of the 35
 * `gtin:` twins in #241's export.
 *
 * It ships seeded because a table ratified and delivering nothing is
 * [#62](https://github.com/palebluebytes/inventoria/issues/62) in miniature.
 * The judgement itself lives in `scripts/pairing-adjudication.mjs`, which is
 * where the ten refusals are too — a reader who wants to know why a barcode is
 * NOT here finds the reason written down beside the ones that are.
 *
 * In alphabetical order by `product`, which is the adjudication literal's order,
 * so the two read against each other.
 */
export const CURATED_PAIRINGS: readonly CuratedPairing[] = [
  {
    gtin: "8436578483167",
    fdcId: 171413,
    set: "reference",
    product: "Aceite de oliva virgen extra",
    captured: "2026-09-17",
    ground:
      "Extra virgin olive oil against `Oil, olive, salad or cooking`. The same substance in the same state, and USDA carries the vitamin E and K a bottle's label does not.",
  },
  {
    gtin: "4068263049675",
    fdcId: 173740,
    set: "pairing-target",
    product: "Alubia roja cocida",
    captured: "2026-09-17",
    ground:
      "The jar this map was chartered on: kidney beans cooked in water. The Search index holds only `Beans, kidney, all types, dried` at about 333 kcal/100 g against this jar's 104, and `Beans, kidney, all types, dried, cooked, boiled` is the state the pack is sold in. Naming a Pairing target is this row asserting that.",
  },
  {
    gtin: "4068263001970",
    fdcId: 1999631,
    set: "reference",
    product: "Bebida de almendra ecologica",
    captured: "2026-09-17",
    ground:
      "An unsweetened almond drink against `Almond milk, unsweetened, plain` — the same kind of product at the same dilution. The label already carries the fortified vitamins, so what USDA adds is the rest.",
  },
  {
    gtin: "3228023910039",
    fdcId: 746767,
    set: "reference",
    product: "Emmental Cœur de Meule",
    captured: "2026-09-17",
    ground:
      "Emmental is what USDA files as `Cheese, swiss`. No search reaches it: OFF's leaf tag is `en:emmentaler`, and that word appears nowhere in the corpus — which is the kind of pairing this table exists to carry.",
  },
  {
    gtin: "8414532033207",
    fdcId: 1999633,
    set: "reference",
    product: "Espinaca picada",
    captured: "2026-09-17",
    ground:
      "Frozen chopped spinach is blanched leaf, and `Spinach, mature` is the same composition per 100 g. Spinach is where USDA's folate, iron and magnesium are worth having.",
  },
  {
    gtin: "8426967020677",
    fdcId: 173735,
    set: "pairing-target",
    product: "Frijoles negros",
    captured: "2026-09-17",
    ground:
      "Canned black beans in sauce, which drain to about `Beans, black, dried, cooked, boiled`. The Search index's `Beans, black, dried` is 341 kcal/100 g against a jar the ledger reads at 85 — the same state gap as the kidney beans, closed the same way.",
  },
  {
    gtin: "3379140130067",
    fdcId: 174282,
    set: "pairing-target",
    product: "Haricots chinois",
    captured: "2026-09-18",
    ground:
      "Cooked yardlong beans: the mature seed, not the green pod. #243 read the energy gap here as evidence of a wrong food and #497 falsified that — the name was right and the state was not — so the row is `Yardlong beans, dried, cooked, boiled`.",
  },
  {
    gtin: "8410069021649",
    fdcId: 789951,
    set: "reference",
    product: "Harina Gallo",
    captured: "2026-09-17",
    ground:
      "Plain wheat flour against `Flour, wheat, all-purpose, unbleached`. The same substance in the same state.",
  },
  {
    gtin: "0060032101083",
    fdcId: 169661,
    set: "reference",
    product: "Jarabe de arce",
    captured: "2026-09-17",
    ground:
      "Maple syrup against `Syrups, maple`. The cleanest pairing in the seed, and the one a search finds unaided: OFF's leaf tag is `en:maple-syrups` and the corpus answers it.",
  },
  {
    gtin: "8424790111005",
    fdcId: 2259793,
    set: "reference",
    product: "Kéfir",
    captured: "2026-09-17",
    ground:
      "The corpus holds no kefir. `Yogurt, plain, whole milk` is the same milk under a different ferment, and the calcium, B12 and phosphorus a person would pair it for do not turn on which culture did the work. A substitution rather than an identity, which is why it is offered and never accepted for anyone.",
  },
  {
    gtin: "8480017747297",
    fdcId: 169736,
    set: "reference",
    product: "Liguine-Tallarines",
    captured: "2026-09-17",
    ground:
      "Dry durum linguine against `Pasta, dry`. Both are durum wheat and water dried to the same moisture; the shape is all that differs.",
  },
  {
    gtin: "0078895126389",
    fdcId: 174277,
    set: "reference",
    product: "LKK's PREMIUM DARK SOY SAUCE",
    captured: "2026-09-17",
    ground:
      "Dark soy sauce against `Soy sauce made from soy and wheat (shoyu)`. Dark soy carries caramel and sugar the reference does not; the sodium stays the label's, because a reference food fills silence only (ADR-0113 §4).",
  },
  {
    gtin: "8436551861487",
    fdcId: 171025,
    set: "reference",
    product: "Oli de Gira-Sol",
    captured: "2026-09-17",
    ground:
      "Sunflower oil against `Oil, sunflower, linoleic, (approx. 65%)`. The corpus holds four sunflower oils differing by fatty-acid profile; for the vitamin E a bottle of frying oil is being annotated with, any of them is the same answer.",
  },
  {
    gtin: "8721321940623",
    fdcId: 174928,
    set: "reference",
    product: "Panko breadcrumbs",
    captured: "2026-09-17",
    ground:
      "Panko against `Bread, crumbs, dry, grated, plain`. This twin was hand-typed from the label and has no Open Food Facts record at all, so nothing automatic could ever have proposed it — and the quarterly job, which reads Open Food Facts, has nothing to read for this barcode.",
  },
  {
    gtin: "5060326278786",
    fdcId: 174267,
    set: "reference",
    product: "Peanut butter powder",
    captured: "2026-09-17",
    ground:
      "Peanut butter powder is `Peanut flour, defatted` — USDA's name for exactly this product.",
  },
  {
    gtin: "8431876301304",
    fdcId: 169378,
    set: "reference",
    product: "Pepinillo Laminado",
    captured: "2026-09-17",
    ground:
      "Sliced gherkins against `Pickles, cucumber, sweet`. The ingredients list vinegar and sugar, which is what picks the sweet row over the dill one.",
  },
  {
    gtin: "0078895126396",
    fdcId: 174277,
    set: "reference",
    product: "Premium Soy Sauce",
    captured: "2026-09-17",
    ground:
      "Light soy sauce against `Soy sauce made from soy and wheat (shoyu)`, the same row as the dark bottle above — the only reference food two barcodes in the seed share.",
  },
  {
    gtin: "5013635484287",
    fdcId: 171016,
    set: "reference",
    product: "Pure sesame oil",
    captured: "2026-09-17",
    ground:
      "Pure sesame oil against `Oil, sesame, salad or cooking`. The same substance in the same state.",
  },
  {
    gtin: "8026160007705",
    fdcId: 746766,
    set: "reference",
    product: "Riccotta",
    captured: "2026-09-17",
    ground:
      "Ricotta against `Cheese, ricotta, whole milk`. The ingredients are whey, milk, cream and salt, which is the whole-milk row rather than the part-skim one.",
  },
  {
    gtin: "3364699043470",
    fdcId: 168908,
    set: "reference",
    product: "Shanxi sliced noodles",
    captured: "2026-09-17",
    ground:
      "Dried wheat noodles against `Noodles, japanese, somen, dry`. `Pasta, dry` would serve as well; the OFF record carries no categories at all, so a search reaches neither.",
  },
  {
    gtin: "8480017305978",
    fdcId: 169731,
    set: "reference",
    product: "Tagliata al huevo",
    captured: "2026-09-17",
    ground:
      "Dry egg tagliatelle against `Noodles, egg, dry`. The egg is what separates this row from `Pasta, dry`, and the label names it.",
  },
  {
    gtin: "0300719065117",
    fdcId: 172449,
    set: "reference",
    product: "Tofu Blando",
    captured: "2026-09-17",
    ground:
      "Soft tofu against `Tofu, soft, prepared with calcium sulfate and magnesium chloride (nigari)`. The coagulant decides the calcium, which is the one figure tofu is worth pairing for, and the OFF record does not say which was used — so this is a prior a person confirms, never a fact.",
  },
  {
    gtin: "8710411045003",
    fdcId: 172470,
    set: "reference",
    product: "Unknown",
    captured: "2026-09-17",
    ground:
      "Smooth peanut butter against `Peanut butter, smooth style, without salt`. The OFF record carries no product name at all — `product` above is the blank the ledger holds — and `en:peanut-butters` is what says the food instead. The one row in the seed where the categories carry it and the name carries nothing.",
  },
  {
    gtin: "6901017331207",
    fdcId: 172237,
    set: "reference",
    product: "Vinaigre De Riz 600 G",
    captured: "2026-09-17",
    ground:
      "Rice vinegar against `Vinegar, distilled`. Honest and worthless: both are water and acetic acid, so the annotation moves no meter. It ships because it is a true pairing, and a table that quietly dropped the true-but-useless ones would overstate what the rest are worth.",
  },
  {
    gtin: "8424790100047",
    fdcId: 2259793,
    set: "reference",
    product: "Yogur natural con leche de vacas de pasto",
    captured: "2026-09-17",
    ground:
      "Plain whole-milk yogurt against `Yogurt, plain, whole milk`. Unsweetened and unflavoured on both sides, which is the whole of the match.",
  },
];
