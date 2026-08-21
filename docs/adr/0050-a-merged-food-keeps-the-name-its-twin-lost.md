# ADR 0050: A merged food answers to the name its twin lost, and an alias asserts retrievability rather than identity

**Status:** Accepted  
**Date:** 2026-08-21  
**Implemented:** #137 `2e52374` (the absence tool), `3afcc17` (the alias), `cd19059` (the two instruments)

This record amends [ADR-0045](0045-usda-stays-the-base-food-composition-authority.md)
§2, whose merge decided which record wins and never considered that the loser's
name was worth keeping, and [ADR-0042](0042-usda-search-reference-foods.md),
whose ranking has no concept of a row having more than one name. It reads
alongside [ADR-0049](0049-a-derived-vocabulary-for-food-search.md), which gives
search a second source of words, and is deliberately not an extension of it: a
vocabulary key is a phrase anyone might type, and this is one row's other name.

## Context

`resolveFdcGroup` collects Foundation and SR Legacy records under `ndbNumber` and
keeps the base record's identity. The panel merges; the name does not. Where USDA
holds one identity under two descriptions, the loser's name is discarded and
nothing carries it.

**93 of the 165 surviving twinned foods ship under a name that replaced a
different archived name**, and it is the plain names that lose:

| the archived name              | the name that ships                    |
| ------------------------------ | -------------------------------------- |
| `Spinach, raw`                 | `Spinach, mature`                      |
| `Millet, raw`                  | `Millet, whole grain`                  |
| `Bananas, raw`                 | `Bananas, ripe and slightly ripe, raw` |
| `Carrots, raw`                 | `Carrots, mature, raw`                 |
| `Egg, whole, raw, fresh`       | `Eggs, Grade A, Large, egg whole`      |
| `Cream, fluid, heavy whipping` | `Cream, heavy`                         |
| `Peppers, sweet, green, raw`   | `Peppers, bell, green, raw`            |
| `Mushrooms, shiitake, raw`     | `Mushrooms, shiitake`                  |

Measured by typing each archived name against the shipped corpus: **40 of the 93
retrieved nothing at all**, 59 failed to lead, and 58 lost at least one
substantive word — `raw` eleven times, then `sweet`, `fresh`, `dried`, `white`.

### It was reported as something else entirely

[#137](https://github.com/palebluebytes/inventoria/issues/137) was filed as
"measure what [ADR-0048](0048-an-absent-measurement-is-not-a-zero.md)'s
calorie-less drop cost search recall", on six cases from research note
[130](../research/130-reference-food-ranking-and-recall.md) §8. None of the six is
an ADR-0048 casualty, and the reason is one line of the tool that produced them:
`usda-ranking-audit.mjs` skipped the Survey archive by comparing `archive.dataset`
against the literal `"Survey (FNDDS)"` while the manifest says
`"Survey (FNDDS 2021-2023)"`. The guard never fired, so all **5,432** Survey
records — a dataset `BUNDLE_DATASETS` deliberately never consumes — were reported
as our own corpus casualties. `Parsley, raw`, `Basil, raw`, `Oats, raw` and
`Whey, sweet, dry` exist only there. `Spinach, raw` and `Millet, raw` are the twin
merge, which is this record.

ADR-0048's own ledger is closed and it is **13 rows**, every one enumerated in
that record. Re-measured against the current archives, 7,966 identities become
4,353 survivors: 922 brand-specific, 1,427 processed, 1,189 prepared, 17
dry-basis, 45 manufacturing inputs, 13 reporting no energy.

### Alternatives that were genuinely live

**Change which record's identity survives**, preferring the plainer description.
It fixes search and display in one move, since it is `Spinach, raw` and
`Egg, whole, raw, fresh` that would then be shown. Ruled out on blast radius:
identity selects the `fdcId` and the portion list as well as the name, so it
changes what a staged food's provenance points at and which household measures it
offers. "Plainer" is also the contested judgement
[#143](https://github.com/palebluebytes/inventoria/issues/143) spent a whole
ticket measuring, and its answer was a ranking key rather than a naming rule.

**Append the archived name to the displayed one**, as ADR-0049's #140 Amendment
does for a vocabulary key — `Eggplant, raw, aubergine`. Ruled out because the
names here are not words a user typed. `Cheese, cheddar (Includes foods for
USDA's Food Distribution Program)` on a food card is a visible regression bought
for a search fix, and unlike a vocabulary hit there is no user word to explain it.

**Express them as vocabulary expansions** in ADR-0049's map, reusing machinery
that already ships. Ruled out on shape: that map is phrase-keyed and global, so
carrying `Spinach, raw` would mean a rule about the words `raw` and `mature` that
holds for every row in the corpus. The thing being carried here belongs to one
identity.

**Ship nothing and let the vocabulary layer cover what it covers.** Ruled out on
measurement: OFF's taxonomy has no entry mapping `raw` onto `mature`, and 40 empty
result sets are not a long tail.

**Scope.** This record governs the names a bundled reference food can be found
by. It changes no panel, no filter and no merge; it does not decide whether a
merge should have happened, which is
[#145](https://github.com/palebluebytes/inventoria/issues/145); and it adds no
word that USDA did not publish for that identity.

## Decision

### 1. A merged identity carries the names it discarded, as search-only aliases

A Search index row gains `also`, the descriptions the other records of its
identity carry. The row is **shown and staged under its own `description`** and
nothing is appended to `food/name`. An alias reaches a food; it never renames one.

The rule is expressed once, as `twinSearchAliases` in `usda-fdc.ts`, and the
generator imports it rather than restating it (ADR-0047 §4).

### 2. An alias asserts retrievability, not identity

An alias says _this row answers to that name_. It never says the two names are
the same food, and no code may read it as a claim about what the row is.

The clause is load-bearing because the merge is not always right. Where USDA
reused an `ndbNumber` across two genuinely different foods — `Apples, raw, golden
delicious, with skin` and `Apples, honeycrisp, with skin, raw` both carry 9501 —
the fusion has already happened and the alias makes it visible rather than
hidden. `golden delicious` returning nothing reads as "USDA does not have it"
when in fact we hold its data filed under another apple. #145 settles whether
those merges stand; if one is undone the pair becomes two rows with their own
names and the alias goes with it, so nothing here has to be cleaned up.

### 3. A name is kept when ranking would read it differently, and USDA's two boilerplate parentheticals come off first

Two rules, and no third.

A description whose words and word order match the surviving name contributes
nothing and is dropped: ranking derives every key from a name read as a name, so
two names it reads identically are one name. That covers both of the gains
without a judgement about which key matters — a name carrying a word the survivor
lacks is what retrieval needs, and a better-formed name for the same words
(`Bananas, raw`, which ends in ", raw" where the survivor buries it behind two
qualifiers) is what the ordering needs.

`(Includes foods for USDA's Food Distribution Program)` and `(may contain
additives to retain moisture)` are stripped, as a **closed list of two phrases**
and never as a rule about parentheses. A parenthetical in these archives is
usually a name — `Cabbage, chinese (pak-choi), raw`, `Yambean (jicama), raw`,
`Green onion, (scallion)` — so a general strip would take the very words an alias
exists to carry.

The surviving record contributes no alias of its own, even where stripping its
boilerplate would leave a different string. Nothing discarded that name.

**87 of the 93 are kept**, for 3,523 measured bytes. The other six read
identically once the boilerplate is off.

### 4. A row is scored as the best of its names

`rankAgainst` scores every name a row has and keeps the best key. An alias is
read into a `ReferenceFoodName` of its own rather than folded into the row's
words, because every key — `raw`, `plain`, `simplicity`, `headLength` — derives
from a description and its word order, and a bag of words earns none of them.

Taking the best is what makes an alias unable to cost a row a place it already
holds: a worse-matching alias simply never wins. The ranking therefore gains no
tier, no key and no clause for aliases, and `compileReferenceFoodQuery` does not
know they exist.

### 5. The vocabulary is derived against rows, not descriptions

ADR-0049 §3's two filters are stated over what the **finished corpus retrieves**,
and after this that includes aliases. `retrievalCounter` reads a row as all of
its names, and the map re-derives whenever the aliases change.

A counter modelling descriptions alone would key phrases that do retrieve, which
is the one thing ADR-0049 §1's zero-results trigger cannot tolerate.

### 6. A name USDA published for a surviving identity must be reachable, and the generator refuses a corpus where one is not

`assertTwinNamesRetrieve` runs at generation. For every surviving twinned
identity, every description in its group must reach the row that took that
identity, searched in the spelling §3 would have kept.

It is stated over the **archives** and measured over the **finished names**, so
it is a check rather than a restatement: an alias the rule failed to emit shows
up as a name that retrieves nothing. The population is a function of USDA's own
`ndbNumber` assignments, so the next mirror refresh can introduce twins nobody has
read, and this is what reads them.

The outcome is measured separately, by a `twin` pass in `pnpm usda:ranking-audit`
that reports what each discarded name reaches and what its row lost.

## Consequences

- **40 result sets that were empty are not**, and three leads move to the right
  row. `spinach` now leads with `Spinach, mature` on the `raw` key its alias
  supplies; `bananas` with the plain ripe row rather than the overripe one;
  `cabbage` and `carrots` likewise.
- **Two of #143's gold-set cases resolve rather than move sideways.** Both were
  `miss` verdicts, and its `spinach` note had already written down that #137 might
  change it. Neither was a case measured as correct.
- **Five discarded names still do not lead**, and each is beaten by a real,
  more specific row carrying the query's words plus its own —
  `Fish, pollock, Alaska, raw`, `Wheat flour, whole-grain, soft wheat`,
  `Peanut butter, smooth style, without salt`. Retrieval is the thing this record
  fixed; those five are ordering, and they belong to #124 and #143.
- **The vocabulary map moved, 435 keys to 446.** `flax seed` left it, having
  learned to answer for itself through `Seeds, flaxseed`; thirteen phrases joined
  because an alias finally gave their OFF group a target that retrieves. The
  synonym sweep now finds 230 miss groups where it found 233.
- **Some aliases are not food searches.** `Applesauce, canned, unsweetened, with
added ascorbic acid` is a name USDA published, so `ascorbic acid` now returns an
  applesauce where it returned nothing. That is the same class ADR-0049 already
  names `implausible-query`, and it is accepted rather than filtered: a rule about
  which of USDA's own names are "real" would be exactly the editorial judgement
  §3 exists to avoid.
- **The index costs 3,523 bytes**, measured and printed by the generator rather
  than estimated, after [#120](https://github.com/palebluebytes/inventoria/issues/120)
  found this artifact 40% larger than the record describing it claimed.
- **`schema_version` goes to 3**, so a reader can refuse a shape it does not know.
- **An alias rides into the ledger inside `twin/raw_provenance.raw_data`**,
  because ADR-0047 §7 makes the generated row the provenance. It is derived data
  sitting beside `macros` and `merged_from`, which are also ours, and nothing
  reads it back.
- **This makes a wrong merge findable.** Where USDA fused two foods under one
  `ndbNumber`, the alias hands a user a row labelled as the other food. That is
  worse-looking and better than silence, and it is the whole reason #145 has a
  worklist: the alias list is exactly the set of pairs somebody has to adjudicate.
- **The absence tool is trustworthy for the first time.** `--explain` now names
  the surviving row a record merged into, distinguishes that from `no_energy`, and
  asks the filters about the merged identity the way the generator does. Every
  absence verdict taken before 2026-08-21 was read through the broken version.
