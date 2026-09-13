# Does a food have forms? — PROTOTYPE

Throwaway. Answers [#189](https://github.com/palebluebytes/inventoria/issues/189)
on the map
[#186](https://github.com/palebluebytes/inventoria/issues/186). Not reached by
the app; nothing here is meant to survive to `main`.

```sh
pnpm prototype:food-forms      # http://localhost:5198
```

Everything is in the URL, so a reading can be pasted into the ticket:
`?food=beef-sirloin&shape=c&t=20`.

## The question, and why it is one cut rather than three mockups

#189 asks whether a food has **forms** the reader picks at staging, or whether
its variants stay **separate rows** and consolidation happens by dropping.

Hand-built mockups could not be compared, because any difference between them
could be a difference of drawing. So all four shapes read **one cut**, computed
in `cut.ts`: given a threshold, every axis a population varies along lands on one
side or the other, and the shapes differ only in what they _do_ with a kept
axis.

| shape                     | a kept axis becomes            | an axis below the threshold   |
| ------------------------- | ------------------------------ | ----------------------------- |
| **A** rows stay           | a row per value                | collapsed, no longer loggable |
| **B** every axis a form   | a picker                       | — (B ignores the threshold)   |
| **C** forms that earn it  | a picker                       | decided for the reader        |
| **D** one row, real forms | part of a form's distinguisher | decided for the reader        |

**D was added after the ruling that a search returns one food per row** (2026-09-11),
which refuses A outright. B and C honour the ruling but offer a _cross-product_
of independent per-axis pickers, 42–98 % of which USDA never published. D drops
the per-axis controls and offers the surviving **combinations** themselves, empty
ones filtered out, so hollowness is zero by construction rather than by luck.

**B is C with the threshold at zero.** That is the finding the prototype is
built to make visible: the difference between "one row per ingredient carrying
forms" and "one row per ingredient carrying the forms that earn it" is a number,
and the number is draggable.

## The measurement

An axis earns a control by moving the calories. That has to be measured
honestly, so it is **paired**: only rows identical on every _other_ axis are
compared, the same shape as the map's own "596 groups differing only by
raw-vs-cooked" figure.

The marginal alternative — mean calories per axis value — is not off by a
little. Over `Beef, top sirloin, steak`:

| axis    | marginal | paired median |
| ------- | -------- | ------------- |
| `trim`  | 0 %      | **12 %**      |
| `grade` | 18 %     | **6 %**       |

The marginal reading says trim is free and grade is the price. The paired
reading says the reverse.

Two rules the measurement obeys, both ADR-0048's "an absent measurement is not a
zero": a pair missing either calorie figure is skipped rather than scored as a
delta of nothing, and panel fullness counts nutrients **present**, not non-zero.

## The four populations

Three are #189's own. The fourth is ADR-0055's trap, kept as a tripwire.

| population               | rows | axes, paired median                                                                     |
| ------------------------ | ---- | --------------------------------------------------------------------------------------- |
| `chicken breast`         | 7    | skin 22 %, preparation 13 %                                                             |
| `beef top sirloin steak` | 19   | separation 37 %, preparation 34 %, trim 12 %, grade 6 %                                 |
| `apple`                  | 13   | sweetening 46 %, skin 8 %, cultivar 7 %; state, preparation, treatment **unmeasurable** |
| `white wine`             | 14   | style 37 %, cultivar 2 %                                                                |

An **unmeasurable** axis is one USDA published no matched pair for. The
prototype **keeps** it rather than dropping it — "USDA never published the
comparison" is not evidence that an axis is noise — and marks it on screen. That
is a decision, made visible rather than assumed, and `apple` is where it bites.

## What it shows

Drive it rather than trusting this list, but these are the readings that came
out of building it. Readings 1–6 are what settled the ruling; **`What D costs`
below is what is still open after it.**

1. **Shape B is mostly hollow.** A control per axis offers a cross-product USDA
   never filled in. At threshold 0: `chicken breast` 5 of 12 combinations empty,
   `beef` 17 of 36, `white wine` 10 of 24, **`apple` 493 of 504 — 98 %**. A
   picker that offers a combination with no row behind it must either dead-end
   or quietly show the number for a different food.
2. **A threshold fixes that fast, for three of the four.** At 20 %:
   `chicken breast` is one skin picker and 0 % hollow, `white wine` is one style
   picker and 0 % hollow, `beef` is two pickers and 17 % hollow.
3. **The wine trap is defused by measurement, not by position.** `late harvest`
   is 112 kcal / 13.4 g carbohydrate against a plain white's 82 / 2.6. Its axis
   measures **37 %** while the grape-varietal axis measures **2 %** — so a
   measured rule keeps the first and decides the second, where any rule shaped
   "drop what follows the plain form" deletes the dessert wine. Watch it die
   under shape A at a high threshold.
4. **No single global threshold works.** `chicken breast`'s preparation axis
   measures **13 %** and `beef`'s trim axis **12 %** — the axis #189 calls the
   strongest case for forms and the axis it calls noise are one percentage point
   apart, and no dial setting separates them. Push the dial high enough to tidy
   beef (35 %) and `chicken breast` keeps no axis at all: one row spanning
   108–197 kcal.
5. **`apple` is the population that breaks every shape.** It mixes a near-tie
   axis (cultivar, 7 %) with an enormous one (dried vs fresh, 48 vs 243 kcal)
   that cannot be measured because USDA never published the pair. Its
   hollowness never falls below **83 %**, at any threshold.
6. **The fullest-panel tiebreak goes silent, and then names a grape.** The map's
   Notes reuse ADR-0056 §3 verbatim — the fullest nutrient panel represents a
   collapsed group. Across all 14 white wines every one of the four macros is
   present, so fullness ties; `Foundation` breaks nothing because all 14 are
   SR Legacy; and the last resort, lowest `fdcId`, elects
   **`Chenin Blanc` (173195)** to stand for _white wine_. The plain
   `Alcoholic beverage, wine, table, white` row is `174837` — the highest id in
   the group, so it loses every time. `apple` does the same thing through the
   Foundation arm and elects `red delicious`. In two of four populations the
   tiebreak names a variety as the ingredient. Whatever #190 writes, the
   representative rule needs a term that prefers the row spelling **fewest**
   qualifiers, and ADR-0056 §3 alone does not supply one.

## What D costs

D answers the hollowness finding and nothing else. Three things it does **not**
fix, all visible on `apple` at 20 %:

1. **A form's name is a raw join of its axis values** — `with added sugar,
dried, stewed, sulfured`. Legible to nobody. A naming rule is owed, and it is
   the same problem `usda-shipped-name.ts` already solves once for descriptions.
2. **The form list has no order.** `fresh, raw` — the form almost every reader
   wants — is listed **fourth**, under three dried variants, because the order
   is whatever the cross-product enumerated. So D needs a ranking _of forms_,
   which is some of the machinery [#192](https://github.com/palebluebytes/inventoria/issues/192)
   expected to retire, moved rather than removed.
3. **The unmeasurable axes still drive the list.** Apple's three dried forms
   exist only because `state`, `preparation` and `treatment` cannot be measured
   and are therefore kept. D stops an unmeasurable axis manufacturing _empty_
   combinations; it does not stop it manufacturing forms nobody asked for.

## The rule, as adjudicated

Four populations hand-worked on 2026-09-11, then corrected twice. **#189's
binary resolves to option (a): variants stay separate rows.** "One food per row"
and "variants stay separate rows" are one ruling, not two — a variant IS a food,
so it gets its row. There is no forms concept, no picker at staging, and **no
`schema_version` bump**; #190 does not own a schema change.

Three dispositions. Only the first two are axis-wide.

| disposition  | what happens                                    | axes                                            |
| ------------ | ----------------------------------------------- | ----------------------------------------------- |
| **form**     | distinguishes a row                             | variety, skin, lean-or-lean-and-fat, cut        |
| **collapse** | merged onto the as-bought row; never a row      | preparation, trim, grade, treatment, sweetening |
| **drop**     | removed outright — **per head, never per axis** | `dried` under apple, `late harvest` under wine  |

**An axis is a form because of what it IS, not because of how far it moves the
number.** That is what retires the dial: the adjudications wanted `cultivar` as
a row (2 % on wine, 7 % on apple) and refused `preparation` (34 % on beef). No
threshold separates those, because size was never the question.

### Why `drop` cannot be a rule on a word

`dried` under `apple` names a different product. Under `apricots` it names the
only way the food exists. A blanket rule on the bare segment `dried` takes **80
rows** and wipes **seven heads out completely**:

| head                                                       | rows lost | what survives |
| ---------------------------------------------------------- | --------- | ------------- |
| `apricots`                                                 | 3 of 3    | **nothing**   |
| `goji berries`                                             | 1 of 1    | **nothing**   |
| `fungi`, `pepeao`, `smelt`, `steelhead trout`, `jellyfish` | all       | **nothing**   |

So `drop` is a **per-head adjudication**, which is the map's hand-worked
25 heads in miniature, and #190 owns both halves: those 25 and the mechanical
rule for the 462-head tail.

### The representative refuses two kinds of row

1. **An unclaimed qualifier is refused.** Without it, `prefer: raw` elects
   `breast, skinless, boneless, meat only, with added solution, raw` and hands
   back a brine-diluted **108 kcal** as plain chicken breast.
2. **A row that positively says it was COOKED is refused.** Step 1 alone left
   `meat only` electing `cooked, fried` at **187 kcal**, defeating the collapse.
   Saying _nothing_ about preparation is not the same as saying "fried" — only a
   stated non-preferred value is refused, which is what keeps every wine row
   intact.

Together they leave `chicken breast, meat only` with **no eligible row**: all
four candidates are cooked or brine-injected, so USDA published no usable panel
for plain skinless chicken breast. It renders as a **coverage hole** — named,
amber, no number — rather than being filled with 108 or 187. That is
[ADR-0046](../../../../docs/adr/0046-curated-stand-ins-for-base-foods-usda-lacks.md)'s business, and the
first concrete evidence that its roster has to grow.

### What the rule produces

| population               | USDA rows | shipped rows | dropped | note                              |
| ------------------------ | --------- | ------------ | ------- | --------------------------------- |
| `chicken breast`         | 7         | **2**        | 0       | 1 coverage hole                   |
| `beef top sirloin steak` | 19        | **2**        | 0       |                                   |
| `apple`                  | 13        | **8**        | 3       | six varieties are six foods       |
| `white wine`             | 14        | **12**       | 2       | twelve varieties are twelve foods |

### What it costs

- **ADR-0055 §1's third amendment**, and the first that deletes a food for being
  a **different** food rather than a duplicate of a survivor. The two earlier
  amendments each had a survivor to point at; this one does not. Dried apple and
  late-harvest wine become unloggable, and the prototype lists them under
  "dropped outright" rather than hiding the price.
- **Consolidation is real only where the distinguishing axis is a collapse.**
  Meat goes 7→2 and 19→2; `white wine` goes 14→12 purely by the drop, and would
  otherwise not consolidate at all. Any variety-heavy head keeps every row, so
  #188's "at most 25 rows per query" bar — not the membership rule — is what has
  to catch it.
- **A form's name is still a raw join of its axis values**, and rows tying on
  plainness still fall through to `fdcId`. Neither blocks #189's answer; both
  are owed before #190 writes the rule.

## What is hand-written, and is not a proposal

The **axis roster** in `model.ts` — which comma-segment means `trim`, which
means `grade`, which grape names count as a variety. It is the smallest thing
that makes four real populations legible so the question can be looked at rather
than argued. The real rule is [#190](https://github.com/palebluebytes/inventoria/issues/190)'s
to write, and that is where the 462-head tail and the escape hatch belong.

Segments no rule claimed are **shown, not hidden** — they are the roster's debt,
listed under "The N USDA rows behind this". `chicken breast` has two
(`boneless`, `with added solution`).

`representative()` reuses ADR-0056 §3's tiebreak — the fullest nutrient panel
represents a collapsed group — but over the **four macros the search index
carries**, not the whole panel, which the index does not hold. A deliberate
proxy, named here so it is not mistaken for the rule.

## Files

| file         | what                                                               |
| ------------ | ------------------------------------------------------------------ |
| `model.ts`   | the axis roster, the four populations, the paired measurement      |
| `cut.ts`     | the one cut all three shapes read, and the hollowness count        |
| `views.ts`   | the four shapes                                                    |
| `main.ts`    | chrome: population, shape, threshold, all three in the URL         |
| `dom.ts`     | twenty lines of element-building                                   |
| `index.html` | the shell; styles live here because stylelint globs `src/**/*.css` |
