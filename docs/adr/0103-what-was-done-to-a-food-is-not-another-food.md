# ADR 0103: What was done to a food is not another food

**Status:** Accepted  
**Date:** 2026-09-12  
**Implemented:** [#434](https://github.com/palebluebytes/inventoria/issues/434) — `src/lib/food/usda-collapse-roster.ts` (§2's roster, §3's two keys, §5's eligibility test) reached through `scripts/usda-app-module.mjs`'s seam (§9); [#435](https://github.com/palebluebytes/inventoria/issues/435) — `scripts/usda-collapse.mjs` (§3's grouping, §4's chain, §6's corpus-wide firing, §9's survivor assertion and §9's account at `docs/research/190-corpus-account.md`), run last from `scripts/usda-bundle.mjs` and replayed by `scripts/usda-drop-census.mjs`, which is where every collapsed row names its survivor; [#436](https://github.com/palebluebytes/inventoria/issues/436) — §5's strip as `resolveCollapsedNames` in `src/lib/food/usda-shipped-name.ts`, licensed by `collapseCorpus` and asserted by `assertNamesClaimNoLess` and `assertNoAxisHidesInAGloss` in `scripts/usda-collapse.mjs`, so a collapsed group's row reads `Beef, composite of trimmed retail cuts` rather than `Beef, composite of trimmed retail cuts, separable lean and fat, trimmed to 0" fat, choice`; [#437](https://github.com/palebluebytes/inventoria/issues/437) — the account's staleness gate, `scripts/usda-account-check.mjs`, chained into `pnpm check`: it rebuilds the whole file from `public/usda/search-index.json` and the census's `"stage": "collapse"` rows and compares the bytes, which is what §9's third requirement asks of a reader who has neither the archives nor a reason to trust the file  
**Amended by:** [ADR-0104](0104-the-corpus-is-ingredients-as-bought-and-not-yet-cooked.md), which keeps §2's as-bought line and replaces the §2–§4 collapse as the mechanism: the cooked records are removed rather than merged. It also corrects this record's Context, whose "the fix that reaches USDA's granularity is the fix that deletes quinoa" rests on a substring match of `/cooked/` that also matched the fourteen rows saying **un**cooked — against §10's own standing warning. Under a word boundary quinoa, teff, spelt and apricots all survive the cut

This record amends [ADR-0055](0055-who-eats-a-food-ranks-it-and-never-drops-it.md)
§1 for a third time, and it is the **narrowest** of the three amendments rather
than the widest. The two before it drop a row on a judgement; this one removes a
row only where the group it belongs to provably keeps another. It also amends
[ADR-0042](0042-usda-search-reference-foods.md) §1, which says what the corpus is
made of, and [ADR-0056](0056-a-name-loses-the-parts-that-do-not-name-the-food.md)
§1, whose positional strip gains a second roster.

It is the synthesis of the wayfinder map at
[#186](https://github.com/palebluebytes/inventoria/issues/186) and rests on its
three closed tickets: [#187](https://github.com/palebluebytes/inventoria/issues/187)
([research note](../research/187-composition-table-granularity.md)),
[#188](https://github.com/palebluebytes/inventoria/issues/188)
([the pre-registered bar](../research/188-consolidation-bar.md)) and
[#189](https://github.com/palebluebytes/inventoria/issues/189) (the
`prototype/189-food-forms` branch).

The rules that make a result _readable_ are ADR-0062's and ADR-0090's. This record
is only about which rows ship.

## Context

Typing `beef` answers with **949 rows**, of which the first twelve are
`Beef, composite of trimmed retail cuts, separable lean and fat / lean only,
trimmed to 0" / 1/8" fat, choice / select, raw` permuted over trim, grade and
separation. `pork` (324 rows) and `lamb` (276) have the same shape. Eight ranking
keys have been added over a year to sort that list and none of them has fixed it,
because the list is not mis-sorted: it is one food written out thirty times, and
no ordering of thirty copies produces fewer than thirty.

The shipped corpus is `public/usda/search-index.json`, `schema_version` 8, **4,238
rows**, of which 3,972 (94%) are SR Legacy. The map measured its shape at
charting: 1,420 rows carry a trim or lean qualifier, 1,739 name a cooking method,
and 596 groups differ **only** by raw-versus-cooked, at a median of +31% calories.
512 head phrases, of which the top 25 hold 69% of the rows.

### The alternatives that were live, and what ruled each one out

**Swap the composition table.** [#187](https://github.com/palebluebytes/inventoria/issues/187)
measured thirteen national tables and found that **no table carries one row per
ingredient** — every one of them multiplies cut by preparation. USDA is the worst
on this axis (8.28 rows per head against CIQUAL's 2.00) and stays anyway, because
granularity is closable from our side and the two tables that beat it on
granularity ship **no household portions at all**, where 95% of our rows carry
one. Re-litigating ADR-0045's other findings was explicitly out of scope.

**Give a food _forms_, chosen at staging.**
[#189](https://github.com/palebluebytes/inventoria/issues/189) built six shapes and
refused all of them. An independent picker per axis offers the cross-product of
the axes, and USDA's design is unbalanced enough that **42% to 98% of that product
has no row behind it** — a picker that must dead-end, or quietly show the number
for a different food. Offering the surviving _combinations_ instead fixes the
hollowness and produces a form list with no order, names that are raw joins of
axis values (`with added sugar, dried, stewed, sulfured`), and a ranking problem
moved rather than removed. A variant IS a food, so it gets a row.

**A measured threshold, keeping the axes that move the calories.** Built, and
refuted by its own numbers. `chicken breast`'s preparation axis moves the number
**13%** and `beef`'s trim axis **12%** — the axis the question calls the strongest
case for a choice and the axis it calls noise are one point apart. Push the dial
high enough to tidy beef and `chicken breast` keeps no axis at all: one row
spanning 108 to 197 kcal. **Size was never the question.**

**The crude drop: delete every row naming a cooking method, then every row naming
a trim or a grade.** This is the rule the map's own charting figure came from
(4,238 to 1,873) and that #187 corroborated by a second route (1,851 rows, `beef`
949 to 38). It is refused here, on a measurement nobody had taken: **what it
deletes has no survivor.**

Reproducing it approximately over the shipped corpus (1,834 rows kept by this
record's transcription of its two regexes, against #187's 1,851):

|                                                           |               |
| --------------------------------------------------------- | ------------: |
| Rows deleted                                              |         2,404 |
| Residual groups losing **every** row, so the food is gone |     **1,089** |
| Rows in those groups                                      |         2,181 |
| Head phrases that disappear entirely                      | **18** of 512 |

The eighteen are `mutton`, `quinoa`, `teff`, `spelt`, `buckwheat groats`,
`amaranth grain`, `escarole`, `malabar spinach`, `tree fern`, `winged bean`,
`pinon nuts`, `dove`, `turkey breast`, `turkey thigh`, `salmon nuggets`,
`guava sauce`, `beef composite` and **`apricots`** — which is the head #189 named
as the one where drying is the only way the food exists. They go because USDA
publishes them only cooked, or only trimmed, and a rule that reads one row at a
time cannot tell "this is a duplicate" from "this is the only record there is".

That is the finding that shaped this record, and it is worth more than the rule it
produced: **the fix that reaches USDA's granularity is the fix that deletes
quinoa.** ADR-0055 §1 exists to forbid exactly this, and it was right to.

**A prevalence cut, to reach the sizes the crude drop reached.** ADR-0055 §1 bars
it in terms, the map ruled the "nobody logs this" residue out of scope at
charting, and §3 below is where the refusal is paid for rather than hidden.

**Generalising ADR-0061's per-head adjudication to the whole corpus.** Refused;
see §8.

### Scope

This record says **which rows the generator ships**. It does not touch retrieval
(ADR-0062), ranking (ADR-0042 §1, ADR-0055 §3 and §4, ADR-0090), the shipped-name
rosters beyond the one addition in §5, Open Food Facts, the barcode path, or
anything a user has already logged. Migration is a non-issue: a logged food is an
`fdc:<id>` entity carrying its own panel into the append-only ledger, and nothing
re-reads the Search index for a past log, so a row leaving the corpus cannot
damage history.

It also does **not** deliver a corpus. It states the rule and fixes the shape of
the roster the rule reads; the roster is seeded by the `Beef` pilot
([#191](https://github.com/palebluebytes/inventoria/issues/191)) and grows one
adjudicated head at a time. A rule stated for 512 heads by someone who has read
four of them would be a guess wearing a decision's clothes.

## Decision

### 1. A corpus row is a food as bought, not a record as published

USDA publishes records. A record is an assay of a specimen: this cut, at this
trim, at this grade, in this state. A corpus row is a **food**, meaning the thing
a person buys, weighs and writes one word for in a food diary.

Where a group of records describes one food, the corpus ships **one row**. This is
the decision, and every section below is how it is carried out.

The identity test is the meal-log test, fixed at charting and unchanged:
**two records are one food if you would write one word for them in a food diary.**
It is not nutritional equivalence — raw and cooked beef differ by a median 31% and
are still one food. It is not shopping equivalence — whole and skimmed milk are
one aisle and three different logs.

### 2. An axis distinguishes a row or collapses onto it, and the line is _as bought_

An **axis** is a dimension the records under one head vary along: preparation,
trim, grade, separation, variety, part, state. Each axis is one of two things,
corpus-wide, and the classification is a property of the axis rather than of the
head it appears under.

> A **distinguishing axis** names something true of the food **when you bought
> it**. It distinguishes a row.
>
> A **collapsing axis** names something done to the food **after you bought it**,
> or a trade specification you never see. It collapses onto the as-bought row.

Cooking collapses: you buy beef and cook it. Trim and grade collapse: they are
true at purchase, but they are specifications written for a butcher's trade and no
reader of this app has ever chosen between them. Variety, part, and fat content
distinguish: you buy a golden delicious, a chicken thigh, a 2% milk.

**Drying distinguishes**, and it is the case that forced this wording. You buy
dried apricots as dried apricots; there is no fresh apricot you dried. #189 had
drying as a collapse and then needed a per-head exception to stop dried apple
merging into fresh apple at 48 against 243 kcal — the rule fighting itself. Under
the as-bought line the exception is unnecessary, because dried apple is a
different food and gets a row.

**An axis is classified by what it IS, never by how far it moves the number.** The
measured threshold that was built and refused is the reason this sentence is here:
the adjudications wanted variety as a row at 2% and refused preparation at 34%.

**The line is about a purchase, not an aisle.** The meal-log test rejected shopping
equivalence, and this section is not smuggling it back: whole and skimmed milk are
two purchases and two rows. What "as bought" settles is only the _direction_ of a
change — did it happen before the food reached the kitchen, or after.

### 3. A collapse group is computed, not declared

Strip from a description every comma-segment the roster classes as a collapsing
axis. What remains is the **residual description**, and rows sharing one residual
description are one **collapse group**.

Grouping is mechanical rather than adjudicated, and the direction it fails in is
the argument for it. **A segment the roster does not claim leaves two rows where
there should be one** — the corpus under-collapses, which is today's defect and not
a new one. The opposite arrangement, where a human names the groups, fails by
deleting a food nobody adjudicated. **The roster's ignorance always costs
coverage, never correctness**, and that sentence governs every clause below.

### 4. The group ships one row, and it is a row USDA published

The group's **representative** is a real record and the panel that ships is that
record's, whole. Not a mean: a mean is a number USDA never measured, no row can be
pointed at to explain it, and the ledger stores `fdc:<id>` entities, so a meaned
row would need an identity that is not a USDA record.

The representative is chosen by, in order:

1. **Eligibility**, which §5 defines.
2. **The fuller nutrient panel**, present-not-nonzero: a measured 0 g of fat is a
   fuller panel than a fat figure USDA never published (ADR-0048).
3. **The lowest `fdcId`**, so the answer is stable across regenerations.

`dataType` is **not** in that chain. Preferring Foundation to SR Legacy is
provenance rather than a claim about the record, and ADR-0055 §1 admits only the
second kind. ADR-0045 §2's Foundation-first merge is a different operation on a
different key (a shared `ndbNumber`) and is untouched.

The reasoning of ADR-0056's 2026-08-25 Amendment is reused here and its text is
not, because the two rules do different jobs: that one picks which of **two rows
that came out with the same name** survives, and this one picks which of a dozen
**differently named** rows stands for the rest. What carries across is why panel
completeness is admissible at all — it is a claim about the record.

### 5. A name may never claim less than its panel measures

This is the safety rule, and §4's eligibility is its consequence rather than a
second rule.

A collapsing segment is removed from the shipped name by ADR-0056 §1's positional
strip, whose roster gains this record's collapsing axes. But the strip is
**licensed by the collapse having actually happened**:

> A collapsing segment is stripped from a name **only where the group it belongs
> to merged more than one row**. A group of one keeps its name whole and ships.

`Quinoa, cooked` is the only quinoa record USDA publishes. Its group has one row,
nothing is stripped, and it ships as `Quinoa, cooked` — a true name over a true
panel. The eighteen head phrases the crude drop deletes all survive here for the
same reason.

A row is **eligible** to represent a group of more than one when the name that
group ships under would still be true of it. Two consequences follow, and both are
the same rule:

- **A row carrying a segment the roster could not read is refused.** Without this,
  `Chicken, broilers or fryers, breast, skinless, boneless, meat only, with added
solution, raw` — the only raw meat-only row USDA published — stands for plain
  chicken breast and hands the reader a brine-diluted **108 kcal**. `with added
solution` would be stripped as unclaimed, and the name would then claim less
  than the panel measures.
- **A row that positively states a non-preferred value on a collapsing axis is
  refused.** Saying _nothing_ about preparation is not the same as saying
  "fried": only a **stated** non-preferred value refuses, which is what keeps
  intact every row that names no preparation at all.

**Where a group of more than one has no eligible row, the group is a coverage
hole** and the food does not ship until [ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md)
supplies a stand-in. #189 found the first one: `chicken breast, meat only` has four
candidates and every one is cooked or brine-injected, so **USDA published no usable
panel for plain skinless chicken breast**, the most-logged chicken cut there is. A
hole is recorded in §9's account as a debt against ADR-0046, and it **blocks the
head from shipping** rather than being papered over with 108 kcal or rendered as a
row with no number. A row with no panel is unloggable, and producing a number is
the whole job of a food search.

### 6. A collapse fires corpus-wide; a drop fires only under a read head

This is the rule for the 462-head tail, and the asymmetry is the whole of it.

> **A collapse always leaves a survivor.** Its worst case under a head nobody has
> read is a wrong representative: visible, recoverable, and a claim about the
> record. So it fires everywhere.
>
> **A drop leaves nothing.** Its worst case under a head nobody has read is
> quinoa. So it fires only under a head phrase every row of which has been read
> and adjudicated.

The second half is `usda-variant-drops.ts`'s Guard 1, inherited unchanged and now
stated as a general principle rather than as one module's precaution. A head that
has been read is a **read head phrase**; the corpus today has three
(`Milk`, `Yogurt`, `Soymilk`) and this record adds none.

The tail is cheap to leave alone: the 462 unadjudicated heads average 2.8 rows,
and the collapsing is concentrated in 40 groups of more than ten rows, **every one
of which is beef**.

### 7. This record takes no drop power

ADR-0055 §1 gains **one** ground and no more:

> A row may be dropped where it differs from another row in the corpus **only** on
> collapsing axes, and that other row ships.

That is the collapse of §3 and §4, and nothing else. It is relational by
construction — it cannot be stated about a row read on its own, which is precisely
why it needs §1's leave rather than fitting inside §1's existing list.

**No general licence to drop is taken**, and the ticket that commissioned this
record expected one. #189 supplied exactly two drop cases, `dried` under `apple`
and `late harvest` under `wine`, and §2's as-bought line makes both of them
distinguishing axes: you buy dried apple as dried apple and late-harvest wine as
late-harvest wine. A power with no instance to point at is the accretion this map
exists to stop, and ADR-0055 §1's discipline is that a drop is argued against a
case and never in advance. If the `Beef` pilot finds a row that must go with no
survivor, it comes back for the amendment carrying that row.

### 8. ADR-0061 is bounded by this record, not generalised by it

Two different membership arguments now live in this corpus and they must not be
confused:

| argument                                  | reach                        | record                         |
| ----------------------------------------- | ---------------------------- | ------------------------------ |
| A preparation is not a food               | corpus-wide, survivor proved | this one                       |
| Simplicity preferred to complete coverage | one read head, judged        | ADR-0061 §2 to §4, ADR-0056 §5 |

Under §2's as-bought line **every one of ADR-0061's seventy-four drops is a
distinguishing axis**: you buy chocolate milk as chocolate milk and dried
buttermilk as dried buttermilk. Those rows left the corpus on a different reason,
which ADR-0061 states plainly and this record does not reach for: extending it
corpus-wide would be the prevalence cut the Context refuses, deleting a food on a
judgement about who looks for it. **A rule claiming "a preparation is not a food"
may not be used to take a row that argument does not reach.**

### 9. The roster is auditable, and the account is committed

The roster of axes lives in a module of its own under `src/lib/food/`, reached by
the generator through the esbuild seam in `scripts/usda-app-module.mjs` so that no
second copy of the answer exists (ADR-0047 §4). It is a third module rather than
an entry in `usda-food-kind.ts` or `usda-variant-drops.ts` because it moves on a
third trigger: those move when an escape is measured and when a head is read, and
this one moves when an **axis is classified**.

Three requirements, each answering a way this codebase has gone wrong before:

- **Every roster entry names which of §2's two kinds it claims, and why.** An
  entry that cannot say is not ready to ship.
- **[ADR-0051](0051-a-shared-ndb-number-is-not-proof-of-one-food.md) §2's survivor
  assertion is inherited whole.** Every collapsed row names the `fdcId` it
  collapsed into, and **generation fails if that `fdcId` is not in the shipped
  index**. Without it a later filter change takes the survivor and the collapse
  silently becomes a deletion.
- **Generation emits a per-head account — rows in, rows out, and why — and the
  account is committed** at `docs/research/190-corpus-account.md`. It is checked in
  rather than left a build output because [#156](https://github.com/palebluebytes/inventoria/issues/156)
  is the trap: regenerating an audit's artifact as a side effect is how the ranking
  audit went blind. A committed account makes "this rule removed forty foods" a
  thing a diff shows moving. The map's own landing-zone figure survived a year
  because nobody re-derived it.

### 10. A roster entry matches a whole segment, and a segment may carry two facts

ADR-0056 §2 calls its rule's positional nature "the whole safety argument". The
same argument reaches here, in two clauses:

- **A roster entry matches a complete comma-segment and never a substring.**
  `Caraway` and `Strawberries` both contain the literal string `raw`;
  `Butter` reaches `butterbur`, `salmon` reaches `salmonberries` and `bread`
  reaches `breadfruit seeds`. The corpus also contains exactly one row spelling
  `trimmed to 1/8"fat` with no space, so an entry is a pattern over a segment
  rather than a literal string.
- **A segment may carry more than one fact, so splitting precedes matching.**
  USDA writes `Beef, ground, 70% lean meat / 30% fat, patty cooked, pan-broiled`,
  welding a shape and a state into one segment. Unsplit, the 43 rows behind
  `minced beef` — ten fat ratios crossed with plain, patty, crumbles and loaf,
  crossed with doneness — collapse by **exactly zero**, which is the measured
  behaviour today.

**`grade` is the standing warning.** The corpus's grade vocabulary is `choice`,
`select` and `prime`; `grade a` is a different sense entirely, appearing in
`Eggs, Grade A, Large, egg white`. A roster entry reading the word rather than the
segment renames three egg rows.

### 11. Both bars bind, and this record does not clear one of them

Two bars apply and neither supersedes the other, because they test opposite
things.

**ADR-0055 §2**: no rule adopted here may break a lead already measured correct,
checked against the 19 heads `docs/research/143-gold-set.json` adjudicates
`correct` — of 50 cases in that file, the other 31 being misses and peers, which
§2 does not protect because they were never right ([#192](https://github.com/palebluebytes/inventoria/issues/192)
measured the count this paragraph originally gave as 29). It
is a regression test, it was made binding on drops for the reason that a broken
lead is recoverable by scrolling and a dropped row is gone, and it binds every
clause above.

**[#188](https://github.com/palebluebytes/inventoria/issues/188)'s pre-registered
bar**: C1, the gold row in the top 3, and C2, at most 25 rows per query, over 44
hand-judged queries. It is a target. Baseline at the time of this record is
**C1 24/44, C2 27/44**.

**C2 is not reachable by this rule for a substantial part of the roster, and this
record says so rather than reinterpreting the bar.** Measured over the shipped
corpus, a collapse of preparation, trim, grade and separation does the work on
seven of the twenty-one queries that exceed 25 rows — `beef` 954 to 228, `lamb`
276 to 94, `pork` 324 to 166, `gammon` 88 to 53, `chicken thigh` 27 to 14, plus
`chicken` and `turkey` — and does **literally nothing** for eight others:

| query    | rows | after collapse | why this rule cannot help                           |
| -------- | ---: | -------------: | --------------------------------------------------- |
| `cheese` |  101 |        **101** | 101 named cheeses. Zero permutation.                |
| `oil`    |   70 |         **70** | 70 named oils.                                      |
| `flour`  |   66 |         **66** | 66 named flours.                                    |
| `egg`    |   35 |         **35** | species × part × frozen/dried/pasteurised.          |
| `salmon` |   32 |         **32** | species, plus `salmonberries`.                      |
| `cream`  |   31 |         **31** | plus `ice cream`, `cream cheese`, `sour cream`.     |
| `butter` |   42 |         **42** | plus `butterbur`, peanut and almond butter.         |
| `mince`  |   43 |         **43** | §10's welded segment; a roster fix, not a rule fix. |

Two instruments are owed and neither is this record's, and naming them is how this
record avoids pretending otherwise. **Retrieval pollution** — `butter` reaching
`butterbur`, `bread` reaching `breadfruit seeds` — belongs with ADR-0062 and
[#407](https://github.com/palebluebytes/inventoria/issues/407). **A head that is
genuinely a hundred foods** is not a membership problem at all, and whatever
answers it will be a ranking or a paging instrument.

Reinterpreting C2 as a bar on the whole search after seeing which queries fail is
the post-hoc move #188 was written to prevent, and this record declines it.

## Consequences

**The corpus lands near 2,900 rows before any head is adjudicated, not near
1,850.** The map registered an expected landing zone of 1,850 to 1,900 as a
sanity figure; that zone is the size of a corpus that has deleted 1,089 foods, and
the bar document is corrected in the same change that carries this record. A
collapse of the four crude classes gives **2,923 residual groups**, and widening
the class list to 25 further near-miss segments reaches only 2,739. **Widening the
roster is not what closes that gap, and nothing this record permits closes it.**

**The consolidation is meat, and this record stops implying otherwise.** All forty
of the collapse groups larger than ten rows are beef. Under §2 and §7, `apple`
ships 11 rows and `white wine` 14 — **those heads do not consolidate at all**,
where #189's prototype showed 8 and 12 by dropping rows this record refuses to
drop. Variety-heavy heads keep every row by design.

**A collapse deletes a measured spread, and the survivor is one arbitrary point
inside it.** #189 measured the paired medians: on `beef, top sirloin, steak`,
collapsing trim throws away **12%** of the calories and grade **6%**; preparation
is **34%**. §4's chain picks the survivor on panel fullness and then on `fdcId`,
neither of which has anything to do with which number is right. This is the price
of one row per food and it is paid knowingly: a reader who logs 100 g of sirloin
gets a figure that is right for the as-bought food and wrong for a choice-grade
steak trimmed to a quarter inch, by a margin smaller than the one they accept
today by picking whichever of thirty rows they happened to see first.

**Some heads will not ship until ADR-0046 grows.** §5 makes a coverage hole a
precondition rather than a warning, so a hand-off ticket for a head can be blocked
on a curated stand-in that does not exist yet. That is the intended failure: the
alternative is shipping 108 kcal of brine as chicken breast. The number of holes
across the 25 adjudicated heads is unknown; one is confirmed.

**The roster is bounded at roughly a hundred entries and endless after that.** The
corpus carries **1,655 distinct trailing segments** over 17,093 occurrences. The
top 25 claim 55% of them, the top 100 claim 72% — and **1,015 of the 1,655 claim
two rows or fewer**. A roster is a weekend's work to 72% coverage and an
unfinishable project past 90%. §3's "ignorance costs coverage, never correctness"
is what makes stopping at 72% a decision rather than a defect.

**Eight of #188's queries stay over the cap and two further efforts are owed**, as
§11 records. The map's destination is reached without C2 being met, and that is a
real result rather than a failure to report: `cheese` returning 101 rows _is_ one row
per ingredient.

**Nothing about the index's shape changes.** No `schema_version` bump — #189
closed that question by refusing the forms concept, and this record adds no field.
A shipped row does not disclose how many USDA records stand behind it; the account
of §9 carries that for reviewers, where the accountability is actually needed. If
a screen is later asked to show it, that is a new decision with a new schema
version.

**The standing risk is unchanged and unaddressed.** 94% of what ships is SR
Legacy, which USDA stopped maintaining in 2018. This record makes the corpus
smaller, not newer, and #187 found no candidate that is more current _and_ better
on granularity _and_ carries portions.

**What would reopen this.** A pilot head that cannot be adjudicated without a drop
with no survivor reopens §7. A second composition table gaining household portions
reopens the Context's first alternative. A screen that needs to show what a row
stands for reopens the last consequence above.

## Amendment (2026-09-12, #191): §5 rewritten, §3 gains a normalisation clause, and the cut-depth lever is refused

The `Beef` pilot this record commissioned has run —
[#191](https://github.com/palebluebytes/inventoria/issues/191),
[research note](../research/191-beef-pilot.md), reproducible by
`pnpm usda:beef-pilot`. The roster was written out for all **202** of `Beef`'s
distinct trailing segments and applied corpus-wide, taking the corpus to **2,837
rows** and `beef` from 954 to **188**.

§1, §2, §3's grouping, §4, §6, §7, §8 and §10 are ratified by it and move no
inch. The as-bought line of §2 classified all 202 segments without producing a
case it could not decide, which is the thing the pilot existed to find out. §5
does not survive, and the two clauses below replace it.

### §5's eligibility test was undefined, and the definition decided whether the head shipped

"A row that positively states a non-preferred value on a collapsing axis is
refused" never says which values are non-preferred. Over `Beef`'s 185 collapse
groups the four available readings give **71, 34, 26 and 0** coverage holes — and
since §5 made a hole block its head, the record as written said `Beef` needs
between zero and seventy-one curated stand-ins before it may ship, and did not
say which.

**Two axes carry a non-preferred value and two do not.** Preparation does:
cooked beef is not the beef you bought. Separation does: `separable lean only` is
a dissected fraction rather than the steak. **Trim and grade carry none**, because
§2 collapsed them on the express ground that they are the same food, and refusing
a row for stating one re-imports the distinction the collapse has just erased.
The Consequences already concede the survivor is an arbitrary point inside a
measured spread — 12% across trim, 6% across grade — so refusing on trim buys
accuracy the record has already declined to claim.

### A coverage hole no longer blocks a head; it ships the group whole

§5 settles this question for a group of one already: `Quinoa, cooked` is the only
quinoa USDA publishes, nothing is stripped, and it ships — a true name over a true
panel. A group of six cooked-only rib eye rows sat under the same paragraph and
blocked 950 rows of beef. The two are identical in every respect that matters,
and the asymmetry had no argument behind it.

> **Where a group of more than one has no eligible row, it ships its
> fullest-panel row under that row's whole, unstripped name**, exactly as a group
> of one does. The strip is what §5 forbids, and not shipping.

The 108 kcal of brine the original clause feared is prevented by the name keeping
`with added solution`, which §5 already knows how to do. Blocking added nothing to
that and cost a head. **ADR-0046 now improves a row rather than gating one**, which
is also what makes the 24 hand-offs tractable: none of them can be blocked on a
stand-in nobody has written. 88 groups corpus-wide took this path in the pilot.

### §5's one confirmed coverage hole does not exist

The record states, and `CONTEXT.md` repeated, that `chicken breast, meat only`
has four candidates all cooked or brine-injected, so "USDA published no usable
panel for plain skinless chicken breast". USDA published **fdc:171077**,
`Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw`, 120 kcal
over a 129-nutrient panel.

#189 read the group under `Chicken, **broilers** or fryers, breast, meat only` —
plural, no `skinless, boneless` — which does hold only cooked rows. The plain raw
record is one segment and one letter away under `broiler` singular, and §3's
grouping saw two foods. Read the Consequences' "one is confirmed" as **none is
confirmed**: the number of coverage holes across the 25 adjudicated heads is
unknown and no instance has yet been demonstrated.

### §3 gains a normalisation clause, and it is punctuation only

The error above is not an anecdote about #189. It is what §3's key does: the
residual description is a string, and USDA's spelling of one cut is not stable.
`Beef, round, top round, steak`, `Beef, round, top round steak` and
`Beef, round, top round steak, boneless` are three groups for one food;
`97% lean meat / 3% fat` and `97% lean meat /3% fat` are two.

> **Rows are grouped on the residual description with commas, hyphens, slashes
> and repeated whitespace normalised away.** Nothing carrying meaning is
> normalised.

This merges only strings already identical modulo punctuation, so it costs no
judgement and cannot merge two foods. It is worth **8 groups of 193** on `Beef` and
is therefore **a correctness lever and not a size one** — it earns its clause
because of what it would have caught, not what it collapses. A wider
normalisation that also ignores `boneless`, `bone-in`, `lip-on` and `lip off`
would merge 14 more, and is refused here: `bone-in` is a real distinction on rib
eye and t-bone, where USDA publishes both, so that judgement belongs to an
adjudicated head and not to §3's mechanical grouping.

### §2 takes no cut-depth lever

The pilot's commission asked whether the rule needs a way to ship
`Beef, bottom round` and collapse steak-versus-roast into it. **No**, and the
reason is measured rather than argued. Truncating the residual description to two
segments leaves **73 rows** — still three times C2's cap — while merging every
ground-beef fat ratio into one `Beef, ground`, the gold row's 80/20 among them,
and flattening `Beef, grass-fed` and `Beef, cured` to a row each. It still leaves
`Beef, rib eye`, `Beef, rib eye steak` and `Beef, ribeye` as three.

Depth is not a coordinate in this corpus. USDA's second segment is variously a
primal (`round`), a cut (`tenderloin`), a shape (`ground`), a husbandry claim
(`Wagyu`), a preservation (`cured`) and an organ (`liver`). A rule counting commas
reads a hierarchy that is not there.

### §7 is ratified, with a negative result against it

§7 says a pilot finding a row that must go with no survivor brings it back as the
argument. `Beef` was read for one and does not contain one. The tempting case is
24 groups of dissected fractions and organ meats — `separable fat`, `seam fat`,
`suet`, `carcass`, `composite of trimmed retail cuts`, `mechanically separated
beef`, and thirteen organ groups — and it is declined on its own numbers: removing
all of them takes `beef` from 188 to about 164, the `designated` ranking key
already sinks them, and the map ruled that residue out of scope at charting.

### §11's table files `beef` on the wrong side of itself

§11 lists `beef` among seven queries the collapse "does the work" on, at 954 to
228, against eight it says the rule cannot help. Measured: of the **twenty-one**
queries over the cap at registration, **exactly one crosses it** — `mushroom`,
27 to 25 — plus `chicken thigh` among the watched multi-word queries. C1 moves by
**zero**, from 24/44 to 24/44; C2 by one, 27/44 to 28/44. One gold row is rescued
from past-the-cap to rank 20.

Nothing in §11's conclusion changes and its honesty is intact — it declined to
reinterpret C2 and said plainly that the bar would not be met. What changes is
which side of its own line `beef` sits on. **`beef` belongs in the second table,
beside `cheese`**: 188 butchery cuts is one row per ingredient, a bottom round
steak and a bottom round roast being two foods, and the remaining distance is
[#411](https://github.com/palebluebytes/inventoria/issues/411)'s and
[#412](https://github.com/palebluebytes/inventoria/issues/412)'s — retrieval and
paging — rather than membership's.

## Amendment (2026-09-15, #435): the collapse shipped, and it reaches four heads rather than six

The generator performs the collapse. `scripts/usda-collapse.mjs` groups the
finished corpus on §3's key, picks one record per group by §4's chain, refuses a
generation in which a collapsed row's survivor is not in the shipped index, and
refuses one in which the rule moves a head phrase nobody expected. **Corpus 2,418
→ 2,037**: 381 records of a cut already in the corpus now ship under the `fdcId`
of the row that stands for them, in 179 groups.

The survivors keep the names USDA published. §5's strip is licensed by the
collapse having happened and is not part of this change, so `beef` still leads
with `Beef, composite of trimmed retail cuts, separable lean and fat, trimmed to
0" fat, choice` rather than with the four words that name it. That is
[#436](https://github.com/palebluebytes/inventoria/issues/436).

### The hand-off's table named six heads; four moved

| head       |  rows | after | absorbed |
| ---------- | ----: | ----: | -------: |
| `Beef`     |   410 |   133 |      277 |
| `Lamb`     |   116 |    64 |       52 |
| `Pork`     |   130 |    92 |       38 |
| `Veal`     |    43 |    29 |       14 |
| **corpus** | 2,418 | 2,037 |      381 |

`Nuts` and `Seeds`, which the hand-off's table gave as 74 → 72 and 46 → 45, are
absent: both still hold 74 and 46 rows and the collapse touches neither. Their
absence is [#434](https://github.com/palebluebytes/inventoria/issues/434)'s
decision rather than a measurement that moved. The only thing that collapsed them was the
preparation axis, and ADR-0104 owns cooked forms now: the eight roasted nut and
seed rows are ingredients as bought, `roasted` is a stated non-preferred value,
and a japanese chestnut merging onto its plain sibling would have **deleted** a
row ADR-0104 argued for. The remaining 484 head phrases have nothing to collapse
at all, because what is left after the cooked half is gone is purely butchery.

### §5's coverage hole has five instances, and they are all beef

The 2026-09-12 Amendment read the Consequences' "one is confirmed" as **none is
confirmed**, and said no instance had been demonstrated. Shipping the rule
demonstrated five, every one of them a cut USDA assayed `separable lean only` and
no other way, at three grades: t-bone steak, bottom round roast, top sirloin
petite roast/filet, ribeye cap steak and ribeye petite roast/filet.

Each ships its fullest-panel record under that record's whole, unstripped name,
which is exactly what that Amendment provides for — **what a hole forbids is the
strip, never the row**. None of the five blocks a head, and ADR-0046 improves
them rather than gating them. `CONTEXT.md`'s Coverage hole entry is corrected in
the same change.

### §9's survivor assertion cannot fail today, and is written for the pipeline that would let it

ADR-0051 §2's assertion is inherited whole: every collapsed row names the `fdcId`
it collapsed into, and generation stops if that id is not in the shipped index.
The collapse runs **last** and picks its representative out of the group it is
collapsing, so nothing between there and the artifact can take a survivor, and
the check cannot fire against the pipeline as it stands. It is written anyway and
the reason is stated rather than implied: the failure it guards is a filter, a
rename or a drop added **after** the collapse, which would leave a dozen rows
pointing at nothing and turn the collapse into a deletion of 381 foods. A unit
test hands it a corpus with the survivor missing, so the refusal is proved to
fire rather than assumed to.

Running last is itself load-bearing and is §3's doing: the residual description is
computed from the name the row will actually ship under, so a segment ADR-0056's
strip has already taken cannot come back to split a group.

### #188's two conditions do not move

Measured over the shipped ranking with `pnpm usda:consolidation-bar`, before and
after (`USDA_INDEX_PATH` points it at a pre-collapse index): **C1 25/44 and C2
31/44, both unchanged**, with no gold row lost and none re-pinned — `beef` falls from
412 rows to 135 and stays past the cap, `lamb` from 117 to 65, `pork` from 131 to 93. The §11 Amendment predicted exactly this shape for the pilot's collapse and
it holds for the shipped one: the queries this rule reaches are queries it cannot
take under 25, and the queries near the cap are not ones it reaches. Nothing here
is a reason to reinterpret the bar, and this record still declines to.

### Eight archived names stop retrieving, and #436 inherits them

`assertTwinNamesRetrieve` asks its question of the MERGE, before the name passes,
because it has to be asked of the names USDA actually wrote — so it certifies a
corpus 381 rows larger than the one that ships, and the generator's report now
says `retrieve the row the merge made` rather than claiming more.

Measured against the shipped corpus, the collapse takes **eight** archived names
with it: four twinned identities, each a `separable lean only` cut whose group
kept the `separable lean and fat` row, so a query spelling out USDA's full
description now matches nothing. That is the rule working rather than a defect —
a collapsed row's name goes with the row, all 381 of them — and it is recorded
here because **#436 is where it becomes answerable**. The `Beef` pilot's own
collapse carried every name a group held as an alias, for exactly this reason,
and it did so because it also performed §5's strip: once `Beef, flank, steak,
separable lean and fat, trimmed to 0" fat, choice` ships as `Beef, flank, steak`,
the words that found it are gone from the row and an alias is the only thing that
keeps a keystroke working. Survivors here keep their whole published names, so
the loss is eight names rather than 381, and the aliasing decision belongs beside
the strip that makes it necessary.

### The pilot refuses a corpus it can no longer measure

`pnpm usda:beef-pilot` measures a collapse over the committed index, and the
committed index is now the output of one — so every table it prints would come
back zeros. A spent instrument still producing output is
[#156](https://github.com/palebluebytes/inventoria/issues/156)'s trap, so it
stops instead and names where the live account is:
`docs/research/190-corpus-account.md` for §9's per-head table, committed and
written by the generator, and `docs/research/usda-drop-census.json` for every
collapsed row and the survivor it names. `USDA_INDEX_PATH` and `USDA_STORE_PATH` point it
at a pre-collapse pair, which reproduces research note #191's numbers exactly.

## Amendment (2026-09-15, #436): §5's strip shipped, and the collisions it was written against do not exist

The flank steak reads `Beef, flank, steak`. **174 of the 179 merged groups ship
their representative under its residual description**, and the other five are
§5's coverage holes, which keep the whole name USDA published — what a hole
forbids is the strip, never the row, and that is now a thing the generator does
rather than a thing this record says.

§5 writes no strip of its own: it gives [ADR-0056](0056-a-name-loses-the-parts-that-do-not-name-the-food.md)
§1's positional strip a second roster. So the rule is `resolveCollapsedNames` in
`src/lib/food/usda-shipped-name.ts`, beside that record's other three rosters and
beside the one answer to "are these two rows one name", and it imports
`residualDescription` from `usda-collapse-roster.ts` rather than spelling the
removal a second time. **The licence arrives from the collapse and is not
computable from a name** — a group merged, and held a record eligible to
represent it — so `scripts/usda-collapse.mjs` hands over the `fdcId`s and this
file is told rather than asking. `Quinoa, cooked` is why: it is the only quinoa
USDA publishes, its name is true, and nothing in it says so.

### §5 is asserted, and what the assertion can actually catch is stated

A safety rule that is assumed is not one. `assertNamesClaimNoLess` reads every
name the strip shortened and refuses a generation where any of these is false:

- **The row was licensed.** A name shortened with no group behind it is
  `Quinoa` over a cooked panel.
- **What it lost is exactly its residual description** — the same segments, in
  the same order, spelled the same way.
- **Every segment it lost is claimed by a preferred axis.** `residualDescription`
  strikes out `separable lean only` as readily as `choice`, so the licence is the
  only thing standing between a dissected fraction and a name claiming a whole
  steak.

**Two of the three cannot fire against the pipeline as it stands, and that is
said here rather than left for a reader to discover.** The second re-runs the
same `residualDescription` the strip just ran, and the third asks about a
non-preferred segment on a row `mayRepresentGroup` has already refused a licence
to. They are written for the same reason §9's survivor assertion is written —
the failure they guard is a pass inserted between the verdict and the rows, which
would shorten a name nobody licensed and report the number that was intended.
`shortened` against `stripped` in `usda-bundle.mjs` holds the two counts to each
other for the same reason and cannot differ either. What proves any of them fire
is a unit test per clause, each handed the corpus that breaks it.

The first clause is the one with live work to do: it is what makes the licence
load-bearing rather than decorative, and a change that computed it from a name
would fail here rather than ship.

### §10's trap fired a fourth time, and the guard is what caught it

The three previous bites were the designation tag, the Food Distribution Program
gloss and `(may have been previously frozen)`, all the same shape: a bracket
welded to the end of a segment, so a whole-segment pattern walks past a word it
was written to take. `assertNoAxisHidesInAGloss` asks the question of the names
that SHIP — for every segment the roster walks past, what would it say with the
trailing bracket removed — and it found a fourth on the day it was written:

> `Pork, cured, separable fat (from ham and arm picnic)`

The separation entry now admits a trailing parenthetical. **Admitting it cannot
take the gloss's own fact with it, because that entry is non-preferred**: a
record stating it never represents a group, so no strip ever reaches the segment.
What the wider pattern changes is the grouping — the row's residual is
`Pork, cured` rather than a description of itself — and measured over the shipped
corpus no other row holds that residual, so nothing moved. The guard reads 6,105
segments a generation and this is the only one it has ever had to say anything
about.

### The collisions this ticket was commissioned to resolve number zero, and the reason is structural

The hand-off expected "two groups whose residuals are the same string". **That
cannot happen.** Two rows with the same residual description have the same
collapse group key, which is the residual with punctuation normalised away — so
they are one group, with one representative. What the check can actually catch is
narrower and is still worth having: a residual that collides on STEMS with a
group whose key differs by punctuation, or with a name an unstripped row keeps —
a group of one, a coverage hole, or an `also` alias, since `bestNameKey` ranks a
query against an alias exactly as against a description.

Measured over the corpus: **174 stripped, 0 refused.**

**A refusal is [ADR-0062](0062-a-foods-own-name-is-what-retrieves-it.md) §3's and
not ADR-0056 §4's**, and the difference is not stylistic. There is no origin here
to say which of two rows loses, and §6 fires the collapse under 484 unread head
phrases on the express ground that its worst case is a wrong representative
rather than a missing food. A strip that deleted a row would take that ground
away. So the rename is simply not made and the row keeps the name it has, which
is also why the refusal is counted: it changes nothing, so a rule the corpus
blocked and a rule that reached nothing look identical from outside.

### No alias is carried, and ADR-0056 §3 is the precedent

The 2026-09-15 hand-off left the aliasing decision here, on the ground that "once
`Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice` ships as
`Beef, flank, steak`, the words that found it are gone from the row". They are,
and they are not carried back:

- **ADR-0056 §3 decided this shape already.** The origin words left the corpus
  entirely — not searched, not ranked, not displayed — because "a name a user can
  read but not type is worse than one they can do neither with". Nobody types
  `separable lean and fat, trimmed to 0" fat`. §2 classifies these segments as a
  trade specification the shopper never sees, which is the same sentence.
- **An alias is ranked.** `bestNameKey` scores a query against `also` exactly as
  against a description, so 174 long aliases would put `choice`, `select` and
  `trimmed to 0" fat` back into the ranked vocabulary — the choice overload the
  whole map exists to reduce, re-imported by the rule that just removed it.
- **It costs no archived name.** `assertTwinNamesRetrieve` asks its question of
  the merge, before either name pass. Re-asked of the SHIPPED corpus — a one-off
  recount, not a pinned figure: run that function's loop against the finished
  survivors rather than against `filtered` — 159 of the 270 archived names under
  a still-shipping identity fail to retrieve, and the figure is **159 with the
  strip and 159 without it**. The strip takes no name the collapse had not
  already taken. The 159 is not this record's to explain and does not contradict
  the #435 Amendment's eight: that one counted names the collapse STOPPED
  retrieving, where this counts every archived name that does not retrieve for
  any reason, ADR-0104's state-word strip included.

What is lost is measurable and is stated rather than denied: typing a row's full
USDA description finds nothing for the 174 rows renamed here, as it already found
nothing for 377 of the 381 rows the collapse took. **The trade vocabulary does
not leave the corpus**, which is where this differs from ADR-0056 §3: the strip
is conditional, so it survives on the rows it could not reach. `separable lean
only` still returns 22 rows, `choice` 7 and `trimmed to 0" fat` 7, against 22, 39
and 39 before. `flank steak`, `pork tenderloin`, `lamb loin` and `sirloin steak`
return exactly what they did.

### What moved, and the one thing that moved back

**#188's two conditions do not move: C1 25/44 and C2 31/44**, the same pair the
#435 Amendment reported for the collapse itself, with no gold row lost and none
re-pinned. `beef` is 135 rows and `lamb` 65, unchanged — the strip renames and
never removes.

**`aust beef` gives back the lead ADR-0056 moved onto a separated fat.** That
record's Consequences pinned it as collateral: `aust` matched `Aust. marble
score` in every Wagyu row, and the rename left `Beef, Wagyu, external fat` short
enough for `accounted` to prefer it over a steak. Six Wagyu rows carried a marble
score; five of their groups merged, so five lose the grade and `aust` stops
reaching them. The sixth is a group of ONE, so §5 forbids the strip, it keeps
USDA's whole name, and it is now the only row the query reaches — a top loin
steak. The rule did not go looking for this and could not have; it is what the
licence does when it declines to fire.

**`plain_sibling` goes 225 to 235**, in the opposite direction to the collapse's
own move and for ADR-0056's Amendment's reason: shortening a name MAKES
qualifier-prefix relations that did not exist. `Beef, flank, steak, separable
lean and fat, trimmed to 0" fat, choice` is a prefix of nothing; `Beef, flank,
steak` sits under `Beef, flank` and takes `Beef, flank, steak, boneless, choice`
under itself. Nine of the ten are a butchery cut meeting its own primal.

**A row searched by its own full description leads it 135 times against 127**,
and `lost` is still zero — the invariant no key or corpus change has ever broken.

### The gold set was re-read, and one case had been passing unnoticed

`docs/research/143-gold-set.json` is keyed on `fdcId` and carries the description
as a human label. Five labels moved and no `fdcId` did. Two of the five are this
record's — `veal` and `lamb` — and **two had been stale since ADR-0104**:
`cowpeas` still said `mature seeds` and `eggs` still said `Eggs, Grade A, Large,
egg whole`.

That second one matters, because the test reading this file compares strings.
`eggs` has led `fdc:748967` — the row the gold set designates — since ADR-0104
renamed it, and the comparison was failing against a label rather than against
the corpus. **The set of cases leading correctly is nine rather than eight, and
the ninth is not a gain this change made.** It is #143's own trap a third time,
after ADR-0104's and the file's own `repinned` note: a set keyed on a description
measures the description. **Four more labels carry no `fdcId` at all**, because the 2026-09-13 re-key
could only give one to a row that still shipped, and all four were still naming
rows the corpus does not hold — `milk`'s lead and its designated row, and
`veal`'s and `yogurt`'s leads. Each is marked dropped rather than re-pointed.
`milk`'s designated row is the case that shows why: it is one of the two 3.25%
milks ADR-0061 §5 drops, so aiming it at the 3.7% row that ships would edit a
pre-registration into agreeing with the corpus, and the disagreement is recorded
rather than edited out.

`docs/research/188-consolidation-bar.json` was re-read
in the same pass; two of its 56 labels were stale and C1 and C2 are identical
either side, which is what a set that ranks by `fdcId` owes.

## Amendment (2026-09-15, #438): the bar was re-measured whole, and the collapse moves neither condition

This record already carries two readings of
[#188](https://github.com/palebluebytes/inventoria/issues/188)'s bar, one in each
of the Amendments above. Both were taken **between** tickets — the first after
the collapse and before §5's strip, the second after the strip — and both are
checkpoints. This is the measurement the map was chartered on: the pre-registered
bar against the corpus that ships, with the rule whole.

**C1 25 of 44 and C2 31 of 44, before the collapse and after it.** Not one of the
44 gating queries changed either verdict, and 40 of the 44 are identical to the
row. The full table is `docs/research/188-consolidation-bar.md` §9; the four
queries that moved at all are `beef` 412 rows to 135, `pork` 131 to 93, `lamb`
117 to 65 and `ham` 53 to 33. No multi-word query moved. The British tripwire
stays intact at 16 of 17 and moves one figure, `gammon` 8 rows to 4.

No gold row left the corpus, no `fdcId` was re-pinned, and all 56 human labels
still name the rows as they ship. **No gold-set amendment is owed**, and the fact
is recorded rather than left as an absence: the 2026-09-14 convention exists so
that an edit to a pre-registered set cannot be silent, which means a non-edit
should not be either.

### `beef` does not clear the page cap, and neither does `lamb`

The Context of this record opens on `beef` answering with 949 rows and the map's
sharpest single question is whether collapsing them reaches 80/20 mince. It does
not.

`beef` answers with **135** rows against a 50-row page and its gold row sits at
uncapped rank **115**. The row's position inside its own result set is _worse_
than before the rule: the rows above it fell 198 to 114 and the rows below it
fell 213 to 20, so the collapse took most of what it took from beneath the row
the bar is trying to reach. That is not a fault in §2's axes. It is what
collapsing butchery permutations does to a head whose plain mince was never
ranked near the top to begin with. It is also the strongest evidence this arc has
produced for §11's own reading: §6 fires this rule corpus-wide, so no two of the
134 rows standing beside the gold one differ only in a collapsing axis — that is
what §3's key guarantees — and the rule has nothing left to take. What remains for
`beef` is a ranking or paging question.

`lamb` answers with **65** rows and its gold row sits at uncapped rank **57**,
seven short of the page. Here the removal was entirely from above — 108 rows
above it became 56, the eight below it stayed eight — and it still misses. `lamb`
is the closest this rule comes to fixing a query outright, and "closest" is the
finding.

### §11's negative list is exact and its positive list scores nothing

§11 named eight queries the collapse would do **literally nothing** for and seven
it "does the work on". The criterion below is the one the 2026-09-12 Amendment
above already used against that same sentence — a query **crossing the 25-row
cap** — and not the looser reading the phrase invites, because the looser reading
is how a rule that moved four queries and cleared none gets written up as having
worked.

**The eight are 8 for 8.** `cheese`, `oil`, `flour`, `egg`, `salmon`, `cream` and
`butter` from the gating roster, and `mince` from the British tripwire, are
identical either side of the collapse, to the row.

**The seven are 0 for 7.** Not one crosses the cap under this rule. `beef`,
`pork` and `lamb` move and stay over it; `chicken` and `turkey` do not move at
all, because what was collapsible in them was preparation and ADR-0104 had
already taken the cooked half before this rule ran; `gammon` and `chicken thigh`
were under the cap before it ran, for the same reason, so there was nothing left
to carry across. The looser question — did the rule touch the query at all —
answers four of the seven, `beef`, `pork`, `lamb` and `gammon`, plus one §11 did
not name, `ham`.

This is the second time the 2026-09-12 Amendment's relocation of `beef` is
confirmed. It moved `beef` off the positive list and filed it beside `cheese` on
the grounds that what remained was retrieval and paging rather than membership;
`beef` then fell further than any query in the roster and its gold row ended
deeper in its own result set than it began. A pre-registered claim exact about a
rule's limits and empty about its reach is wrong in the better direction, and
§11's refusal to reinterpret C2 is what makes any of it scorable.

### §11's refusal stands, and the residue is filed

Thirteen gating queries still answer with more than 25 rows: the four this rule
moved, and nine it never touched, from `cheese` at 100 rows down to `cream` at 31. §9 of the note lists them with their counts; they are not restated here,
because a figure kept in two ungated places is
[#156](https://github.com/palebluebytes/inventoria/issues/156)'s trap in slower
motion.

§11 says a head that is genuinely a hundred foods is not a membership problem and
wants a ranking or a paging instrument. That is still true and this record still
declines to build it, and it now declines to absorb it into prose either:
[#451](https://github.com/palebluebytes/inventoria/issues/451) carries the nine
heads and the two unreachable gold rows with their numbers. Retrieval pollution
remains [#407](https://github.com/palebluebytes/inventoria/issues/407)'s.

Reinterpreting C2 after seeing which queries fail is the move #188 was written to
prevent. The bar stands as registered, the rule did not clear it, and this record
says so.

### The registration baseline is not re-derivable, and the comparison drawn against it is a cross-set one

`USDA_INDEX_PATH` re-derives a baseline **only within one `schema_version`**, and
this is worth stating because every reading in this record compares one corpus
version against another.

Pointed at the schema-8 index the bar was registered against, today's harness
reports C1 **22** of 44 rather than the registered 24, and the cause is this
branch rather than that corpus. ADR-0104 made `raw` a fact on the row; schema 8
carries no such field, so the `raw` key `readRowRank` builds is 0 on all 4,238
rows and ties uniformly, leaving the ranking one key short without saying so. Two
frecency keys and `CANONICAL_ROWS` also postdate the registration. §9 of the note
carries the full reading and what does reproduce.

What this costs is the comparison #438's hand-off drew, "24/44 at registration
against 25/44 now", read there as a gold re-pin: the gain crosses a changed
ranking as well as a changed pin, and the registered 24 is not a number this
branch can reproduce. The 2026-09-14 gold-set amendment in
`docs/research/188-consolidation-bar.json` is untouched by this, because it
measured its re-pin both ways over one corpus with one build — the only kind of
comparison this subsection is arguing for. The like-for-like statement about the
collapse is the one this Amendment opens with.
