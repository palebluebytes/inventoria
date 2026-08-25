// ---------------------------------------------------------------------------
// The twin-merge adjudication ledger (ADR-0051)
// ---------------------------------------------------------------------------
//
// `fdcIdentityKey` collects Foundation and SR Legacy records under a shared
// `ndbNumber`. That relies on USDA reusing a number only for one food, and it
// does not: 11243 holds a raw portabella and a grilled one, 9501 holds Honeycrisp
// and Golden Delicious, 2047 holds iodized salt and plain. Where that happens the
// merge fuses two foods, and one of them leaves the corpus wearing the other's
// name.
//
// ADR-0048 §4 closed the merge to `ndbNumber` and forbade a curated pairing list.
// Its reason was sound and it answered the wrong direction: a NEW number means a
// new food, which is true, while the merge depends on the converse. ADR-0051
// records the reversal, and this is what it produces — not a list that pairs
// records, but one that refuses to.
//
// EVERY twin pair is here, not only the fused ones. A ledger that answers "what
// have we looked at" cannot hold a category it declines to look at, and the
// generator FAILS on a pair this list does not name, and on a name here it never
// sees (`assertTwinLedgerCovers` in `scripts/usda-bundle.mjs`). A mirror refresh
// that introduces an unadjudicated twin stops the build rather than silently
// fusing it.
//
// The verdicts were reached one at a time against the evidence hierarchy in
// `docs/research/145-twin-fusion-adjudication.md` §6, pre-registered before a
// pair was read. That note and `docs/research/145-twin-ledger.json` carry the
// reasoning and the `fdcId`s; this file carries only what the rule and the check
// need, and `usda-twin-ledger.test.ts` locks the two together.
//
// NOTHING IN THE APP IMPORTS THIS FILE. The generator reaches it through the
// same esbuild seam it reaches the filters through, so 190 rows of adjudication
// never enter a bundle a user downloads — the arrangement `food-vocabulary.ts`
// and `curated-stand-ins.ts` both use.
// ---------------------------------------------------------------------------

/**
 * Why a pair was merged or split, from the closed set fixed before the sweep ran.
 * A code invented while adjudicating is the failure the pre-registration exists
 * to catch, so this union is the whole of it.
 *
 * The reason code IS the verdict — no pair carries a code that appears on both
 * sides, which the sweep checked and {@link twinVerdictOf} relies on.
 */
export type TwinReasonCode = TwinMergeReason | TwinSplitReason;

/**
 * `same-name`: the two descriptions read alike once archive boilerplate is
 * stripped, so there are not two names to weigh. `rename`: one food, USDA
 * rewrote the description. `narrowing`: the survivor names the default instance
 * of the same food.
 */
export type TwinMergeReason = "same-name" | "rename" | "narrowing";

/**
 * The evidence hierarchy. `separate-ndb-elsewhere` is level 1 — USDA holds one
 * of the pair under a DIFFERENT number, so the shared one cannot mean this pair.
 * The rest are level 2's identity-forming dimensions.
 */
export type TwinSplitReason =
  | "separate-ndb-elsewhere"
  | "cultivar"
  | "species"
  | "preparation-state"
  | "milled-form"
  | "added-ingredient";

const SPLIT_REASONS: ReadonlySet<string> = new Set([
  "separate-ndb-elsewhere",
  "cultivar",
  "species",
  "preparation-state",
  "milled-form",
  "added-ingredient",
]);

/** True when this reason refuses the merge rather than confirming it. */
export function twinVerdictOf(reason: TwinReasonCode): "merge" | "split" {
  return SPLIT_REASONS.has(reason) ? "split" : "merge";
}

/**
 * One adjudicated pair: `ndbNumber`, the reason, and the two descriptions with
 * archive boilerplate stripped — Foundation's first, SR Legacy's second.
 *
 * The descriptions are carried because they are what the verdict was reached by
 * READING. The check compares them, so a mirror refresh that rewrites either one
 * fails rather than quietly reusing a judgement about different words.
 */
export type TwinLedgerEntry = readonly [
  ndbNumber: number,
  reason: TwinReasonCode,
  foundation: string,
  sr_legacy: string,
];

/**
 * The 8 pairs USDA numbered alike and this project does not merge.
 *
 * Kept apart from the 182 confirmations below because these are the whole of
 * the change: each one becomes two rows, and each is named in ADR-0051 with what
 * the split costs.
 */
export const SPLIT_TWINS: readonly TwinLedgerEntry[] = [
  [2047, "added-ingredient", "Salt, table, iodized", "Salt, table"],
  [
    5332,
    "added-ingredient",
    "Chicken, ground, with additives, raw",
    "Chicken, ground, raw",
  ],
  [
    9206,
    "preparation-state",
    "Orange juice, no pulp, not fortified, not from concentrate, refrigerated",
    "Orange juice, raw",
  ],
  [
    9501,
    "cultivar",
    "Apples, honeycrisp, with skin, raw",
    "Apples, raw, golden delicious, with skin",
  ],
  [
    11243,
    "separate-ndb-elsewhere",
    "Mushroom, portabella",
    "Mushrooms, portabella, grilled",
  ],
  [12220, "milled-form", "Flaxseed, ground", "Seeds, flaxseed"],
  [
    16222,
    "added-ingredient",
    "Soy milk, unsweetened, plain, shelf stable",
    "Soymilk (all flavors), unsweetened, with added calcium, vitamins A and D",
  ],
  [20140, "milled-form", "Flour, spelt, whole grain", "Spelt, uncooked"],
];

/**
 * The 182 pairs adjudicated as one food, kept so the census has no hole.
 *
 * These change nothing. They are here because a pair absent from the ledger has
 * to be an error rather than a default, and that is only possible if the merges
 * are written down too.
 */
export const MERGED_TWINS: readonly TwinLedgerEntry[] = [
  [1001, "rename", "Butter, stick, salted", "Butter, salted"],
  [1009, "same-name", "Cheese, cheddar", "Cheese, cheddar"],
  [
    1012,
    "rename",
    "Cottage cheese, full fat, large or small curd",
    "Cheese, cottage, creamed, large or small curd",
  ],
  [
    1015,
    "same-name",
    "Cheese, cottage, lowfat, 2% milkfat",
    "Cheese, cottage, lowfat, 2% milkfat",
  ],
  [1017, "rename", "Cream cheese, full fat, block", "Cheese, cream"],
  [1019, "narrowing", "Cheese, feta, whole milk, crumbled", "Cheese, feta"],
  [
    1029,
    "same-name",
    "Cheese, mozzarella, low moisture, part-skim",
    "Cheese, mozzarella, low moisture, part-skim",
  ],
  [1032, "same-name", "Cheese, parmesan, grated", "Cheese, parmesan, grated"],
  [
    1036,
    "same-name",
    "Cheese, ricotta, whole milk",
    "Cheese, ricotta, whole milk",
  ],
  [1040, "same-name", "Cheese, swiss", "Cheese, swiss"],
  [
    1042,
    "rename",
    "Cheese, pasteurized process, American, vitamin D fortified",
    "Cheese, pasteurized process, American, fortified with vitamin D",
  ],
  [1053, "rename", "Cream, heavy", "Cream, fluid, heavy whipping"],
  [1056, "rename", "Cream, sour, full fat", "Cream, sour, cultured"],
  [
    1077,
    "same-name",
    "Milk, whole, 3.25% milkfat, with added vitamin D",
    "Milk, whole, 3.25% milkfat, with added vitamin D",
  ],
  [
    1079,
    "same-name",
    "Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D",
    "Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D",
  ],
  [
    1082,
    "same-name",
    "Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D",
    "Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D",
  ],
  [
    1085,
    "same-name",
    "Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)",
    "Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)",
  ],
  [
    1088,
    "rename",
    "Buttermilk, low fat",
    "Milk, buttermilk, fluid, cultured, lowfat",
  ],
  [1116, "same-name", "Yogurt, plain, whole milk", "Yogurt, plain, whole milk"],
  [1123, "rename", "Eggs, Grade A, Large, egg whole", "Egg, whole, raw, fresh"],
  [1124, "rename", "Eggs, Grade A, Large, egg white", "Egg, white, raw, fresh"],
  [1125, "rename", "Eggs, Grade A, Large, egg yolk", "Egg, yolk, raw, fresh"],
  [
    1126,
    "same-name",
    "Egg, yolk, raw, frozen, pasteurized",
    "Egg, yolk, raw, frozen, pasteurized",
  ],
  [1133, "same-name", "Egg, whole, dried", "Egg, whole, dried"],
  [1137, "same-name", "Egg, yolk, dried", "Egg, yolk, dried"],
  [1145, "rename", "Butter, stick, unsalted", "Butter, without salt"],
  [
    1171,
    "same-name",
    "Egg, whole, raw, frozen, pasteurized",
    "Egg, whole, raw, frozen, pasteurized",
  ],
  [
    1172,
    "same-name",
    "Egg, white, raw, frozen, pasteurized",
    "Egg, white, raw, frozen, pasteurized",
  ],
  [1173, "same-name", "Egg, white, dried", "Egg, white, dried"],
  [
    1227,
    "same-name",
    "Cheese, dry white, queso seco",
    "Cheese, dry white, queso seco",
  ],
  [
    1256,
    "same-name",
    "Yogurt, Greek, plain, nonfat",
    "Yogurt, Greek, plain, nonfat",
  ],
  [
    1285,
    "same-name",
    "Yogurt, Greek, strawberry, nonfat",
    "Yogurt, Greek, strawberry, nonfat",
  ],
  [
    1293,
    "same-name",
    "Yogurt, Greek, plain, whole milk",
    "Yogurt, Greek, plain, whole milk",
  ],
  [2046, "same-name", "Mustard, prepared, yellow", "Mustard, prepared, yellow"],
  [4042, "rename", "Oil, peanut", "Oil, peanut, salad or cooking"],
  [4044, "rename", "Oil, soybean", "Oil, soybean, salad or cooking"],
  [4047, "same-name", "Oil, coconut", "Oil, coconut"],
  [
    4511,
    "rename",
    "Oil, safflower",
    "Oil, safflower, salad or cooking, high oleic (primary safflower oil of commerce)",
  ],
  [
    4518,
    "rename",
    "Oil, corn",
    "Oil, corn, industrial and retail, all purpose salad or cooking",
  ],
  [4582, "same-name", "Oil, canola", "Oil, canola"],
  [
    5665,
    "same-name",
    "Turkey, ground, 93% lean/ 7% fat, raw",
    "Turkey, ground, 93% lean, 7% fat, raw",
  ],
  [
    5666,
    "same-name",
    "Turkey, ground, 93% lean, 7% fat, pan-broiled crumbles",
    "Turkey, ground, 93% lean, 7% fat, pan-broiled crumbles",
  ],
  [
    5671,
    "rename",
    "Chicken, broilers or fryers, drumstick, meat only, cooked, braised",
    "Chicken, broilers or fryers, dark meat, drumstick, meat only, cooked, braised",
  ],
  [
    5746,
    "same-name",
    "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised",
    "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, braised",
  ],
  [
    6164,
    "same-name",
    "Sauce, salsa, ready-to-serve",
    "Sauce, salsa, ready-to-serve",
  ],
  [
    6931,
    "same-name",
    "Sauce, pasta, spaghetti/marinara, ready-to-serve",
    "Sauce, pasta, spaghetti/marinara, ready-to-serve",
  ],
  [
    7022,
    "same-name",
    "Frankfurter, beef, unheated",
    "Frankfurter, beef, unheated",
  ],
  [
    7028,
    "same-name",
    "Ham, sliced, pre-packaged, deli meat (96%fat free, water added)",
    "Ham, sliced, pre-packaged, deli meat (96%fat free, water added)",
  ],
  [
    7089,
    "same-name",
    "Sausage, Italian, pork, mild, cooked, pan-fried",
    "Sausage, Italian, pork, mild, cooked, pan-fried",
  ],
  [
    7919,
    "same-name",
    "Sausage, turkey, breakfast links, mild, raw",
    "Sausage, turkey, breakfast links, mild, raw",
  ],
  [
    7954,
    "same-name",
    "Sausage, breakfast sausage, beef, pre-cooked, unprepared",
    "Sausage, breakfast sausage, beef, pre-cooked, unprepared",
  ],
  [9021, "narrowing", "Apricot, with skin, raw", "Apricots, raw"],
  [9040, "rename", "Bananas, ripe and slightly ripe, raw", "Bananas, raw"],
  [9042, "same-name", "Blackberries, raw", "Blackberries, raw"],
  [9050, "same-name", "Blueberries, raw", "Blueberries, raw"],
  [9070, "narrowing", "Cherries, sweet, dark red, raw", "Cherries, sweet, raw"],
  [9094, "same-name", "Figs, dried, uncooked", "Figs, dried, uncooked"],
  [
    9123,
    "same-name",
    "Grapefruit juice, white, canned or bottled, unsweetened",
    "Grapefruit juice, white, canned or bottled, unsweetened",
  ],
  [
    9130,
    "rename",
    "Grape juice, purple, with added vitamin C, from concentrate, shelf stable",
    "Grape juice, canned or bottled, unsweetened, with added ascorbic acid",
  ],
  [9148, "same-name", "Kiwifruit, green, raw", "Kiwifruit, green, raw"],
  [9181, "same-name", "Melons, cantaloupe, raw", "Melons, cantaloupe, raw"],
  [9184, "same-name", "Melons, honeydew, raw", "Melons, honeydew, raw"],
  [9191, "same-name", "Nectarines, raw", "Nectarines, raw"],
  [9202, "same-name", "Oranges, raw, navels", "Oranges, raw, navels"],
  [
    9209,
    "rename",
    "Orange juice, no pulp, not fortified, from concentrate, refrigerated",
    "Orange juice, chilled, includes from concentrate",
  ],
  [9236, "same-name", "Peaches, yellow, raw", "Peaches, yellow, raw"],
  [9266, "rename", "Pineapple, raw", "Pineapple, raw, all varieties"],
  [9277, "rename", "Plantains, ripe, raw", "Plantains, yellow, raw"],
  [9302, "same-name", "Raspberries, raw", "Raspberries, raw"],
  [9316, "same-name", "Strawberries, raw", "Strawberries, raw"],
  [
    9400,
    "rename",
    "Apple juice, with added vitamin C, from concentrate, shelf stable",
    "Apple juice, canned or bottled, unsweetened, with added ascorbic acid",
  ],
  [
    9401,
    "rename",
    "Applesauce, unsweetened, with added vitamin C",
    "Applesauce, canned, unsweetened, with added ascorbic acid",
  ],
  [9412, "same-name", "Pears, raw, bartlett", "Pears, raw, bartlett"],
  [
    9415,
    "rename",
    "Pear, Anjou, green, with skin, raw",
    "Pears, raw, green anjou",
  ],
  [
    9500,
    "rename",
    "Apples, red delicious, with skin, raw",
    "Apples, raw, red delicious, with skin",
  ],
  [
    9502,
    "rename",
    "Apples, granny smith, with skin, raw",
    "Apples, raw, granny smith, with skin",
  ],
  [
    9503,
    "rename",
    "Apples, gala, with skin, raw",
    "Apples, raw, gala, with skin",
  ],
  [
    9504,
    "rename",
    "Apples, fuji, with skin, raw",
    "Apples, raw, fuji, with skin",
  ],
  [9542, "rename", "Plantains, underripe, raw", "Plantains, green, raw"],
  [10219, "rename", "Pork, ground, raw", "Pork, fresh, ground, raw"],
  [11052, "same-name", "Beans, snap, green, raw", "Beans, snap, green, raw"],
  [
    11056,
    "same-name",
    "Beans, snap, green, canned, regular pack, drained solids",
    "Beans, snap, green, canned, regular pack, drained solids",
  ],
  [11080, "same-name", "Beets, raw", "Beets, raw"],
  [11086, "same-name", "Beet greens, raw", "Beet greens, raw"],
  [11090, "same-name", "Broccoli, raw", "Broccoli, raw"],
  [11098, "same-name", "Brussels sprouts, raw", "Brussels sprouts, raw"],
  [11109, "narrowing", "Cabbage, green, raw", "Cabbage, raw"],
  [11112, "same-name", "Cabbage, red, raw", "Cabbage, red, raw"],
  [
    11116,
    "rename",
    "Cabbage, bok choy, raw",
    "Cabbage, chinese (pak-choi), raw",
  ],
  [11124, "rename", "Carrots, mature, raw", "Carrots, raw"],
  [
    11130,
    "same-name",
    "Carrots, frozen, unprepared",
    "Carrots, frozen, unprepared",
  ],
  [11135, "same-name", "Cauliflower, raw", "Cauliflower, raw"],
  [11143, "same-name", "Celery, raw", "Celery, raw"],
  [11161, "same-name", "Collards, raw", "Collards, raw"],
  [11205, "same-name", "Cucumber, with peel, raw", "Cucumber, with peel, raw"],
  [11209, "same-name", "Eggplant, raw", "Eggplant, raw"],
  [11215, "same-name", "Garlic, raw", "Garlic, raw"],
  [11233, "same-name", "Kale, raw", "Kale, raw"],
  [
    11236,
    "same-name",
    "Kale, frozen, cooked, boiled, drained, without salt",
    "Kale, frozen, cooked, boiled, drained, without salt",
  ],
  [11238, "rename", "Mushrooms, shiitake", "Mushrooms, shiitake, raw"],
  [
    11251,
    "same-name",
    "Lettuce, cos or romaine, raw",
    "Lettuce, cos or romaine, raw",
  ],
  [
    11252,
    "rename",
    "Lettuce, iceberg, raw",
    "Lettuce, iceberg (includes crisphead types), raw",
  ],
  [11253, "rename", "Lettuce, leaf, green, raw", "Lettuce, green leaf, raw"],
  [11257, "rename", "Lettuce, leaf, red, raw", "Lettuce, red leaf, raw"],
  [11260, "rename", "Mushrooms, white button", "Mushrooms, white, raw"],
  [
    11266,
    "rename",
    "Mushroom, crimini",
    "Mushrooms, brown, italian, or crimini, raw",
  ],
  [
    11296,
    "same-name",
    "Onion rings, breaded, par fried, frozen, prepared, heated in oven",
    "Onion rings, breaded, par fried, frozen, prepared, heated in oven",
  ],
  [11298, "same-name", "Parsnips, raw", "Parsnips, raw"],
  [11333, "rename", "Peppers, bell, green, raw", "Peppers, sweet, green, raw"],
  [11413, "rename", "Flour, potato", "Potato flour"],
  [11457, "rename", "Spinach, mature", "Spinach, raw"],
  [
    11482,
    "same-name",
    "Squash, winter, acorn, raw",
    "Squash, winter, acorn, raw",
  ],
  [
    11485,
    "same-name",
    "Squash, winter, butternut, raw",
    "Squash, winter, butternut, raw",
  ],
  [
    11540,
    "rename",
    "Tomato juice, with added ingredients, from concentrate, shelf stable",
    "Tomato juice, canned, with salt added",
  ],
  [
    11546,
    "rename",
    "Tomato, paste, canned, without salt added",
    "Tomato products, canned, paste, without salt added",
  ],
  [11564, "same-name", "Turnips, raw", "Turnips, raw"],
  [
    11693,
    "same-name",
    "Tomatoes, crushed, canned",
    "Tomatoes, crushed, canned",
  ],
  [11821, "rename", "Peppers, bell, red, raw", "Peppers, sweet, red, raw"],
  [
    11937,
    "same-name",
    "Pickles, cucumber, dill or kosher dill",
    "Pickles, cucumber, dill or kosher dill",
  ],
  [11950, "rename", "Mushroom, enoki", "Mushrooms, enoki, raw"],
  [
    11951,
    "rename",
    "Peppers, bell, yellow, raw",
    "Peppers, sweet, yellow, raw",
  ],
  [11952, "same-name", "Radicchio, raw", "Radicchio, raw"],
  [11957, "same-name", "Fennel, bulb, raw", "Fennel, bulb, raw"],
  [11960, "same-name", "Carrots, baby, raw", "Carrots, baby, raw"],
  [11987, "rename", "Mushroom, oyster", "Mushrooms, oyster, raw"],
  [11993, "rename", "Mushroom, maitake", "Mushrooms, maitake, raw"],
  [12006, "rename", "Chia seeds, dry, raw", "Seeds, chia seeds, dried"],
  [
    12014,
    "rename",
    "Seeds, pumpkin seeds (pepitas), raw",
    "Seeds, pumpkin and squash seed kernels, dried",
  ],
  [
    12036,
    "rename",
    "Seeds, sunflower seed, kernel, raw",
    "Seeds, sunflower seed kernels, dried",
  ],
  [12061, "rename", "Nuts, almonds, whole, raw", "Nuts, almonds"],
  [12087, "same-name", "Nuts, cashew nuts, raw", "Nuts, cashew nuts, raw"],
  [
    12120,
    "rename",
    "Nuts, hazelnuts or filberts, raw",
    "Nuts, hazelnuts or filberts",
  ],
  [
    12131,
    "same-name",
    "Nuts, macadamia nuts, raw",
    "Nuts, macadamia nuts, raw",
  ],
  [12142, "rename", "Nuts, pecans, halves, raw", "Nuts, pecans"],
  [12147, "rename", "Nuts, pine nuts, raw", "Nuts, pine nuts, dried"],
  [
    12151,
    "same-name",
    "Nuts, pistachio nuts, raw",
    "Nuts, pistachio nuts, raw",
  ],
  [
    12155,
    "rename",
    "Nuts, walnuts, English, halves, raw",
    "Nuts, walnuts, english",
  ],
  [
    12195,
    "rename",
    "Almond butter, creamy",
    "Nuts, almond butter, plain, without salt added",
  ],
  [
    12537,
    "same-name",
    "Seeds, sunflower seed kernels, dry roasted, with salt added",
    "Seeds, sunflower seed kernels, dry roasted, with salt added",
  ],
  [
    12563,
    "same-name",
    "Nuts, almonds, dry roasted, with salt added",
    "Nuts, almonds, dry roasted, with salt added",
  ],
  [
    13236,
    "same-name",
    'Beef, short loin, t-bone steak, bone-in, separable lean only, trimmed to 1/8" fat, choice, cooked, grilled',
    'Beef, short loin, t-bone steak, bone-in, separable lean only, trimmed to 1/8" fat, choice, cooked, grilled',
  ],
  [
    13468,
    "same-name",
    'Beef, short loin, porterhouse steak, separable lean only, trimmed to 1/8" fat, select, raw',
    'Beef, short loin, porterhouse steak, separable lean only, trimmed to 1/8" fat, select, raw',
  ],
  [
    14091,
    "rename",
    "Almond milk, unsweetened, plain, shelf stable",
    "Beverages, almond milk, unsweetened, shelf stable",
  ],
  [15033, "same-name", "Fish, haddock, raw", "Fish, haddock, raw"],
  [15066, "rename", "Fish, pollock, raw", "Fish, pollock, Alaska, raw"],
  [
    15121,
    "same-name",
    "Fish, tuna, light, canned in water, drained solids",
    "Fish, tuna, light, canned in water, drained solids",
  ],
  [
    15234,
    "rename",
    "Fish, catfish, farm raised, raw",
    "Fish, catfish, channel, farmed, raw",
  ],
  [
    15236,
    "rename",
    "Fish, salmon, Atlantic, farm raised, raw",
    "Fish, salmon, Atlantic, farmed, raw",
  ],
  [16087, "rename", "Peanuts, raw", "Peanuts, all types, raw"],
  [
    16098,
    "rename",
    "Peanut butter, creamy",
    "Peanut butter, smooth style, with salt",
  ],
  [16115, "rename", "Flour, soy, full-fat", "Soy flour, full-fat, raw"],
  [16117, "rename", "Flour, soy, defatted", "Soy flour, defatted"],
  [16158, "same-name", "Hummus, commercial", "Hummus, commercial"],
  [17224, "same-name", "Lamb, ground, raw", "Lamb, ground, raw"],
  [19335, "same-name", "Sugars, granulated", "Sugars, granulated"],
  [20008, "rename", "Buckwheat, whole grain", "Buckwheat"],
  [20011, "rename", "Flour, buckwheat", "Buckwheat flour, whole-groat"],
  [20012, "rename", "Bulgur, dry, raw", "Bulgur, dry"],
  [20031, "rename", "Millet, whole grain", "Millet, raw"],
  [
    20036,
    "rename",
    "Rice, brown, long grain, unenriched, raw",
    "Rice, brown, long-grain, raw",
  ],
  [20038, "rename", "Oats, whole grain, rolled, old fashioned", "Oats"],
  [
    20061,
    "rename",
    "Flour, rice, white, unenriched",
    "Rice flour, white, unenriched",
  ],
  [
    20080,
    "rename",
    "Flour, whole wheat, unenriched",
    "Wheat flour, whole-grain",
  ],
  [
    20081,
    "rename",
    "Flour, wheat, all-purpose, enriched, bleached",
    "Wheat flour, white, all-purpose, enriched, bleached",
  ],
  [
    20083,
    "rename",
    "Flour, bread, white, enriched, unbleached",
    "Wheat flour, white, bread, enriched",
  ],
  [20088, "rename", "Wild rice, dry, raw", "Wild rice, raw"],
  [20090, "rename", "Flour, rice, brown", "Rice flour, brown"],
  [20130, "rename", "Flour, barley", "Barley flour or meal"],
  [
    20444,
    "rename",
    "Rice, white, long grain, unenriched, raw",
    "Rice, white, long-grain, regular, raw, unenriched",
  ],
  [
    20481,
    "rename",
    "Flour, wheat, all-purpose, unenriched, unbleached",
    "Wheat flour, white, all-purpose, unenriched",
  ],
  [
    20581,
    "rename",
    "Flour, wheat, all-purpose, enriched, unbleached",
    "Wheat flour, white, all-purpose, enriched, unbleached",
  ],
  [
    23359,
    "same-name",
    'Beef, round, top round roast, boneless, separable lean only, trimmed to 0" fat, select, raw',
    'Beef, round, top round roast, boneless, separable lean only, trimmed to 0" fat, select, raw',
  ],
  [
    23362,
    "same-name",
    'Beef, round, eye of round roast, boneless, separable lean only, trimmed to 0" fat, select, raw',
    'Beef, round, eye of round roast, boneless, separable lean only, trimmed to 0" fat, select, raw',
  ],
  [
    23377,
    "same-name",
    'Beef, loin, tenderloin roast, separable lean only, boneless, trimmed to 0" fat, select, cooked, roasted',
    'Beef, loin, tenderloin roast, separable lean only, boneless, trimmed to 0" fat, select, cooked, roasted',
  ],
  [
    23385,
    "same-name",
    'Beef, loin, top loin steak, boneless, lip-on, separable lean only, trimmed to 1/8" fat, choice, raw',
    'Beef, loin, top loin steak, boneless, lip-on, separable lean only, trimmed to 1/8" fat, choice, raw',
  ],
  [
    23562,
    "same-name",
    "Beef, ground, 90% lean meat / 10% fat, raw",
    "Beef, ground, 90% lean meat / 10% fat, raw",
  ],
  [
    23572,
    "same-name",
    "Beef, ground, 80% lean meat / 20% fat, raw",
    "Beef, ground, 80% lean meat / 20% fat, raw",
  ],
  [
    36408,
    "same-name",
    "Restaurant, Latino, pupusas con frijoles (pupusas, bean)",
    "Restaurant, Latino, pupusas con frijoles (pupusas, bean)",
  ],
  [
    36412,
    "same-name",
    "Restaurant, Latino, tamale, pork",
    "Restaurant, Latino, tamale, pork",
  ],
  [
    36602,
    "same-name",
    "Restaurant, Chinese, fried rice, without meat",
    "Restaurant, Chinese, fried rice, without meat",
  ],
  [
    36622,
    "same-name",
    "Restaurant, Chinese, sweet and sour pork",
    "Restaurant, Chinese, sweet and sour pork",
  ],
  [
    43382,
    "rename",
    "Cranberry juice, not fortified, from concentrate, shelf stable",
    "Cranberry juice, unsweetened",
  ],
];

/** Every pair `fdcIdentityKey` collects across the two bundled archives. */
export const TWIN_LEDGER: readonly TwinLedgerEntry[] = [
  ...SPLIT_TWINS,
  ...MERGED_TWINS,
];

/**
 * The `ndbNumber`s whose two records must NOT be collected together.
 *
 * The whole of the rule the ledger exists to state, derived rather than written
 * twice. {@link fdcIdentityKey} takes it as an argument rather than reaching for
 * it, so the decision is visible at the one call site that groups records.
 */
export const SPLIT_TWIN_NDB_NUMBERS: ReadonlySet<number> = new Set(
  SPLIT_TWINS.map(([ndbNumber]) => ndbNumber)
);

// ---------------------------------------------------------------------------
// Records USDA numbered apart that name a food this corpus already carries
// ---------------------------------------------------------------------------
//
// The converse of everything above. The ledger asks what a SHARED `ndbNumber`
// means, and ADR-0051 answers that sharing one is not proof of one food. This
// asks the other half — whether numbering two records apart is proof of two
// foods — and answers no, for the cases where USDA's own metadata says so.
//
// Deliberately not a predicate. There is no property of a description that
// separates `Cabbage, napa, cooked` from `Cabbage, savoy, cooked`; only knowing
// that napa cabbage and pe-tsai are one vegetable does, and that is a fact about
// the world rather than about the string. So it is a written list, adjudicated
// one row at a time, in the manner of `LOCAL_VOCABULARY` — and like that list it
// is checked at generation, so a mirror refresh that rewrites either description
// fails the build rather than silently dropping a row nobody re-read.
// ---------------------------------------------------------------------------

/**
 * One superseded record: the `fdcId` that leaves, the description it leaves
 * under, the description of the record that keeps the food, and why they are one
 * food.
 *
 * Both descriptions are carried for the reason {@link TwinLedgerEntry} carries
 * its two: they are what the verdict was reached by READING.
 */
export type SupersededRecord = readonly [
  fdcId: number,
  superseded: string,
  survivor: string,
  why: string,
];

/**
 * The records dropped as a second, poorer copy of a food already in the corpus.
 *
 * **One.** A list this short is a list, not a rule; if it grows past a handful,
 * the question is whether USDA's numbering can be read mechanically after all,
 * and that is a measurement rather than another entry.
 */
export const SUPERSEDED_RECORDS: readonly SupersededRecord[] = [
  [
    168572,
    "Cabbage, napa, cooked",
    "Cabbage, chinese (pe-tsai), cooked, boiled, drained, without salt",
    "Napa cabbage and pe-tsai are one vegetable under two names. USDA numbered them apart (11970 against 11120) but filed this one under Brassica oleracea, the species of green cabbage and broccoli, where the pe-tsai record has Brassica rapa (Pekinensis Group) — which is right. It carries 40 nutrient fields against that record's 63, names no cooking method where every other cabbage row does, and reports 3.2 mg of vitamin C against 15.8. Keeping it also suppressed the vocabulary: `napa` retrieved this row literally, so ADR-0049's fallback never fired and never offered the pe-tsai rows that answer the word properly.",
  ],
];

/** The `fdcId`s {@link SUPERSEDED_RECORDS} removes, for the generator's filter. */
export const SUPERSEDED_FDC_IDS: ReadonlySet<number> = new Set(
  SUPERSEDED_RECORDS.map(([fdcId]) => fdcId)
);
