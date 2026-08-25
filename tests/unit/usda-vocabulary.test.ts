import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importersOf } from "./support/importers";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// bundle and backup scripts beside it.
// @ts-ignore
import {
  VOCABULARY_TARGET_SHARE,
  assertVocabularyHolds,
  buildVocabularySection,
  deriveVocabulary,
  readTaxonomyGroups,
  retrievalCounter,
  assertLocalVocabularyHolds,
  buildLocalVocabularySection,
  leadingRowReader,
} from "../../scripts/usda-vocabulary.mjs";
import {
  DENIED_VOCABULARY_TAGS,
  LOCAL_VOCABULARY,
  LOCAL_VOCABULARY_CEILING,
  type LocalVocabularyEntry,
} from "../../src/lib/food/food-vocabulary";
import type { SearchIndex } from "../../src/lib/food/usda-corpus";
import * as corpusModule from "../../src/lib/food/usda-corpus";
import * as ranking from "../../src/lib/food/reference-food-ranking";

// The derivation behind ADR-0049: Open Food Facts' ingredients taxonomy reduced
// to the phrases this corpus has no name for, and the phrases that answer them.
// What matters here is that a key is a phrase the shipped search retrieves
// NOTHING for, that every key reaches something that retrieves, and that the two
// filters between the taxonomy and the map are the ones the record describes.

describe("readTaxonomyGroups — the English synonym groups OFF publishes", () => {
  it("keeps a group OFF names more than one way", () => {
    expect(
      readTaxonomyGroups({
        "en:eggplant": { synonyms: { en: ["eggplant", "aubergine"] } },
      })
    ).toEqual([{ tag: "en:eggplant", members: ["eggplant", "aubergine"] }]);
  });

  it("drops a group with a single name, which can expand nothing", () => {
    expect(
      readTaxonomyGroups({ "en:okra": { synonyms: { en: ["okra"] } } })
    ).toEqual([]);
  });

  it("drops a group with no English synonyms at all", () => {
    expect(
      readTaxonomyGroups({
        "fr:aubergine": { synonyms: { fr: ["aubergine", "aubergines"] } },
      })
    ).toEqual([]);
  });

  it("lower-cases and de-duplicates, because OFF repeats names in both cases", () => {
    // Left alone this inflates the member counts and mints two keys the search
    // cannot tell apart.
    expect(
      readTaxonomyGroups({
        "en:swede": { synonyms: { en: ["Swede", "swede", " RUTABAGA ", ""] } },
      })
    ).toEqual([{ tag: "en:swede", members: ["swede", "rutabaga"] }]);
  });
});

describe("deriveVocabulary — a phrase that retrieves nothing, mapped to ones that do", () => {
  type Group = { tag: string; members: string[] };

  /** A corpus stub: a phrase not named here retrieves nothing. */
  const derive = (
    groups: Group[],
    rows: Record<string, number>,
    denied: string[] = []
  ) =>
    deriveVocabulary(groups, {
      denied,
      countMatches: (phrase: string) => rows[phrase] ?? 0,
      corpusSize: 4353,
    });

  it("inverts a group into the miss that needs help and the names that answer", () => {
    expect(
      derive(
        [{ tag: "en:eggplant", members: ["aubergine", "eggplant", "brinjal"] }],
        { eggplant: 6 }
      ).expansions
    ).toEqual({ aubergine: ["eggplant"], brinjal: ["eggplant"] });
  });

  it("stores phrases, never rows, so the map cannot freeze a ranking", () => {
    // Freezing the retrieved records at generation time would pin the ordering
    // #124 exists to change, and a corpus refresh would silently redirect a key.
    const { expansions } = derive(
      [{ tag: "en:eggplant", members: ["aubergine", "eggplant"] }],
      { eggplant: 6 }
    );
    expect(Object.values(expansions).flat()).toEqual(["eggplant"]);
  });

  it("drops a group whose members all agree, whichever way they agree", () => {
    // Both retrieve: nothing to expand. Neither does: nothing to expand TO.
    expect(
      derive(
        [
          { tag: "en:apple", members: ["apple", "apples"] },
          { tag: "en:cod", members: ["gadus morhua", "gadus"] },
        ],
        { apple: 30, apples: 30 }
      ).expansions
    ).toEqual({});
  });

  it("refuses a denied tag even where its members would have qualified", () => {
    const { expansions, denied_groups } = derive(
      [{ tag: "en:folic-acid", members: ["folic acid", "vitamin m"] }],
      { "vitamin m": 1 },
      ["en:folic-acid"]
    );
    expect(expansions).toEqual({});
    expect(denied_groups).toBe(1);
  });

  it("gathers the targets of a phrase two groups both miss on", () => {
    expect(
      derive(
        [
          { tag: "en:chili", members: ["chilli", "chili pepper"] },
          { tag: "en:chile", members: ["chilli", "chile"] },
        ],
        { "chili pepper": 9, chile: 4 }
      ).expansions
    ).toEqual({ chilli: ["chili pepper", "chile"] });
  });

  it("drops a target too broad to be a synonym, and says which", () => {
    // ADR-0049 section 3's own case: `whole` matches 217 unrelated descriptions,
    // so expanding to it answers with a page of arbitrary rows.
    const { expansions, dropped_targets } = derive(
      [{ tag: "en:whole", members: ["wholemeal", "whole", "whole grain"] }],
      { whole: 217, "whole grain": 27 }
    );
    expect(expansions).toEqual({ wholemeal: ["whole grain"] });
    expect(dropped_targets).toEqual([{ phrase: "whole", rows: 217 }]);
  });

  it("drops a key the guard leaves with nothing to reach", () => {
    const { expansions, orphaned_keys } = derive(
      [{ tag: "en:salt", members: ["cooking salt", "salt"] }],
      { salt: 424 }
    );
    expect(expansions).toEqual({});
    expect(orphaned_keys).toEqual(["cooking salt"]);
  });

  it("puts the guard at a share of the corpus, not at a row count", () => {
    // The same target survives a big corpus and fails a small one, which is what
    // makes the threshold survive a refresh.
    const group = [{ tag: "en:whole", members: ["wholemeal", "whole"] }];
    const rows = { whole: 40 };
    const at = (corpusSize: number) =>
      deriveVocabulary(group, {
        denied: [],
        countMatches: (phrase: string) => rows[phrase] ?? 0,
        corpusSize,
      }).expansions;
    expect(at(4353)).toEqual({ wholemeal: ["whole"] });
    expect(at(1000)).toEqual({});
    expect(VOCABULARY_TARGET_SHARE).toBeLessThan(0.0262);
  });

  it("sorts its keys, so a regeneration diffs as changed entries", () => {
    expect(
      Object.keys(
        derive(
          [
            { tag: "en:zucchini", members: ["courgette", "zucchini"] },
            { tag: "en:arugula", members: ["rocket", "arugula"] },
          ],
          { zucchini: 5, arugula: 3 }
        ).expansions
      )
    ).toEqual(["courgette", "rocket"]);
  });
});

describe("assertVocabularyHolds — the finished map, re-measured", () => {
  it("passes a map whose keys retrieve nothing and whose targets retrieve", () => {
    const map = { aubergine: ["eggplant"], courgette: ["zucchini"] };
    const count = (phrase: string) =>
      phrase === "eggplant" ? 6 : phrase === "zucchini" ? 5 : 0;
    expect(assertVocabularyHolds(map, count)).toBe(map);
  });

  it("refuses a key that retrieves rows of its own", () => {
    // ADR-0049 section 1 expands only when a search returns zero rows, so a key
    // that already answers would never be reached — and a key that shadowed a
    // real answer would be a regression the map cannot see.
    expect(() =>
      assertVocabularyHolds({ apple: ["apples"] }, () => 30)
    ).toThrow(/"apple" retrieves rows of its own/);
  });

  it("refuses a key that expands to nothing that retrieves", () => {
    // Otherwise the search answers "No food found" twice, more slowly.
    expect(() =>
      assertVocabularyHolds({ courgette: ["zucchino"] }, () => 0)
    ).toThrow(/"courgette" expands to nothing that retrieves/);
  });

  it("is the check the generator runs with a counter of its own", () => {
    // Handed the derivation's memoised counter it would read back the cached
    // answers that admitted each phrase and could never fail, which is a
    // restatement rather than a check. This is why it is a separate function.
    const built = deriveVocabulary(
      [{ tag: "en:zucchini", members: ["courgette", "zucchini"] }],
      {
        denied: [],
        countMatches: (phrase: string) => (phrase === "zucchini" ? 5 : 0),
        corpusSize: 4353,
      }
    );
    expect(() => assertVocabularyHolds(built.expansions, () => 12)).toThrow(
      /retrieves rows of its own/
    );
  });
});

describe("retrievalCounter — the shipped search, asked how much a phrase reaches", () => {
  // The ranking module itself, which is the whole of what this borrows: the
  // point of the seam is that the map is derived by the search that ships.
  const count = retrievalCounter(
    [
      { description: "Eggplant, raw" },
      { description: "Zucchini, baby, raw" },
      { description: "Squash, summer, zucchini, raw" },
    ],
    ranking
  );

  it("counts every row a phrase reaches, not the page the app would show", () => {
    expect(count("zucchini")).toBe(2);
    expect(count("eggplant")).toBe(1);
  });

  it("answers nothing for the phrase the corpus does not use", () => {
    expect(count("courgette")).toBe(0);
    expect(count("aubergine")).toBe(0);
  });

  it("reads a row by every name it answers to, aliases included", () => {
    // The corpus the app searches is rows-with-aliases (#137), so a map derived
    // against descriptions alone would key phrases that DO retrieve.
    const withAlias = retrievalCounter(
      [{ description: "Spinach, mature", also: ["Spinach, raw"] }],
      ranking
    );

    expect(withAlias("spinach raw")).toBe(1);
  });

  it("counts a row once however many of its names answer", () => {
    const withAlias = retrievalCounter(
      [{ description: "Millet, whole grain", also: ["Millet, raw"] }],
      ranking
    );

    expect(withAlias("millet")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The hand-written section (ADR-0049's #141 Amendment)
// ---------------------------------------------------------------------------

/** One admissible entry, varied a field at a time by the cases below. */
const entry = (
  over: Partial<LocalVocabularyEntry> = {}
): LocalVocabularyEntry => ({
  key: "gammon",
  targets: ["pork cured ham"],
  landsOn: "Pork, cured, ham",
  why: "the British name for cured leg of pork",
  ...over,
});

describe("buildLocalVocabularySection — the hand list as the artifact carries it", () => {
  it("reduces the entries to the same phrase -> phrases map the derived one is", () => {
    // The fallback reads one map. A second SHAPE beside the derived section
    // would mean a second reader, and the point of the section is that there is
    // not one (ADR-0049 section 4).
    expect(buildLocalVocabularySection([entry({})]).expansions).toEqual({
      gammon: ["pork cured ham"],
    });
  });

  it("sorts by key, so an addition diffs as one entry", () => {
    expect(
      Object.keys(
        buildLocalVocabularySection([
          entry({ key: "porridge oats" }),
          entry({ key: "caster sugar" }),
        ]).expansions
      )
    ).toEqual(["caster sugar", "porridge oats"]);
  });

  it("carries neither a url nor a digest, and says why in its source", () => {
    // The derived section is a substantial extraction from OFF and therefore an
    // ODbL derivative database. These words are nobody's extraction, and the
    // whole reason ADR-0049 section 4 left room for a section of their own is
    // that they stay outside it. A section that stated an ODbL licence would
    // give the obligation away for free.
    const section = buildLocalVocabularySection([entry()]);
    expect(section).not.toHaveProperty("licence");
    expect(section).not.toHaveProperty("url");
    expect(section).not.toHaveProperty("sha256");
    expect(section.source).toMatch(/hand-written/);
    expect(section.source).toMatch(/Open Food Facts/);
  });

  it("drops the evidence, which is the repo's and not the artifact's", () => {
    // `landsOn` and `why` are what a generation and a reviewer check the entry
    // against. Shipping them would put a paragraph of prose per entry in a file
    // every user downloads, to say something no reader of it can act on.
    expect(
      Object.values(buildLocalVocabularySection([entry()]).expansions)
    ).toEqual([["pork cured ham"]]);
  });
});

describe("assertLocalVocabularyHolds — the four admissions, three of them mechanical", () => {
  /**
   * What each phrase leads with, given a vocabulary. Injected the way
   * `countMatches` is, so the admissions are asserted against a handful of
   * stated answers rather than against 4,318 rows — and so the one impure,
   * expensive step stays in {@link leadingRowReader}.
   */
  const corpus: Record<string, string> = {
    "pork cured ham": "Pork, cured, ham",
    ham: "Pork, cured, ham",
  };
  const leads = (query: string, vocabulary: Record<string, string[]>) => {
    for (const phrase of corpus[query] ? [query] : (vocabulary[query] ?? []))
      if (corpus[phrase]) return corpus[phrase];
    return null;
  };
  const holds = (
    entries: LocalVocabularyEntry[],
    derived: Record<string, string[]> = {}
  ) =>
    assertLocalVocabularyHolds(entries, {
      derived,
      leads,
      ceiling: LOCAL_VOCABULARY_CEILING,
    });

  it("passes an entry that retrieves nothing and leads with the row it names", () => {
    expect(holds([entry()])).toEqual([entry()]);
  });

  it("refuses a key that already retrieves (admission 1)", () => {
    // The fallback runs only on zero results, so an entry for a phrase that
    // answers is an entry nothing would ever reach.
    expect(() => holds([entry({ key: "ham" })])).toThrow(
      /"ham" already retrieves/
    );
  });

  it("refuses a key the derived map already covers (admission 3)", () => {
    // A word OFF knows is a word this list should not be spending a line on,
    // and a hand entry that shadowed a derived one would be the harder bug: the
    // two maps would disagree and the merge order would decide.
    expect(() => holds([entry()], { gammon: ["pork cured ham"] })).toThrow(
      /"gammon" is already reached by the derived vocabulary/
    );
  });

  it("refuses an entry whose targets retrieve nothing (admission 2)", () => {
    expect(() => holds([entry({ targets: ["pork gammon joint"] })])).toThrow(
      /"gammon" reaches nothing/
    );
  });

  it("refuses an entry whose expected row has moved (admission 2)", () => {
    // The admission the whole list waited on #143 for. A corpus refresh that
    // moves the answer fails generation instead of silently redirecting the key
    // to whatever the ranking now leads with.
    expect(() =>
      holds([entry({ landsOn: "Pork, fresh, leg (ham), raw" })])
    ).toThrow(
      /"gammon" leads with "Pork, cured, ham", not "Pork, fresh, leg \(ham\), raw"/
    );
  });

  it("refuses an entry with no reason beside it (admission 4)", () => {
    // The one admission no machine can check is the one a human has to write
    // down. An empty `why` is an entry nobody asserted anything about.
    expect(() => holds([entry({ why: "  " })])).toThrow(
      /"gammon" records no reason/
    );
  });

  it("refuses the same key twice", () => {
    // Two entries for one key is one entry silently winning; which one depends
    // on insertion order, which is not a decision anybody made.
    expect(() => holds([entry(), entry({ landsOn: "Ham" })])).toThrow(
      /"gammon" appears twice/
    );
  });

  it("refuses a list over the ceiling", () => {
    // ADR-0046 section 6's shape. Reaching it says the vocabulary problem is
    // bigger than a hand list and wants re-deriving, which is a decision this
    // check exists to force rather than to make.
    const over = Array.from({ length: LOCAL_VOCABULARY_CEILING + 1 }, (_, at) =>
      entry({ key: `gammon ${at}` })
    );
    expect(() => holds(over)).toThrow(/ceiling of 20/);
  });
});

describe("buildVocabularySection — the map under its own licence", () => {
  const pinned = {
    url: "https://static.openfoodfacts.org/data/taxonomies/ingredients.full.json",
    sha256: "abc",
    licence: "ODbL",
    source: "Open Food Facts",
  };

  it("carries the licence, source, url and digest beside the map", () => {
    // The map is a substantial extraction from OFF and so a derivative database
    // under ODbL. A section that did not say so would make the whole artifact
    // one (ADR-0049 section 4).
    expect(buildVocabularySection({ aubergine: ["eggplant"] }, pinned)).toEqual(
      {
        licence: "ODbL",
        source: "Open Food Facts",
        url: pinned.url,
        sha256: "abc",
        expansions: { aubergine: ["eggplant"] },
      }
    );
  });
});

describe("the committed vocabulary", () => {
  // These are the bytes the app ships. Nothing reads the map yet (#140 is what
  // will), so without this it would sit in the repo unchecked until a hand-edit
  // or a half-finished regeneration reached a user.
  const manifest = JSON.parse(
    readFileSync("scripts/usda-backup.manifest.json", "utf8")
  );
  const index: SearchIndex = JSON.parse(
    readFileSync("public/usda/search-index.json", "utf8")
  );

  describe("the derived vocabulary", () => {
    const vocabulary = index.vocabulary_off;
    const expansions: Record<string, string[]> = vocabulary.expansions;
    const count = retrievalCounter(index.foods, ranking);

    it("names the licence, the source and the digest it was derived from", () => {
      // ODbL obliges the derivative to be offered under the same licence, and
      // the digest is the whole of the drift detector for a file OFF rewrites
      // in place (ADR-0049 sections 2 and 4).
      expect(vocabulary.licence).toBe("ODbL");
      expect(vocabulary.source).toBe("Open Food Facts");
      expect(vocabulary.sha256).toBe(manifest.vocabulary.sha256);
      expect(vocabulary.url).toBe(manifest.vocabulary.url);
    });

    it("keys only phrases the finished corpus retrieves nothing for", () => {
      // The property ADR-0049 section 1 rests on: expansion runs only when a
      // search returns zero rows, so a key that answered would never be reached
      // and a key that shadowed a real answer would be a regression.
      const answering = Object.keys(expansions).filter(
        (phrase) => count(phrase) > 0
      );
      expect(answering).toEqual([]);
    });

    it("gives every key at least one target that retrieves", () => {
      const empty = Object.entries(expansions).filter(
        ([, targets]) => !targets.some((target) => count(target) > 0)
      );
      expect(empty).toEqual([]);
    });

    it("reaches the words this corpus has no name for", () => {
      // Nine of the classes a hand-written list would not have thought to
      // enumerate: regional English, spacing, word order, and a loanword.
      expect(expansions.aubergine).toEqual(["eggplant"]);
      expect(expansions.courgette).toEqual(["zucchini"]);
      expect(expansions.swede).toEqual(["rutabaga"]);
      expect(expansions.rocket).toEqual(["arugula"]);
      expect(expansions.cornflour).toEqual(["corn flour"]);
      expect(expansions["skimmed milk"]).toContain("skim milk");
      expect(expansions.linseed).toContain("flaxseed");
      expect(expansions["ginger powder"]).toEqual(["ground ginger"]);
      expect(expansions.wombok).toContain("chinese cabbage");
    });

    it("drops a key the corpus learned to answer for itself", () => {
      // `flax seed` was a key until the twin merge's discarded names became
      // search aliases (#137): `Flaxseed, ground` now also answers to SR
      // Legacy's `Seeds, flaxseed`, so the phrase retrieves and ADR-0049 §1's
      // fallback would never reach it. A key that answers is the one thing the
      // map must not hold.
      expect(count("flax seed")).toBeGreaterThan(0);
      expect(expansions).not.toHaveProperty("flax seed");
    });

    it("keys no phrase from a group the deny-list refuses", () => {
      // Unfiltered these answer with margarine, snail and soybean oil
      // respectively, through members OFF carries for label reading rather than
      // for searching.
      for (const phrase of [
        "folic acid",
        "selenium",
        "sal tree oil",
        "confiture",
      ])
        expect(expansions).not.toHaveProperty(phrase);
      expect(DENIED_VOCABULARY_TAGS.length).toBeGreaterThan(100);
    });

    it("expands to no phrase broad enough to answer with a page of anything", () => {
      // `wholemeal -> whole` is the entry that shows why the guard exists: a
      // target 217 unrelated descriptions happen to contain is a word, not a
      // synonym (ADR-0049 section 3).
      const targets = [...new Set(Object.values(expansions).flat())];
      const limit = VOCABULARY_TARGET_SHARE * index.foods.length;
      expect(targets.filter((target) => count(target) > limit)).toEqual([]);
      for (const word of ["salt", "whole", "beans"])
        expect(targets).not.toContain(word);
    });

    it("is sorted by key, so a taxonomy refresh diffs as changed phrases", () => {
      const keys = Object.keys(expansions);
      expect(keys).toEqual([...keys].sort());
    });
  });

  describe("the hand-written vocabulary", () => {
    const local = index.vocabulary_local;

    it("is the section the entries reduce to, and nothing more", () => {
      // The artifact carries the map; `landsOn` and `why` stay in the repo.
      expect(local).toEqual(buildLocalVocabularySection(LOCAL_VOCABULARY));
    });

    it("holds all four admissions against the shipped bytes", () => {
      // The generation-time check, re-run here over the committed artifact
      // rather than over the corpus a run happened to hold in memory. It is the
      // same function given the app's own search, so a hand-edited entry or a
      // half-finished regeneration fails here before it reaches a user.
      expect(() =>
        assertLocalVocabularyHolds(LOCAL_VOCABULARY, {
          derived: index.vocabulary_off.expansions,
          leads: leadingRowReader(index, corpusModule),
          ceiling: LOCAL_VOCABULARY_CEILING,
        })
      ).not.toThrow();
    });

    it("declares no licence, because the words are not OFF's to license", () => {
      // ADR-0049 section 4 keeps the derived map a distinct ODbL section so the
      // artifact is a collective work with one ODbL component rather than an
      // ODbL artifact. A hand list declaring the same licence would give that
      // away for nothing.
      expect(local).not.toHaveProperty("licence");
      expect(local.source).toMatch(/hand-written/);
    });

    it("shares no key with the derived map", () => {
      // Admission 3 the other way round. The two sections merge into one map at
      // load, so a shared key would be one section silently winning.
      const derived = new Set(Object.keys(index.vocabulary_off.expansions));
      expect(
        Object.keys(local.expansions).filter((key) => derived.has(key))
      ).toEqual([]);
    });

    it("stays under its ceiling, which is a signal and not a cap", () => {
      expect(LOCAL_VOCABULARY.length).toBeLessThanOrEqual(
        LOCAL_VOCABULARY_CEILING
      );
    });

    it("is reached by the generator alone, never by the app", () => {
      // The arrangement the module's own header describes, now that it carries
      // eight entries of evidence beside the 160-tag deny-list: the app reads
      // the finished map out of `search-index.json`, and none of the prose
      // admitting an entry ever enters a bundle a user downloads. The same lock
      // `usda-twin-ledger` and `usda-food-kind` carry.
      expect(importersOf("food-vocabulary")).toEqual([]);
    });
  });
});
