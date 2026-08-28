import { describe, it, expect } from "vitest";
import { importersOf } from "./support/importers";
import {
  isFlavouredVariant,
  isDehydratedForm,
  isFortificationDuplicate,
  resolveVariantDrops,
  ADJUDICATED_VARIANTS,
} from "../../src/lib/food/usda-variant-drops";
// ADR-0061's three rules. Each is asked with the descriptions that shared its
// row's head phrase in the corpus at the commit before the drops — the real
// rosters, because a sibling rule tuned against invented siblings is tuned
// against nothing, and because after the drops the evidence for these answers
// is gone.

/** The forty-one rows USDA filed under `Milk`, before ADR-0061 read them. */
const MILK_HEAD = [
  "Milk, buttermilk, fluid, cultured, reduced fat",
  "Milk, imitation, non-soy",
  "Milk, fluid, nonfat, calcium fortified (fat free or skim)",
  "Milk, filled, fluid, with blend of hydrogenated vegetable oils",
  "Milk, filled, fluid, with lauric acid oil",
  "Milk, reduced fat, fluid, 2% milkfat, with added nonfat milk solids and vitamin A and vitamin D",
  "Milk, reduced fat, fluid, 2% milkfat, protein fortified, with added vitamin A and vitamin D",
  "Milk, lowfat, fluid, 1% milkfat, with added nonfat milk solids, vitamin A and vitamin D",
  "Milk, low sodium, fluid",
  "Milk, dry, whole, with added vitamin D",
  "Milk, dry, nonfat, regular, without added vitamin A and vitamin D",
  "Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D",
  "Milk, chocolate, fluid, commercial, reduced fat, with added vitamin A and vitamin D",
  "Milk, chocolate, lowfat, with added vitamin A and vitamin D",
  "Milk, sheep, fluid",
  "Milk, chocolate, lowfat, reduced sugar",
  "Milk, producer, fluid, 3.7% milkfat",
  "Milk, lowfat, fluid, 1% milkfat, protein fortified, with added vitamin A and vitamin D",
  "Milk, nonfat, fluid, with added nonfat milk solids, vitamin A and vitamin D (fat free or skim)",
  "Milk, nonfat, fluid, protein fortified, with added vitamin A and vitamin D (fat free and skim)",
  "Milk, dry, nonfat, calcium reduced",
  "Milk, buttermilk, dried",
  "Milk, chocolate beverage, hot cocoa, homemade",
  "Milk, goat, fluid, with added vitamin D",
  "Milk, human, mature, fluid (For Reference Only)",
  "Milk, indian buffalo, fluid",
  "Milk, evaporated, 2% fat, with added vitamin A and vitamin D",
  "Milk, chocolate, fat free, with added vitamin A and vitamin D",
  "Milk, reduced fat, fluid, 2% milkfat, with added nonfat milk solids, without added vitamin A",
  "Milk, dry, nonfat, regular, with added vitamin A and vitamin D",
  "Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D",
  "Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D",
  "Milk, buttermilk, fluid, whole",
  "Milk, nonfat, fluid, without added vitamin A and vitamin D (fat free or skim)",
  "Milk, fluid, 1% fat, without added vitamin A and vitamin D",
  "Milk, chocolate, fluid, commercial, reduced fat, with added calcium",
  "Milk, dry, whole, without added vitamin D",
  "Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D",
  "Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim)",
  "Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D",
  "Milk, whole, 3.25% milkfat, with added vitamin D",
];

/** The eight rows USDA filed under `Soymilk`, every one of them flavoured. */
const SOYMILK_HEAD = [
  "Soymilk, original and vanilla, unfortified",
  "Soymilk, original and vanilla, with added calcium, vitamins A and D",
  "Soymilk, original and vanilla, light, with added calcium, vitamins A and D",
  "Soymilk, chocolate and other flavors, light, with added calcium, vitamins A and D",
  "Soymilk, original and vanilla, light, unsweetened, with added calcium, vitamins A and D",
  "Soymilk, chocolate, unfortified",
  "Soymilk, chocolate, with added calcium, vitamins A and D",
  "Soymilk, chocolate, nonfat, with added calcium, vitamins A and D",
];

/** The six plain tubs `Yogurt` keeps, and four of the nineteen it loses. */
const YOGURT_HEAD = [
  "Yogurt, plain, low fat",
  "Yogurt, plain, skim milk",
  "Yogurt, Greek, plain, lowfat",
  "Yogurt, Greek, plain, nonfat",
  "Yogurt, plain, whole milk",
  "Yogurt, Greek, plain, whole milk",
  "Yogurt, plain, nonfat",
  "Yogurt, vanilla, low fat.",
  "Yogurt, Greek, strawberry, nonfat",
  "Yogurt, fruit variety, nonfat",
  "Yogurt, chocolate, nonfat milk",
];

describe("isFlavouredVariant", () => {
  it("drops a flavoured form where its head keeps a plain one", () => {
    for (const description of [
      "Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D",
      "Milk, chocolate beverage, hot cocoa, homemade",
    ])
      expect([description, isFlavouredVariant(description, MILK_HEAD)]).toEqual(
        [description, true]
      );
    for (const description of [
      "Yogurt, vanilla, low fat.",
      "Yogurt, Greek, strawberry, nonfat",
      "Yogurt, fruit variety, nonfat",
      "Yogurt, chocolate, nonfat milk",
    ])
      expect([
        description,
        isFlavouredVariant(description, YOGURT_HEAD),
      ]).toEqual([description, true]);
  });

  it("keeps the plain rows the flavoured ones are a variant of", () => {
    for (const description of [
      "Milk, sheep, fluid",
      "Milk, producer, fluid, 3.7% milkfat",
      "Milk, buttermilk, fluid, whole",
    ])
      expect([description, isFlavouredVariant(description, MILK_HEAD)]).toEqual(
        [description, false]
      );
    for (const description of [
      "Yogurt, plain, low fat",
      "Yogurt, Greek, plain, whole milk",
    ])
      expect([
        description,
        isFlavouredVariant(description, YOGURT_HEAD),
      ]).toEqual([description, false]);
  });

  it("does not fire under a head where every plain row carries the word", () => {
    // ADR-0061 §2's exemption, and the whole reason the rule is not a bare
    // roster. `Soymilk, original and vanilla` is USDA's name for PLAIN soy milk:
    // under this head the only rows carrying no roster word besides `vanilla`
    // are the four that carry it, so `vanilla` is the default name rather than a
    // flavour and the rule declines. `chocolate` declines for the same reason on
    // the same head — the four chocolate rows are the only rows carrying no
    // roster word besides `chocolate` — which is why all twelve soymilks are
    // adjudicated by hand instead.
    for (const description of SOYMILK_HEAD)
      expect([
        description,
        isFlavouredVariant(description, SOYMILK_HEAD),
      ]).toEqual([description, false]);
  });

  it("never fires under a head nobody has read", () => {
    // ADR-0061's Scope. `Cheese`, `Ice cream` and `Beverages` all carry a
    // flavour ladder and none of them has been adjudicated, so the rule is off
    // there however plainly the word reads.
    for (const [description, siblings] of [
      [
        "Ice cream, soft serve, chocolate",
        ["Ice cream, soft serve, chocolate", "Ice cream, vanilla"],
      ],
      [
        "Beverages, Carob-flavor beverage mix, powder, prepared with whole milk",
        [
          "Beverages, Carob-flavor beverage mix, powder, prepared with whole milk",
          "Beverages, water, tap, drinking",
        ],
      ],
    ] as const)
      expect([description, isFlavouredVariant(description, siblings)]).toEqual([
        description,
        false,
      ]);
  });
});

describe("isDehydratedForm", () => {
  it("drops a powder where its head keeps a fluid form", () => {
    // The six rows ADR-0061 §3 reaches, all of them under `Milk`.
    const dried = MILK_HEAD.filter((description) =>
      isDehydratedForm(description, MILK_HEAD)
    );
    expect(dried).toEqual([
      "Milk, dry, whole, with added vitamin D",
      "Milk, dry, nonfat, regular, without added vitamin A and vitamin D",
      "Milk, dry, nonfat, calcium reduced",
      "Milk, buttermilk, dried",
      "Milk, dry, nonfat, regular, with added vitamin A and vitamin D",
      "Milk, dry, whole, without added vitamin D",
    ]);
  });

  it("needs the fluid twin, which is what makes the refused marker safe", () => {
    // ADR-0055 §7 refused this marker bare, and that refusal is not reversed:
    // read against a whole description it takes 294 corpus rows. Handed a head
    // with no fluid form it declines, which is why no prune, pasta or cocoa
    // powder can reach it — none of those heads holds one.
    expect(
      isDehydratedForm("Milk, dry, whole, without added vitamin D", [
        "Milk, dry, whole, without added vitamin D",
        "Milk, dry, whole, with added vitamin D",
      ])
    ).toBe(false);
  });

  it("never fires under a head nobody has read, fluid twin or not", () => {
    // The measurement the adjudicated-head guard is here for: the fluid gate
    // alone reaches eight rows, and the two extra are these, under a head
    // nobody has adjudicated.
    const whey = [
      "Whey, acid, dried",
      "Whey, acid, fluid",
      "Whey, sweet, dried",
    ];
    expect(isDehydratedForm("Whey, acid, dried", whey)).toBe(false);
  });
});

describe("isFortificationDuplicate", () => {
  it("keeps the rung that names no addition and drops the rest", () => {
    // ADR-0061 §4, over the 2% ladder: five records of one milk, four of them
    // naming something put in.
    const twoPercent = MILK_HEAD.filter((description) =>
      /2% milkfat/.test(description)
    ).filter((description) => isFortificationDuplicate(description, MILK_HEAD));
    expect(twoPercent).toEqual([
      "Milk, reduced fat, fluid, 2% milkfat, with added nonfat milk solids and vitamin A and vitamin D",
      "Milk, reduced fat, fluid, 2% milkfat, protein fortified, with added vitamin A and vitamin D",
      "Milk, reduced fat, fluid, 2% milkfat, with added nonfat milk solids, without added vitamin A",
      "Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D",
    ]);
    expect(
      isFortificationDuplicate(
        "Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D",
        MILK_HEAD
      )
    ).toBe(false);
  });

  it("groups a rung USDA spelled two ways", () => {
    // The survivor is `Milk, fluid, 1% fat` and the three it beats say `lowfat,
    // fluid, 1% milkfat`. On their words alone they are different foods; the
    // rule reads a canonical fat level, which is the whole reason it has one.
    for (const description of [
      "Milk, lowfat, fluid, 1% milkfat, with added nonfat milk solids, vitamin A and vitamin D",
      "Milk, lowfat, fluid, 1% milkfat, protein fortified, with added vitamin A and vitamin D",
      "Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D",
    ])
      expect([
        description,
        isFortificationDuplicate(description, MILK_HEAD),
      ]).toEqual([description, true]);
    expect(
      isFortificationDuplicate(
        "Milk, fluid, 1% fat, without added vitamin A and vitamin D",
        MILK_HEAD
      )
    ).toBe(false);
  });

  it("does not read an evaporated milk as a fortification of the 2% rung", () => {
    // It names the same fat level and is a different food, so the identity
    // carries the qualifiers that are neither apparatus nor a fat level.
    expect(
      isFortificationDuplicate(
        "Milk, evaporated, 2% fat, with added vitamin A and vitamin D",
        MILK_HEAD
      )
    ).toBe(false);
  });

  it("declines where two rows both name no addition", () => {
    // Two rows are not a ladder. `Yogurt, plain, skim milk` and `Yogurt, plain,
    // nonfat` are one yogurt written twice and neither names an addition, so
    // this rule refuses to choose and ADR-0061 §5 does it by reading them.
    for (const description of [
      "Yogurt, plain, skim milk",
      "Yogurt, plain, nonfat",
    ])
      expect([
        description,
        isFortificationDuplicate(description, YOGURT_HEAD),
      ]).toEqual([description, false]);
  });
});

describe("the rows ADR-0061 §5 adjudicates by hand", () => {
  it("names thirty rows, each once and each with a reason", () => {
    expect(ADJUDICATED_VARIANTS).toHaveLength(30);
    expect(new Set(ADJUDICATED_VARIANTS.map(([fdcId]) => fdcId)).size).toBe(30);
    for (const [fdcId, description, why] of ADJUDICATED_VARIANTS)
      expect([fdcId, description, why.length > 40]).toEqual([
        fdcId,
        expect.any(String),
        true,
      ]);
  });
});

describe("resolveVariantDrops", () => {
  const row = (fdcId: number, description: string) => ({ fdcId, description });

  it("counts a row once, under the first rule that reaches it", () => {
    // The four tallies are a partition, not an overlapping census: the dry
    // nonfat milks are a fortification ladder of their own as well as a
    // dehydrated form, and the hand list names rows a rule may already have
    // taken. Both are settled by asking in one order.
    const drops = resolveVariantDrops([
      row(170876, "Milk, dry, whole, with added vitamin D"),
      row(173454, "Milk, dry, whole, without added vitamin D"),
      row(172225, "Milk, buttermilk, fluid, whole"),
      row(
        170879,
        "Milk, chocolate, fluid, commercial, whole, with added vitamin A and vitamin D"
      ),
      row(170875, "Milk, low sodium, fluid"),
    ]);
    // In the order the rows arrived, since the map is a verdict per row; the
    // hand list is asked last and so trails it.
    expect([...drops]).toEqual([
      [170876, "dehydrated_form"],
      [173454, "dehydrated_form"],
      [170879, "flavoured_variant"],
      [170875, "adjudicated_variant"],
    ]);
  });

  it("says nothing about a row it was not handed", () => {
    // The verdict is about a corpus rather than about a list, which is what
    // lets `usda-corpus.test.ts` ask it of the finished artifact and expect
    // nothing back.
    expect([
      ...resolveVariantDrops([row(172225, "Milk, buttermilk, fluid, whole")]),
    ]).toEqual([]);
  });
});

describe("the variant rules stay out of the app's bundle", () => {
  it("are reached only through the generator's esbuild seam", () => {
    // The arrangement `usda-food-kind.ts` next door documents and this module
    // follows for the same reason: the corpus is filtered once, ahead of time,
    // and thirty rows of adjudication plus their prose would be dead weight on
    // every page load (ADR-0047 §4).
    expect(importersOf("usda-variant-drops")).toEqual([]);
  });
});
