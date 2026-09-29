/**
 * The ceiling for #240's pairing question: every `gtin:` twin in #241's export,
 * adjudicated by hand.
 *
 * Extracted from `pairing-census.mjs` when #495 needed the same population to
 * ask a different question — which limit nutrients a pairing may supply. One
 * hand judgement, read by every census, so no two measurements can drift onto
 * different populations.
 *
 * **The judgement is one act over two populations, and both halves live here.**
 * ADR-0113 §11 ships the cooked records as a second set — the Pairing target
 * set, 1,035 collapsed rows, reached only by a person who declares the pack
 * cooked — so "what could be paired" now has two answers per barcode:
 *
 * - {@link ADJUDICATION} reads every twin against the **as-bought** corpus, the
 *   2,023 rows `public/usda/search-index.json` ships, which is what the default
 *   Declared state reaches.
 * - {@link ACCEPTED} and {@link REFUSED} read the twins that corpus could not
 *   pair against the **Pairing target set**, which is what declaring _cooked_
 *   reaches.
 *
 * #497 wrote the second half into `pairing-target-census.mjs` instead and
 * `veto-census.mjs` then copied its three `fdcId`s out of that, which made the
 * judgement three literals in two files; by #516 they had drifted, three
 * verdicts in the first half still describing a corpus that no longer bounds
 * what is reachable. Folded back here, one file, and the invariants at the foot
 * of this module hold the halves to one population rather than leaving it to
 * whoever reads them next.
 *
 * Type-import-only, deliberately: a bare runner's Node loads it with no install
 * step, which is what lets the four censuses, the offline gate and the
 * quarterly job all read the same judgement (`src/lib/food/curated-stand-ins.ts`
 * has the property for the same reason).
 */

/**
 * What a perfect proposer COULD have offered for each barcode, and why.
 *
 * `fdcId` is the row this session would accept if the app offered it;
 * `null` is a refusal, and `why` carries the refusal's reason as well as the
 * acceptance's. Every entry was read against the shipped 2,023-row **as-bought**
 * corpus rather than against USDA at large, because a row this app does not ship
 * cannot be proposed by anything — and against that corpus rather than the whole
 * of what ships, because ADR-0113 §11's Declared state defaults to as-bought and
 * a person who never reaches for the question meets these 2,023 rows and no
 * others. What declaring _cooked_ adds is {@link ACCEPTED}, never this literal.
 *
 * Three verdicts, not two, and the third is the finding:
 *
 * - `paired` — the corpus holds a reference food for this substance in a state
 *   whose per-100 g composition is a fair stand-in for the product as eaten.
 * - `state-gap` — the corpus holds the INGREDIENT but only dried or raw, and
 *   the product is sold cooked or in brine. ADR-0103/0104 consolidated the
 *   corpus to uncooked foods, so there is a row, and a per-100 g annotation off
 *   it would be wrong by the water the cooking added — roughly threefold for a
 *   pulse. Counted apart from `paired` because calling it a pairing is what
 *   would put a 3x error into a meter.
 * - `none` — no defensible row, or the OFF record does not say what the food is.
 *
 * A `state-gap` names a gap in the as-bought corpus, not a gap in the app: every
 * one of today's three is closed by the Pairing target set, and {@link ACCEPTED}
 * says with what. The verdict stays `state-gap` because it is what the default Declared
 * state reaches, and because the three proposer scores in `pairing-census.mjs`
 * are scores against that corpus — folding the cooked row in here would credit
 * the matcher with a row it cannot see.
 */
export const ADJUDICATION = {
  8436578483167: {
    name: "Aceite de oliva virgen extra",
    verdict: "paired",
    fdcId: 171413,
    why: "Oil, olive, salad or cooking. Same substance, no state change; USDA carries vitamin E and K, which the label does not.",
  },
  4068263049675: {
    name: "Alubia roja cocida",
    verdict: "state-gap",
    fdcId: 175193,
    why: "#240's motivating case. Against the as-bought corpus what survives is `Beans, kidney, all types, dried` at ~333 kcal/100 g against this jar's 104 — the gap itself. `fdcId 173740` (kidney beans, dried, cooked, boiled) is the row the map's Notes cite; ADR-0103/0104's consolidation dropped it from the shipped corpus and ADR-0113 §11 put it back within reach, in the Pairing target set, at x1.22 (see ACCEPTED). Re-read for #516.",
  },
  4068263001970: {
    name: "Bebida de almendra ecologica",
    verdict: "paired",
    fdcId: 1999631,
    why: "Almond milk, unsweetened, plain. Same kind of product at the same dilution order; the label already carries the fortified vitamins, so what USDA adds is the rest.",
  },
  8423352106213: {
    name: "Bebida de arroz + coco",
    verdict: "none",
    fdcId: null,
    why: "A 15% rice drink with 2% coconut milk. The corpus has no rice beverage, and `Nuts, coconut milk` is the undiluted ingredient.",
  },
  5400706613279: {
    name: "Cacao Nibs",
    verdict: "none",
    fdcId: null,
    why: "The corpus holds cocoa POWDER, which is the defatted derivative — 13% fat against the nibs' 55%. Every mineral per 100 g is concentrated by the fat that was pressed out.",
  },
  8852646172007: {
    name: "Chili Paste with holy basil leaves",
    verdict: "none",
    fdcId: null,
    why: "A compound condiment. No single reference food describes it.",
  },
  6921804720304: {
    name: "Crispy Chilli in Oil",
    verdict: "none",
    fdcId: null,
    why: "45% soybean oil, 25% chilli, 15% onion. A recipe, not a food.",
  },
  3228023910039: {
    name: "Emmental Cœur de Meule",
    verdict: "paired",
    fdcId: 746767,
    why: "Cheese, swiss — which is what USDA files Emmental as. The matcher cannot reach it: OFF's leaf tag is `en:emmentaler`, and that word appears nowhere in the corpus.",
  },
  8414532033207: {
    name: "Espinaca picada",
    verdict: "paired",
    fdcId: 1999633,
    why: "Spinach, mature. Frozen chopped spinach is blanched leaf; the per-100 g composition is the same order, and spinach is where USDA's folate, iron and magnesium are worth having.",
  },
  8426967020677: {
    name: "Frijoles negros",
    verdict: "state-gap",
    fdcId: 173734,
    why: "Canned black beans in sauce. `Beans, black, dried` at ~341 kcal/100 g against a jar #241's export reads at 85. Same shape as the kidney bean above, and closed the same way: `fdcId 173735` (black beans, dried, cooked, boiled) is in the Pairing target set at x1.55 (see ACCEPTED). Re-read for #516.",
  },
  3379141822848: {
    name: "Galette De Riz Ronde 22 CM LION",
    verdict: "none",
    fdcId: null,
    why: "Rice paper: rice, tapioca, water, salt, dried into a sheet. A manufactured product, not the grain; the corpus has neither it nor a rice flour that would stand for it.",
  },
  6901089041097: {
    name: "Glasnudeln | Vermicelles",
    verdict: "none",
    fdcId: null,
    why: "Mung bean glass noodles are mung bean STARCH — near-zero protein. `Mung beans, dried` carries 24 g of it. The corpus row names the seed the starch was taken out of.",
  },
  3379140130067: {
    name: "Haricots chinois",
    verdict: "state-gap",
    fdcId: 174281,
    why: "Adjudicated `none` at #243 on the reading that a 2.6x energy disagreement was the macro-overlap check refusing a WRONG FOOD — 122 kcal and 13.1 g protein against `Yardlong bean` raw at 47 and 2.8. #497 falsified that, and #516 corrects the verdict: the row #243 compared against is the green pod, and the pack is the mature seed, which the as-bought corpus ships as `fdcId 174281` Yardlong beans, dried, at 347 kcal — the same x2.8 state gap as the two pulses above. The name was right and the state was not, so the veto has no measured case of catching a wrong food. `fdcId 174282`, boiled, is in the Pairing target set at x0.97 (see ACCEPTED).",
  },
  8410069021649: {
    name: "Harina Gallo",
    verdict: "paired",
    fdcId: 789951,
    why: "Flour, wheat, all-purpose, unbleached. Same substance, no state change.",
  },
  "0060032101083": {
    name: "Jarabe de arce",
    verdict: "paired",
    fdcId: 169661,
    why: "Syrups, maple. The cleanest pairing in the population, and the one the matcher gets for free: OFF's leaf tag is `en:maple-syrups` and the corpus answers it.",
  },
  8424790111005: {
    name: "Kéfir",
    verdict: "paired",
    fdcId: 2259793,
    why: "The corpus has no kefir. `Yogurt, plain, whole milk` is the same milk under a different ferment, and the calcium, B12 and phosphorus a person would want from it do not turn on which culture did the work. A substitution the user must see and confirm, which is the shape #240 already committed to.",
  },
  8480017747297: {
    name: "Liguine-Tallarines",
    verdict: "paired",
    fdcId: 169736,
    why: "Pasta, dry. Dry durum pasta against dry durum pasta.",
  },
  "0078895126389": {
    name: "LKK's PREMIUM DARK SOY SAUCE",
    verdict: "paired",
    fdcId: 174277,
    why: "Soy sauce made from soy and wheat (shoyu). Dark soy carries caramel and sugar the reference does not, and the sodium is the label's anyway (#240: USDA fills silence only).",
  },
  8436551861487: {
    name: "Oli de Gira-Sol",
    verdict: "paired",
    fdcId: 171025,
    why: "Oil, sunflower, linoleic (approx. 65%). The corpus holds four sunflower oils that differ by fatty-acid profile; for the vitamin E a bottle of frying oil is being annotated with, any of them is the same answer.",
  },
  8721321940623: {
    name: "Panko breadcrumbs",
    verdict: "paired",
    fdcId: 174928,
    why: "Bread, crumbs, dry, grated, plain. Adjudicable, and unreachable by the matcher for a reason the matcher cannot fix: this twin was hand-typed from the label and has no OFF record at all.",
  },
  5060326278786: {
    name: "Peanut butter powder",
    verdict: "paired",
    fdcId: 174267,
    why: "Peanut flour, defatted. USDA's name for exactly this product.",
  },
  8431876301304: {
    name: "Pepinillo Laminado",
    verdict: "paired",
    fdcId: 169378,
    why: "Pickles, cucumber, sweet. The ingredients list vinegar and sugar, which is what picks the sweet row over the dill one.",
  },
  8414100382003: {
    name: "Pink tonic",
    verdict: "none",
    fdcId: null,
    why: "The corpus has no tonic water. Hand-typed twin, no OFF record.",
  },
  "0078895126396": {
    name: "Premium Soy Sauce",
    verdict: "paired",
    fdcId: 174277,
    why: "Soy sauce made from soy and wheat (shoyu). The second barcode in the population to land on this row, and the only cross-barcode repeat in it.",
  },
  5013635484287: {
    name: "Pure sesame oil",
    verdict: "paired",
    fdcId: 171016,
    why: "Oil, sesame, salad or cooking.",
  },
  8026160007705: {
    name: "Riccotta",
    verdict: "paired",
    fdcId: 746766,
    why: "Cheese, ricotta, whole milk. The ingredients are whey, milk, cream and salt, which is the whole-milk row rather than the part-skim one.",
  },
  3364699043470: {
    name: "Shanxi sliced noodles",
    verdict: "paired",
    fdcId: 168908,
    why: "Noodles, japanese, somen, dry — dried wheat noodle against dried wheat noodle. `Pasta, dry` would serve as well; neither is reachable from an OFF record that carries no categories at all.",
  },
  6902253111721: {
    name: "Shirataki nouilles",
    verdict: "none",
    fdcId: null,
    why: "Konjac. 20 kcal/100 g and nothing in the corpus resembles it.",
  },
  8480017305978: {
    name: "Tagliata al huevo",
    verdict: "paired",
    fdcId: 169731,
    why: "Noodles, egg, dry.",
  },
  "0300719065117": {
    name: "Tofu Blando",
    verdict: "paired",
    fdcId: 172449,
    why: "Tofu, soft, prepared with calcium sulfate and magnesium chloride (nigari). The coagulant decides the calcium, which is the one number worth pairing tofu for, and the OFF record does not say which was used — so this is an acceptance the user has to make, not one a proposer may make for them.",
  },
  8414100382027: {
    name: "Tonic Water Zero",
    verdict: "none",
    fdcId: null,
    why: "No tonic water in the corpus. Hand-typed twin, no OFF record. (Its `food/ingredients_text` describes a gazpacho — a capture-path defect in the ledger, noted and left to #208.)",
  },
  8424790113009: {
    name: "Unknown",
    verdict: "none",
    fdcId: null,
    why: "The OFF shell case #240 was chartered on, in its harder form: 93 kcal, 7 g fat, 4 g protein, and no name, no categories and no ingredients. A perfect proposer reads the record, and this record does not say what the food is. Only the person holding it can start the pairing.",
  },
  8710411045003: {
    name: "Unknown",
    verdict: "paired",
    fdcId: 172470,
    why: "Peanut butter, smooth style, without salt. The OFF record has NO product name and is still adjudicable, because `en:peanut-butters` says what the blank name does not — the one case in the population where the categories carry the food and the name carries nothing.",
  },
  6901017331207: {
    name: "Vinaigre De Riz 600 G",
    verdict: "paired",
    fdcId: 172237,
    why: "Vinegar, distilled. Honest and worthless: both are water and acetic acid, and the annotation would move no meter. Counted as a pairing because it is one, and reported as moving nothing, because that is the number that decides whether the machinery earns its keep.",
  },
  8424790100047: {
    name: "Yogur natural con leche de vacas de pasto",
    verdict: "paired",
    fdcId: 2259793,
    why: "Yogurt, plain, whole milk.",
  },
};

/**
 * Whether the best row the **Pairing target set** offers is one this session
 * would accept, read by hand against the pack — the same act
 * {@link ADJUDICATION} performs, over the rows the as-bought corpus could not
 * hold (ADR-0113 §11).
 *
 * `fdcId` is the row accepted and `why` is the reason. Only the twins
 * {@link ADJUDICATION} could not pair appear: a twin that already pairs
 * as-bought never meets the question, because the Declared state defaults to
 * as-bought and the widening is the person's to reach for.
 *
 * Kept apart from the energy check on purpose. The veto admits five of these
 * and a person accepts three, and the two it waves through are not noise: they
 * are the reverse error `pairing-target-census.mjs` §5 measures, caught on the
 * live population. A census that reported the veto's five as coverage would be
 * laundering exactly the mistake #497 was asked to price.
 *
 * Three of thirteen, which is what takes the population from 22 to 25 of 35.
 * They happen to be exactly today's three `state-gap` rows — the shipped corpus
 * held the ingredient in the wrong state and this set holds the right one — but
 * that is the data rather than a rule: a `none` could gain a target here too,
 * and the invariants below say only what must hold.
 */
export const ACCEPTED = {
  4068263049675: {
    fdcId: 173740,
    why: "the map's motivating jar; kidney beans boiled, the state the pack is sold in",
  },
  8426967020677: {
    fdcId: 173735,
    why: "black beans boiled; the jar is in sauce and drains to about this",
  },
  3379140130067: {
    fdcId: 174282,
    why:
      "yardlong beans DRIED then boiled — the mature seed, not the green pod #243 measured. " +
      "#243 read this as the macro veto refusing a wrong food; it was the right food in a state the corpus did not hold",
  },
};

/**
 * The twins where the Pairing target set offers a row and the hand refuses it.
 *
 * The other half of {@link ACCEPTED}'s act, in the same record shape — `fdcId`
 * is the row that was offered and turned down — and written down for the same
 * reason the refusals in {@link ADJUDICATION} are: both of these are rows the
 * energy veto waves through, so a reader who only had the acceptances could not
 * tell a measured refusal from an unexamined one.
 */
export const REFUSED = {
  3379141822848: {
    fdcId: 168878,
    why:
      "rice paper is a dried sheet at 341 kcal; `Rice, white, cooked` is 130 kcal of mostly water. " +
      "Right grain, inverted state — the veto is silent because the error lands low",
  },
  6901089041097: {
    fdcId: 168919,
    why:
      "mung bean STARCH against a wheat-and-egg noodle, and dried against cooked. " +
      "Two errors compounding, both on the blind side",
  },
};

/**
 * What must hold between the two halves, checked on load rather than trusted.
 *
 * #516 exists because the halves lived in different files and one went stale
 * against the other. Merging them removes the distance; this removes the
 * silence, so the next divergence is a crash in all four censuses at once
 * rather than a number nobody re-read. No import: a comparison over three
 * object literals keeps the module loadable by a bare runner's Node.
 */
for (const [half, rows] of [
  ["ACCEPTED", ACCEPTED],
  ["REFUSED", REFUSED],
]) {
  for (const [gtin, row] of Object.entries(rows)) {
    if (!ADJUDICATION[gtin])
      throw new Error(`${half}[${gtin}] judges a twin ADJUDICATION does not`);
    if (ADJUDICATION[gtin].verdict === "paired")
      throw new Error(
        `${half}[${gtin}] judges a twin that already pairs as-bought`
      );
    if (typeof row.fdcId !== "number")
      throw new Error(`${half}[${gtin}] names no row`);
    if (gtin in ACCEPTED && gtin in REFUSED)
      throw new Error(`${gtin} is both accepted and refused over the same set`);
  }
}
