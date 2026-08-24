import { describe, it, expect } from "vitest";
import {
  readReferenceFoodName,
  compileReferenceFoodQuery,
  compareRelevance,
  plainSiblingsOf,
  readRowRank,
} from "../../src/lib/food/reference-food-ranking";
import type { RelevanceKey } from "../../src/lib/food/reference-food-ranking";

// ADR-0042 §5's ordering, asserted on the two halves it is now built from: the
// query-independent reading of a name, and the query's score over it. The tiers
// themselves are exercised end-to-end over the committed corpus in
// `usda-corpus.test.ts`; these pin the pieces those cases rest on.

const rank = (query: string, description: string) =>
  compileReferenceFoodQuery(query)(readReferenceFoodName(description));

/** A name key completed with the two ROW keys a pair of rows can tie on. */
const tiedOnRowKeys = (key: ReturnType<typeof rank>): RelevanceKey => ({
  ...key,
  plainSibling: 1,
  designated: 1,
});

describe("readReferenceFoodName", () => {
  it("reads the head phrase as the words before the first comma", () => {
    const name = readReferenceFoodName("Grapes, red, seedless, raw");
    expect(name.words).toEqual(["grapes", "red", "seedless", "raw"]);
    expect(name.headLength).toBe(1);
  });

  it("treats a comma-less description as all head", () => {
    expect(readReferenceFoodName("Vinegar balsamic").headLength).toBe(2);
  });

  it("singularises the plurals food names are full of", () => {
    // A bare trailing "s" turned "potatoes" into "potatoe", which no spelling of
    // "potato" equals — so the food ranked below "Sweet potato leaves" on a
    // search for its own name.
    expect(readReferenceFoodName("Potatoes, raw").stems).toContain("potato");
    expect(readReferenceFoodName("Tomatoes, raw").stems).toContain("tomato");
    expect(readReferenceFoodName("Cherries, sour, raw").stems).toContain(
      "cherry"
    );
    // …without disturbing the words a bare "s" already got right. Both sides of
    // a comparison run through the same function, so a word that is not a plural
    // only has to stem consistently, not correctly.
    expect(readReferenceFoodName("Cheese, cheddar").stems).toContain("cheese");
    expect(readReferenceFoodName("Pies, apple").stems).toContain("pie");
  });

  it("drops the -es English adds after a sibilant, so 'radish' answers both", () => {
    // #138: a bare "s" leaves "radishe", which no spelling of "radish" equals,
    // so a search for the vegetable led with "Radish seeds, sprouted, raw".
    // (ch|sh|x|ss|z) is the whole set of endings English does this to.
    expect(readReferenceFoodName("Radishes, raw").stems).toContain("radish");
    expect(readReferenceFoodName("Peaches, yellow, raw").stems).toContain(
      "peach"
    );
    // A word that only LOOKS like one of those plurals stems wrongly and
    // harmlessly: "molasses" becomes "molass", which no other corpus word
    // becomes, so it still answers itself and nothing else.
    expect(readReferenceFoodName("Molasses").stems).toEqual(["molass"]);
  });

  it("singularises 'leaves' as the one irregular it carries, not as a -ves rule", () => {
    // #138: the corpus holds six -ves words and only two are plurals, so a
    // blanket rule would stem "chives" to "chif", "cloves" to "clof" and
    // "olives" to "olif" — each of which still matches itself, but stops
    // answering the SINGULAR a user types, which works today.
    expect(readReferenceFoodName("Grape leaves, raw").stems).toContain("leaf");
    expect(readReferenceFoodName("Chives, raw").stems).toContain("chive");
    expect(readReferenceFoodName("Spices, cloves, ground").stems).toContain(
      "clove"
    );
    expect(readReferenceFoodName("Olives, ripe, canned").stems).toContain(
      "olive"
    );
    // "halves" is rejected on the same measurement: half-ing it regresses
    // "halves" from walnut halves to a pork rump half and improves nothing.
    expect(readReferenceFoodName("Nuts, walnuts, halves, raw").stems).toContain(
      "halve"
    );
  });

  it("stems only a trailing plural, so 'grapes' answers 'grape'", () => {
    expect(readReferenceFoodName("Grapes, raw").stems).toContain("grape");
    // Not a stemmer: "grapefruit" keeps its own identity, which is the whole
    // distinction a prefix search cannot draw.
    expect(readReferenceFoodName("Grapefruit, raw").stems).toContain(
      "grapefruit"
    );
  });

  it("counts the shelf label USDA writes where a food's name should be", () => {
    // ADR-0042's #154 Amendment. USDA names a drink for the aisle before it
    // names the drink — the food is `wine`, and two words are spent getting
    // there — so the words a food's own name starts at are counted here once.
    expect(
      readReferenceFoodName("Alcoholic beverage, wine, table, red").shelfLength
    ).toBe(2);
    expect(readReferenceFoodName("Beverages, tea, green").shelfLength).toBe(1);
    expect(
      readReferenceFoodName("Fish, salmon, Atlantic, raw").shelfLength
    ).toBe(1);
    // A head that names the food itself is not a shelf label, however many rows
    // share it: `Beef, chuck, arm pot roast` qualifies beef by its CUT, where
    // `Fish, salmon` qualifies fish by a different fish.
    expect(
      readReferenceFoodName("Beef, chuck, arm pot roast, raw").shelfLength
    ).toBe(0);
    expect(readReferenceFoodName("Oil, olive, extra virgin").shelfLength).toBe(
      0
    );
    // A label with nothing after it is the food's whole name, so there is no
    // shelf to discount — the row would otherwise have no name at all.
    expect(readReferenceFoodName("Spices").shelfLength).toBe(0);
  });

  it("reads a shelf label through the spacing USDA actually wrote", () => {
    // `Game meat , bison, ground, raw` ships with the space before its comma.
    expect(
      readReferenceFoodName("Game meat , bison, ground, raw").shelfLength
    ).toBe(2);
  });

  it("demotes a modifier that is only ever the WHOLE qualifier", () => {
    // ADR-0042's #154 Amendment. `light` as a word reaches 49 corpus rows and
    // most are not light anything — chicken LIGHT MEAT, mushrooms exposed to
    // ultraviolet LIGHT — so it is read as a whole comma-part, where all 15 it
    // reaches are a reduced form of their food.
    expect(readReferenceFoodName("Sour cream, light").plain).toBe(0);
    expect(readReferenceFoodName("Alcoholic beverage, wine, light").plain).toBe(
      0
    );
    expect(
      readReferenceFoodName("Chicken, broilers or fryers, light meat, raw")
        .plain
    ).toBe(1);
    // Same for `cooking`: the whole part is a cooking wine, which is salted and
    // not a drink; the word alone takes six salad-or-cooking oils with it.
    expect(
      readReferenceFoodName("Alcoholic beverage, wine, cooking").plain
    ).toBe(0);
    expect(readReferenceFoodName("Oil, olive, salad or cooking").plain).toBe(1);
  });

  it("reads a de-alcoholised drink as the modified form it is", () => {
    // `non-alcoholic` needs no new mechanism: it is the family MODIFIED_FORM
    // already names with `nonfat` and `non-soy`, and both rows it reaches are a
    // form of a drink with the alcohol taken out.
    expect(readReferenceFoodName("Beverages, Wine, non-alcoholic").plain).toBe(
      0
    );
    expect(
      readReferenceFoodName("Malt beverage, includes non-alcoholic beer").plain
    ).toBe(0);
  });

  it("settles the raw keys, which no query changes", () => {
    expect(readReferenceFoodName("Bananas, raw").simplicity).toBe(3);
    expect(readReferenceFoodName("Bananas, overripe, raw").simplicity).toBe(2);
    expect(readReferenceFoodName("Beef, raw, ground").simplicity).toBe(1);
    expect(readReferenceFoodName("Cheese, cheddar").raw).toBe(0);
  });
});

describe("compileReferenceFoodQuery", () => {
  it("scores the food whose head IS the query above one that merely holds it", () => {
    expect(rank("grape", "Grapes, raw").tier).toBe(50);
    expect(rank("grape", "Grape leaves, raw").tier).toBeLessThan(50);
  });

  it("walks the whole ladder down one name at a time", () => {
    // Each rung asks how much of the food's own name the query accounts for.
    const grape = (d: string) => rank("grape", d).tier;
    expect(grape("Grapes, red, seedless, raw")).toBe(50); // the head IS "grape"
    expect(grape("Grape leaves, raw")).toBe(40); // a typed word IS a head word
    expect(grape("Grapefruit, raw")).toBe(30); // the head completes "grape"
    expect(grape("Tomatoes, grape, raw")).toBe(20); // whole word, qualifier only
    expect(grape("Cheese, cheddar")).toBe(0); // nothing
  });

  it("scores a head the query COMPLETES above a word the query lands on", () => {
    // The reported case: "pot" reached "Beef, chuck, arm pot roast" before it
    // reached potatoes, because "pot" is a whole word there and only a prefix in
    // "Potatoes". USDA names a food "Food, qualifier", so completing the head
    // names the food; landing on a qualifier does not.
    expect(rank("pot", "Potatoes, flesh and skin, raw").tier).toBe(30);
    expect(rank("pot", "Beef, chuck, arm pot roast, raw").tier).toBe(20);
    // And a typed word landing ON a head word still beats both.
    expect(rank("pot", "Pot roast, raw").tier).toBe(40);
  });

  it("scores a whole-word match above a bare prefix one", () => {
    // "grape" is a whole word of "Juice, grape, canned" but the head is "juice",
    // so neither head rung applies; a partial "grap" reaches "Juice,
    // grapefruit, …" by prefix alone and not through its head either.
    expect(rank("grape", "Juice, grape, canned").tier).toBe(20);
    expect(rank("grap", "Juice, grapefruit, canned").tier).toBe(10);
    // …while the same word inside the HEAD lifts the food a rung, even when the
    // head carries more than the query.
    expect(rank("grapefruit", "Grapefruit juice, white").tier).toBe(40);
  });

  it("keeps the settled head above the one the query only completes", () => {
    // Both name a food the query reaches through its head, but only one IS the
    // query — which is what keeps "grape" answering with grapes.
    expect(rank("grape", "Grapes, raw").tier).toBe(50);
    expect(rank("grape", "Grapefruit, raw").tier).toBe(30);
  });

  it("scores a name no token reaches as no match at all", () => {
    expect(rank("gorgonzola", "Bananas, raw").tier).toBe(0);
  });

  it("requires EVERY token, not just one", () => {
    expect(rank("soy milk", "Beverages, rice milk").tier).toBe(0);
    expect(rank("soy milk", "Soy milk, unsweetened").tier).toBe(50);
  });

  it("prefers the head the query fills most completely, mid-word", () => {
    // "grap" cannot stem-match "grapes" yet, so both collapse into the prefix
    // tier and head-completeness is what separates them.
    const grapes = rank("grap", "Grapes, raw");
    const grapefruit = rank("grap", "Grapefruit, raw");
    expect(grapes.tier).toBe(grapefruit.tier);
    expect(grapes.head).toBeGreaterThan(grapefruit.head);
  });

  it("counts a head SHORTER than the query as a mismatch too", () => {
    // A signed difference made a too-short head score highest of all: for
    // "soy milk", "Milk, imitation, non-soy" (head 4 characters) beat
    // "Soy milk, unsweetened" (head 7, an exact fill) on +3 against 0.
    const exact = rank("soy milk", "Soy milk, unsweetened, plain");
    const tooShort = rank("soy milk", "Milk, imitation, non-soy");
    expect(exact.head).toBeGreaterThan(tooShort.head);
    expect(exact.head).toBeCloseTo(0);
  });

  it("sums how far into the name each typed word landed", () => {
    // #124's key. "Oil, corn, peanut, and olive" and "Oil, olive, salad or
    // cooking" score identically on all four earlier keys, so `Array.sort`'s
    // stability handed "olive oil" to whichever fdcId was lower — a blend, for
    // a query naming a single oil. USDA orders qualifiers by descending
    // importance, so where a word sits says how much the food is that thing.
    const blend = rank("olive oil", "Oil, corn, peanut, and olive");
    const oil = rank("olive oil", "Oil, olive, salad or cooking");
    expect(blend.tier).toBe(oil.tier);
    expect(blend.head).toBe(oil.head);
    // "olive" at word 4 against word 1; "oil" is word 0 in both.
    expect(blend.position).toBe(-4);
    expect(oil.position).toBe(-1);
    // Which is also why the key sums rather than taking the smallest matched
    // index anywhere in the name. That reading scores both candidates 0 and
    // does nothing at all — "oil" alone, the token that ties them, is proof:
    // it sits at word 0 of each, and a minimum can never see past it.
    expect(rank("oil", "Oil, corn, peanut, and olive").position).toBe(0);
    expect(rank("oil", "Oil, olive, salad or cooking").position).toBe(0);
  });

  it("charges the head word nothing, so the key never restates the tier", () => {
    // Index 0 contributes 0 to the sum, which settles for free — and with no
    // exclusion rule — whether a word matched in the head should count.
    expect(rank("grape", "Grapes, raw").position).toBe(0);
    // A head of two words costs 1, because its second word IS at index 1 — but
    // it costs every candidate sharing that head the same 1, which is why the
    // key cannot break a head-only tie (#143).
    expect(rank("soy milk", "Soy milk, unsweetened").position).toBe(-1);
    expect(
      rank("soy milk", "Soy milk, chocolate, ready to drink").position
    ).toBe(-1);
  });

  it("charges nothing for the shelf label, so a drink is not last to its own name", () => {
    // ADR-0042's #154 Amendment, and the defect that prompted it. `red wine`
    // led with `Vinegar, red wine`, because USDA spends two words on the aisle
    // before naming the wine and one on naming the vinegar — so the key read
    // the vinegar as the more wine-ish of the two.
    const wine = rank("red wine", "Alcoholic beverage, wine, table, red");
    const vinegar = rank("red wine", "Vinegar, red wine");
    expect(wine.tier).toBe(vinegar.tier);
    // "wine" at word 2 and "red" at word 4, less the two shelf words: 0 + 2.
    expect(wine.position).toBe(-2);
    expect(vinegar.position).toBe(-3);
    expect(
      compareRelevance(tiedOnRowKeys(wine), tiedOnRowKeys(vinegar))
    ).toBeLessThan(0);
  });

  it("leaves the tier alone, so a shelf label is still not a head match", () => {
    // The discount reaches the two keys that read where a word SITS, and no
    // further. `tea` is a qualifier in `Beverages, tea, …` and stays one, which
    // is what keeps the tier gap that buries ordinary tea a separate question.
    expect(rank("tea", "Beverages, tea, green, brewed").tier).toBe(20);
    expect(rank("wine", "Alcoholic beverage, wine, table, red").tier).toBe(20);
  });

  it("takes the FIRST word answering a token, by stem or by prefix", () => {
    // Either branch of the retrieval test can be the one that answers, so both
    // count — and whichever answers first is the index.
    expect(rank("potato", "Sweet potato leaves, raw").position).toBe(-1);
    // "grap" only prefix-matches, and the earliest such word is the head.
    expect(rank("grap", "Juice, grape, canned").position).toBe(-1);
  });

  it("gives every retrieved name a position, with no sentinel", () => {
    // A row is retrieved when every token prefix-matches some word OR every
    // token stem-matches some word, so under either branch each token has a
    // first answering word. A name that answers nothing never gets this far.
    expect(rank("gorgonzola", "Bananas, raw").position).toBe(0);
    expect(rank("gorgonzola", "Bananas, raw").tier).toBe(0);
  });

  it("ranks a head the query does not cover below every head it does", () => {
    expect(rank("grape", "Juice, grape, canned").head).toBeLessThan(
      rank("grape", "Grapefruit, raw").head
    );
  });

  it("says whether anything of the name is left over", () => {
    // #155. `head` asks this of the head phrase and stops at the first comma;
    // this asks it of the whole name. "soybean oil" accounts for every word of
    // `Oil, soybean` and leaves `lecithin` over in the other, which is the whole
    // of what separated an oil from an emulsifier.
    expect(rank("soybean oil", "Oil, soybean").accounted).toBe(1);
    expect(rank("soybean oil", "Oil, soybean lecithin").accounted).toBe(0);
  });

  it("does not count a shelf label as a word left over", () => {
    // If the aisle is not part of the food's name for `position`, it is not
    // part of it for completeness either. "whiskey sour" names the whole of
    // `Alcoholic beverage, whiskey sour`, and used to lose to a powdered mix
    // because two words of shelf label were counted against it.
    expect(
      rank("whiskey sour", "Alcoholic beverage, whiskey sour").accounted
    ).toBe(1);
    expect(
      rank("whiskey sour", "Beverages, Whiskey sour mix, powder").accounted
    ).toBe(0);
  });

  it("accounts for a word by the same test retrieval uses", () => {
    // Stem OR prefix, not whole-word equality: a name is scored by the rule that
    // admitted it, so the key cannot disagree with retrieval about what a token
    // matched. "oat" reaches "oatmeal" as a prefix and "berry" reaches "berries"
    // as a stem, and both leave the name fully accounted.
    expect(rank("oat bread", "Bread, oatmeal").accounted).toBe(1);
    expect(rank("berry", "Berries").accounted).toBe(1);
    expect(rank("oat bread", "Bread, oat bran").accounted).toBe(0);
  });

  it("scores a name no token reaches as unaccounted, not as complete", () => {
    // The vacuous reading a `for`-loop over zero unmatched words would give: a
    // name that answers nothing has nothing left over either. `NO_MATCH` carries
    // 0 so the key can never float a row the query does not reach.
    expect(rank("gorgonzola", "Bananas, raw").accounted).toBe(0);
    expect(rank("gorgonzola", "Bananas, raw").tier).toBe(0);
  });

  it("strips a wildcard the caller supplied, so 'bana*' is 'bana'", () => {
    expect(rank("bana*", "Bananas, raw").tier).toBe(
      rank("bana", "Bananas, raw").tier
    );
  });

  it("is case-blind, so a phone's capitalised first word still searches", () => {
    expect(rank("Banana", "Bananas, raw").tier).toBe(50);
  });

  it("splits a typed word on punctuation, the way a name is split", () => {
    // The name tokeniser has always split on every non-alphanumeric run, so a
    // hyphen, apostrophe, bracket, slash or comma inside a TYPED word used to
    // make a token no name word could equal or prefix — and the whole query
    // collapsed to NO_MATCH. 4,394 of the 4,429 shipped rows could not be
    // reached by their own full description (#136).
    expect(rank("mahi-mahi", "Fish, mahimahi, raw").tier).toBeGreaterThan(0);
    expect(
      rank("hyacinth-beans", "Hyacinth-beans, immature seeds, raw").tier
    ).toBe(50);
    expect(rank("sheep's milk", "Milk, sheep, fluid").tier).toBeGreaterThan(0);
    expect(rank("yambean (jicama)", "Yambean (jicama), raw").tier).toBe(50);
  });

  it("reaches the same row whether the punctuation is typed or spaced", () => {
    // The acceptance the fix is written against: punctuation is a separator, so
    // typing it can only ever agree with typing a space in its place. The spaced
    // form is spelled out rather than derived, so the case cannot agree with the
    // tokeniser by construction.
    for (const [typed, spaced, description] of [
      ["yambean (jicama)", "yambean jicama", "Yambean (jicama), raw"],
      ["whole-wheat pasta", "whole wheat pasta", "Pasta, whole-wheat, dry"],
      [
        "margarine-like",
        "margarine like",
        "Margarine-like, vegetable oil spread, 60% fat",
      ],
      ["cabbage, chinese", "cabbage chinese", "Cabbage, chinese, raw"],
    ] as const) {
      expect(rank(typed, description)).toEqual(rank(spaced, description));
    }
  });

  it("answers nothing at all to a query that holds no word", () => {
    // Punctuation is a separator, so "-" or "(" tokenises to nothing — and a
    // query with no tokens passes every test over them vacuously, which would
    // land every name in the whole-word tier and hand back the corpus. A caller
    // guarding on `query.trim()` does not catch it: "-" is not blank.
    for (const query of ["", "   ", "-", "(", "%", "..."]) {
      expect(rank(query, "Bananas, raw").tier).toBe(0);
    }
  });

  it("still reads a hyphenated name as the two words it holds", () => {
    // Splitting "whole-wheat" turns one unmatchable token into two matchable
    // ones, which is the intent: the name has them as two words too.
    expect(readReferenceFoodName("Pasta, whole-wheat, dry").words).toContain(
      "wheat"
    );
    expect(rank("whole wheat", "Pasta, whole-wheat, dry").tier).toBe(
      rank("whole-wheat", "Pasta, whole-wheat, dry").tier
    );
  });
});

describe("compareRelevance", () => {
  it("consults each key only when the one before it ties", () => {
    // Every field, spelled out: a key built from a subset compares `undefined`
    // to `undefined`, which is NaN, which is falsy, so a missing field reads as
    // a tie and the test agrees with itself. `plain` went untested that way from
    // #143 until ADR-0055.
    const key = (over: Partial<RelevanceKey>): RelevanceKey => ({
      tier: 20,
      raw: 1,
      head: -1,
      accounted: 1,
      position: -1,
      plainSibling: 1,
      plain: 1,
      simplicity: 3,
      designated: 1,
      ...over,
    });
    const beats = (a: Partial<RelevanceKey>, b: Partial<RelevanceKey>) =>
      compareRelevance(key(a), key(b));

    // Each key in turn, beaten by the one before it: the winner is worse on
    // every later field and still wins.
    expect(
      beats(
        {
          tier: 40,
          raw: 0,
          head: -9,
          accounted: 0,
          position: -9,
          plainSibling: 0,
          plain: 0,
          simplicity: 0,
          designated: 0,
        },
        { tier: 20 }
      )
    ).toBeLessThan(0);
    expect(
      beats(
        {
          raw: 1,
          head: -9,
          accounted: 0,
          position: -9,
          plainSibling: 0,
          plain: 0,
          simplicity: 0,
          designated: 0,
        },
        { raw: 0 }
      )
    ).toBeLessThan(0);
    expect(
      beats(
        {
          head: -1,
          accounted: 0,
          position: -9,
          plainSibling: 0,
          plain: 0,
          simplicity: 0,
          designated: 0,
        },
        { head: -9 }
      )
    ).toBeLessThan(0);
    // ADR-0042's #155 Amendment: `accounted` sits beside `head`, below it,
    // because it asks `head`'s question of the whole name rather than of the
    // head phrase. Its slot could not be measured — four placements move the
    // same four leads — so this is the argument, pinned.
    expect(
      beats(
        {
          accounted: 1,
          position: -9,
          plainSibling: 0,
          plain: 0,
          simplicity: 0,
          designated: 0,
        },
        { accounted: 0 }
      )
    ).toBeLessThan(0);
    expect(
      beats(
        {
          position: -1,
          plainSibling: 0,
          plain: 0,
          simplicity: 0,
          designated: 0,
        },
        { position: -9 }
      )
    ).toBeLessThan(0);
    // ADR-0055 §5: plainSibling sits beside `plain`, above it, because it asks
    // `plain`'s question of the corpus rather than of the name.
    expect(
      beats(
        { plainSibling: 1, plain: 0, simplicity: 0, designated: 0 },
        { plainSibling: 0 }
      )
    ).toBeLessThan(0);
    expect(
      beats({ plain: 1, simplicity: 0, designated: 0 }, { plain: 0 })
    ).toBeLessThan(0);
    expect(
      beats({ simplicity: 3, designated: 0 }, { simplicity: 2 })
    ).toBeLessThan(0);
    // …and `designated` last, the weakest signal there is.
    expect(beats({ designated: 1 }, { designated: 0 })).toBeLessThan(0);
    expect(beats({}, {})).toBe(0);
  });
});

// ADR-0055 §3 and §5: two keys that read a ROW rather than a name. The corpus
// leads they move are asserted in `usda-corpus.test.ts`; these pin the pieces.

describe("plainSiblingsOf", () => {
  it("flags a name a shorter name in the same corpus is a strict prefix of", () => {
    expect(
      plainSiblingsOf([
        "Alcoholic beverage, wine, table, white",
        "Alcoholic beverage, wine, table, white, Riesling",
        "Oil, corn",
        "Oil, corn, peanut, and olive",
        "Grapes, red, seedless, raw",
      ])
    ).toEqual([false, true, false, true, false]);
  });

  it("never flags a name as its own sibling, however it is spelled", () => {
    // A strict prefix has strictly fewer parts, so an identical name — or the
    // same name spelled with different spacing or case — can never flag itself.
    expect(
      plainSiblingsOf(["Oil, corn", "OIL,  CORN", "Nuts, almonds, whole, raw"])
    ).toEqual([false, false, false]);
  });

  it("reads a qualifier boundary as a comma, not as a word", () => {
    // "Cheese, cheddar" is a prefix of "Cheese, cheddar, sharp" and not of
    // "Cheese, cheddars" — the parts have to match whole, or every plural would
    // demote its own singular.
    expect(
      plainSiblingsOf([
        "Cheese, cheddar",
        "Cheese, cheddar, sharp",
        "Cheese, cheddars",
      ])
    ).toEqual([false, true, false]);
  });
});

describe("readRowRank", () => {
  it("demotes a row USDA published for a designated population", () => {
    expect(
      readRowRank({ foodCategory: "American Indian/Alaska Native Foods" })
        .designated
    ).toBe(0);
    expect(
      readRowRank({ foodCategory: "Vegetables and Vegetable Products" })
        .designated
    ).toBe(1);
    // The category, never the parenthesised name tags: 22 rows carry (Apache),
    // (Southwest), (Northern Plains Indians) or (Klamath) instead of the four
    // #134 named, and every one of them is in the category.
    expect(
      readRowRank({ foodCategory: "Vegetables and Vegetable Products" })
        .designated
    ).toBe(1);
  });

  it("leaves a row with no category undemoted", () => {
    expect(readRowRank({}).designated).toBe(1);
    expect(readRowRank({}).plainSibling).toBe(1);
  });

  it("carries the baked plain-sibling flag through as a key", () => {
    expect(readRowRank({ plain_sibling: true }).plainSibling).toBe(0);
    expect(readRowRank({ plain_sibling: undefined }).plainSibling).toBe(1);
  });
});
