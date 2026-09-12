# ADR 0100: What was done to a food is not another food

**Status:** Accepted  
**Date:** 2026-09-12

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
checked against the 29 adjudicated cases in `docs/research/143-gold-set.json`. It
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
