# ADR 0053: An empty food search is recorded locally, and leaves the device only by hand

**Status:** Accepted  
**Date:** 2026-08-23  
**Amended by:** the Amendment below, which moves the log out of the ledger into `localStorage` — §6's redaction and §7's retention cap both require deleting a datom, which `AGENTS.md` §3 forbids

## Context

Three open questions in this repo want the same fact, and none of them can get it.

[#142](https://github.com/palebluebytes/inventoria/issues/142) asks whether the
vocabulary fallback should substitute a synonym found _inside_ a longer query —
`aubergine` expands today and `raw aubergine` does not.
[`docs/research/142-carrier-phrase-sweep.md`](../research/142-carrier-phrase-sweep.md)
measured what such a tier could reach: **72 of 348 probes rescued, across 48 of 58
keys, which deflate to 28 distinct foods of 35.** What it could not measure is
whether anyone types those phrases. Its §6 states the ceiling plainly and then
overstates it, calling query evidence unavailable "here and later" — that is a v1
scoping decision written as a permanent fact, and it is corrected in the same change
as this record.

[#123](https://github.com/palebluebytes/inventoria/issues/123) wants to know which
foods users miss, so that [ADR-0046](0046-curated-stand-ins-for-base-foods-usda-lacks.md)
§2's admission bar is applied to foods somebody actually looked for. Its body names
the gap in its own words: "nothing tells us which foods users actually miss" —
candidates today come from reasoning about likely neighbours.

And [ADR-0049](0049-a-derived-vocabulary-for-food-search.md)'s Consequences concede
the same thing about the mechanism that already shipped: "425 is reach, not usage,
and this record should not be read as claiming otherwise." The vocabulary fallback
has been in the app since #140 and has never had a usage number.

One instrument answers all three. This record decides its shape, and
[#149](https://github.com/palebluebytes/inventoria/issues/149) builds it.

### The alternatives that were live

**Build the per-token tier on the sweep's reach number.** Rejected, and rejected by
the sweep's own pre-registration rather than after the fact: §6 says a positive
result "establishes that the mechanism has something to reach, which is strictly
less than establishing that it is worth reaching for."
[#130](https://github.com/palebluebytes/inventoria/issues/130) exists precisely to
stop unmeasured mechanisms being added, and reach is not the measurement.

**Close #142 as a permanent no.** Rejected because it converts a v1 scoping call
into a law of the project. It would also condemn the sweep retroactively: if usage
were the deciding fact and were known to be unobtainable, the four commits that
measured reach should never have been authorised.

**Off-device query telemetry.** Rejected on the merits, not on cost. The search
corpus is bundled and runs offline so that nothing leaves the device
([ADR-0047](0047-bundle-the-usda-archives-and-retire-the-api.md) §1), and a
food search is a record of what someone was thinking about eating — for a
health-adjacent app that can imply a condition, a pregnancy or a disorder.

**Capture only when the user asks to request a food** — #123's own shape. Rejected
on sampling. A user who types `raw aubergine`, sees nothing and knows the food
exists deletes a word and tries again; they do not press a button. An action-gated
log under-samples exactly the population #142 needs, and would return a null that
looks like evidence and is not.

**Log every empty search.** Rejected on noise. The search fires on a 120 ms debounce
from three characters up, sized deliberately so results track the word rather than
waiting for it (`FoodStager.svelte:778`). Typing `raw aubergine` produces roughly
eleven searches, ten of them keystroke states.

### Scope

This record governs what is recorded when a reference-food search finds nothing,
where that record lives, and how it leaves the device. It changes no search, no
ranking, no filter, no vocabulary and no corpus, and it does not touch the
empty-state copy — [#123](https://github.com/palebluebytes/inventoria/issues/123)
still owns that, and this record deliberately does not build its request action.

**It does not decide #142.** It builds the instrument whose reading will, under a
bar pre-registered in §7 below rather than chosen once the numbers are in.

**What is recorded here is not telemetry.** Nothing is transmitted. Nothing is
aggregated off-device. Nothing leaves at all except through an export the user
performs by hand, having read the whole of what they are exporting. The v1
descoping of query telemetry is untouched by this record, and a reader who takes
this as reopening it has misread it.

## Decision

### 1. Recording is local and unconditional; export is the consent event

Empty searches are recorded without a toggle. A recorder gated behind an opt-in
that defaults to off measures nothing, and an instrument that only fires for users
who went looking for it samples the wrong people.

This is not a weakening of consent, because **nothing is disclosed by recording.**
The ledger already holds a complete history of everything its owner has eaten,
which is far more sensitive than a list of words that returned no result, and it
holds it without a toggle for the same reason: on a local-first app, a local record
is state rather than a disclosure. The disclosure is the export, and that is where
consent belongs.

Export therefore takes the model-C shape
[ADR-0034](0034-label-photo-food-capture.md) §8 already establishes for
contributing to Open Food Facts: a master setting that defaults to off, plus a
review of the actual payload shown before anything is written.

Settings carries three controls beside the master toggle — the current entry count,
an off switch for recording, and an action that clears the log. Control and
discoverability are provided by those; they are not provided by making the
instrument opt-in.

### 2. One entry per settled search session, never one per search

A search session begins when the food search field is first non-empty and ends when
the user abandons it, clears it, or stages a food. **One entry is appended per
session, and only if that session ever reached an empty result.**

The entry records the last query text that returned nothing — not every debounced
state on the way to it.

This is not only noise reduction. If a session goes `raw aubergine` → nothing →
`aubergine` → eggplant, the entry holds both halves, and that is a **saved retry
observed directly** rather than inferred from a count of empty queries. The unit
#142 is actually about is retries saved: every food the sweep found is already
reachable today by deleting a word, so the tier makes nothing reachable that is
not — it spares a user a guess about a mechanism they cannot see.

### 3. An entry's shape, under a new `search/` namespace

| Attribute           | Holds                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `search/query`      | The final text that returned nothing                                                        |
| `search/outcome`    | `nothing`, `rescued_by_vocabulary`, or `resolved_after_correction` with the correcting text |
| `search/settled`    | False when the session was abandoned mid-word, so it can be excluded from a denominator     |
| `search/vocabulary` | The §4 flags, the subset bucket, and the search index `schema_version` current at capture   |

`docs/eavt-vocabulary.md` is the canonical registry for the namespace and
`CONTEXT.md` for the term; both are updated in the change that adds them, per
`AGENTS.md` §2.

**Only a genuine no-food is recorded.** `searchUsdaFoods` throws
`NoReferenceFoodError` when nothing matched and a plain `Error` for a fault, a
distinction that exists so "a broken artifact or a broken service worker is never
folded into 'no food found'" (`src/lib/food/food-search.ts:145`). A log that fired
on both would count an offline corpus fetch as a vocabulary miss.

**A vocabulary-rescued query is recorded too**, under its own outcome. It cost one
enum value, and it produces the first usage number ADR-0049's fallback has ever
had.

### 4. Vocabulary flags are stored as captured and recomputed at read

A flag says whether the empty query contained a vocabulary key as one token among
several, and which subset that key belongs to.

**The subset is all 124 single-token keys, not 58.** The sweep's §7.3 excludes keys
with multi-token values on the grounds that they are "a phrase substitution, which
is a different and larger mechanism"; that conflates the arity of the key with the
arity of the value. Replacing the single token `chilli` with `chili pepper` is one
substitution, positionally unambiguous, and no more combinatorial than replacing it
with `chile`. The genuinely different mechanism is a multi-token _key_, which needs
a windowed match. The 66 excluded keys carry much of the everyday traffic this arc
exists for — `cornflour → corn flour`, `daikon → white radish`,
`blackcurrant → black currant`, `borlotti → cranberry bean`. Which of the two
buckets a key falls in is recorded, so the evidence can be read at either boundary
without a second collection window.

**Matching is by stem, never by prefix.** The whole-phrase tier prefix-matches so
that `aubergin` reaches `aubergine` mid-keystroke; a mid-phrase prefix substitution
is a mechanism nobody has proposed, and the instrument must not quietly build a
case for one.

**Flags are recomputed at read against the current map, and the capture-time flags
are kept.** The vocabulary re-derives from the corpus on every filter change — #142
alone was re-sized four times, 425 → 446 → 453 keys and 64 → 62 → 58 for the
subset — and #134 and #137 are both open and both move the corpus. Keeping both
readings is what makes a session that would have been rescued then and would not be
now visible as a finding about churn rather than invisible as a discrepancy.

### 5. Only the reference-food search is instrumented

`FoodStager`'s search over the bundled USDA corpus, and nothing else. `CategoryPicker`
searches OFF categories on its own debounce, and recipe ingredient resolution and
the Recent filter search other things again. Both consumers of this log read the
USDA corpus; widening the instrument would mix populations that share nothing but
the word "search".

### 6. The log leaves only through a reviewed export, and rides along with nothing

Export writes JSON, after the full log has been shown for review. Redaction is
**deletion from the log**, not exclusion from one export: two states would mean the
review screen shows something other than what exists, which is the wrong direction
for a consent surface.

**The `search/` namespace is excluded from
[#105](https://github.com/palebluebytes/inventoria/issues/105)'s wholesale ledger
export and from its peer-to-peer sync.** That ticket asks for both, and both would
carry this log by default — the backup without the review §1 requires, the sync to
a second device with no consent event at all. This clause constrains #105 rather
than asking it to remember: a mechanism justified entirely by "nothing leaves
without review" must not acquire two paths that do exactly that.

The cost is that restoring a device loses its search log. That is six weeks of words
that returned nothing, and it is the right thing to lose.

### 7. The bar, pre-registered

Registered here, before the instrument exists, for the reason the sweep's §7 gives:
a threshold chosen once the numbers are in is a rationalisation.

- **Readable at 40 settled empty sessions**, over a window of **six weeks** of
  ordinary use.
- **#142 builds if ≥ 15% of those sessions contain a mid-phrase vocabulary key** —
  six of forty.
- **If six weeks closes short of 40, #142 is decided on the sweep's reach number
  and the window is not extended.** An instrument that can be run until it says
  something is not an instrument.
- **Retention is the last 200 entries**, oldest dropped.

The 40 and the 15% are estimates made without usage data, which is the thing being
measured; they are pinned here so that moving them is a visible act.

## Consequences

**#142 stops being a build question and becomes a blocked one.** It stays open,
carrying the sweep's number and this instrument as its blocker, and it will be
settled by a reading rather than by a judgement about 28 foods.

**Two corrections land on #142 whatever the log says.** Its benefit is retries
saved, not foods reached — all 28 are reachable today by deleting a word. And the
sweep's §7.1 band 3, which said "cut a build ticket" at ≥ 20 rescues and was cleared
at 47, was **mis-drafted rather than overruled**: it named an action the same
document's §6 says a reach measurement cannot license. The rule that survives is
that a pre-registered band must name a decision its own measurement can support —
and §7 above is written to that rule.

**ADR-0049's fallback gets priced.** Its Consequences have conceded since it was
written that 425 was reach and not usage. `rescued_by_vocabulary` is the first
evidence either way, and it may show the shipped mechanism earns less than the
unbuilt one would.

**#123 loses its capture half and keeps its hard question.** Where a food request
goes is still unanswered and still its own; what it gains is a demand signal that
does not depend on anyone pressing a button.

**A new namespace on a ledger that is deliberately domain-shaped.** `event/`,
`food/`, `habit/`, `recipe/`, `twin/` and `settings/` all name things the app is
about. `search/` names something the app _does_, and it is the first of its kind
here. If more instrumentation follows it, that is a drift worth noticing early
rather than a precedent to lean on.

**A record of what its owner searched for now exists on the device.** It is less
sensitive than the eating history beside it and it is not nothing. §1's controls,
§6's single egress and §7's retention cap are the whole of the mitigation, and they
are deliberately modest.

**Six weeks is a calendar, not a mechanism.** Nothing will prompt anyone to read
the log; the entry count in Settings is the only affordance, and it will be missed
if nobody looks. That is accepted rather than solved, because the alternative is a
nagging surface built for an audience of one.

**The bar may be wrong.** Forty sessions is a guess about how much one person uses
a food search, made by the party that cannot see it. §7 pins it so that a
correction is an amendment to this record and not a quiet edit to a threshold.

## Amendment (2026-08-23): the log leaves the ledger, and the drift goes with it

Consequences named a drift and left it standing: `search/` would be the first
namespace here to describe what the app _does_ rather than what it is _about_,
every other one — `event/`, `food/`, `habit/`, `recipe/`, `twin/`, `settings/` —
naming a thing the domain contains. Recorded as "worth noticing early rather than a
precedent to lean on", which is a note, not a decision.

Looking at it properly shows it was a symptom, and that two clauses above are not
merely awkward in the ledger but **cannot be implemented in it**.

### §6's redaction and §7's cap both require deleting a datom

The ledger is append-only, and `AGENTS.md` §3 makes that a red line: `UPDATE` and
`DELETE` against `datoms` are never generated, and exactly two destructive
operations are sanctioned — `resetLedgerSchema` and the one-shot ADR-0020
migration — with "do not add others" stated outright.

§6 requires redaction to be **deletion from the log** rather than exclusion from
one export, so that the review screen shows what exists. §7 requires retention to
be **the last 200 entries, oldest dropped**. Neither is expressible as an append.

Retraction-by-append does not rescue §6, and the reason is the point of the
clause rather than a technicality. Someone redacts a search because they do not
want that text to leave the device; a tombstone datom shadows the value in a
projection and leaves it sitting in the ledger, where the next thing to read the
table finds it. A redaction that does not remove is not a redaction.

### So the log lives in `localStorage`, where the secrets already went

`src/lib/stores/secrets.ts` states the principle this record should have applied
in its own header: **"The ledger is undeletable and it syncs — the wrong home for
a password."** ADR-0034 §8 moved the OFF credentials and the TMDB key out for
those two properties, and this log needs both of them for the same reasons.

§3's table is therefore not a set of ledger attributes. The same fields become the
shape of one JSON record under a namespaced `localStorage` key, written through a
single module in the way `secrets.ts` is the single path for every secret. `AGENTS.md`
§2's requirement to register a new namespace in `docs/eavt-vocabulary.md` falls
away with it, because there is no new namespace; `CONTEXT.md` still gains the term,
since the concept is real whatever stores it.

**The consent toggle stays a `settings/` datom.** It is a preference, which is
what that namespace is for, and it is the same split ADR-0034 §8 made — the
setting in the ledger, the sensitive payload outside it.

### What this buys beyond legality

**§6's exclusion becomes structural rather than disciplinary.** That clause
constrains [#105](https://github.com/palebluebytes/inventoria/issues/105) to keep
`search/` out of a wholesale export and out of peer sync — a rule that has to be
remembered by someone who has no reason to think about this record. Off the
ledger, there is nothing to remember and nothing to leak: `localStorage` is
per-device and unsynced, so the reviewed hand-export of §6 is the only path that
exists rather than the only path that is permitted. This is the same move
ADR-0049 §1 makes about its no-regression property, and for the same reason: a
guarantee the structure enforces beats one that discipline enforces.

**And the drift is gone rather than contained.** The ledger stays domain-shaped,
with no instrumentation namespace in it and no precedent for the next one.

The comment already filed on #105 is left standing. It now over-warns, which is
the harmless direction, and it records why the constraint was thought necessary.

### What this costs

The log gets no HLC ordering and does not participate in the ledger's projections,
which is nothing here: the instrument is per-device by design and 200 entries in
arrival order is the whole of what it needs. It is also lost by a browser storage
clear that leaves the ledger intact, which shortens some six-week windows and is
accepted — §7's short-window branch already says what happens then, and it does not
say extend.
