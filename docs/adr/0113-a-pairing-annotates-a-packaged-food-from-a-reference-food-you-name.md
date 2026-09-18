# ADR 0113: A pairing annotates a packaged food from a reference food you name, and never fills it

**Status:** Accepted  
**Date:** 2026-09-18  
**Amends:** [ADR-0108](0108-a-volume-food-is-weighed-by-the-class-you-say-it-is.md) §10 (its ban on a nutrient value crossing to an Open Food Facts product is narrowed to the product's stored panel and to any field the label carries; a marked reading and a frozen occasion are outside it)  
**Amends:** [ADR-0103](0103-what-was-done-to-a-food-is-not-another-food.md) §2 (`salt` is the fourth Collapsing axis, corpus-wide and narrow to salt)  
**Charted by:** [#240](https://github.com/palebluebytes/inventoria/issues/240) — the map, its eleven closed children and the research notes each one produced

## Context

The app records a packaged food from its barcode. Open Food Facts answers with
whatever the product's contributors put there, which on a European pack is the
mandatory declaration and nothing else: energy, fat, saturates, carbohydrate,
sugars, protein, salt. Twelve micronutrient targets exist in
`nutrition-targets.ts` and carry meters, and for anyone eating packaged food they
read near zero — not because the food carries no iron but because no label prints
it.

The corpus this app already ships knows those figures. USDA measured the foods;
the records are bundled, keyless and offline ([ADR-0047](0047-bundle-the-usda-archives-and-retire-the-api.md));
[ADR-0045](0045-usda-stays-the-base-food-composition-authority.md) §1 makes them
the composition authority for base foods. What was missing was any way to say
_this jar is that food_, and any account of what such a statement would license.

**The population is real and roughly half packaged.**
[#241](https://github.com/palebluebytes/inventoria/issues/241) took the ledger out
of the browser: 3,645 food datoms over 15 days, 29 of the 70 distinct foods logged
are `gtin:` twins against 30 `fdc:`, 172 of 375 consumption events live. Measured
over the 35 `gtin:` twins in that export
([#243](https://github.com/palebluebytes/inventoria/issues/243),
[`docs/research/243-what-actually-pairs.md`](../research/243-what-actually-pairs.md)),
the hand-adjudicated ceiling is 24 of 35, and **every usable pairing fills a median
of 8.5 of the twelve metered micronutrients** — ten for kefir, eleven for ricotta
and for egg pasta. That is the prize, and it is most of the panel rather than a
garnish on it.

**The motivating case, and what happened to it.** The map was chartered on
`GTIN 4068263049675`, a jarred Spanish pulse whose Open Food Facts record is a
shell — `completeness: 0.075`, no name, no nutriments — and whose printed label
carries fibre 6.4 g per 100 g, matching `fdcId 173740`
(`Beans, kidney, all types, mature seeds, cooked, boiled, without salt`) exactly.
By the time the map reached it that row had left the corpus:
[ADR-0104](0104-the-corpus-is-ingredients-as-bought-and-not-yet-cooked.md) keeps
only foods as bought and not yet cooked, and the shipped index says cooked on zero
rows. The jar was unpairable for most of this map's life. §11 below is what makes
it reachable again, at ×1.22 with 98 nutrients, and the record says so in terms
because a map that cannot serve the case that chartered it owes its reader that
sentence.

### The alternatives that were live, and what ruled each one out

Every one of these was measured rather than argued away, and each has a closed
ticket carrying the numbers.

- **A mechanical proposer over the OFF category tags.** Shipped and measurable
  today: right 7 times in 16 offers, and **plausibly wrong 5** — self-rising flour
  offered for plain wheat flour, at ×16.10 the calcium, which nobody hesitates
  over. Silent on 19 of 35 twins, because 15 carry no `categories_tags` at all.
  The rule that only a person's explicit act accepts a pairing is no defence
  against errors of exactly the kind a person accepts. (#243.)
- **The product name through the shipped search.** Zero of 35. The search drops a
  row the moment one typed word fails to land, and a pack's name always carries a
  brand word: `Pure sesame oil` returns nothing where `sesame oil` returns one.
  Relaxing that conjunction was tried: 5 right against 23 wrong. (#243,
  [#247](https://github.com/palebluebytes/inventoria/issues/247).)
- **Your own past pairings, across barcodes.** 2 of 35, and refuted structurally
  rather than by the count: a recurring shop is forty products and roughly forty
  distinct foods, so two products sharing one reference food is rare by
  construction. The same-barcode case needs no mechanism — it is the twin's own
  datom. (#243.)
- **A model.** Refused on measurement, after all three of the objections this map
  expected to rest on dissolved. The corpus **fits a prompt** (2,023 rows, ~21.3k
  tokens against a 131k window), the secret has a home ([ADR-0070](0070-the-proxy-is-part-of-the-site-it-serves.md)
  put a Worker in the site and map [#474](https://github.com/palebluebytes/inventoria/issues/474)
  built a gated model route), and a pick costs **$0.00054**. What killed it is that
  the model cannot hold the list: 15 agreements at 120 candidate rows, 11 at 300,
  6 at 600, **1 at 2,023**, same prompt and same products throughout — and nothing
  can hand it 120 rows, because the 120-row arm was seeded with the answers.
  A chunked scan is the failure mode rather than the fallback: given 120 rows
  holding none of the right answers it proposes for 31 of 35 and is right **0**
  times, offering rutabagas for the kidney beans it had just refused on state
  grounds. (#247,
  [`docs/research/247-can-a-model-propose-a-pairing.md`](https://github.com/palebluebytes/inventoria/blob/prototype/247-model-pairing-proposer/docs/research/247-can-a-model-propose-a-pairing.md).)
- **Converting a cooked pack's reference food to a cooked basis.**
  [ADR-0048](0048-an-absent-measurement-is-not-a-zero.md) §3 already forbids the
  act in terms — _"not by rescaling an assay to an assumed dry or wet basis"_ — and
  letting the label's own energy supply the factor rescues the multiplier without
  rescuing the act. It also fails its own physics worst where the prize is: folate
  and potassium leach into the cooking water and the minerals largely do not, so an
  energy ratio is least trustworthy on exactly the twelve figures a pairing spends.
  ([#489](https://github.com/palebluebytes/inventoria/issues/489).)
- **A second meter band for estimated figures.** Prototyped as three seams over
  four real pairings and refused on its own surface: the seam that survives a panel
  row does not survive 6px of track, and twelve `NutrientCard`s each carrying one
  turn a day's readout into a chart.
  ([#244](https://github.com/palebluebytes/inventoria/issues/244),
  [`prototype/244-estimate-beside-measurement`](https://github.com/palebluebytes/inventoria/tree/prototype/244-estimate-beside-measurement).)
- **A shared pairing store of our own.** Refused mechanically rather than on
  judgement. [ADR-0096](0096-devices-converge-without-both-being-awake-through-a-store-of-sealed-deltas.md)
  §15 already reads _"an identifier that cannot rotate must never enter a retained
  surface"_; a GTIN cannot rotate, hashing it buys nothing at that entropy, and
  `scripts/worker-config-check.mjs` fails the build on a second bucket or a
  lifecycle exemption — so a pairing cache expiring at 30 days is not a cache.
  ([#246](https://github.com/palebluebytes/inventoria/issues/246).)
- **An energy veto over the macros both sources carry.** It looked free: one
  division, no new data, and it refuses both state gaps without anyone needing to
  know what a jar is. Measured within a declared state it has no case at all (§13).
  ([#496](https://github.com/palebluebytes/inventoria/issues/496),
  [`docs/research/496-the-energy-veto-within-one-state.md`](../research/496-the-energy-veto-within-one-state.md).)

### Scope

This record covers a food **captured from Open Food Facts by its barcode**, shown
beside a USDA reference food a person chose, in this app.

It does not cover, and its silences are not rulings on:

- **Filling one panel from two sources.** An OFF product's stored panel is never
  completed with USDA values in place. That is what ADR-0045 §5 forbids and what
  this record leaves forbidden; §8 says exactly how far the ban reaches.
- **Substituting a reference food for the scanned pack.** Barcode as a lookup
  shortcut with the label panel discarded is a different feature, and it destroys
  the transcription the user owns.
- **Reading a label photo with a model** (`ai-autofill.ts`,
  [#51](https://github.com/palebluebytes/inventoria/issues/51)). A larger effort
  with its own research; map #474 carries the app's one way to ask a model.
- **Pairing a hand-entered food** (§15), **contributing to Open Food Facts as the
  app** ([#504](https://github.com/palebluebytes/inventoria/issues/504)), **whether
  ADR-0032's four caps are the right caps**
  ([#506](https://github.com/palebluebytes/inventoria/issues/506)), and **a derived
  recipe nutrient already being a partial sum over its ingredients**
  ([#512](https://github.com/palebluebytes/inventoria/issues/512), named in §16
  because the `est` mark will otherwise be read as covering it).
- **Putting cooked records into the Search index.** ADR-0103 and ADR-0104 decided
  what a Reference food is on the shopper test, and _a pairing would like a target_
  is not an argument on that test. §11 ships them as a second set reached by one
  route only, which is a different act; it does not reopen the corpus's admission
  rule.

## Decision

### 1. A pairing annotates a packaged food; it never fills one

A **pairing** is one person's assertion that a named USDA reference food describes
the substance in their jar well enough to stand in for what the label left silent.
The Open Food Facts product stays the food. The reference food is shown beside it,
named, with its own source tag, and the two are never merged into one record.

Everything below is a consequence of that sentence, and where a clause looks like
a restriction it is usually this sentence applied to a new surface.

### 2. Only a person's explicit act makes a pairing a fact

Whatever proposes a candidate, a pairing exists because somebody accepted it.
Pre-_selecting_ is allowed; pre-_accepting_ is not. A figure reaching a meter
without a person having said yes is the collapse ADR-0048 §1 exists to prevent.

This is not softened by §9's finding that nothing proposes well enough to build.
It binds the **Curated pairing table** (§14), which pre-selects and never accepts,
and it binds anything a later record adds.

### 3. A pairing is a property of a capture, not of the corpus

It is your assertion about your jar, written as a datom on your twin and superseded
by appending. Two people can be right about one barcode — drained against in-brine,
this year's recipe against last year's. Nothing in this app holds a fact of the
form _barcode X is food Y_, and the twin's own datom is the whole of the
same-barcode cache.

### 4. The label always wins, and a reference food fills silence only where no label could have carried the figure

Where both sources carry a value, **the label's is shown and the reference's is not
shown at all** — not folded away, not behind a tap. An overlapping USDA value is
not a better measurement of your jar; it is an accurate measurement of a different
preparation.

Silence is the other half, and it is partitioned **by nutrient, never by
jurisdiction** ([#495](https://github.com/palebluebytes/inventoria/issues/495),
`pnpm limits:census`):

> A pairing may supply `cholesterol_content` and `trans_fat_content`. It may
> **never** supply `sodium_content` or `saturated_fat_content`.

Sodium and saturated fat are in the mandatory declaration under both EU 1169/2011
and 21 CFR 101.9, so their absence is a failed capture wherever the jar was sold
and a reference food may not cover for it. Cholesterol and trans fat are outside
the EU declaration, so a European pack is lawfully silent on both — and the
population agrees: 20 of 22 paired twins silent on cholesterol, 22 of 22 on trans
fat, and of 35 `gtin:` twins with a panel, **0 carry a non-zero trans fat**.

The per-jurisdiction version of this rule is **unsound, not merely unnecessary**,
and that is worth recording because the fact it would need is already in the
ledger. `countries_tags` rides in the raw provenance blob on 21 of 22 paired
twins — but it is a _sales_ list (`Premium Soy Sauce` names eight countries
including the United States), so it cannot say which panel is printed on the jar in
your hand; and 14 of those 21 sit under `twin/raw_provenance`, which
[ADR-0086](0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md)
§5 superseded and the shipped code does not read. The one twin carrying no
`countries_tags` at all is the one with no OFF record, which is precisely the
capture gap the rule refuses.

**A refused fill needs no surface and no new word.** It looks exactly like a
nutrient neither source carries, because that is what it is: the app has no
measurement of your jar's sodium and declines to invent one. `filled_fields` (§6)
simply never names those two keys.

### 5. The panel is one list, marked `est`. The meter does not change

Every nutrient sits in one list in normal panel order, in the shipped
`NutrientBreakdown` shape. A figure the reference food supplied is told apart from
one the manufacturer printed by a small **`est`** mark and a lighter weight —
nothing framed off, nothing in a second column, no dashed block. A nutrient both
sources carry shows the label's figure with no mark.

`ui/Meter.svelte` and [ADR-0037](0037-shared-meter-primitive.md)'s shared meter are
untouched, and **an estimated figure reaches the day's meters as measured**. So do
the amber over-limit tint and the _Biggest gaps_ chips.

The mark's meaning is one sentence and it is the same on a food and on a dish:
**not every figure in this row was printed on a label.** On a food's own panel
_not every_ happens to be _none_; a dish does not get a second, softer mark.

This overturns a clause the map called binding — _a paired estimate aggregates in a
distinct band_ — and it does so by **re-applying the owner's own precedent rather
than contradicting one**. ADR-0041's 2026-08-06 Amendment had already removed the
`·est` marker from the NOVA badge, on the stated ground that a calmer surface beats
an at-a-glance provenance cue, with the honesty moved one tap deeper. The map's
band clause was resting on a marker that no longer existed. §5 makes the same call
on a surface where the stakes are numbers rather than a word, and a reader of
ADR-0041 should take this as that amendment holding rather than as a new direction.

**The price, stated rather than discovered: the `est` mark is the sole carrier of
provenance on screen, and it has no backstop.** That is what the meter taking an
estimate as measured costs, and §6 is load-bearing rather than optional because of
it.

### 6. What a logged occasion freezes

For a Consumption Event whose target is a **food**, `event/metrics` is unchanged —
one blob, every number in it, the borrowed figures indistinguishable there because
that is what §5 already ruled the meter does with them — and a **sibling
`event/pairing`** names which keys the reference food supplied:

```json
{
  "entity": "event:consume_…",
  "attribute": "event/pairing",
  "value": {
    "ref": "fdc:173740",
    "name": "Beans, kidney, all types, mature seeds, cooked, boiled, without salt",
    "source_uri": "https://api.nal.usda.gov/fdc/v1/food/173740",
    "filled_fields": ["iron", "potassium", "folate", "magnesium"]
  }
}
```

That shape is `MergedSource` (`src/lib/food/provenance.ts:45`) in the event's
clothes: ADR-0045 §4 already requires a borrowed value to be traceable, and this is
the same fact about a different kind of source.

For a Consumption Event whose target is a **recipe**, there is no `event/pairing`
at all. **Each frozen ingredient row inside `event/instantiation` carries its own
`pairing`**, in the same four-key shape, nested so that the row's own `ref` and
`name` keep meaning the ingredient twin. A top-level list over the rows was refused
because it is not **reconstructible**: the row's numbers are frozen, so a reader
sums the marked rows and divides by the snapshot's own `yield` and gets the exact
borrowed share, where a list can only say that somewhere inside a sum something was
borrowed. The measurement that decided it: one live occasion froze **twelve** rows
naming **four** reference foods, and in that dish folate is 100% borrowed and
calcium 2.3%. A list would have said both with equal weight.
([#498](https://github.com/palebluebytes/inventoria/issues/498),
`pnpm recipes:census`.)

Three rules bind both shapes:

- **Omitted, never emitted empty.** A pairing that supplied nothing writes no
  `event/pairing` and no row-level `pairing`, following `buildRawProvenance`'s own
  rule, so absence means exactly one thing ledger-wide: _nothing here was supplied_.
- **The name is frozen** even though display identity is read live everywhere else
  in this projection, because it belongs to a **third** entity the corpus may drop —
  `fdcId 173740` has already left once — and the raw-export reader this is written
  for has no live lookup at all.
- **The reference food's own per-100 figures never travel.** They duplicate numbers
  `event/metrics` already holds and their only use would be a re-derivation
  ADR-0045's #147 amendment forbids.

The two attributes never co-occur, and a reader need not guess which shape is in
front of them: `event/instantiation` is already the thing that says _this is a
dish_, and is already where the app branches.

**The honesty test this was built against**, run against the result: _someone
reading a raw exported ledger, with no access to this app, must be able to tell
which numbers a manufacturer printed and which a pairing supplied — and for a dish,
which ingredient's._ They grep the event id out of the NDJSON ([ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md)
§1). Two lines come back. For a food, one carries every number and the other names
a USDA food, its URI and the keys that came from it; the intersection is the answer
and the difference is the label's. For a dish, neither line is `event/pairing`: one
carries the summed numbers and the other carries the rows, each with its own frozen
figures and, where one exists, its own `pairing`. A reader who has never heard of
pairing gets a complete, correctly-summing panel either way. **There is no third
category** — §10 having refused conversion, nothing in the ledger is a number this
app computed.

### 7. The twin's pairing is live; the occasion's copy is frozen

`food/pairing` on the `gtin:` twin is a **bare live `fdc:` id**, latest-datom-wins,
superseded by appending when you change your mind about your jar, cleared by
writing `""`. It carries no field list and no name: which reference food you chose
is the whole of your assertion, and what it fills is computed at read time from
whichever panel rows are silent now.

These are **two facts, not one fact serving two purposes**, and the relationship
needs no new principle — it is `recipe/batch_weight` standing beside
`event/instantiation.batch_weight` exactly ([ADR-0022](0022-recipe-instantiations-as-editable-snapshots.md)).
Two consequences follow and are stated rather than left to be found:

- Re-pair the jar tomorrow and yesterday's meal keeps marking exactly the rows
  yesterday's pairing supplied, under yesterday's reference food's name, even if
  that name has since left the corpus.
- Unpair it and yesterday's meal changes not at all.

So the two surfaces have different tenses: **a food's own panel is live**, re-read
each time and marking whatever is silent now; **a logged occasion's panel is
frozen**. A dish has both at once — the live template panel composed from its
ingredient twins as they stand, and the occasion's panel read off frozen rows — and
they can honestly disagree on screen at the same moment.

**An estimate never reaches a stored `nutrition/info`.** The panel datom stays
strictly the label and the marked rows are composed at read time. The narrow reason
is §1; the sharper one is that `nutrition/info` is user-writable as a label
correction ([ADR-0034](0034-label-photo-food-capture.md) §6), so a merged panel
would silently become a user-attributed transcription the first time somebody fixed
a typo in it, and the seam would be gone with no datom having lied.

### 8. A nutrient value may cross into a marked reading and a frozen occasion, and never into the product's stored panel (amends ADR-0108 §10)

ADR-0108 §10 ruled, answering [#242](https://github.com/palebluebytes/inventoria/issues/242):

> **A property of the substance may cross. A composition value may not.** A
> density, and what a household measure of the food weighs, may reach an OFF
> product from USDA. A nutrient value may never.

Read without qualification that forbids this whole record, and a reader landing on
§10 alone would build something this map has spent eleven tickets deciding against
building. So it is narrowed here rather than left to be read around.

**What §10's last sentence now reads as:** a nutrient value may never enter an OFF
product's **stored panel** (`nutrition/info`), and may never displace or sit beside
a figure the label carries. What it may do is be **shown in a marked reading** and
**frozen onto an occasion**, under §§4–7.

The narrowing is exactly the width of §10's own reasoning and no wider. §10 argues
from ADR-0045 §5's rationale — _"a panel built from one table's energy and
another's fibre describes no food that exists"_ — and from ADR-0045 §4's bar that
_"a merged panel must never present itself as a single record USDA served"_. Both
hazards are about a record **presenting itself as one coherent measurement of one
food**. Under §5 above nothing does: the borrowed rows are marked on every surface
that shows them, and the datom a later reader or a later editor touches is the
label's alone. §10's own cost paragraph draws the line at _"tolerable for a
household measure and would not be tolerable for a calorie"_ — a figure nobody can
tell from a measurement. A figure carrying a mark is not that figure.

**What the narrowing costs, said plainly.** The mark is a screen and the meter
discards it (§5), so a borrowed iron does move an amber tint and does count toward a
day's target as though the manufacturer had printed it. That is a real widening of
§10, and it is the reason this section exists instead of a silence.

### 9. No proposer, and no model

Nothing proposes a pairing. A person reaches it through the food search that
already ships over this corpus — no key, no network, single-digit milliseconds,
already the way every reference food enters this app — and against the 19 twins the
mechanical matcher says nothing about, a search box is not the worse answer, it is
the only one.

The rule the map carried throughout — **a pairing worker may only emit an identity,
never a number** — stands, and it is now a constraint on the **surface** rather than
a reassurance about the mechanism. #247 measured why: handed the whole corpus, a
model emitted six ids that are real rows naming a different food while its own
stated reason named the food correctly — peanut butter under the words "olive oil",
cornmeal under "Emmental cheese". Validating the id against the corpus catches
**one error in seven**. So the clause the map rested on — _a wrong pairing names a
food you can read and reject_ — holds only if the screen shows **the reference
food's own description**, and a screen showing a proposer's reason instead would
launder the other six. A search the user drives satisfies that by construction, and
anything added later must satisfy it explicitly.

Both of #247's reopening clauses are numeric and cheap to re-test (ten calls,
3,081 neurons re-ran everything): a model that, handed all 2,023 rows in one
prompt, puts the adjudicated row at top-1 for **15 of 22** pairable twins reopens
the lane whole; a retriever that puts the adjudicated row inside a **120-row**
candidate list for **20 of 22** reopens the adjudicator half alone.

### 10. A pairing never converts

A packaged food whose state has no reference food available to it is **not paired
at all**, and the affordance says so. Nothing is rescaled to a cooked or dry basis,
and nothing is calibrated by the label's own energy.

This is refused on records this app already obeys rather than on the population
being small, so it survives the corpus growing: ADR-0048 §3 names the act
(_"not by rescaling an assay to an assumed dry or wet basis"_), and ADR-0108 §10
permits neither a conversion nor a calibration, so the refusal needs no amendment
to it beyond §8's, which runs the other way.

Run through ADR-0108 §11's four counts — the one place this app's inference ban has
been carved before — a cooking factor holds one of four: it is not bounded by a
measured corpus with a stated spread, the user asserts the _pairing_ while the
factor would be the app's own claim about what cooking did, and being wrong costs
the whole panel rather than a percent of one nutrient.

The cooked case is met instead by **reaching the right record** (§11), which
computes nothing: USDA measured those foods and published them; they simply did not
ship.

### 11. The cooked records ship as a second set, reached only by a Declared state

**1,182 collapsed rows ship as the Pairing index and the Pairing nutrient store**
(`public/usda/pairing-index.json`, `public/usda/pairing-nutrient-store.json`),
fetched on demand and **precached by neither Facet**. Coverage goes 22 → 25 of the
35 measured twins, this map's chartered jar included, at ×1.22 with 98 nutrients.
([#497](https://github.com/palebluebytes/inventoria/issues/497),
[`docs/research/497-cooked-records-as-pairing-targets.md`](../research/497-cooked-records-as-pairing-targets.md);
[#510](https://github.com/palebluebytes/inventoria/issues/510).)

**A person's Declared state decides which set the pairing search reaches.** One
question about the pack in their hand — _cooked_, or _as you bought it_ — with two
values, defaulting to as-bought, and **nothing recorded**:

- **Two values, not three.** An _I don't know_ that shows both sets re-admits by
  the option nobody reads carefully the whole error this partition exists to
  refuse.
- **Defaulting to as-bought** means the 22 twins that already pair behave exactly
  as they do today, a person never meets the question unless they reach for it, and
  the second artifact's fetch stays off the common path. The declaration is a
  widening act, not a gate in front of pairing.
- **Nothing recorded**, because every row in the new artifact is a cooked record by
  construction: the target's own `fdc:` id **is** the state. Storing it would keep
  the question rather than the answer.
- **The partition is symmetric**, which is what makes it refuse both signs.
  Declaring _cooked_ reaches the 1,182 and never the 2,023; the default reaches the
  2,023 and never the 1,182. It refuses §10's forward error (a cooked pack onto a
  dried row) by the same construction as the reverse one — the **101** confusions
  #497 measured below ×0.7, where #489 found no signal at all.
- It asks a person to grade a **food-identity** claim about their own jar, never a
  composition claim, which is the line ADR-0034 §4 draws about what a person is
  well placed to judge.

**Two artifacts rather than one**, inheriting ADR-0047's argument that search never
reads a nutrient and staging reads all of them: the index when a person declares
_cooked_, the store when they accept a row. **On demand rather than bundled**,
against the direction #497 recorded, because the root Facet already fetches
`nutrient-store.json` on demand ([ADR-0077](0077-a-facet-precaches-its-own-weight.md)
§5 precaches `search-index.json` alone), so bundling would buy offline for the
pairing _search_ while the thing it pairs to stayed a fetch — and because under a
Declared state one bundled corpus with search-time predicates **is** the thing this
record puts out of scope. Neither Facet's `precacheBytes` moves, and that is safe by
construction rather than by care: both `precache` arrays are explicit literal lists,
nothing glob-shaped over `public/usda/`.

**The set is collapsed** — 1,182 rows, not 1,725 — because `CONTEXT.md` says an axis
classification holds corpus-wide. Not collapsing would assert that a trim and a
grade distinguish a food when you pair but not when you shop, which is a claim about
the **record**, and ADR-0103 decided on what an axis _is_ rather than on how far it
moves the calories.

**The index carries the same fields under a distinct type.** Narrowing was measured
and refused on bytes: the entire index is 28,853 B brotli, so dropping the unread
fields can save only a fraction of that, against a second builder and a second set
of tests. What earns the nominal type is not bytes — with an identical type
`buildSearchCorpus` will accept a pairing row, and the out-of-scope leak in the
Scope section above is one mistaken call away. A distinct type makes it a **compile
error**, which is the cheapest gate this decision can have.

**The Vocabulary map is shared, never duplicated**, because there is no path to
declaring a pack cooked that has not already loaded the shipped index's header. One
consequence falls out and is written here rather than discovered: `state_qualifiers`
holds only the six **uncooked** spellings, so nothing strips `cooked` or `boiled`
from a query, and a person searching the pairing set may type the cooking word.

**The shipped ranking is reused whole, and two of its twelve keys ride inert** over
a set where every row is cooked: `raw` (set from `describedRaw`, which no cooked
description satisfies) and `canonical` (a fixed id set drawn from shipped rows). A
constant key in a lexicographic comparator changes no order, so they cost nothing at
runtime — recorded because this repo has an inert ranking key in its memory
precisely for having gone unwritten. `plainSibling` and `designated` still do work,
recomputed over the pairing set.

### 12. Salt is the fourth Collapsing axis (amends ADR-0103 §2)

`with salt` / `without salt` is a **Collapsing axis**, corpus-wide, and narrow to
salt. Salting a pot while it boils is _something done to a food after it was
bought_, which is ADR-0103 §2's line, applied.

It has never needed classifying because cooked records never reached the variant
rules; re-admitting them under §11 brings it back at **145 pairs — 290 of the 1,182
rows, a quarter of the set**, of which #497 measured 130 agreeing within 10% on the
twelve nutrients a pairing may spend, and §4 forbids it spending the one they
reliably differ on.

**Corpus-wide rather than scoped to the pairing set**, and the reason is that the
coining changes **0 shipped rows**: today the two statements are mechanically the
same act and differ only in what the glossary claims, and given that, the
corpus-wide one is the true sentence.

**Narrow to salt, and explicitly not to preparation at large.** Boiled, braised and
roasted are also things done after buying, but a pack _names its cooking method_, so
merging those would erase a distinction the pack itself supplies.

`CollapsingAxisName` gains a fourth member, and the collapse account at
`docs/research/190-corpus-account.md` gains a second table covering the pairing arm,
with the shipped table staying byte-identical across the change. That is where the
0-shipped-rows claim becomes checkable rather than asserted, and it is the one
assertion this section is most exposed on. One honest edit falls out of it: the file
says what is left after ADR-0104 removed the cooked half is _purely butchery_, and
in the pairing arm it is butchery **and salt**.

### 13. There is no energy veto

The macros both sources carry are not spent. No threshold refuses a pairing.

The veto was the most attractive thing this map found and it does not survive
measurement. Inside a declared state all 25 adjudicated pairings land between ×0.24
and ×2.22, median ×1.03, **none above 2.5** — so the zero-cost band is that wide,
and cross-tabbed against #243's divergence instrument the two axes are
**anti-correlated**. The three rows the shipped ×2.5 rule catches are ×1.00 on all
twelve metered micronutrients, while every plausible wrong row that carries harm
sits inside the band: B12 at ×25.17 on a goat cheese at ×1.22, folate at ×9.48 on a
gluten-free pasta at ×1.01. All five of #243's hand-graded _a person would tap yes_
errors sit between ×0.74 and ×1.10.

**More data cannot fix this, and that is why the refusal is permanent rather than
provisional.** A wrong row matching your label on energy is a food resembling yours
in _macros_, which is exactly the condition under which a micronutrient differs by
an order of magnitude. **Energy is a macro; a pairing spends micros.** The veto
measures the one axis the transaction does not risk. Retroactively, that is also why
#497 found no wrong-food catch: a mis-aimed instrument, not a thin population.

What does the work instead: **§11's Declared state** for the state error, and **the
reference food's own description on the surface** (§9) for the identity.

The threshold was not merely retuned, and the reason is worth keeping: it rests on
**two one-row margins**, not one. `Pepinillo Laminado` at ×2.22 holds the high fence
0.98 from the boundary, and it is a sugar-loading difference rather than the
dry-food-plus-water asymmetry one-sidedness was argued from; the almond drink at
×0.24 holds the low one. The low arm is free and worthless besides — +26 refusals at
zero cost in right pairings, its most plausible catches being four
`Pickles, cucumber, sour/dill` rows at ×0.27–0.29, which is the right food in a
different brine.

Nothing is removed by this: the veto has never been in the app. It exists in
`pnpm pairing:census`, `pnpm targets:census` and `pnpm veto:census`, all three of
which keep it as a _measuring_ instrument, and this section costs a sentence rather
than a deletion.

### 14. Nothing contributes back to Open Food Facts; a Curated pairing table travels instead

A pairing contributes nothing to OFF. The ground is #243's measurement that **5 of
9 wrong proposals are the plausible kind**, so publishing pairing-derived categories
would launder plausible-but-wrong identity claims into a commons everyone reads.
This is a deferral with a numeric clause (_What would reopen this_, below), not
a refusal in principle.

What carries the shared benefit is **the Curated pairing table**: a hand-authored
TypeScript module, `src/lib/food/curated-pairings.ts`, on
[ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md)'s stand-in
precedent — type-import-only, so a bare runner's Node loads it with no install step,
which is what buys the gates. A **Curated pairing** is
`{ gtin, fdcId, set, product, captured, ground }`, where `set` is
`"reference" | "pairing-target"` and is **not lookup metadata**: §11 made the
target's own `fdc:` id the state, so a row naming a Pairing target _is_ the
assertion that the pack is cooked, and the field writes it once. Deriving the set
instead — _absent from the search index, so it must be a Pairing target_ — turns a
stale id into a phantom fetch of a 1,182-row artifact that will never hold it.

It ships **seeded with the 25 adjudicated rows**, because a table ratified and
delivering nothing is [#62](https://github.com/palebluebytes/inventoria/issues/62)
in miniature. The two alternatives are refused on fact rather than taste: a column
inside `search-index.json` is the hand edit `scripts/usda-account-check.mjs` exists
to catch, since it rebuilds that account byte for byte; and a third JSON in
`public/usda/` costs a `precache` edit and a re-declared `precacheBytes` band —
a human re-measurement — for an artifact weighing tens of bytes a row.

**What holds "curated only" is a shape plus a rate, and the first gate is honest
about being nothing.** No check can prove a row was hand-authored: the source module
means a row needs a commit, but a generator could write that file tomorrow. What
the commitment rests on is that every row carries a `ground` a reviewer reads, so
**a submission path scales only by deleting that field**, which is a visible act in
a diff. Beside that sit a **ceiling of 100 rows asserted by a test** — ADR-0046 §6's
exact shape, where reaching it means re-arguing the first reopening clause below
rather than
raising the number — and an **offline check in `pnpm check`** on
`scripts/density-class-check.mjs`'s shape: every `fdcId` resolves in the artifact its
`set` names, every `gtin` unique and well-formed, and no `gtin` appears in
`CURATED_STAND_INS`.

**At the surface a Curated pairing pre-selects and shows two things rather than
implying them** — the USDA row's own description (§9's condition) and the Declared
state the row asserts. One explicit act accepts both, per §2; either is a tap from
being changed. A fallback-only treatment is refused, because it hides the curated
claim exactly where it is load-bearing. **A curated row never overwrites a live
`food/pairing`**: the person's assertion about their own jar wins, and the table is a
prior rather than a fact.

**A cleared `food/pairing` is a refusal of the proposal, not of the food.** The
curated row is not re-offered for a twin carrying a cleared pairing, so the clear
means one thing ledger-wide; the pairing search stays one deliberate act away, so
re-pairing costs a tap and never a nag.

### 15. What may never be paired

- **A `recipe:` twin.** 0 of the ledger's 239 `nutrition/info` panels sit on one,
  because `recipe/ingredients` is pure references and the nutrition derives. There
  is no silence for a pairing to fill.
- **An `fdc:` twin.** It is the reference authority; the relationship has no second
  end.
- **A `food:custom_` twin.** These are the ledger's most silent food — 22
  hand-entered panels carrying 2 or 9 keys of a possible 24, every one silent on all
  twelve micronutrients — so they would fill _more_ meters than packs do. They are
  refused because **§4's partition does not transfer**: that rule is built on what a
  label could have carried, and a hand-entered silence is the user not typing rather
  than a manufacturer not declaring, so _sodium is a failed capture_ has no grip on
  it.
- **A barcode already carrying a Curated stand-in** (ADR-0046), in the **table**
  arm. A stand-in is admitted on an `absence` argued over the mirrored archives —
  `5010251341352`'s is a proof that no table carries a cream at the UK's 48%
  standard, every table halting a rung below at 35.6–36.1 g fat — so a Curated
  pairing for that barcode would assert the negation of the evidence that admitted
  it. **The refusal is narrow: it rules the table arm only.** Whether a person
  holding the tub may pair it themselves is open, and is the fourth reopening
  clause below.

### 16. The vocabulary, and the two words this record may not use

Six terms land in `CONTEXT.md` with this record: **Pairing target**, **Pairing
index**, **Pairing nutrient store**, **Declared state**, **Curated pairing**,
**Curated pairing table**. The **Reference food** entry is narrowed in one clause,
because it reads _a record USDA cooked before it measured it is not a Reference food
and does not ship_, and after §11 1,182 such records ship: it becomes \*does not ship
**in the Search index\***, plus a pointer to what ships beside it. The entry's own
shopper-test argument is load-bearing for ADR-0103 and ADR-0104 and is not otherwise
touched.

**Two words are spent and this record does not spend them again.**

- **`pairing list`** belongs to the **Twin ledger** under ADR-0048 §4's rule against
  a list that _creates_ merges — spent, and spent with the inverted connotation.
- **Bare `Pairing`** is already the glossary's name for the P2P act that makes two
  of your own devices Paired Devices (ADR-0096 §8). The food sense is therefore
  **never written bare in the glossary**; it lands only as a qualified term, and the
  attribute names `food/pairing` and `event/pairing` are unaffected because they are
  namespaced. #245 coined bare **Pairing** for the food sense on the ground that the
  map had said _pairing_ throughout, without the glossary having been checked; that
  coining does not land, and whichever ticket ships the datoms coins a qualified
  term instead.

**What this record does not name, and names on purpose.** `deriveRecipeNutrition`
totals an extra nutrient only across the ingredients that actually reported it — the
deliberate ADR-0030 rule against fabricating a 0 — so a dish's folate is already a
sum over 6 of its 12 rows, shown as the dish's own with nothing saying so. Pairing
**narrows** that and the `est` mark makes it worse by implication, because a reader
who learns _marked means partly borrowed_ will infer that an unmarked row is wholly
measured across every ingredient, which is false today and stays false. It is a
derivation defect rather than a provenance one, it predates pairing, and it is
[#512](https://github.com/palebluebytes/inventoria/issues/512). **The `est` mark is
not the complete account of what a derived row stands on.**

## Consequences

- **The prize is the reason and it is measured.** 22 of 35 twins pair today and 25
  under §11, each filling a median of 8.5 of the twelve metered micronutrients. The
  twelve targets stop being unreachable for a packaged diet, which is the first time
  that has been true.
- **A wrong pairing is now the standing risk, and nothing catches it.** §13 removed
  the only instrument anyone proposed, on the ground that it measured the wrong axis.
  What stands between a person and a wrong panel is the reference food's own
  description on screen and their own reading of it. #243's five plausible-wrong
  cases are what that has to be good enough for.
- **Provenance survives in exactly two places and neither has a backstop**: the
  `est` mark on the panel, and the datom. The meter discards it by design (§5).
- **The chartered jar is served, and only just.** `fdcId 173740` is reachable under
  §11 at ×1.22 with 98 nutrients. Had the cooked set not shipped it would have stayed
  unreachable, and this record would have closed a map that could not serve the case
  that opened it. Recorded because the §11 decision looked, for most of this map's
  life, like a corpus question rather than the load-bearing one.
- **A person typing reaches the cooked set; the dead matcher never could.** Probing
  the 1,182-row index, `black beans` and `yardlong beans` each put the adjudicated
  row **top-1**, while the OFF category tag and the pack's own language return
  nothing. One smaller thing came with it and is recorded rather than ticketed:
  `kidney beans` ranks a **sprouted** row above `fdcId 173740`. That is ADR-0103 and
  ADR-0104's neighbourhood, and it is survivable because the pick is a hand choice
  from rows showing their own descriptions.
- **The fill moves no amber, and nobody should cite one for it.** Over 14 logged
  days, 172 live events, days over cap are 2/1/2/0 and identical whether every
  silence is filled or none is. What moves is **bar length**, by up to 50× inside a
  cap. §4 is argued on honesty, not on harm avoided.
- **Every one of ADR-0032's four caps is already reachable by one serving of a
  reference food the corpus ships** — one egg is 138% of the day's cholesterol cap,
  49.8 g of butter is 114% of saturated fat and 82% of trans fat, with no pairing
  anywhere near it. Pairing widens the set of foods that reach a cap and did not
  cause this. Whether those are the right caps is #506.
- **Two artifacts are added to the wire and neither is installed.** 460,552 B and
  1,180,449 B raw (28,853 B and 127,575 B brotli), fetched only by someone who
  declares a pack cooked. A person who never does pays nothing.
- **The Curated pairing table's reach is bounded by one basket.** The seed is one
  person's shopping, so a stranger's coverage depends on overlapping it. That is the
  real limit on the shared benefit and the thing most likely to trip the first
  clause.
- **Drift is answered for delisting only.** The quarterly `curated:check` job
  already classifies GONE, panel-moved and no-longer-single-ingredient, and extending
  it to these barcodes costs rules rather than machinery. But a Curated pairing
  claims the barcode's _substance_, so what invalidates it is reformulation or GTIN
  reuse — and **reformulation under a stable GTIN is an undetected blind spot**,
  named here rather than dressed as covered, with the row's `captured` date making
  the claim's age auditable. A panel-drift threshold would be an instrument nobody
  has aimed, and §13 has just priced what a mis-aimed instrument costs.
- **Two gates cannot land ahead of the code, and this is mechanical rather than
  procedural.** `tests/unit/meal-payload.test.ts` partitions every attribute the EAVT
  registry marks `(reference)` into _walked by the closure_ or _declared as resolving
  inside its own Tracked Domain_, and fails at the moment somebody coins one in
  neither — so the registry entries for `food/pairing` and `event/pairing` ship with
  the code that answers the payload question, not with this record. Both are
  **declared**, not walked: the reference food does not cross in a sent meal, because
  you ate the jar and walking it would ship a searchable food nobody ate. For the
  recipe shape that partition **goes dark** — `event/instantiation` is already marked
  and already walked, so a nested `pairing.ref` is invisible to it — and the
  implementation owes one targeted `referencesOf` test pinning that an instantiation
  carrying a paired row yields the ingredient refs and not the reference food, plus
  one sentence in `refsIn`'s comment saying `pairing.ref` is deliberately not read.
- **Nothing here is built.** Implementation hands off as ordinary tickets. Three
  pieces are already specified and should not be re-derived: folding
  `pairing-target-census.mjs`'s `ACCEPTED` literal back into
  `scripts/pairing-adjudication.mjs`, whose header already says it was extracted so
  two measurements could not drift onto different populations and which has since
  drifted; **re-reading the 13 `state-gap` verdicts against the lifted 1,182-row
  set**, of which 3 became reachable and are now stale; and keeping the merged module
  type-import-only so the offline gate and the quarterly job can both load it.

### What would reopen this

Four clauses. The first three carry numbers, as `CODING_STANDARDS.md` §8 requires;
the fourth deliberately does not, and says why.

1. **A shared pairing store of our own** returns when the Curated pairing table
   covers **under 50%** of a basket's `gtin:` twins while hand adjudication of that
   same basket clears **65%** — measured per basket and never centrally, against 25
   of 35 rather than #246's original 22. There is no route to a population number
   that is not the usage heartbeat ADR-0096 §15 refused, so the clause trips on
   evidence somebody chooses to bring.
2. **Contributing pairings back to Open Food Facts** returns at **50 hand-adjudicated
   user-made pairings with a plausible-wrong rate under 2%** — the rate rather than
   the count, because #243 established that wrong-and-plausible is the number that
   matters, and 50 because it is the smallest sample that can distinguish 2% from
   zero at all.
3. **A model proposer** returns on either of #247's two clauses in §9.
4. **Whether a person may pair a barcode that carries a Curated stand-in** is open,
   and this is the one clause with no threshold in it, because nothing is waiting on
   a measurement. §15 rules the table arm only: a person holding the tub is not
   making a claim about the archives, and nobody has examined whether their own
   pairing of a stand-in's barcode is theirs to make. What reopens it is an argument,
   not a count.
