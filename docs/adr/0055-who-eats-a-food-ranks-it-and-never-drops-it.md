# ADR 0055: Who eats a food ranks it and never drops it

**Status:** Accepted  
**Date:** 2026-08-24  
**Amended by:** the #151 Amendment below, which corrects the price §3's key was adopted at and admits the two leads it costs  
**Implemented:** #151; `src/lib/food/reference-food-ranking.ts` (both keys), `src/lib/food/usda-corpus.ts` (where they attach), `scripts/usda-bundle.mjs` (schema 5)

This record amends [ADR-0042](0042-usda-search-reference-foods.md) §1, whose
relevance keys gain two that read a ROW rather than a name, and answers a question
its governing principle left open: whether a record can be dropped for being
somebody else's food rather than for being a brand, a package or a dish. It drops
nothing.

## Context

ADR-0042's principle is that USDA search returns "reference foods — generic,
non-branded, non-composite entries — and ranks base ingredients (raw whole foods)
first". Four populations satisfy that literally and were raised, in
[#134](https://github.com/palebluebytes/inventoria/issues/134), as possibly not
satisfying it usefully: single-varietal wines, protein powders, the whole
`American Indian/Alaska Native Foods` category, and origin-qualified meat that
sits beside a plain twin.

Each was filed as a membership question — a candidate for §3's or §5's drop
rosters. Measured over the shipped 4,360-row index at `d97e4ce`, three of the four
are not membership questions at all, and the fourth is not a defect.

### The measurements that decided it

**Varietal wines.** 36 wine rows, 28 of them a varietal under a plain twin (15
red, 13 white). The claim that they differ "by a rounding error" holds for the
dry table reds — 74 to 88 kcal against a plain red of 85 — and fails on
`wine, table, white, late harvest`, which is **112 kcal and 13.4 g carbohydrate**
against a plain white of 82 and 2.6: a dessert wine wearing a table wine's name.
Any rule shaped "drop what follows `table, red|white`" deletes it. The claim that
ranking already floats the plain form is also false at HEAD: `white wine` returned
the plain row at **position 8**, behind six varietals and that dessert wine.

**Powders.** 27 `Beverages` powder or mix rows, 12 of them `prepared with whole
milk` (composites, not powders) and only **four** supplement-shaped. The query
`protein powder` led with `Protein supplement, milk based, Muscle Milk, powder`
and its Light sibling — Title-Case brands in `Dairy and Egg Products`, invisible
to `BRAND_CAPS`, which is ADR-0042 §3's known and accepted gap and not this
question. A bare `powder` marker costs fifteen rows outside `Beverages`: curry,
chili, garlic and onion powder, three cocoa powders, tomato powder, baobab powder
and dried egg white.

**The `American Indian/Alaska Native Foods` category.** 151 rows. The ticket
described it as "largely prepared dishes"; by dish marker it is **19 dishes and
132 single-ingredient foods**, 45 of them `raw`. **45 rows name a food no other
row in the corpus mentions, 37 of them single-ingredient** — including the only
**mutton** in the corpus, the only **agave**, and the only cockles, huckleberries,
cloudberries, salmonberries, chokecherries, stinging nettles, cattail, sourdock,
wocas and chiton. Dropping the category deletes mutton from the app.

The over-representation the ticket recorded is real and was re-derived here, since
`pnpm usda:ranking-audit` no longer emits it: **140 head queries end in a tie at
the top, 15 of them led by a row from this category — 10.7% against a 3.5% corpus
share.** Its harm is almost entirely absent. **Twelve of those fifteen sit on head
phrases no other row in the corpus occupies** — `seal`, `walrus`, `whale`,
`caribou`, `elk`, `agutuk`, `frybread`, `sea lion`, `mouse nuts`, `willow`,
`chokecherries`, `tortilla` — where leading buries nothing, because there is
nothing else to bury. Three contest: `oil`, `cornmeal` and `tea`.

**Origin-qualified meat.** 285 rows carry `australian`, `new zealand` or
`imported`; 282 are Australian and New Zealand beef, lamb and veal, and three are
`New Zealand spinach`, a distinct species. The predicate proposed for them —
"a plain twin exists" — **reaches none of them.** There are **zero
`Lamb, domestic` rows**: 170 of the corpus's 280 lamb rows are imports, the cut
vocabulary they carry (chump, flap, foreshank, tunnel-boned leg) is British
butchery, and `lamb chop` leads with a New Zealand row, which for this app's
reference user is the answer rather than the defect. That user is not a
supposition: ADR-0049 measures coverage against a list of everyday **British**
queries and ADR-0046 admits stand-ins against UK compositional standards.

### Alternatives that were genuinely live

**Drop each axis on prevalence** — "nobody logs Mouvedre", "not this app's
users". Ruled out by §1 below. There is no usage data to argue it from: ADR-0053's
log records only searches that returned NOTHING, is session-scoped, local, and
never leaves the device, so it cannot say which of two returned rows anybody
picked. A drop is irreversible and a demotion costs a rank, which is the
asymmetry ADR-0042's own Consequences already states.

**A country-name filter.** Refuted in #134's own second comment before this
record: 305 rows matched origin words over the then-current corpus and most were
not foods-from-a-country. `New Zealand spinach` is _Tetragonia_;
`Cabbage, chinese (pe-tsai)` is napa cabbage and is the exact record
[#130](https://github.com/palebluebytes/inventoria/issues/130) §8 used to prove a
coverage-gap ticket wrong.

**A powder or supplement marker.** A marker narrow enough to be safe reaches four
rows. That does not price a new predicate, and ADR-0042 §4's packaging markers
already take the barcoded forms.

**Folding the new key into `ReferenceFoodName.plain`.** Refuted by measurement
while drafting: that field is per-NAME, and since ADR-0050 §4 a row is scored as
the best of its names, with 80 rows carrying an `also` alias. If aliases join the
sibling set, **fourteen rows demote themselves** — `Oil, corn` is a row and the
prefix of its own alias, as are `Oil, soybean`, `Oil, peanut`, `Oil, safflower`,
`Nuts, almonds, whole, raw`, `Pineapple, raw`, `Oats, whole grain, rolled, old
fashioned` and seven more, every one of them a canonical row.

**Scope.** This record governs what may be a reason to drop a reference food, and
adds two ranking keys. It does **not** touch ADR-0042 §3, §4 or §5: no filter
gains or loses a member here, no row leaves the corpus, and the ADR-0049
vocabulary does not re-derive. It does not address three defects the measurement
surfaced, each named in Consequences and cut as its own ticket: `tea`, a drink
query answered by a non-drink, and the Title-Case brand gap.

## Decision

### 1. Prevalence is a ranking reason and never a dropping reason

Who eats a food, how often, and whether this app's users are among them may
inform where a row RANKS. It may never remove a row from the corpus.

A drop rule must be a claim about what the record IS — a brand, a package, a
dish, a laboratory basis, a manufacturing input, the five predicates
`usda-food-kind.ts` already owns. "Our users do not eat this" is a claim about
the audience, we have no data licensed to support it, and being wrong deletes a
food with no way for a user to discover the loss.

This is why the `American Indian/Alaska Native Foods` category stays whole and
why 282 rows of imported meat stay: both were proposed for dropping on this
reason and no other.

> **280 since [#157](https://github.com/palebluebytes/inventoria/issues/157)**,
> and the Context measurement above reads 283 rather than 285 for the same
> reason. Two rows left as `manufacturing beef`, USDA's trade grade for boneless
> beef sold to be ground, which is a claim about the specification and so a
> reason this section admits. The sentence is corrected rather than rewritten
> because the number is the point of it: what this section forbids is the
> argument those rows were originally proposed on, and none of them has left on
> that argument. See ADR-0042's
> [#157 Amendment](0042-usda-search-reference-foods.md#amendment-2026-08-24-157-a-specification-sold-into-a-trade-is-not-a-food).

### 2. A rule adopted here must break no lead already measured correct

Carried from [#143](https://github.com/palebluebytes/inventoria/issues/143), which
rejected its part key in writing for breaking four correct leads while fixing
none, and made binding here on **drops as well as ranking keys** — a broken lead
is recoverable by scrolling and a dropped row is gone. Every candidate in #134 has
measurable collateral, and this bar is what ruled out three of the four.

The bar is checked against the 29 adjudicated cases in
`docs/research/143-gold-set.json` that carry a `should_lead`, and against a sweep
of every corpus head phrase and head word.

### 3. A name with a plainer twin in the corpus ranks below that twin

Where one row's full name is a strict qualifier-prefix of another's, the longer
name is a qualified form of the shorter and ranks below it on a tie.
`Alcoholic beverage, wine, table, white, Riesling` sits under
`Alcoholic beverage, wine, table, white`; `Oil, corn, peanut, and olive` sits
under `Oil, corn`.

Two constraints, both load-bearing and both pinned as tests:

- **The sibling set is built from descriptions only.** An `also` alias never
  contributes a parent.
- **A row is never its own sibling.** Without both, the fourteen rows named in
  Context demote themselves.

This is the same question ADR-0042 §1's `plain` key asks — is this the plain form
of its food — asked of the corpus instead of the name. It stays a boolean. It is
not #124's "fewest qualifiers", which #130 disproved by finding USDA writes the
canonical milk with MORE qualifiers than the imitation one.

**Reach: 128 of 4,358 rows under 78 parents.**

### 4. A record published for a designated population ranks below one that is not

A row USDA files under `American Indian/Alaska Native Foods` ranks below a row
that is not, where the two are otherwise equal.

The reason is provenance, not worth. USDA publishes these as reference
composition for a documented population, so where two rows answer a query equally
well the one published for no particular population is the better default answer.
The key fires only on an exact tie in every earlier key and removes nothing: on
the twelve head phrases only this category occupies, every candidate carries the
designation, the key ties uniformly and the order is unchanged.

**It is keyed on `foodCategory`, never on the parenthesised name tags.** The four
tags #134 names reach 129 rows; 22 more carry `(Apache)`, `(Southwest)`,
`(Northern Plains Indians)` or `(Klamath)`, and the category catches all 151.

### 5. Both keys read the row, so both attach where the row is

`ReferenceFoodName` describes a name and cannot carry either fact. The keys are
fields on `RelevanceKey`, populated in `bestNameKey`, which already receives the
whole `SearchableFood`. `compareRelevance` stays the single place the ordering is
expressed.

The order becomes:

```
tier, raw, head, position, plainSibling, plain, simplicity, designated
```

`plainSibling` sits beside `plain` because it asks `plain`'s question.
`designated` sits last because it is the weakest signal available and, measured,
placing it last costs nothing: run immediately after `position` and run dead last,
it changes the same two leads and no others.

> An eighth slot opened between `head` and `position` in
> [#155](https://github.com/palebluebytes/inventoria/issues/155) — see ADR-0042's
> [#155 Amendment](0042-usda-search-reference-foods.md#amendment-2026-08-24-155-what-head-asks-of-the-head-phrase-asked-of-the-rest-of-the-name),
> which reads
> `tier, raw, head, accounted, position, plainSibling, plain, simplicity, designated`.
> Nothing in this section moves; the block above is one key short of current.

### 6. What cannot be derived is baked; what can be derived is read

`plainSibling` needs corpus-wide knowledge and is computed at generation time,
reached through the `usda-app-module.mjs` esbuild seam so there is no second copy
of the answer (ADR-0047 §4). The Search index `schema_version` goes **4 to 5**.

`designated` is a pure function of `foodCategory`, which every row already
carries, and is therefore computed on read — the rule ADR-0041 set for
`deriveNovaVerdict` and for the same reason: data already present is never
duplicated into a second field that can drift from it.

Computing `plainSibling` at load was measured and rejected: **24 ms**, with a
single split per row and string-prefix accumulation, against the 18.5 ms the whole
corpus load costs today. Baking it costs about 1 KB against a 509 KiB index.

### 7. Three predicates are rejected, and stay rejected

Recorded so they are not re-proposed, in the form #143 used for its part key:

| predicate                                               | why it is refused                                                                                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a country or origin word in the name                    | a name-shaped rule for a substance-shaped question; deletes _Tetragonia_, pak choi, napa cabbage, gai lan, Chinese jujube and Irish moss, none of which is a food from a country |
| "a plain twin exists", applied to origin-qualified meat | measured: reaches **0 of 285**. There is no plain twin, because there is no domestic lamb in the corpus at all                                                                   |
| a powder or supplement marker                           | a safe form reaches 4 rows; an unsafe one takes curry, garlic, onion and chili powder, three cocoa powders, tomato powder, baobab powder and dried egg white                     |

> Read alongside [ADR-0042](0042-usda-search-reference-foods.md)'s
> [#157 Amendment](0042-usda-search-reference-foods.md#amendment-2026-08-24-157-a-specification-sold-into-a-trade-is-not-a-food),
> which widens §5's `isManufacturingInput` by thirteen rows and turns on both §1
> and the third row of this table. Two things there bear on this record. **The
> powder-or-supplement refusal held**: `Soy protein isolate` was a live candidate
> and was refused on this table rather than around it. And **two of the 285
> origin-qualified meat rows §1 protects leave**, which is consistent rather than
> an erosion — §1 bars a claim about who eats a food, and `manufacturing beef` is
> USDA's own trade grade for beef sold to be ground, which is a claim about the
> specification. Seventy-two of the seventy-four New Zealand imports stay, and
> the count is pinned as a test.
>
> That amendment also records a **third** face of the sweep blind spot the #151
> Amendment below confesses twice: `sweepQueries` takes only the FIRST word of a
> qualifier part, so `lecithin` — the second word of `soybean lecithin` — cannot
> be generated, and the case that motivated the change was outside the 3,997
> queries that priced it. It was measured by hand instead.

## Consequences

- **#134 was filed as a membership question and lands as a ranking answer.** No
  row is dropped, no filter changes, the corpus stays at 4,360, and neither the
  ADR-0049 vocabulary nor the row count in fifteen files moves. A ticket about
  what belongs in a corpus ended by changing only what comes first, which is the
  outcome §1 makes likely for anything raised on this reason again.
- **The measured wins are four queries.** `white wine` moves the plain row from
  position 8 to 1, `table wine` from 3 to 1, `red wine` from 4 to 2, `oil` and
  `cornmeal` each replace a designated lead with an undesignated one. Against
  that: **one changed lead in a 753-query sweep** (`cream substitute`, powdered to
  liquid, a wash between two substitutes) and **zero broken leads** across both
  keys on the 29-case gold set.
- **The 28 varietal wines keep their panels.** The late-harvest dessert wine that
  made a drop rule unacceptable is harmless under a demotion: it sorts below plain
  white and keeps its 112 kcal.
- **`tea` is not fixed and cannot be fixed by either key.** Both designated tea
  rows have `Tea` as their head phrase (rung 50) while every ordinary tea is
  `Beverages, tea, …` (rung 20, a qualifier match), and no key below `tier` can
  reach a tier gap. The corpus holds no head-phrase tea row at all. Cut as its own
  ticket; it is a retrieval or naming question, likely ADR-0049's.

  > Measured 2026-08-24 on #153 and **still not fixed**, deliberately. It is not
  > ADR-0049's: the vocabulary fires only on an empty result and `tea` returns
  > twelve rows. It is a tier question, and letting `tier` read ADR-0042's
  > shelf-label roster was swept at three scopes and refused at all three — see
  > that record's [#153 Amendment](0042-usda-search-reference-foods.md#amendment-2026-08-24-153-the-tier-may-not-read-the-shelf-label-roster-at-any-scope).
  > Two findings bear on this record. `tea` is one of **nine** head phrases
  > occupied only by designated rows that a shelf-labelled row contests, seven of
  > them game meat or fish. And the fix's mechanism would have been this record's
  > own `designated` key, not `tier`: the nine `Beverages, tea, …` rows are
  > identical on all nine keys, so a tier answer only equalises them and lets
  > `designated` decide.

  > Corrected 2026-08-24 on [#158](https://github.com/palebluebytes/inventoria/issues/158),
  > which measured the sentence above and found both halves wrong. **The tie is
  > eight, not nine**: `Beverages, tea, black, brewed, prepared with tap water,
decaffeinated` carries `plain_sibling: true`, its name being a strict
  > extension of the plain tap-water row's, so §3 of this record already demotes
  > it. And **`designated` cannot decide** — none of the nine is an American
  > Indian/Alaska Native record, so the key ties at 1 across all of them. The
  > mechanism a tier answer would hand `tea` to is `Array.prototype.sort`'s
  > stability, and ordered among themselves the eight lead with
  > `Beverages, tea, green, brewed, decaffeinated`. #158 measured no key that
  > separates them and shipped none: every one of the nine is 0–1 kcal, so the
  > accident costs at most 1 kcal, and the caffeine signal that would have worked
  > is refused in ADR-0042's #158 Amendment. What it left is a tripwire saying so
  > and a note, [#158](../research/158-complete-ties-in-the-ranking.md), whose
  > wider finding bears on this record's §2: **1,121 of 3,997 queries open with a
  > complete tie**, and the four generic-animal leads §2's bar protects are
  > themselves ties that `fdcId` order happens to get right.

- **A drink query can still be answered by a non-drink.** `red wine` leads with
  `Vinegar, red wine` and bare `wine` with `Beverages, Wine, non-alcoholic`, both
  surviving §3 because both are ADR-0042's #124 position key preferring a word
  that lands earlier in the name. Cut separately from `tea`: #130's audit forbids
  blending a tier failure with a ranking one, and these are ranking.

  > Closed in [#154](https://github.com/palebluebytes/inventoria/issues/154), as
  > ADR-0042's [#154 Amendment](0042-usda-search-reference-foods.md#amendment-2026-08-24-154-the-aisle-usda-walks-down-is-not-the-foods-name).
  > The cause was neither of the two readings the ticket carried forward from
  > here. USDA writes a shelf label where a food's name belongs, so `position`
  > was charging a wine for the two words spent reaching it, and the row that
  > SHOULD lead has a non-food head phrase too — which is what makes "an
  > ingredient-of row loses to the food itself" unstatable on this case. The
  > `non-alcoholic` fix this record's own ticket called nearly free moves zero
  > leads, because `plain` sits below `position`. The tier gap is untouched and
  > `tea` did not move.

- **`Muscle Milk` still leads `protein powder`.** It is ADR-0042 §3's Title-Case
  brand gap, accepted there in writing, and belongs on `TRADEMARK_DENYLIST` beside
  `powerade` and `reddi wip`. Cut as its own ticket in
  [#131](https://github.com/palebluebytes/inventoria/issues/131)'s class, not
  bundled here: it drops two rows, and a filter change re-derives the ADR-0049
  vocabulary and drags the row count through fifteen files. That sweep is the
  whole of that ticket and would be invisible inside this one.

  > Done in [#152](https://github.com/palebluebytes/inventoria/issues/152), as
  > ADR-0042's #152 amendment: `muscle milk` joins the denylist, §7's refusal of a
  > powder-or-supplement marker holds, and the corpus falls to 4,358 rows. The
  > sweep was worth its own ticket — the map did not move, and reporting that took
  > the measurement.

- **`plainSibling` is derived data in a shipped artifact**, which can drift from
  the predicate that derived it. The esbuild seam and `usda-bundle.test.ts`'s
  union-versus-stub check are what stop that, and they are the same arrangement
  `usda-food-kind.ts`, `food-vocabulary.ts` and `usda-twin-ledger.ts` already use.
- **Captures written by ADR-0053's search log before this lands say
  `schema_version: 4`.** That is the field working: it records which corpus a flag
  was computed against, and a bump is what makes an old capture legible rather
  than misleading.
- **§4 demotes a culturally-designated category, and that deserves to be read as
  what it is.** It is a statement about who a record was published for, it moves
  nothing except on an exact tie, and it leaves all 151 rows searchable and
  loggable under their own names. §1 is what keeps that from becoming a deletion,
  and the two clauses should be read together or not at all.

## Amendment (2026-08-24, #151): the sweep behind §2 could not see a multi-word query

Consequences reports **one changed lead in a 753-query sweep** for §3's key. That
sweep was every corpus head phrase and every head word, so **every query of more
than one word was outside it by construction** — including `white wine`,
`table wine` and `red wine`, the three cases §3 was adopted to fix. A measurement
that cannot contain the cases the rule was written for is not a bound on the
rule's cost, and quoting it as one was wrong.

Re-run at implementation over **3,390 queries** — OFF's synonym groups, ADR-0049's
British list, every head phrase, every head word, and each head paired with its
first qualifier word as the `adjective noun` shape #124 is about:

|               |                                                                                        |
| ------------- | -------------------------------------------------------------------------------------- |
| leads changed | **23**                                                                                 |
| improvements  | **19**                                                                                 |
| washes        | **2** (`corn oil`, `cream substitute` — one blend or one light substitute for another) |
| **worse**     | **2** (`soybean oil`, `soy oil`)                                                       |

The gold-set result is unchanged: **zero broken leads** across the 29 adjudicated
`should_lead` cases in `docs/research/143-gold-set.json`.

### The three it costs, two of them the same defect

`soybean oil` led with `Oil, soybean, salad or cooking, (partially hydrogenated)`
and now leads with **`Oil, soybean lecithin`**, an emulsifier rather than an oil.
`corn oil` moved between two blends, from `Oil, corn, peanut, and olive` to
`Oil, corn and canola`, and is the same defect with a milder symptom: it was
first logged here as a wash, which understated it, because the row that should
lead is `Oil, corn` — §3's own worked-example parent — and it sits second behind
a blend for exactly the reason lecithin leads soybean.

The key did what §3 says: `Oil, soybean, salad or cooking, …` is a qualified form
of `Oil, soybean`, which is a row, so it sorts below it. What that uncovered is a
tie the ranking cannot separate — `Oil, soybean` and `Oil, soybean lecithin` agree
on tier, raw, head, position, plain and simplicity, so corpus order decides, and
the lecithin row has the lower `fdcId`. That tie is #143's unfixed class and
predates this record; §3 made it visible rather than creating it. On both queries
the row a person searching for soybean oil actually wants moves **from 4th to
2nd**.

### §2 is not weakened, and here is what it now means

§2 says a rule must break no lead **already measured correct**. None of these
was: they are not in the gold set and were never adjudicated. The gold set's own
result is now a guard rather than a claim — `usda-corpus.test.ts` pins the six
cases that lead correctly today, so the bar fails a future key instead of being
re-measured by hand. They are worse by
inspection, which is the same standard #143 rejected its part key on, so they are
recorded here and pinned in `usda-corpus.test.ts` rather than left for somebody to
rediscover. The difference from #143 is the ratio and the direction: that key
broke four leads and fixed **none**, where this one fixes nineteen and leaves the
right row higher in both cases it worsens. Shipping it was a decision taken with
these numbers in hand, not a bar quietly lowered.

> The confession did not go far enough, and #154 found the rest of it. The
> 3,390-query replacement below **still could not generate `red wine` or a bare
> `wine`**: its `adjective noun` shape pairs a qualifier with the HEAD phrase,
> and for `Alcoholic beverage, wine, table, red` that builds
> `wine alcoholic beverage`, which nobody types. Two of §2's own three worked
> examples were outside the sweep that priced them, twice over. The shapes that
> reach a shelf-labelled row now live in `scripts/usda-ranking-queries.mjs`,
> with a `--leads` reader, so the next key is priced by a tool rather than by
> whatever its implementer built and threw away.

The residual tie is [#155](https://github.com/palebluebytes/inventoria/issues/155),
which carries all three queries. It is a question about two rows that no key
distinguishes, which is exactly what #143 left open for the 135 ties its `plain`
key did not reach.

> Closed in [#155](https://github.com/palebluebytes/inventoria/issues/155), as
> ADR-0042's [#155 Amendment](0042-usda-search-reference-foods.md#amendment-2026-08-24-155-what-head-asks-of-the-head-phrase-asked-of-the-rest-of-the-name).
> A seventh name key, `accounted`, asks of the whole name what `head` asks of the
> head phrase, and all three queries now lead with the plain oil. **The three
> leads this Amendment records as its price are therefore no longer paid**, and
> the pins in `usda-corpus.test.ts` were replaced rather than deleted, as the
> ticket required.
>
> Two things worth carrying back here. §3's key did not create the tie and does
> not widen it — measured at implementation, the class is **seven ties in a
> 3,376-query sweep**, four of which moved. And the ticket's premise that the
> class would be found among head-phrase ties was **wrong**: 140 of those tie at
> the top and exactly one differs in accounting, already leading correctly. The
> class is a multi-word-query class, which is what this Amendment's own
> confession about the 753-query sweep should have predicted.
