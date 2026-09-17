/**
 * The ceiling for #240's pairing question: every `gtin:` twin in #241's export,
 * adjudicated by hand against the shipped 2,023-row corpus.
 *
 * Extracted from `pairing-census.mjs` when #495 needed the same population to
 * ask a different question — which limit nutrients a pairing may supply. One
 * hand judgement, read by both, so the two measurements cannot drift onto
 * different populations.
 */

/**
 * What a perfect proposer COULD have offered for each barcode, and why.
 *
 * `fdcId` is the row this session would accept if the app offered it;
 * `null` is a refusal, and `why` carries the refusal's reason as well as the
 * acceptance's. Every entry was read against the shipped 2,023-row corpus
 * rather than against USDA at large, because a row this app does not ship
 * cannot be proposed by anything.
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
    why: "#240's motivating case. `fdcId 173740` (kidney beans, cooked, boiled) is the row the map's Notes cite and it is NO LONGER SHIPPED — ADR-0103/0104's consolidation dropped every cooked row. What survives is `Beans, kidney, all types, dried` at ~333 kcal/100 g against this jar's 104.",
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
    why: "Canned black beans in sauce. `Beans, black, dried` at ~341 kcal/100 g against the jar's 91. Same shape as the kidney bean above.",
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
    verdict: "none",
    fdcId: null,
    why: "The name says yardlong bean and the label does not: 122 kcal and 13.1 g protein against `Yardlong bean` raw at 47 and 2.8. The only candidate disagrees with the printed panel by 2.6x on energy, which is the macro-overlap check refusing a pairing the name would have waved through.",
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
