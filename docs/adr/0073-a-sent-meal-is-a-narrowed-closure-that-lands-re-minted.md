# ADR 0073: A sent meal is a narrowed closure, and it lands re-minted on the recipient's own clock

**Status:** Accepted  
**Date:** 2026-08-29  
**Amends:** [ADR-0067](0067-a-ledger-comes-back-by-merging-never-by-replacing.md) (§2's kept stamps and §3's advance-on-receive do **not** transfer to a payload from another person, and its Scope's deferral to #179 lands here)  
**Amends:** [ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md) (§2's `artifact` gains a sibling format, `inventoria-meal`, which shares the NDJSON grammar and shares no merge rule)  
**Amends:** [ADR-0014](0014-namespace-prefixes-for-eavt-entity-identification.md) (deterministic ids are finally used for the purpose that record states, and §5 adds a derived `event:consume_` id)  
**Amends:** [ADR-0058](0058-a-past-meal-is-copied-whole-at-the-amounts-logged.md) (its copy **is** the receive path, with an injectable event id in front of it)  
**Amended by:** [ADR-0076](0076-a-meals-closure-is-bounded-by-kind-not-by-reachability-alone.md) (§8.4 and §8.5 are enforced by entity kind, not by reach alone; §8 gains an eighth refusal on attribute namespace; and §8's premise that an unknown attribute rides unread is corrected, since two projections scope by attribute)

## Context

[ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md) settles how bytes
reach the other device. This record settles **what those bytes are and what they become
when they land**.

The unit is a **Past meal**: its Consumption Events plus the reference closure of the
Digital Twins they point at. The shape is
[ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md)'s NDJSON —
raw datoms, one JSON object per line — because one wire shape and one reader is worth
more than a bespoke format. Everything interesting is in what the closure is **narrowed
to** and what the recipient's ledger does with it.

Three facts forced the narrowing, measured over the app's own mappers on real source data
(`docs/research/196-past-meal-closure-measurements.md`,
`docs/research/199-large-meal-payload-measurements.md`):

- `twin/raw_provenance` is **39.8%** of a measured ledger, and it is the single reason a
  `gtin:` twin costs 23,904 gzipped bytes against an `fdc:` twin's 331 — a **58x**
  difference for two things a user cannot tell apart.
- The two copies of a label photo are **55.6%** of a measured ledger, and one photo takes
  a meal from 1 QR symbol to 106. Gzip cannot help: base64 JPEG compresses about 1.34:1.
- Post-narrowing, **Consumption Events are 45.2% of a large meal's payload against the
  twins' 40.0%**. A payload scales with how many times you logged something, not with how
  many distinct foods are involved. The earlier rate card said the opposite because it
  predated the narrowing.

### The alternatives that were live

- **Send ids, not twins** — a derived twin crosses as its id alone and the recipient
  regenerates the payload from the bundled corpus. Refused on measurement: dropping
  `twin/raw_provenance` alone captures **97.9%** of what id-only would save on the worst
  barcode meal and **93.1%** across a six-meal corpus, and every non-photo meal is already
  one QR symbol without it. Id-only buys nothing and costs a bundle-version coupling — the
  milk simplification (ADR-0061/0062) removed 74 corpus rows, so an id minted before a
  release need not resolve after it, and ADR-0051's twin fusion means a row can change
  _meaning_ between vintages.
- **Send ids plus a diff of the sender's edits.** Refused with the above: it optimises a
  payload that is already free, and it would have read the alias-widened `food/name` a
  vocabulary search produces as a spurious user correction.
- **A sender toggle for photos.** Refused: it puts a 164x cost behind a switch whose
  consequence no user can predict.
- **Merging a received twin at attribute granularity.** Refused in §6, on the projection
  order rather than on principle.

### Scope

This record covers the payload, the envelope, the refusals and the landing. It does not
cover the transport or the code (ADR-0072), the screens
([ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md)), or the
own-device half
([ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md)),
whose payload inverts three of the rules below and is a payload split rather than a wire
split.

**There is no inbox.** An earlier layer of this design specified a `localStorage` inbox
holding three payloads, refusing a fourth rather than evicting, with a sender-visible
"their inbox is full" state and a `ceiling x depth` budget invariant. §10 replaces all of
it. None of it is anywhere in this record, deliberately, so that nothing here invites a
store to be built.

## Decision

### 1. The closure carries winning facts only, not the whole history

The payload is the **winning datom per `(entity, attribute)`** — still raw rows, byte for
byte, so ADR-0064 §1's "never parsed and re-serialised" holds. It is a subset of lines,
not a projection.

ADR-0064 exports superseded facts because a durability backup **is** the log. A sent meal
is not a backup: the recipient is being given a food as it stands, not every correction
the sender ever made to it, and superseded rows are cost with no reader on the far side.

**This is the first of three rules that invert for the own-device half** (ADR-0075 §7).

### 2. Exactly three attributes never cross, and the list is exhaustive

`twin/raw_provenance`, `food/label_photos` and `food/photo_base64`. **Every other
attribute crosses verbatim.**

That takes the worst measured meal from **106 QR symbols to one**, and a `gtin:` twin from
58x an `fdc:` twin to rough parity.

Photos do not cross primarily for the bytes. **A label photo is a record of the sender's
capture act** — evidence that these numbers came off that label — not a property of the
food. The recipient did not take it and cannot audit it against anything. Provenance is
the same kind of thing, plus §3's rebuild.

`food/label_capture` and `food/manual_entry` are the same _kind_ of record and **cross
anyway**, because **the omission list being short and enumerable is worth more than the
principle being pure**. Three named attributes is a rule a reader can check and this record
can state in a sentence; "everything recording the sender's act" is a principle every
future attribute would have to be re-adjudicated against. `food/manual_entry` earns it
outright — its `kind` is the sole input to `isCatalogueFood`, so dropping it would silently
change whether a received menu dish is reusable. `food/label_capture` has no live reader at
all and rides on the list being short rather than on its own merit. Said out loud so this
record does not overclaim.

**Second inversion for the own-device half**, which carries photos.

### 3. `fdc:` provenance is rebuilt locally; `gtin:` provenance is not rebuilt at all

Where the recipient can rebuild the omitted provenance from a source **it already holds**,
it does. Today that means `fdc:` only: `SearchableFood.row` retains the raw index row, so
`mapIndexRowToPayload(row)` regenerates the identical blob deterministically from the
bundle already loaded for search — offline, and with no network.

- **At accept**, in the same append, because it is part of what the user agreed to.
- **As a datom**, not a read-through: it is a fact this device derived from its own bundle,
  stamped on its own clock, consistent with §7. A read-through would make every NOVA badge
  re-parse the corpus.
- **An absent row is a silent degradation, never a refusal.** A different corpus vintage,
  or a row a membership filter dropped, lands the twin without provenance and the badge
  reads "not rated", which
  [ADR-0041](0041-nova-processing-badge.md) §2 already reserves as the neutral,
  never-a-warning answer for a food that cannot be judged.

**`gtin:` is not rebuilt.** The only path is re-fetching Open Food Facts, which needs
network at accept time and would tell OFF's servers which barcodes you were sent. **Turning
acceptance into a third-party disclosure is not admissible**, and the asymmetry runs the
right way: `deriveNovaVerdict` reads provenance only for `fdc:`, the cheap twin, while
OFF's NOVA rides the separately-lifted `food/assessment`, which crosses.

### 4. The envelope: a distinct artifact that declares its closure roots

A meal payload's line one is an envelope carrying:

- **`artifact: "inventoria-meal"`**, never `inventoria-ledger`. If it shared the name,
  **Settings → Import Ledger would swallow it** — merging it with foreign stamps and
  bypassing the re-mint, the skip rule, the restamp and every refusal below. ADR-0064 §2
  put `artifact` on line one precisely to stop that, and two formats whose merge rules
  differ must not share a name. The ledger reader refuses a meal by name; the meal reader
  refuses a ledger by name.
- **its own `schema_version`**, moving independently of the export format's and read
  against a supported _list_, following ADR-0067 §4.
- **the closure `roots`**: which `event:consume_` ids constitute the meal. Without them a
  reader cannot tell a closure from an arbitrary bag of datoms, and §8.5 is not
  expressible.

It carries **no `device_id` and no row count**. Sender identity exists nowhere at all
(§11), and §9 counts bytes rather than believing a declaration.

Map decision 6 survives: same NDJSON grammar, same verbatim rows, different envelope and
different rules. A _shape_ shared, not a format merged.

### 5. The Consumption Event is re-minted from a deterministic id; every twin crosses with its id intact

`copyPastMeal` already mints a fresh `event:consume_` and carries `event/target` through
untouched. Receiving is that operation **with a wire in front of it**, so there is **no
closure rewrite at all** and every reference inside the payload still resolves.

The event is re-minted because it is a claim about _the recipient_ eating: their clock,
their day, their Meal Type. The twins are not claims about anyone; they are shared
descriptions of food, which is the whole reason ADR-0014 made ids deterministic.

**Minted twin ids (`food:custom_`, `recipe:`) cross verbatim**, not re-minted. That buys
free deduplication: send the same homemade granola twice and the recipient gets one twin,
where re-minting would leave two identical foods in their catalogue forever. The objection
that this imports a stranger's uuid is real and empty — the uuid is opaque, identifies
nobody, and cannot collide.

**The re-minted event id is derived, not random.** `logFoodConsumption` mints
`event:consume_${random}_${timestamp}` fresh on every call, so a second accept of the same
payload would log the meal twice. The recipient's event id is instead a **deterministic
function of the payload's declared root** — the first half of a SHA-256 over the root
entity id, rendered hex — so a second accept produces the same entity id, `INSERT OR
IGNORE` absorbs it, and no ordering can duplicate anything. It encodes nothing about the
sender: a hash of an opaque uuid identifies nobody, and §11's refusal of sender identity
holds.

Two costs, stated. The receive path is `copyPastMeal` **with an injectable id** rather
than literally that function. And **a meal sent twice deliberately is accepted once** —
the same idempotence the twins already get, applied to the occasion.

**The `recipe:` entity crosses whole**, at 414 gzipped bytes. Omitting it and letting
`Instantiation.based_on` dangle looked clean and is wrong: `based_on` **equals**
`event/target`, and the logged row's display name is got by resolving `event/target` to the
twin's `recipe/name`, so omitting the recipe lands a **nameless row**. Carrying only
`recipe/name` is no better, because the recipe browse list is a query on that attribute
alone and a name-only recipe appears in the list and opens empty. **The recipient gains a
working recipe they did not author** — a consequence to state plainly rather than a defect.
You sent them what you made.

### 6. An entity the recipient already holds is skipped whole

Not merged, not latest-wins. If the ledger holds **any** datom for that entity, every line
the payload carries for it is discarded, and the meal logs against the twin they already
have. One `SELECT 1 FROM datoms WHERE entity = ?`.

Projections read in ascending HLC order and take the last, so a plain merge means **the
sender's numbers overwrite the recipient's own corrections** whenever the sender's stamp is
greater — and `hlc_ms` is wall-clock-seeded, so a sender with a fast phone wins. The user
accepted _a meal_. "Nothing writes unseen" holds at attribute granularity or it does not
hold at all.

**This rule is exactly wrong between one person's own devices**, where the whole point is
that a later fact wins. ADR-0075 §7 inverts it.

### 7. Everything is restamped, and `Hlc.update` is never called against another person's payload

ADR-0067 §2 calls import "the one write path that keeps a stamp it did not issue" and §3
advances the local clock to the greatest stamp carried. **Neither transfers here.** §2's
justification is that a re-imported row _is the same row_; a received twin is a fact this
device is learning for the first time.

§3 is the deciding one. Keeping foreign stamps _requires_ advancing the clock to them, so
**a sender whose phone is set to 2030 permanently drags the recipient's clock forward** —
every subsequent local write stamps at 2030, from accepting one meal. With your own file
that is self-inflicted; from another person it is not, and bounding it is strictly worse
than closing it.

So every row lands on the recipient's own clock, **no foreign `device_id` ever enters the
ledger**, and an accepted meal is one coherent moment on their timeline. The cost is that
this erases the free provenance mark a foreign `device_id` would have given, which is why
§11 exists.

**Third inversion for the own-device half**, and the sharpest: there, keeping stamps and
advancing on receive **is** the convergence mechanism.

### 8. Seven refusals, judged at receive, in one pass

**Judged when the payload arrives, before anything is shown** — so a hostile payload never
reaches the screen, and the failure lands while the sender is still present to be told.
Accept re-checks nothing; only §6's skip rule is evaluated then, against the ledger as it
stands.

**One pass, not two.** ADR-0067 §5 reads a file twice to promise all-or-nothing over
something too large for memory. A payload is single-digit KB, arrives over a wire _into_
memory, and is bounded by §9, so checking everything before writing anything is free.
Stated explicitly because the next reader will go looking for the second pass.

1. **`artifact` is not `inventoria-meal`.** A separate message from (2), and neither claims
   the payload is newer — ADR-0067 §4's rule, verbatim.
2. **`schema_version` is not one this reader understands.**
3. **A line is not valid JSON, or not a well-formed datom row.** The same grammar checks as
   `ledger-import.ts`.
4. **The envelope declares a root the lines do not carry, or declares none.**
5. **An entity is not reachable from the declared roots.** This is the clause doing the
   security work. Without it a "meal" can carry `settings/food/targets`, a `habit:` or a
   `notes/op`, and §6 only skips entities the recipient _already holds_, so anything
   unfamiliar would land unseen. The reader recomputes the closure from the roots and
   refuses everything outside it.
6. **A reference does not resolve inside the payload** — `event/target`,
   `instantiation.based_on`, `instantiation.ingredients[].ref`, `recipe/ingredients[].ref`.
   The payload must be **self-contained**: the sender cannot know what the recipient holds,
   so completeness is the sender's obligation and unresolvability means a truncated
   closure. This is the check that catches §5's nameless-row failure.
7. **One of §2's three forbidden attributes is present.** Refused rather than silently
   dropped: a recipient quietly given less than was sent cannot tell.

**An unknown _attribute_ is explicitly not a refusal.** (5) already contains the threat: an
unknown attribute can only ride an entity the closure reaches, so it is a fact about a
food, harmless if unread. Refusing it would need a hand-maintained allow-list mirroring
`docs/eavt-vocabulary.md`, and ADR-0014's own amendment records what keeping a growing list
inside a fixed decision costs.

### 9. The ceiling is 1 MiB, on decoded bytes, counted incrementally

**1 MiB.** That is **8.9x** a large complex meal (30 foods, three cooked dishes, 114.6 KiB
raw) and **4.6x** an implausible 60-food feast (224.0 KiB raw). The governing rule, which
matters more than the number:

> **The ceiling exists to bound a hostile payload and must never be the reason an honest
> meal cannot be sent. If it ever would be, the ceiling is wrong, not the meal.**

An earlier figure of 256 KiB was justified as "~40x the measured worst case". It is
**2.2x**: the arithmetic was never at fault, it inherited a 6 KB figure from a corpus that
varied the _kind_ of food and never the _number_, so nobody had priced a big meal. A
60-food feast is 87% of 256 KiB and a 120-food payload exceeds it, and **nothing caps the
foods in a meal**.

**The ceiling counts decoded bytes, incrementally, aborting the moment it is crossed.**
ADR-0064 §6 measures on bytes actually received rather than a declared length, which is
right against a lying length and wrong against a compressing transport: these payloads gzip
about **9:1**, so 1 MiB received would decode to roughly 9 MiB — a decompression bomb that
passes the ceiling as written and then exhausts memory. So **two bounds, both on bytes
counted rather than declared**: 1 MiB on decoded bytes at the recipient, which is the bound
that refuses a meal, and ADR-0072 §11.3's smaller wire-byte backstop at the relay, which
never is.

**The figures above are a dated measurement with a named harness**
(`docs/research/199-large-meal-harness.mts`, 2026-08-28), not a fact about the app. A test
asserts the **invariant** — a synthesised large meal stays under the ceiling — and must
never assert 114.6 KiB, which would fail on every corpus regeneration.

### 10. Nothing holds an unaccepted meal: the receiving surface **is** the hold

A payload that arrives, passes §8 and is then neither accepted nor discarded is
**destroyed**. It is held in memory for the life of the receiving view and nowhere else —
no `localStorage`, no OPFS file, no second table, no expiry timer, no sweep.

The argument is not simplicity. **ADR-0072 §5 already bought the recovery**: a send is
synchronous, so both people are present at the moment of delivery _by definition_. If the
hold evaporates seconds later the sender is still there, and minting another code is the
same step-down the design uses for every other failure. A store exists to survive the
absence of the person who sent the thing, and that absence cannot occur while the loss is
fresh.

Four clauses follow, and each is a rule rather than a detail:

- **Abandonment is one event, not three.** Deliberate exit, backgrounding and an OS purge
  are treated identically, because the runtime cannot tell them apart — `pagehide` and
  `visibilitychange` fire for the deliberate and the involuntary alike, and a hard purge
  fires nothing. Two behaviours the runtime cannot distinguish is a fiction that would be
  written down here and then not be true.
- **The boundary is the receiving surface, not the tab.** This app has no router, so a
  payload held in a component _could_ survive wandering to another Tab and back. It does
  not: **leaving is declining**, by any route. The alternative rebuilds the reader problem
  at smaller scale — an invisible meal whose survival depends on whether a reload happened
  is a rule the user cannot see, predict or be told.
- **Leaving does not ask.** Guarding a loss just priced as cheap with a modal is
  incoherent, and it would be the first chrome in a flow ADR-0074 builds with none. If a
  prompt is ever warranted, this section was wrong and should be reopened rather than
  patched.
- **Nothing of another person's ever persists on your device unless you accepted it.** That
  is discharged **by construction rather than by policy**: there is no retention rule
  because there is nothing to retain, and no place to inspect because there is nothing to
  inspect.

**An abandoned receive is indistinguishable from a decline**, and the sender was told
delivery rather than acceptance (ADR-0072 §7). That is the privacy property working, not a
hole in it, and it is recorded because it is the first thing a later reader will think was
missed.

**The cold-boot window that could have reopened this is measured out of existence.**
Delivery completing before the app can show the meal would have been a genuinely silent
loss, unlike an abandoned receive. It cannot happen: an installed PWA makes **0 pre-mount
requests** with everything precached, and SQLite is entirely **off** the mount path —
joining the room needs a WebSocket and `crypto.subtle`, not the ledger, so receive,
seal-verify and display all complete before OPFS is ready. Against ADR-0072 §11.4's
five-minute room, boot is orders of magnitude inside budget.

### 11. A received food is marked as having arrived, and the mark is display-only

§7 erased the free provenance mark, so it is written explicitly. **One attribute,
`food/arrival`**, in the same family as `food/manual_entry` and `food/label_capture`: a
record of _how this food came to be here_, never _who sent it_. Registered in
`docs/eavt-vocabulary.md` alongside its siblings. "Arrived by send" is a capture method,
not an authorship claim, and no author or owner concept enters the ledger.

**It fixes a live defect rather than decorating.** `foodSourceView` reads
`twin/raw_provenance.adapter`, then the entity prefix, then falls through to `manual`. A
received `food:custom_` twin carries no provenance and matches no prefix, so today it would
render as **manual entry — a false claim that the recipient hand-authored it.** The mark is
what `foodSourceView` says instead, and it is also what explains an absent NOVA verdict on
a received `gtin:` twin whose provenance §3 refuses to rebuild.

**It is display-only.** It does not gate reuse, does not exclude the food from Recent, does
not exclude it from search, and does not annotate the recipe list. Anything more would
build a second-class citizen into a ledger that has no such concept, and would contradict
re-minting, which exists precisely to make the meal theirs. Two consequences follow and are
stated rather than defended against: reusability is **inherited from the sender's own
classification**, because `isCatalogueFood` reads `food/manual_entry.kind`, which crosses;
and an accepted meal's foods enter **Recent** like any other logged foods, so accepting a
meal can displace the recipient's own recent suggestions against
[ADR-0057](0057-the-recent-list-is-the-meals-default-content.md)'s cap of twelve.

**Sender identity does not exist anywhere.** Not in the ledger, not in the envelope, not in
the receiving view. A self-declared name is unauthenticated, so it is worse than nothing:
it invites exactly the trust that human inspection is supposed to supply. And there is no
gap to fill — **the recipient knows who it is from because they started the receive.**

## Consequences

**The integrity of the recipient's ledger is largely bought before the code is.** §8.5
stops a payload smuggling anything outside the closure, nothing is written before a human
taps accept, and §6 means an entity they already hold is never overwritten. **The worst a
successful impostor achieves is a plausible-looking fake meal on a screen, which a human
reads before accepting** — a lie about food, not a write nobody saw. That is the argument
for not importing magic wormhole's apparatus wholesale: it protects a file the recipient
cannot inspect before it lands, and this payload is inspected by a person before a single
row is written.

**A recipe you did not author appears in your recipe list**, per §5. It is a working
recipe, browsable and re-loggable, and it is what was sent.

**A received `gtin:` food has no NOVA verdict and no photo**, per §2 and §3. Both degrade
to the neutral answer rather than to a warning.

**Accept is idempotent and a deliberate second send is absorbed**, per §5. That is the
price of never being able to duplicate a meal by accident, and it is the right way round:
the loss from a swallowed second send is one visible meal the user can log again, while a
duplicate is a silent double-count in a day's totals.

**Three earlier clauses of this design are retired rather than trimmed**, so nobody
re-derives the store they assume: the inbox depth of three, the `ceiling x depth ≤ the
localStorage budget` invariant, and the sender-visible "their inbox is full" state with the
screen it implied. §9 keeps the number and replaces its justification, which is more honest
than re-deriving one against a memory bound nobody has measured; §10 removes the rest. The
`localStorage` inbox is not a smaller store — it is no store.

**Nothing here reaches the own-device half**, which pays `twin/raw_provenance` and the
photos in full. That is deliberate and is ADR-0075's to defend.
