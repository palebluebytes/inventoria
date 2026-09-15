# Research: the bar a consolidated food search has to clear (#188)

**Grounds:** `searchIndexRows` in `src/lib/food/usda-corpus.ts` and the eight ranking keys in `src/lib/food/reference-food-ranking.ts`, measured over the committed `public/usda/search-index.json` (`schema_version` 8, 4,238 rows) via `pnpm usda:consolidation-bar`. The registered bar itself is [`188-consolidation-bar.json`](188-consolidation-bar.json).
**Siblings:** parent map [#186](https://github.com/palebluebytes/inventoria/issues/186). [#187](https://github.com/palebluebytes/inventoria/issues/187) settled that the source stays USDA, so this bar is measured against USDA descriptions and does not move. [#190](https://github.com/palebluebytes/inventoria/issues/190) writes the rule this bar judges; [#191](https://github.com/palebluebytes/inventoria/issues/191) pilots it on `Beef` and is the first thing to re-run this measurement.
**Outcome:** §9 records what the shipped rule did to the two conditions, measured 2026-09-15 under [#438](https://github.com/palebluebytes/inventoria/issues/438). Sections 1 to 8 are the registration and are not edited by it.
**Date:** 2026-09-11. **Status:** pre-registration. The roster, the gold set, both pass conditions and the cap were fixed **before the membership rule exists and before a single row was adjudicated**. No corpus, ranking or filter code has changed.

---

## 1. Why the bar is written before the rule

This project measures against thresholds pre-registered rather than chosen after the fact. [#130](https://github.com/palebluebytes/inventoria/issues/130)'s "236 vocabulary misses against a threshold of 100" is the pattern, and it is why that finding was believable: the threshold could not have been picked to suit the answer, because the answer did not exist yet.

The same exposure exists here and is larger. #190 will write a rule that deletes rows, and whoever writes it also gets to say whether it worked. So the roster, the gold rows, the conditions and the cap are all fixed here, in advance, and the pilot is handed a number it cannot negotiate.

## 2. Two conditions, asking two different questions

**C1 — the gold row is in the top 3.** The user-facing question: is the row a diarist means near the top of the screen.

**C2 — the query returns at most 25 rows.** This exists only to stop C1 being passed dishonestly.

C2 is the condition worth arguing about, so here is the argument. Eight ranking keys already exist and none of them has fixed `beef`. Nothing stops a ninth being added that lifts 80/20 ground beef into the top three — at which point C1 goes green while `beef` still answers with **954 rows**. The first three lines look right, the other 951 are still there, and the map's destination, one row per ingredient, has been missed with every light on.

The map's own Notes already rule this out in principle: _"a ship rule, not a rank rule — eight ranking keys have not fixed `beef`; the corpus is where the fix goes."_ C2 is what holds a rule to that in practice, because **result-set size is the one number ranking cannot move**. Reorder 954 rows and there are still 954. Only dropping or merging changes it.

### The condition this replaces

#188's ticket proposed instead: _no query where the top 10 rows share a head phrase and differ only in qualifiers_. It was measured and dropped. Collapsing each query's top 10 to distinct foods — the food's own name plus the qualifier where USDA puts the variety — gives:

| query     | distinct foods in the top 10 |                                             |
| --------- | ---------------------------- | ------------------------------------------- |
| `beef`    | 1                            | `beef \| composite of trimmed retail cuts`  |
| `pork`    | 1                            | `pork \| fresh`                             |
| `lamb`    | 4                            | composite / frozen / fresh / foreshank      |
| `chicken` | 5                            | broilers / liver / ground / cornish         |
| `egg`     | 7                            | duck / goose / quail / turkey               |
| `cheese`  | 9                            | cottage / fontina / monterey / mozzarella   |
| `bread`   | 10                           | white wheat / potato / cheese / multi-grain |

It catches **2 of 26** queries tested. It passes `lamb`, `egg` and `apple`, three of the map's own named failures, and fails `cheese` and `bread`, which are not duplication at all. It is measurable and it measures the wrong thing — and worse, detecting duplication by reading names means the bar smuggles in the very judgement the rule is supposed to make.

### Why 25

Across the 44 gating queries the result-set distribution is: min 1, **median 14**, max 954. Failures by candidate cap:

| cap             | 10  | 15  | 20  | **25** | 30  | 40  | 50  |
| --------------- | --- | --- | --- | ------ | --- | --- | --- |
| queries failing | 26  | 22  | 18  | **17** | 16  | 12  | 10  |

25 clears the 50-row page cap by enough that the cap stops mattering, sits just above the median so the already-well-behaved queries are untouched, and the curve is flat between 20 and 30 — the exact figure is not delicate, which is what a pre-registered number should look like.

## 3. The gold set is hand-written, and keyed by `fdcId`

"The plain form" is **not** mechanically decidable. Every proxy tried failed: ranking by fewest comma-separated parts puts `flour`'s plain form at rank 49 and `beef`'s at 20. Any mechanical definition is a guess at the membership rule, which makes the bar circular.

So the gold set is 44 hand judgements, one per query, each naming the row a diarist means.

It is keyed by **`fdcId`, never by description.** [ADR-0056](../adr/0056-a-name-loses-the-parts-that-do-not-name-the-food.md)'s shipped-name work renames rows, so a description-keyed gold set reports a renamed row as missing — and the rename, the intended change, reads as a regression. This is not hypothetical: while this set was being written, three gold rows were recorded as "not in corpus" that were simply mis-transcribed (`Rice, white, long-grain` for the shipped `long grain`; a dropped parenthetical on `Bread, white, commercially prepared (includes soft bread crumbs)`). Keying on the id removes the failure mode entirely.

Two gold choices are recorded as arguable rather than presented as obvious: **`beans`**, where baked, green and kidney are three different logs and no single row is right, and **`apple`**, where no plain `Apples, raw` ships and gala stands in as the most-grown variety.

## 4. One query is excluded, with its reason

**`chocolate` is not in the roster.** The corpus ships no chocolate: a `chocolate` query reaches two cocoa beverage powders and three ice creams. There is no row a diarist means, so there is no gold row. A query that can only ever fail for a reason #190's rule cannot fix would make the pilot read worse than it is, so it is excluded on the record rather than scored.

Two near-misses are kept with their weakness noted instead of excluded: **`bacon`**, where the only real bacon row carries `reduced/low sodium`, and **`tuna`**, where no canned tuna ships and the gold is the commonest fresh one.

## 5. HEAD, measured

The pre-registered baseline, against the shipped 4,238-row corpus:

> **C1 — gold row in the top 3: 24 of 44.**
> **C2 — at or under 25 rows: 27 of 44.**
> **Gold rows not on the screen at all: 4** — three past the 50-row page cap, one not retrieved at any depth.

The four unreachable ones are the sharpest statement of the problem this map exists to fix:

| query     | gold row                                                    |                                   |
| --------- | ----------------------------------------------------------- | --------------------------------- |
| `beef`    | `Beef, ground, 80% lean meat / 20% fat, raw`                | past the page cap, under 954 rows |
| `chicken` | `Chicken, breast, boneless, skinless, raw`                  | past the page cap, under 179 rows |
| `lamb`    | `Lamb, ground, raw`                                         | past the page cap, under 276 rows |
| `ham`     | `Pork, cured, ham, whole, separable lean and fat, unheated` | not retrieved at all              |

Mince is the most-logged beef there is and you cannot reach it by typing `beef`.

`ham` is a different harm and is reported apart from the other three. Typing `ham` returns **one** row — `Ham, sliced, restaurant` — while `gammon` returns 88 (**corrected 2026-09-12, see §8**; registered as 50, which was a page-capped reading), because [ADR-0062](../adr/0062-a-foods-own-name-is-what-retrieves-it.md) §1's stray-mention rule drops rows the typed word reaches only past the food's own name, and USDA files every cured ham under `Pork, cured, ham, …`. The hams ship; they are unreachable by their own word. This is not duplication and #190's rule should not be expected to fix it.

`chicken` shows the duplication and the page cap in a single query: `Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw` sits at rank **8**, while the Foundation row for the same food, `Chicken, breast, boneless, skinless, raw`, is past **50**. Two rows, one ingredient, one reachable.

### A correction to an earlier reading

An initial pass recorded `egg` as a **coverage hole** — no plain raw hen's egg in the corpus. That was wrong, and it was a bad substring probe rather than a fact about the corpus. The row ships: `Eggs, Grade A, Large, egg whole` (`fdc:748967`), a Foundation record carrying `Egg, whole, raw, fresh` as an [ADR-0050](../adr/0050-a-merged-food-keeps-the-name-its-twin-lost.md) twin alias — the SR Legacy name the merge discarded. It ranks **13** for `egg`, behind duck, goose, quail and turkey. The corpus is right, the merge is right, and the ranking is the failure.

## 6. What is deliberately not in the bar

**British queries do not gate this map.** They reach food by a different machine — [ADR-0049](../adr/0049-a-derived-vocabulary-for-food-search.md)'s vocabulary, 444 OFF-derived expansions plus 8 hand-written local ones — and **15 of the 17 match no corpus row literally**. Blending them into the gating roster would make a vocabulary number read as a corpus number, and a regression would be unattributable.

They are carried as a **tripwire** rather than a condition, firing on one transition only: a query that answered now answers with nothing. That is not idle. ADR-0049's map is derived _from corpus text_, so deleting rows moves it, and three of these queries are one row from silence — `porridge oats` (1 row), `sultanas` (1 row), and `double cream`, which already returns nothing ([#141](https://github.com/palebluebytes/inventoria/issues/141)). At registration: **16 of 17 answer**.

**Multi-word queries are watched, not gating** — [#151](https://github.com/palebluebytes/inventoria/issues/151) established that a head-phrase-only sweep cannot price a multi-word rule, so twelve are carried to catch a rule that fixes one-word queries by breaking two-word ones. At registration: **C1 10 of 12, C2 10 of 12**.

**Corpus size is a sanity figure with no pass or fail attached.** The expected landing zone is **2,850-2,950 rows** (**corrected 2026-09-12, see §8**; it was registered as 1,850-1,900). A rule landing far outside it is asked to explain itself. A rule landing inside it and failing C1 or C2 still fails — hitting a size by deleting the wrong rows is not the destination.

## 7. The harness

`scripts/usda-consolidation-bar.mjs`, run with `pnpm usda:consolidation-bar` (add `--json` for a diffable artifact).

It borrows the shipped `searchIndexRows` through `usda-app-module.mjs` rather than restating it, so the vocabulary fallback, both matching tiers and all eight ranking keys are the ones that ship. C2's row count comes from the uncapped scorer over the phrases the shipped search actually ran — counting the typed query alone would report `minced beef` as 0 rows while the user looks at a full screen of 43.

Three deliberate omissions, each with a scar behind it:

- **It writes no artifact.** [#156](https://github.com/palebluebytes/inventoria/issues/156) is the record of what regenerating a measurement's committed artifact as a side effect costs — the ranking audit went blind. The registered bar is an input here and is never written back.
- **It is not wired into `pnpm check`.** A gate would fail on every legitimate corpus change and train people to regenerate without reading, which is the reasoning `usda-ranking-audit.mjs` already carries about itself.
- **It checks every gold id exists before ranking it.** A gold id missing from the corpus is a broken bar, not a failing search, and the two are never reported as the same thing.

**Where this file lives is not settled.** Whether it stays a script of its own or folds into `usda-ranking-audit.mjs` is deferred until the rule it measures exists; `usda-ranking-audit.mjs` is at 956 lines against the ~1000-line wall `CODING_STANDARDS.md` §4 draws, so the fold is not free and the decision is better made with the pilot's needs known.

## 8. Corrections (2026-09-12, #190)

Two registered figures were wrong. Both are corrected in place above and recorded
here, because a pre-registered document whose numbers change silently is worth
less than one with no numbers at all. **C1 and C2 are untouched**, and so are the
gold set and the roster: a sanity figure and a tripwire reading are not the
conditions this document exists to fix in advance.

### The landing zone was the size of a corpus that has deleted a thousand foods

The registered zone of **1,850-1,900** came from the crude three-rule cut (4,238 to
1,873) and from #187's independent 1,851. Both of those are **drop** figures: they
delete every row naming a cooking method, then every row naming a trim or a grade.
Nobody had asked what that deletes.

Measured over the shipped corpus while writing
[ADR-0103](../adr/0103-what-was-done-to-a-food-is-not-another-food.md):

|                                                           |               |
| --------------------------------------------------------- | ------------: |
| Rows deleted                                              |         2,404 |
| Residual groups losing **every** row, so the food is gone |     **1,089** |
| Rows in those groups                                      |         2,181 |
| Head phrases that disappear entirely                      | **18** of 512 |

The eighteen include `quinoa`, `teff`, `spelt`, `buckwheat groats`, `mutton`,
`turkey breast`, `escarole` and `apricots`, all because USDA publishes them only
cooked or only trimmed. A rule that ships them, which is the only kind
[ADR-0055](../adr/0055-who-eats-a-food-ranks-it-and-never-drops-it.md) §1 permits,
**collapses** rather than drops and lands at **2,923** residual groups. Widening
the collapsing-segment roster to 25 further near-misses reaches only 2,739, so the
gap to the registered zone is not something a bigger roster closes.

The corrected zone of **2,850-2,950** is the corpus before any head phrase is
adjudicated. Hand-adjudicating the 25 largest heads moves it further down by an
amount nobody has measured, so a rule landing below the zone explains itself with
its per-head account rather than being marked wrong.

### The `gammon` tripwire recorded a page cap, not an answer size

The British tripwire column reads `searchIndexRows(...).hits.length`, which is
truncated at the 50-row page cap, where C2's column reads the uncapped scorer.
`gammon` is the **only** roster query where the two disagree: it answers with
**88** rows and was registered as 50. The tripwire fires on a query falling to
zero, so its verdict is unaffected — 16 of 17 answer, as registered — but the
number beside it was not an answer size and is now stated as one.

## 9. The outcome (2026-09-15, #438)

The rule this document was written in advance of has shipped: ADR-0103's
collapse ([#435](https://github.com/palebluebytes/inventoria/issues/435)) and
§5's strip ([#436](https://github.com/palebluebytes/inventoria/issues/436)). This
section records what it did to the two conditions. **Sections 1 to 8 are the
registration and are not edited**, because a pre-registration whose registration
moves measures nothing.

### The verdict

**The collapse does not move either condition.**

|                                 | at registration |  pre-collapse |       shipped |
| ------------------------------- | --------------: | ------------: | ------------: |
| corpus rows                     |           4,238 |         2,418 |         2,037 |
| C1 — gold row in the top 3      |           24/44 |         25/44 |         25/44 |
| C2 — at or under 25 rows        |           27/44 |         31/44 |         31/44 |
| gold past the 50-row page cap   |               3 |             2 |             2 |
| gold not retrieved at any depth |               1 |             0 |             0 |
| multi-word C1 / C2              |   10/12 · 10/12 | 10/12 · 12/12 | 10/12 · 12/12 |
| British tripwire answering      |           16/17 |         16/17 |         16/17 |

The middle and right columns are like-for-like: one `schema_version`, one search
build, one gold set, both taken from the same working tree with
`pnpm usda:consolidation-bar` and `USDA_INDEX_PATH` pointed at `c750b929`'s index
for the middle one. The left
column is the registered reading and is **not** comparable to either; §9's last
subsection is why.

**Corpus size, which §6 registers as a sanity figure.** The shipped corpus is
2,037 rows against a landing zone of 2,850-2,950, and §6 asks a rule landing far
outside it to explain itself rather than marking it wrong. The explanation is the
one §8 anticipated: the zone is the corpus before any head is adjudicated, and
ADR-0104 then removed the cooked half rather than collapsing it. What **this**
rule took is 2,418 rows to 2,037 across four heads, accounted head by head in
`190-corpus-account.md`. The zone carries no pass or fail and is not restated
here as one.

### Nothing changed verdict, and four queries changed size

Of the 44 gating queries, **0 changed either verdict** and **40 are identical to
the row**. Four moved:

| query  | rows          | gold row's uncapped rank | C1        | C2        |
| ------ | ------------- | ------------------------ | --------- | --------- |
| `beef` | 412 → **135** | 199 of 412 → 115 of 135  | fail→fail | fail→fail |
| `pork` | 131 → **93**  | 10 → 8                   | fail→fail | fail→fail |
| `lamb` | 117 → **65**  | 109 of 117 → 57 of 65    | fail→fail | fail→fail |
| `ham`  | 53 → **33**   | 10 → 7                   | fail→fail | fail→fail |

No multi-word query moved at all. The British tripwire moves one figure —
`gammon` 8 rows to 4 — and stays intact at 16 of 17.

No gold row left the corpus, no `fdcId` was re-pinned, and all 56 human labels
still match the names the rows ship under. **No gold-set amendment is owed**, and
that is recorded here rather than left as an absence: the convention set on
2026-09-14 exists so that a silent edit cannot happen, which means a silent
non-edit should not either.

### `beef` does not clear the page cap, and neither does `lamb`

Stated plainly because the ticket asks for it plainly, and because this is the
question the map was chartered on.

**`beef`: no.** 135 rows against a 50-row page, gold row at uncapped rank 115.
Typing `beef` still cannot reach 80/20 mince. Worse, the row's position **within
its own result set got worse**: the rows above it fell 198 to 114, the rows below
it fell 213 to 20. The collapse took most of what it took from _beneath_ the row
the bar is trying to reach — 48th percentile to 85th. That is not a defect in the
rule. It is what collapsing butchery permutations does to a head whose plain
mince was never ranked near the top in the first place.

**`lamb`: no, by seven rows.** 65 rows, gold row at uncapped rank 57. Here the
removal was entirely from above — 108 rows above it became 56, the 8 below it
stayed 8 — and it still misses the page cap by seven. `lamb` is the closest the
roster comes to a query the corpus rule nearly fixed, and "nearly" is the whole
finding.

### §11's prediction, scored

ADR-0103 §11 named eight queries the collapse would do **literally nothing** for
and seven it "does the work on". The criterion scored here is the one that
record's own 2026-09-12 Amendment used when it re-measured the same claim — a
query **crossing the 25-row cap** — rather than the looser reading the phrase
invites.

- **The eight negatives are 8 for 8.** `cheese`, `oil`, `flour`, `egg`, `salmon`,
  `cream` and `butter` from the gating roster, and `mince` from the British
  tripwire, are identical to the row either side of the collapse. §11 said this
  rule cannot help them and it cannot.
- **The seven positives are 0 for 7.** Not one crosses the cap under this rule.
  `beef` at 135 rows, `pork` at 93 and `lamb` at 65 move and stay over it;
  `chicken` at 71 and `turkey` at 52 do not move at all; and `gammon` (tripwire)
  and `chicken thigh` (multi-word) had already fallen under the cap through
  ADR-0104, at 8 rows and 10, so this rule had nothing left to carry across.
- **On the looser question of whether the rule touched a query at all**, four of
  the seven moved: `beef`, `pork` and `lamb`, all three still over the cap, and
  `gammon` from 8 rows to 4. One query §11 did not name moved too — `ham`, 53 to 33.
- **`chicken` and `turkey` did not move because ADR-0104 landed in between.**
  §11's table was measured over the 4,238-row corpus. What was collapsible in
  those two was preparation, and the cooked half of the corpus was gone before
  this rule ran. `190-corpus-account.md` says the same thing from the other side:
  four head phrases move, and what is left after ADR-0104 is purely butchery.

So §11's pessimism is exact and its optimism scores nothing, which is the better
direction for a pre-registered claim to be wrong in. It is also a second
confirmation of that record's 2026-09-12 Amendment, which moved `beef` off the
positive list and filed it beside `cheese`: `beef` fell further than any query in
the roster, 412 rows to 135, and its gold row ended **deeper** in its own result
set than it began.

### The residue

24 of 44 gating queries pass both conditions. 12 fail both, 7 fail C1 only, 1
fails C2 only.

Thirteen queries still answer with more than 25 rows. The collapse reached four
of them and left all four over the cap; the other nine it did not touch and
cannot:

| untouched | rows |     | untouched | rows |
| --------- | ---: | --- | --------- | ---: |
| `cheese`  |  100 |     | `bread`   |   49 |
| `chicken` |   71 |     | `butter`  |   39 |
| `oil`     |   70 |     | `beans`   |   39 |
| `flour`   |   63 |     | `cream`   |   31 |
| `turkey`  |   52 |     |           |      |

None of those nine is duplication, so none of them is a membership problem, and
§11 already says what they are owed instead: retrieval pollution belongs with
ADR-0062, and a head that is genuinely a hundred named foods wants a ranking or
paging instrument. The residue is filed as
[#451](https://github.com/palebluebytes/inventoria/issues/451) rather than left
in this paragraph.

### The registered column is not re-derivable, and the reason is a flattened key

`USDA_INDEX_PATH` re-derives a baseline **only within one `schema_version`.**

Pointed at the 4,238-row schema-8 index the bar was registered against, today's
harness reports **C1 22/44, C2 27/44**. C2 reproduces the registered reading
exactly, and so do the unreachable split (3 past the cap, 1 absent) and the
multi-word pair. C1 does not, and neither reason is the corpus:

- **A row fact that index does not carry.** ADR-0104 made `raw` a field on the
  row. Schema 8 has no `raw` key at all, so `readRowRank` reads `undefined` for
  all 4,238 rows and returns 0 for every one of them. The key is present, ties
  uniformly, and discriminates nothing — a ranking one key short, running without
  saying so. It is not [#155](https://github.com/palebluebytes/inventoria/issues/155)'s
  `NaN`-is-falsy blindness, which skips a key; it is the same family, a key that
  cannot decide anything.
- **Ranking keys landed after registration.** Two frecency keys
  ([#165](https://github.com/palebluebytes/inventoria/issues/165),
  [#320](https://github.com/palebluebytes/inventoria/issues/320)) and
  `CANONICAL_ROWS` — the hen's egg and cow's whole milk — are all dated
  2026-09-13 or later against a bar registered on 2026-09-11.

Which of the two accounts for the two points is not separated here, because the
reading is reported as **not comparable** rather than as a corrected baseline.
What it costs is #438's hand-off, which tabled 24/44 at registration against
25/44 now and read the one-point gain as a re-pin: the gain crosses a changed
ranking as well as a changed pin, and the registered 24 is not a number this
branch can reproduce. The 2026-09-14 gold-set amendment in
[`188-consolidation-bar.json`](188-consolidation-bar.json) is untouched by this,
because it measured its re-pin both ways over one corpus with one build — the
only kind of comparison this subsection is arguing for. The like-for-like
statement this arc can make is the one at the top of §9, and it is that the
collapse moved neither condition.
