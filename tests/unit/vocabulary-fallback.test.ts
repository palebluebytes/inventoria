import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { curatedMatches } from "../../src/lib/food/curated-foods";
import {
  buildSearchCorpus,
  expandThroughVocabulary,
  mapIndexRowToPayload,
  searchIndexRows,
  type SearchCorpus,
  type SearchIndex,
  type UsdaIndexRow,
} from "../../src/lib/food/usda-corpus";
import { deriveNovaVerdict } from "../../src/lib/food/nova-verdict";
import type { RawProvenance } from "../../src/lib/food/provenance";

// ADR-0049 §1's retrieval fallback, asserted over the bytes the app ships. The
// committed artifact is the fixture for the same reason `usda-corpus.test.ts`
// uses it: the vocabulary was derived against THIS corpus, and a hand-built
// stand-in could agree with the code while disagreeing with the data.
const index: SearchIndex = JSON.parse(
  readFileSync("public/usda/search-index.json", "utf8")
);
const corpus = buildSearchCorpus(index);

/**
 * The search as it behaved before this ticket: the same code over a corpus whose
 * vocabulary is empty, so the fallback has nothing to expand through. Used as
 * the "today" side of the strict-addition property rather than a second copy of
 * the ranking, which could drift from the one that ships.
 */
const literalOnly: SearchCorpus = { foods: corpus.foods, vocabulary: {} };

const topFor = (query: string): string | undefined =>
  searchIndexRows(corpus, query).hits[0]?.row.description;
const retrieves = (c: SearchCorpus, query: string): boolean =>
  searchIndexRows(c, query).hits.length > 0;

/** The phrases an expansion offers, without the aliases, for the shape tests. */
const phrasesOf = (
  vocabulary: Record<string, string[]>,
  query: string
): string[] => expandThroughVocabulary(vocabulary, query).map((e) => e.phrase);

describe("expandThroughVocabulary", () => {
  const vocabulary = {
    aubergine: ["eggplant"],
    chilli: ["chili pepper", "chile", "chile pepper"],
    "flax seed": ["flaxseed"],
    "soya bean": ["soybean", "soybeans"],
  };

  it("expands a phrase the corpus has no name for", () => {
    expect(phrasesOf(vocabulary, "aubergine")).toEqual(["eggplant"]);
  });

  it("keeps every value a key carries, because they are different foods", () => {
    // 144 of the 433 keys carry two to six targets; `chilli` is why (ADR-0049 §3).
    expect(phrasesOf(vocabulary, "chilli")).toEqual([
      "chili pepper",
      "chile",
      "chile pepper",
    ]);
  });

  it("reaches a key mid-type, so the fallback fires before the last keystroke", () => {
    expect(phrasesOf(vocabulary, "aubergin")).toEqual(["eggplant"]);
    expect(phrasesOf(vocabulary, "flax se")).toEqual(["flaxseed"]);
  });

  it("prefers an exact key over the keys a prefix would also reach", () => {
    // "chilli" is a whole key and also a prefix of nothing else here; the tier
    // that matters is that an exact hit never blends with a partial one.
    const twoTier = { chilli: ["chile"], "chilli powder": ["chili powder"] };
    expect(phrasesOf(twoTier, "chilli")).toEqual(["chile"]);
    expect(phrasesOf(twoTier, "chill")).toEqual(["chile", "chili powder"]);
  });

  it("matches a key modulo plural, the way the ranking reads a word", () => {
    expect(phrasesOf(vocabulary, "flax seeds")).toEqual(["flaxseed"]);
  });

  it("matches typed words against key words in order, not in any order", () => {
    expect(phrasesOf(vocabulary, "seed flax")).toEqual([]);
  });

  it("does not expand a key that is only part of what was typed", () => {
    // The map is phrase-keyed: `aubergine` expands and `raw aubergine` does not
    // (ADR-0049 Consequences). Deliberate, and unmeasured rather than unwanted.
    expect(phrasesOf(vocabulary, "raw aubergine")).toEqual([]);
  });

  it("names the key that reached each phrase, not just the phrase", () => {
    // The alias is what the food is shown under, so it has to be the WHOLE key
    // even when the query was still being typed: "aubergin" reaches the food
    // under "aubergine", never under half a word.
    expect(expandThroughVocabulary(vocabulary, "aubergin")).toEqual([
      { alias: "aubergine", phrase: "eggplant" },
    ]);
    expect(expandThroughVocabulary(vocabulary, "soya beans")).toEqual([
      { alias: "soya bean", phrase: "soybean" },
      { alias: "soya bean", phrase: "soybeans" },
    ]);
  });

  it("gives one phrase one alias, so a food is shown under one name", () => {
    // Two keys can offer the same phrase; a row can only be shown under one name.
    expect(
      expandThroughVocabulary(
        { "soy beans": ["soybean"], "soya bean": ["soybean"] },
        "soy bean"
      )
    ).toEqual([{ alias: "soy beans", phrase: "soybean" }]);
  });

  it("answers nothing for a query holding no word at all", () => {
    expect(phrasesOf(vocabulary, "   ")).toEqual([]);
    expect(phrasesOf(vocabulary, "!!")).toEqual([]);
  });

  it("reads a typed word the way the tokeniser does, punctuation included", () => {
    // #136: a key is never compared against tokens some other function produced.
    expect(phrasesOf(vocabulary, "flax-seed")).toEqual(["flaxseed"]);
  });
});

describe("the vocabulary fallback in the search", () => {
  it("answers a query the corpus has no name for", () => {
    expect(retrieves(literalOnly, "aubergine")).toBe(false);
    expect(topFor("aubergine")).toBe("Eggplant, raw");
  });

  it("keeps the typed query beside the phrases it expanded to", () => {
    // The typed word costs the ranking nothing — it just retrieved nothing — and
    // it is what keeps the curated table seeing what was typed.
    expect(searchIndexRows(corpus, "aubergine").phrases).toEqual([
      "aubergine",
      "eggplant",
    ]);
  });

  it("names the typed query itself when nothing was expanded", () => {
    expect(searchIndexRows(corpus, "banana").phrases).toEqual(["banana"]);
    expect(
      searchIndexRows(corpus, "gorgonzola nibs of the sea").phrases
    ).toEqual(["gorgonzola nibs of the sea"]);
  });

  it("ranks each row on its BEST expansion, not on whichever value came first", () => {
    // `chilli` carries three targets. Concatenate-and-dedupe would let the order
    // of a key's values decide the ordering; scoring every row against every
    // expansion and keeping the best key means the values are unordered data.
    const forward = searchIndexRows(corpus, "chilli").hits.map(
      (h) => h.row.description
    );
    const reversed = searchIndexRows(
      {
        foods: corpus.foods,
        vocabulary: { chilli: ["chile pepper", "chile"] },
      },
      "chilli"
    ).hits.map((h) => h.row.description);
    const sameValuesOtherOrder = searchIndexRows(
      {
        foods: corpus.foods,
        vocabulary: { chilli: ["chile", "chile pepper"] },
      },
      "chilli"
    ).hits.map((h) => h.row.description);
    expect(reversed).toEqual(sameValuesOtherOrder);
    expect(forward.length).toBeGreaterThan(0);
  });

  it("shows the food under the name that reached it", () => {
    // What the user asked for: a search that quietly answered with another word
    // says which word. `mapIndexRowToPayload` puts it on `food/name`, so it
    // reaches every surface that displays a food rather than only the results
    // list — the staged card, the log, Recent, a recipe's ingredients.
    const [hit] = searchIndexRows(corpus, "aubergine").hits;
    expect(hit.alias).toBe("aubergine");
    expect(
      mapIndexRowToPayload(hit.row, hit.alias).attributes["food/name"]
    ).toBe("Eggplant, raw, aubergine");
  });

  it("leaves USDA's own description untouched in the provenance blob", () => {
    // The widened name must never masquerade as USDA's (ADR-0045 §4), and it is
    // what `deriveNovaVerdict` reads back rather than the display name.
    const [hit] = searchIndexRows(corpus, "aubergine").hits;
    const payload = mapIndexRowToPayload(hit.row, hit.alias);
    const provenance = payload.attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance.raw_data.description).toBe("Eggplant, raw");
  });

  it("keeps a NOVA inference a vocabulary key would otherwise have suppressed", () => {
    // `ginger powder -> ground ginger` is one of nineteen keys carrying a
    // NOVA-3 deny-substring. Read off the display name, "powder" would drop
    // `Ginger, ground` out of its inferred NOVA 1.
    const [hit] = searchIndexRows(corpus, "ginger powder").hits;
    expect(hit.alias).toBe("ginger powder");
    const payload = mapIndexRowToPayload(hit.row, hit.alias);
    expect(payload.attributes["food/name"]).toContain("powder");
    expect(deriveNovaVerdict(payload)).toEqual({
      state: "rated",
      tier: 1,
      source: "inferred",
    });
  });

  it("names no food a search answered without help", () => {
    // The other half of strict addition: a food the typed word reached is shown
    // exactly as it is today.
    for (const hit of searchIndexRows(corpus, "banana").hits) {
      expect(hit.alias).toBeUndefined();
      expect(
        mapIndexRowToPayload(hit.row, hit.alias).attributes["food/name"]
      ).toBe(hit.row.description);
    }
  });

  it("still answers nothing for a query no phrase reaches", () => {
    expect(searchIndexRows(corpus, "gorgonzola nibs of the sea").hits).toEqual(
      []
    );
    expect(searchIndexRows(corpus, "   ").hits).toEqual([]);
  });
});

// ── The pre-registered acceptance (#140) ────────────────────────────────────
// The three bars the ticket set before the work started, asserted rather than
// reported, so a taxonomy refresh or a ranking change that undoes them fails
// here instead of quietly shrinking what search can reach.

describe("what the fallback buys, against the bars set before it was built", () => {
  const audit = JSON.parse(
    readFileSync("docs/research/130-ranking-audit.json", "utf8")
  ) as {
    cases: {
      pass: string;
      verdict?: string;
      query?: string;
      members?: { query: string }[];
    }[];
  };

  it("closes at least 200 of the miss groups #130 measured", () => {
    // A group is closed when EVERY member retrieves — the oracle #130 built into
    // the sweep, where a sibling member has already named the record the failing
    // one should have reached.
    const misses = audit.cases.filter(
      (c) => c.pass === "synonym" && c.verdict === "miss"
    );
    // 233 when #140 shipped, 230 since #137: three groups whose every member now
    // retrieves against a corpus that answers to the names the twin merge had
    // discarded, so the sweep no longer calls them misses. The floor moves with
    // the finding rather than being pinned to a number the corpus has left.
    expect(misses.length).toBeGreaterThanOrEqual(230);
    const closed = misses.filter((group) =>
      (group.members ?? []).every((m) => retrieves(corpus, m.query))
    );
    expect(closed.length).toBeGreaterThanOrEqual(200);
    // Nine hundred-odd searches over 4,360 rows, so the default 5 s timeout is
    // a coin-toss under a loaded machine rather than a signal about the code.
  }, 30_000);

  it("answers seven of the seventeen failing British queries, with the right row", () => {
    // Seven and not fifteen because that is what OFF actually knows; the other
    // ten wait on a hand-written `vocabulary_local` (ADR-0049 Consequences).
    for (const [query, expected] of [
      ["aubergine", "Eggplant, raw"],
      ["courgette", "Squash, zucchini, baby, raw"],
      ["rocket", "Arugula, raw"],
      ["swede", "Rutabagas, raw"],
      ["beetroot", "Beets, raw"],
      ["cornflour", "Corn flour, masa harina, white or yellow, dry, raw"],
      [
        "sultanas",
        "Grapes, red or green (European type, such as Thompson seedless), raw",
      ],
    ] as const) {
      expect([query, retrieves(literalOnly, query)]).toEqual([query, false]);
      expect([query, topFor(query)]).toEqual([query, expected]);
    }
  });

  it("is a strict addition: no query that answers today answers differently", () => {
    // Structural, because the fallback runs only on an empty result — but
    // asserted, not assumed. The queries are every vocabulary key and the
    // prefixes of it a user passes through while typing, which is exactly the
    // set that can reach a key at all.
    const keys = Object.keys(index.vocabulary_off.expansions);
    const queries = new Set<string>();
    for (const key of keys) {
      // Prefixes of the WHOLE key, not of its first word: a multi-word key is
      // reachable mid-phrase ("flax se"), and those queries have to be in the
      // set or the widest tier goes unchecked. Sampled at the lengths that can
      // change the answer — the first word, and a word boundary either side —
      // because every prefix of every key is 5,000 searches for no more cases.
      const lengths = new Set([1, 3, key.indexOf(" "), key.length]);
      for (let i = key.indexOf(" "); i >= 0; i = key.indexOf(" ", i + 1))
        for (const n of [i, i + 2, i + 4]) lengths.add(n);
      for (const n of lengths)
        if (n > 0 && n <= key.length) queries.add(key.slice(0, n).trim());
    }
    let asserted = 0;
    for (const query of queries) {
      const before = searchIndexRows(literalOnly, query).hits;
      if (before.length === 0) continue;
      asserted++;
      expect([query, searchIndexRows(corpus, query).hits]).toEqual([
        query,
        before,
      ]);
    }
    // Not vacuous: a good few of those prefixes really do answer today.
    expect(asserted).toBeGreaterThan(100);
  }, 30_000);

  it("is a strict addition for the curated table too, not only for the rows", () => {
    // The half of `searchUsdaFoods` the fallback also changed (ADR-0049 §6). A
    // curated stand-in reached today has to still be reached, which is why the
    // typed query stays in the phrase set: "cacao b" retrieves no reference food
    // and prefix-matches the key `cacao butter`, whose expansions reach the
    // stand-in's aliases not at all.
    for (const query of [
      "cacao",
      "cacao b",
      "cacao bean",
      "cacao nibs",
      "cocoa",
      "nibs",
      "nib",
    ]) {
      const before = curatedMatches([query]);
      const after = curatedMatches(searchIndexRows(corpus, query).phrases);
      expect([query, after.map((m) => m.entry.food)]).toEqual([
        query,
        before.map((m) => m.entry.food),
      ]);
      expect([query, after.map((m) => m.exact)]).toEqual([
        query,
        before.map((m) => m.exact),
      ]);
    }
  });
});
