# ADR 0056: A food's name loses the parts that do not name the food

**Status:** Accepted  
**Date:** 2026-08-25  
**Implemented:** `src/lib/food/usda-shipped-name.ts`, applied by `scripts/usda-bundle.mjs`; Search index `schema_version` 5 to 6

This record amends [ADR-0042](0042-usda-search-reference-foods.md) §3, whose
governing principle covered which records ship and how they rank but never what
they are CALLED, and adds a narrow amendment to
[ADR-0055](0055-who-eats-a-food-ranks-it-and-never-drops-it.md) §1, which as
written forbids the sixteen drops this rule causes.

It is the first rule in this project that rewrites a USDA description. Every
earlier one filters (`usda-food-kind.ts`), merges (ADR-0045 §2), ranks
(ADR-0042 §1) or adds a name (ADR-0050 §4). This one takes words away.

## Context

USDA writes three things where a food's name belongs.

**Where an imported carcass came from.** `Lamb, New Zealand, imported, loin
chop, separable lean and fat, raw`. 280 rows carried `New Zealand`, `Australian`
or `imported` as a standalone qualifier.

**Where it filed the row.** `Beef, variety meats and by-products, liver, raw`.
100 rows carried that phrase as a qualifier of its own, sitting between the
animal and the organ; 93 of them are renamed and 7 leave under §4. A 101st
carries it without the comma USDA meant to type, which §4 has to look past.

**How wide the sample behind the row was.** `all grades` (255 rows) averages
USDA's beef grades; `all classes` (21 rows) does the same over poultry classes,
the bird's market category by age and sex. Both sit beside rows that name a
single grade or class — `choice`, `select`, `prime`, `broilers or fryers`,
`stewing` — and those keep the word that names them.

Neither names the food. Both consume the width of a result row before the cut a
person is looking for. The ask that produced this record was "remove any foods
that have a name in them (like Alaska)", and the first thing measurement did was
narrow it.

### What the measurements ruled out

**A general place-word rule is refused.** 639 of the corpus's rows carry one of
~104 place words, and most are not origins: `Atlantic` on a cod names a species
whose fat differs from the Pacific one, `Boston butt` is a cut, `Swiss` chard is
neither Swiss nor optional, and `bengal gram` and `pe-tsai` are the British and
regional aliases ADR-0049's vocabulary exists to preserve. ADR-0055 §7 already
refused this predicate in writing; the measurement here agrees with it.

**The cultural designation tags stay.** `(Alaska Native)`, `(Navajo)`,
`(Apache)`, `(Northern Plains Indians)`, `(Klamath)` and `(Hopi)` were the
example in the original ask and are the one case this record does not touch.
ADR-0055 §4 demotes that category on an exact tie and §1 forbids dropping it; 45
of its rows name a food no other row mentions, including the corpus's only
mutton. Restating one of them without its tag would assert it is a
general-population reference value, which is not what USDA published it as.

**Dropping duplicates "from different places" reaches almost nothing.** The
proposal's second half was to keep one row where several places supply the same
food. Stripping the origin and comparing names exactly reaches 25 of 428 rows,
and most of those are false: `New Zealand spinach` against `Spinach` is
_Tetragonia_ against _Spinacia_, and eight are Wagyu marble-score pairs. The
honest reach was three beef offal pairs, and all three disagree substantially —
40 of 94 shared fields differ by 25% or more on liver alone. They are not
duplicates. What actually drops here is a consequence of the rename, not of that
proposal, and §5 says so.

**A composite-drop rule is refused.** Choice overload is the reason this ticket
existed, and the origin words are not its cause: `beef` and `steak` return 50
rows with zero origin-qualified among them, and `pork`, `chicken`, `cheese`,
`rice`, `milk`, `potato` and `salmon` have none at any depth. The real driver is
the trim-and-grade cross product — 1,418 rows (32.7% of the corpus) say
`separable lean`, 926 add a trim spec, 850 a USDA grade. The obvious cut, the 53
`composite of trimmed retail cuts` rows, was drafted and then refused: it deletes
`Veal, composite of trimmed retail cuts, separable lean and fat, raw`, which
`docs/research/143-gold-set.json` adjudicates as the row that SHOULD lead `veal`,
and leaves that query on the Australian rib roast the gold set's own note calls
the defect. ADR-0055 §2 binds drops as well as ranking keys. Choice overload is
left open, and it is not this record's.

**Scope.** This record governs what a shipped reference food is CALLED, and the
drops that follow when two names come out the same. It does not touch ADR-0042
§4 or §5, adds no member to any filter roster, and changes no ranking key. It
does not address choice overload.

## Decision

### 1. A qualifier part that does not name the food is removed

Two rosters, both in `usda-shipped-name.ts`:

- **Commercial origin** — `new zealand`, `australian`, `imported`.
- **USDA's cataloguing apparatus** — `variety meats and by-products`,
  `all grades`, `all classes`.

Both rosters are removed from a shipped description.

The second roster costs something the first does not, and it is worth stating.
`all grades` and `all classes` are claims about the MEASUREMENT — they say the
figure spans every grade or bird class rather than picking one — so removing
them makes a row look more specific than USDA meant it. They are removed anyway
because in this corpus they never tell two rows apart: measured, stripping both
collides with nothing, since every row that names a single grade or class keeps
the word that names it. `Aust. marble score` is deliberately NOT on this roster
for the opposite reason — it names a grade rather than averaging over them, so
it still distinguishes rows, and 16 Wagyu rows keep it. Neither is kept anywhere: there is
no field holding the original, because a field holding it is an invitation for
the next reader to search it. `scripts/usda-bundle.mjs` regenerating from the
archives is the way back.

### 2. The rule is positional, and that is the whole safety argument

A roster entry is removed only where it occupies a **whole comma-delimited
qualifier part**, and **never from the head phrase**.

`New Zealand spinach, raw` therefore keeps its name. That row is _Tetragonia
tetragonioides_, a different plant from spinach carrying a fifth of its iron —
12 kcal and 0.66 mg against 23 and 3.57 — and the corpus holds **no
`Spinach, raw` row at all**, so §4's collision guard has nothing to notice and
would let a lexical rule through. A word-list rule would file that plant under
real spinach's name and nothing downstream could tell.

The position is a safe proxy because USDA is consistent about it: `New Zealand`
appears 168 times, 165 as a standalone qualifier and 3 as that plant, and
`imported` never appears without a country before it. `Aust. marble score 9`
keeps its abbreviation for the same reason — it is part of a grade, not a part of
its own, and reaching it would need the second lexical rule this section refuses.

### 3. The words leave the corpus entirely

Not display-only. The origin words are absent from descriptions, from `also`
aliases, from what search matches and from what ranking reads. `new zealand lamb`
returns nothing, deliberately: a name a user can read but not type is worse than
one they can do neither with, and nobody searches for a place.

`also` is renamed with the descriptions. No alias carries an origin today, so
this reaches nothing — but `bestNameKey` ranks against every alias, so stripping
one kind of name and not the other would make `new zealand` searchable again the
first time a refresh produced such a twin.

`new zealand` on its own still returns the three spinach rows, which is §2
working rather than a leak.

### 4. Where two names come out the same, the row that named an origin loses

The rename can make two rows identical. Where it does, the row carrying an
origin is dropped and the other is kept.

**The tiebreak asks about origins, not about renaming.** Both rows may have been
renamed — USDA files the same lamb organ once as `Lamb, variety meats and
by-products, heart, raw` and once as `Lamb, New Zealand, imported, heart, raw` —
so "was this row renamed" cannot break the tie. An origin is what distinguished
the dropped row from the row it now duplicates; an aisle label distinguished
nothing.

**Collisions are judged on stems, in order.** USDA writes the plain organ
`kidneys` and its import `kidney`; those differ as text, but the search already
treats them as one word, so shipping both puts two rows a letter apart side by
side. The comparison is never over a sorted word set: a sorted set is a multiset,
and `Nuts, mixed nuts, oil roasted, without peanuts, with salt added` and
`…, with peanuts, without salt added` are opposite foods built from the same
words.

**Every other preparation of a dropped food goes with it.** Otherwise the corpus
keeps a boiled liver measured in one national herd beside a raw liver measured in
another, disagreeing several-fold with nothing on screen to explain why. This is
simplicity preferred to complete coverage, and §5 prices it.

An import that nothing contests keeps its new name and stays. That is what leaves
New Zealand tripe, `Lamb, testes`, `Lamb, sweetbread` and `Lamb, tongue - swiss
cut` in the corpus, and it is the same line that leaves mutton in it.

### 5. Amendment to ADR-0055 §1, deliberately narrow

ADR-0055 §1 says prevalence may rank a reference food and may never drop one, and
that a drop must be a claim about what the record IS. The sixteen drops in §4 are
not such a claim: the panels differ, and what makes the rows indistinguishable is
a rule **this project** adopted.

§1 gains one ground and no more: **a row may be dropped when a naming rule this
project introduced has made it indistinguishable from another row, and it is the
row that carried the origin.** It may never be borrowed for a drop argued on who
eats a food, which is the whole of what §1 exists to forbid.

The reason on record is the one actually given: **simplicity preferred to
complete coverage.** That is closer to the audience claim §1 bars than the
collision framing alone suggests, and it is written plainly here rather than
dressed as a claim about the records.

## Consequences

- **The corpus falls from 4,335 rows to 4,319**, and 631 rows are renamed. Eight
  rows leave on §4's collision rule and eight as preparations of them. Every one
  is New Zealand beef or lamb offal.
- **Sixteen assays are gone, and one of them matters.** The corpus keeps beef
  liver at **4,970 µgRAE** of vitamin A and no longer holds the imported row's
  **28,300**. Both clusters were measured internally consistent — across 239
  raw-and-cooked pairs the median cooked/raw ratio is 1.00, p05 0.50, p95 2.00,
  and 32% go down — so the 5.7× gap is between POPULATIONS, not preparations, and
  there was no cooking anomaly to delete. Vitamin A is a **limit** nutrient in
  this app (ADR-0032) and liver is the food UK guidance warns about for exactly
  that reason. Whether 4,970 or 28,300 is right for a British user is **not
  known**: it was raised, and the decision was to proceed without checking it
  against a UK source. If that check ever happens and the imported figure wins,
  this section is where to start.
- **`aust beef` now leads with a separated fat.** Measured over 3,976 sweep
  queries: 3,898 leads unchanged, 7 emptied because the query named an origin, 71
  moved, and this is the only one that went from a food to the fat trimmed off
  one. `aust` matches `Aust. marble score` in both candidates, and the shorter
  name lets `accounted` favour the fat row. Pinned in `usda-corpus.test.ts`
  rather than left to be rediscovered, on #151's precedent.
- **`tri beef` moved too**, from the beef composite to `Beef, tripe, raw`, which
  the aisle-label strip left short enough to win. Both are sweep-generated pairs
  rather than phrases anyone types.
- **364 rows now lead when searched by their own full description**, against 218
  before this record — `lost` stays at zero, the invariant no key or corpus
  change has ever broken. Most of the gain is `all grades` alone, which takes two
  words off 255 rows.
- **The word `classes` has left the corpus**, because it only ever appeared
  inside `all classes`. The stemmer therefore makes one merge fewer, which
  `usda-corpus.test.ts` counts: a rename takes a word the same way a filter drop
  takes one.
- **The gold set is unmoved: 0 broken, 1 fixed** (`spinach`). ADR-0055 §2's bar
  is met, and `usda-corpus.test.ts` already guards it.
- **A rename erases the evidence for older measurements.** ADR-0055's #157
  Amendment pinned "72 of the 74 New Zealand imports stay" by counting a
  description prefix that no longer exists. That assertion is now made by
  `fdcId`, and the eight it loses are listed. Any future measurement stated over
  a description has the same exposure.
- **Foods already logged keep their old names**, and nothing migrates. The ledger
  is append-only (`AGENTS.md` §3), so this is required rather than merely
  convenient — a `food/name` frozen at staging time is a fact about what was
  logged, not a cache of the corpus.
- **`schema_version` goes 5 to 6.** No field changes shape; a value does. A
  capture written by ADR-0053's search log against schema 5 recorded a corpus
  whose names differ, and the bump is what makes that legible.
- **The ADR-0049 vocabulary re-derived**, as any corpus change makes it. The
  derived map is 444 phrases reaching 333, and the row count moved in the seven
  files that state it.
- **Choice overload is untouched**, which was the reason the ticket was raised.
  The trim-and-grade cross product is still there, the composite refusal above
  says why the obvious cut is not the answer, and it wants its own record.
