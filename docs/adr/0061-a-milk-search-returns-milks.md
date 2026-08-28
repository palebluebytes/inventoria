# ADR 0061: A milk search returns milks

**Status:** Accepted  
**Date:** 2026-08-28

This record amends [ADR-0055](0055-who-eats-a-food-ranks-it-and-never-drops-it.md)
§1, which as written forbids most of the seventy-four drops below, and §7, whose
refused powder marker is the shape one of them would otherwise take. It is the
second amendment §1 has taken and the reason given is the same one
[ADR-0056](0056-a-name-loses-the-parts-that-do-not-name-the-food.md) §5 gave:
simplicity preferred to complete coverage.

The search rules that make the result readable are a separate record,
[ADR-0062](0062-a-foods-own-name-is-what-retrieves-it.md). This one is only about
which rows ship.

## Context

Typing `milk` returned **fifty rows, which was the page cap**; eighty-one rows in
the shipped corpus answered the query. What a reader saw first was dry whole milk,
chocolate milk, sheep milk, dried buttermilk, hot cocoa and human milk. Ordinary
cow's milk appeared as **sixteen separate rows** — two whole, five at 2%, four at
1%, five nonfat — differing from each other by whether vitamins A and D had been
added, whether nonfat solids had been added, and whether the record was protein
fortified.

Read whole, the eighty-one rows fall into four groups:

- **Milks a person drinks.** Cow at four fat levels, sheep, goat, Indian buffalo,
  soy, almond, oat, rice, coconut. Thirteen rows.
- **The same cow's milk again.** Fifteen further rows that name a fortification
  rather than a food.
- **Foods made with milk or from milk, but not milk.** Chocolate milk, milkshakes,
  dried milk, evaporated milk, buttermilk, filled and imitation milk, hot cocoa.
- **Not milk at all.** Twelve cheeses, seven yogurts, two milkfish, a mashed
  potato and eight beverage mixes, reached because `milk`, `milkfat` and
  `milkfish` all begin with the same four letters.

The fourth group is a retrieval defect and is ADR-0062's. The first three are a
question about which records belong in a corpus, and that is this record's.

### Why ADR-0055 §1 had to be amended rather than worked around

§1 says prevalence may rank a food and may never drop one, and that a drop must be
a claim about what the record IS. Some of the drops below satisfy it honestly:
`Milk, human, mature, fluid (For Reference Only)` carries USDA's own marker for a
record published as a reference standard, and that phrase matches **exactly one row
in the whole corpus**. `Milk, producer, fluid, 3.7% milkfat` is raw bulk-tank milk
before standardisation, a specification in the same shape as the `manufacturing
beef` that ADR-0042's #157 Amendment admitted. `Milk, filled`, `Milk, imitation`
and `Milk substitutes` are formulated vegetable-fat products sold to stand in for
dairy.

Most are not. Chocolate milk is a drink people drink. Dried milk is a cupboard
staple. A milkshake is a food. The reason for removing them is that they crowd a
list, and dressing that up as a claim about the records would be the manoeuvre
ADR-0056 §5 explicitly refused to perform. The reason is written plainly instead.

### Why the obvious general predicates do not work

Both were proposed, measured, and refuted before the rules below were settled.

**A flavour roster with a plain-twin test.** ADR-0055 §3 already bakes
`plain_sibling` into the index, so requiring a roster word AND a plainer twin
looked like a predicate rather than a list. Measured over the shipped corpus, a
flavour roster reaches **85 rows and only 8 carry `plain_sibling`** — and they are
the wrong eight. `Vanilla extract, imitation, alcohol` carries it;
`Soymilk, chocolate, unfortified` does not, because `plain_sibling` is a strict
qualifier-prefix test and there is no `Soymilk` row to be a prefix of. The
compound rule would have deleted vanilla extract and kept every chocolate soymilk.

**The roster alone is worse.** USDA names plain soy milk
`Soymilk, original and vanilla`. A `vanilla` entry deletes the plain soymilk and
leaves the chocolate one. The word marks a flavour under one head phrase and the
default under another.

**A dried or powder marker.** §7 refused this and recorded that an unsafe form
takes curry powder, cocoa and dried egg white. The true reach is larger than that
note suggests: `dry|dried|powder|powdered|dehydrated|instant` matches **294 rows**,
including walrus, caribou, prunes, sun-dried tomatoes, shiitake, cloud ears, every
dry pasta and noodle, parboiled rice, couscous, powdered sugar and the dry-roasted
nuts. §7's refusal was right and is not reversed.

What both failures have in common is that they ask a corpus-wide question of a
word. Scoping the question to a **head phrase** makes both tractable: `Milk, dry,
whole` shares a head with rows that are fluid, and prunes do not.

**Scope.** Three head phrases were adjudicated by reading every row under them:
`Milk`, `Yogurt` and `Soymilk`, plus the rows under other heads that name
themselves a milk drink. `Beverages`, `Cheese`, `Ice cream` and every other head
with a flavour ladder are **deliberately not done**, and the rules below fire only
where a head has been adjudicated. This record does not change ranking, retrieval
or any name; ADR-0062 does both of those.

## Decision

### 1. Amendment to ADR-0055 §1: a second ground, and the reason for it

§1 gains one further ground beyond ADR-0056 §5's: **within a head phrase that has
been adjudicated row by row, a row may be dropped for being a variant of a food
the corpus keeps** — a flavoured form, a dehydrated form, or a record that names a
fortification rather than a food.

The reason is **simplicity preferred to complete coverage**. That is nearer the
audience claim §1 exists to forbid than the variant framing alone suggests, and it
is stated here rather than dressed as a claim about the records, on ADR-0056 §5's
precedent.

Two guards make it narrower than it reads. It is available **only under a head
phrase whose every row has been read and adjudicated**, which is what stops it
becoming a licence to prune by intuition. And ADR-0055 §2's bar still applies in
full: no drop here may break a lead already measured correct.

### 2. A flavoured variant drops where its head keeps a plain one

The roster is `chocolate`, `strawberry`, `carob`, `eggnog`, `malt`, `vanilla`,
`fruit`.

**A roster word is not a flavour word under a head where every plain row carries
it.** This exemption is mechanical and is checked at generation: if removing the
word would leave the head with no plain row, the word does not fire under that
head. It is the whole of what protects `Soymilk, original and vanilla`, and it was
found by measurement rather than foresight.

### 3. A dehydrated form drops where its head keeps a fluid one

Amendment to ADR-0055 §7, deliberately narrow. §7 refused a **bare** powder or
supplement marker and that refusal stands unchanged; a marker read only against
the rows sharing a head phrase with a fluid form is not one. It reaches six rows,
all under `Milk`, and cannot reach a prune, a pasta or a cocoa powder, because
none of those heads holds a fluid twin.

### 4. Where one food is recorded at several fortifications, one row survives

The survivor is the row that names **no addition** — `without added vitamin A and
vitamin D` over `with added vitamin A and vitamin D`, and either over `protein
fortified` or `with added nonfat milk solids`, which are different foods rather
than different paperwork.

This costs real data and the cost is stated rather than buried: the surviving
whole, 2%, 1% and nonfat rows carry **107 to 128 nutrient fields**, where the
Foundation twins they beat carry **159**. The trade is composition fidelity for a
readable list, and a future reader who wants the fuller panels back should start
here.

### 5. The adjudicated rosters

**Under `Milk`, forty-two rows leave**: six dried, seven chocolate, two milkshakes,
one reference-only record (human milk), four formulated stand-ins (`filled` ×2,
`imitation`, `substitutes`), one designated-population record (`low sodium`),
fifteen fortification duplicates, and six rows filed under `Beverages` that name
themselves a milk drink — `chocolate almond milk`, the two
`chocolate-flavor beverage mix for milk` rows and three chocolate drink powders
prepared with milk.

The last six are here rather than out of scope because **the adjudicated unit is
the milk drinks, not the shelf USDA filed them on**. Without them `chocolate milk`
returns three malted drink powders, which is worse than returning nothing: an
empty search is recorded by [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)
and a wrong answer is not.

**Full-fat cow's milk is the 3.7% row**, kept and renamed from `Milk, producer,
fluid, 3.7% milkfat` to `Milk, whole, 3.7% milkfat`; both 3.25% rows go. `producer`
names the supply chain rather than the food, 3.7% is nearer the UK compositional
figure than 3.25%, and keeping both would have reproduced under two near-identical
names exactly the duplication this record exists to remove.

**Under `Yogurt`, twenty rows leave** and six survive: plain at whole, low fat and
nonfat, and Greek plain at the same three. Greek and a fat level are types, not
flavours. `Yogurt, plain, skim milk` leaves as a duplicate of
`Yogurt, plain, nonfat`.

**Under `Soymilk`, twelve rows leave and none survives.** Four chocolate, four
`(All flavors)` aggregates — an average across flavours is a claim about the
measurement, not a food — and all four `original and vanilla` rows. The single
plain soy milk the corpus keeps is the Foundation row `Soy milk, unsweetened,
plain, shelf stable`, which carries the richer panel and the spelling people type.
`soymilk` becomes a vocabulary key expanding to `soy milk`, so the one-word
spelling still lands ([ADR-0049](0049-a-derived-vocabulary-for-food-search.md) §1).

### 6. A dead vocabulary key is pruned, and an emptied search is left empty

The derived vocabulary ships keys that point at rows this record removes —
`powdered milk` to `milk powder` and `dry milk`, `dried whole milk` to
`whole dry milk`, `skimmed milk powder` to `nonfat dry milk`. They are pruned at
generation, because a fallback that expands to nothing is worse than no key.

`chocolate milk`, `milkshake`, `milk powder` and `dried milk` therefore return
**nothing**, and no phrase is re-pointed at plain milk to soften it. Answering
`chocolate milk` with whole milk would be a wrong answer given confidently.

`skimmed milk` and `semi-skimmed milk` are unaffected: both are existing
vocabulary keys, and the phrases they expand to — `skim milk`, `1% fat milk`,
`reduced-fat milk` — still land on the surviving rungs.

## Consequences

- **The corpus falls from 4,312 rows to 4,238.** A search for `milk` returns
  **seventeen rows** rather than eighty-one capped at fifty, and fifteen of the
  seventeen are milk. The remaining two are milkfish, which ADR-0062 §4 declines
  to chase.
- **The cow's-milk ladder is four rows: 64, 50, 42 and 35 kcal.** One full fat, one
  2%, one 1%, one skimmed.
- **Nineteen flavoured yogurts and twelve soymilks leave on a rule that began as a
  milk fix.** That is the honest reach of asking for a general predicate instead of
  a hand-list, and it was accepted with the rows read rather than counted.
- **Four searches that used to return something now return nothing**, and the only
  thing that will surface it is ADR-0053's local empty-search log. If
  `chocolate milk` becomes one of its top entries, that is the evidence for
  reversing a drop, and it is the reason the log's threshold matters more after
  this record than before it.
- **A user who wants chocolate milk is not stranded.** It is a branded packaged
  product, reached by the barcode and Open Food Facts path
  ([ADR-0034](0034-label-photo-food-capture.md)) or by manual entry
  ([ADR-0035](0035-custom-food-intent-chooser.md)). This is
  the mitigation that makes these drops survivable and it should be checked before
  any further head is adjudicated.
- **§1 has now been amended twice, both times for simplicity.** ADR-0056 §5 gave a
  narrow collision ground and called its reason what it was; this record gives a
  broader one. A third amendment should be read as evidence that §1 is being
  eroded rather than refined, and the honest response then is to rewrite §1 rather
  than amend it again.
- **The three adjudicated heads are a precedent trap.** The rules ship general but
  fire only where a head has been read. A future reader who assumes `Beverages`
  was considered and kept will be wrong: it was never looked at.
- **A drop rule's reach must be pinned as the population it LEFT.** Every count
  here is stated over the 4,312-row corpus at the commit that precedes the change,
  because after it lands the evidence for these numbers is gone.

## Amendment (2026-08-28, #177): §6's keys are not dead, and why the prune found nothing

§6 says the derived vocabulary ships keys pointing at rows this record removes,
and that they are pruned at generation. Measured over the 4,238 rows that ship,
**one half of that is already true and the other half is false**, and both
halves are recorded here because §6 as written would send the next reader
looking for a prune that has nothing to do.

### The prune that had already happened

Nothing had to be built for it. ADR-0049 §3's effect filter keeps a synonym
group only where a member retrieves and a member does not, and the map is
derived from the FINISHED corpus, so a target that loses its last row takes its
keys with it in the same regeneration that drops the rows. `skimmed milk powder`
and `skimmed cow's milk powder` left with #174, because `nonfat dry milk` went
to zero. That is the mechanism §6 asks for, working before it was asked.

### The keys §6 names, measured

`milk powder`, `whole milk powder` and `dry milk` all still retrieve, so no key
above them is dead:

| phrase              | rows | what it leads with                                               |
| ------------------- | ---- | ---------------------------------------------------------------- |
| `milk powder`       | 4    | `Beverages, Eggnog-flavor mix, powder, prepared with whole milk` |
| `whole milk powder` | 4    | the same four                                                    |
| `dry milk`          | 1    | `Fish, milkfish, cooked, dry heat`                               |
| `nonfat dry milk`   | 0    | —                                                                |

So `powdered milk` returns five rows, and `dried whole milk`, `dry whole milk`,
`powdered whole milk`, `whole dry milk` and `whole powdered milk` return four
each. §6 was written expecting [ADR-0062](0062-a-foods-own-name-is-what-retrieves-it.md)
§1 in its original unconditional form, under which the four beverage mixes are
stray mentions and go. #176 shipped it **gated** — the cut fires only where some
row answers on a strictly higher rung — and under `milk powder` no row answers
in its own name at all, so the bar sits at 0 and every mention clears it.

The rows themselves are §5's blind spot rather than a retrieval defect. §5 drops
six rows filed under `Beverages` that name themselves a milk drink and all six
are chocolate; an eggnog mix, a carob mix, a strawberry mix and a cereal-grain
coffee substitute, each `prepared with whole milk`, are not. `Beverages` is the
head §5 says plainly was never looked at, and the Consequences call that a
precedent trap. Removing them is a corpus decision that wants the head
adjudicated row by row first, which is what §1's guard requires and this record
does not do.

**Nothing is re-pointed, and that part of §6 stands.** `chocolate milk`,
`milkshake` and `dried milk` return **0 rows** and are recorded by
[ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)'s
local log. `milk powder` is the one of §6's four that does not, and it is worse
than empty rather than better: it answers with a drink mix, which is the failure
§5 refuses for `chocolate milk` in exactly these words.

### Teaching the derivation ADR-0062 §1 was tried, and refused on measurement

The obvious reading of §6 is that the derivation measures a wider retrieval than
the app performs, and that closing the gap is what prunes the keys. It was built
and regenerated, and it prunes nothing:

- **The effect filter cannot see the rule.** `withoutStrayMentions` takes its bar
  from a row that is `named`, and a `named` row always clears it, so a non-empty
  result can never come back empty. "Does this phrase retrieve anything?" has the
  same answer with the rule and without it, whatever the corpus. The regeneration
  that applied it **added two keys and removed none** (444 to 446).
- **The stopword guard is made worse by it.** The guard asks how many rows merely
  CONTAIN a target, which is what makes a word a word rather than a synonym. Under
  the rule `whole` falls from 209 rows to five — four turkeys and a milk — and
  `wholemeal -> [whole, whole grain]`, the entry ADR-0049 §3 names as the reason
  the guard exists, is readmitted and leads with
  `Turkey from whole, light meat, meat only, with added solution, raw`.

The counter therefore keeps counting mentions, and says so. The invariance the
first bullet rests on is pinned as a test on `withoutStrayMentions` rather than
left as an argument in a comment.

### One key the drops did add

`milk` now reaches 35 rows on the guard's count, under its 47-row limit, so the
OFF group behind `milk ingredients -> milk` survives the guard for the first
time. It is a label phrase rather than one of §6's four, and answering it with
seventeen milks is right, so it is admitted — but it is worth naming, because it
is the first time this corpus has let a key point at bare `milk` and §6's
prohibition is on softening a DEAD phrase, not on the word.

### What shipped

`soymilk -> soy milk`, §5's own instruction, as the eighth entry in
`vocabulary_local` ([ADR-0049](0049-a-derived-vocabulary-for-food-search.md) §4).
It leads with `Soy milk, unsweetened, plain, shelf stable` and is held to that by
the generation, like the seven before it.
