# ADR 0092: A local log records completely at a level, and the export is the whole of the protection

**Status:** Accepted  
**Date:** 2026-09-03  
**Supersedes:** [ADR-0054](0054-one-local-log-facility-and-no-channel-without-a-reader.md), whose §1 chose channels _rather than_ levels and whose §2 forbade a channel without a named reader and an open question  
**Amends:** [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md) §2 and §3 (every session is recorded, and the entry shape gains a level and a fire sequence), and [ADR-0071](0071-a-scan-session-is-recorded-locally-and-carries-no-barcode.md) §4, §5 and §6 (sensitivity is gone, the counters move here, and a view is no longer what makes a channel legal). Both keep their own records; see the Amendment appended to each  
**Amended by:** the Amendment below, which gives §12 a fourth runtime throw — a channel whose derived `localStorage` keys are somebody else's — now that one module owns the keyspace those keys are built in  
**Research:** [`docs/research/264-logging-record-and-dial.md`](../research/264-logging-record-and-dial.md), commissioned by [#264](https://github.com/palebluebytes/inventoria/issues/264) and cited throughout, including twice where it cut against the answer taken  
**Wayfinder:** [#212](https://github.com/palebluebytes/inventoria/issues/212), whose tickets [#213](https://github.com/palebluebytes/inventoria/issues/213), [#214](https://github.com/palebluebytes/inventoria/issues/214), [#215](https://github.com/palebluebytes/inventoria/issues/215), [#262](https://github.com/palebluebytes/inventoria/issues/262), [#263](https://github.com/palebluebytes/inventoria/issues/263), [#264](https://github.com/palebluebytes/inventoria/issues/264) and [#284](https://github.com/palebluebytes/inventoria/issues/284) hold the detail this record gists

## Context

The Log facility shipped as an **instrument**: a place to put a measurement somebody
had already decided to take. ADR-0054 §2 made that explicit and made it a gate —
a channel may not exist unless its `reader` names a real consumer and a decision
that consumer will take, because "an instrument with no question is a data
collection habit".

That is a good rule, and it was the right rule when the facility had one channel
and one blocked ticket behind it. It is the wrong rule for the thing the facility is
now being asked to be, which is a **black box**: a record of what the app did, kept
so that someone can be asked for it after something went wrong.

The evidence for the mismatch is in ADR-0054's own Context. It opens on the 33
`console.*` calls in `src/lib` — since recounted at **38** — and calls them "events
with real diagnostic value that are unavailable the moment they matter, which is
after the fact". Then §2 excludes every single one of them, because a projection
error has no named reader and no open ticket, and its Consequences say so outright:
"most should stay". The record diagnosed the gap and then wrote a rule that
forbade closing it.

### The instrument discipline was right, and it is being retired anyway

This record does not find that ADR-0054 §2 was foolish. It finds that §2 answers a
different question from the one now being asked, and that the two answers cannot
both be a universal rule.

- **For a channel aimed at a ticket, §2 still holds.** `search` exists to settle
  [#142](https://github.com/palebluebytes/inventoria/issues/142) at a bar
  pre-registered before the data arrived, and that is the discipline this project is
  genuinely ahead of standard practice on. #264 looked for it and found nothing:
  Glean is the only system that requires a declaration before collection at all, and
  its six enforced keys carry no field for the question.
- **For a black box, §2 is unsatisfiable by construction.** The reader of a boot
  narration line is a person reproducing a bug that has not happened yet. There is no
  ticket to name, and the honest declaration is "so that somebody can be asked for
  this later", which §2 rejects as "it might be useful later".

So §2 stops being a **precondition on every channel** and becomes what it was
protecting: a channel says in prose what it is for, and the export sheet shows that
prose to the person deciding whether to hand the file over. What is given up is
named in Consequences as a loss, not papered over.

### Why severity is the organising axis now, when #214 §3 said it was not

[#214](https://github.com/palebluebytes/inventoria/issues/214) §3 demoted severity to
a carried field on a measurement: of roughly 25 eligible `console.*` calls, 20 shared
a severity, so severity separated almost nothing and the channel did the separating.
That measurement was correct and it is reversed here for a reason that is about its
denominator rather than its arithmetic.

**It was taken over `console.*` alone.** The population is now every search session
and every scan session as well. Across the three channels the levels are 20 ERROR,
15 DEBUG and one WARN in `app`; two WARN outcomes, three INFO outcomes and a DEBUG
field in `search`; one ERROR, two WARN and two INFO in `scan`. Severity separates
those. It also does the job a channel cannot do: it decides **what is captured** at a
given dial position, and therefore what a channel costs at each one.

ADR-0054 §1 posed levels and channels as alternatives. They are not, and #264 found
no framework that treats them as such: every system read has both a namespace and a
level, and the namespace is never the thing that gates capture. What retires is §2's
reader-and-question rule as a universal requirement. The channel itself survives, and
it is load-bearing: it owns the `localStorage` keyspace, it names the Tracked Domain
that writes it, and it is the unit the export consent is chosen over.

### Why the capture gate is a budget device and not a privacy one

Levels were refused by ADR-0054 for one concrete reason: they "invite _log everything
at debug and filter later_, which is the correct design for a server draining to a
sink with a retention policy and the wrong one for a device with a 5 MB quota".

That is exactly the practice adopted here, and it is adopted with the numbers in
hand rather than in spite of them. The whole of the facility at its most verbose is
**213 KiB against a 256 KiB budget** (§8), and the arithmetic that makes it fit is
an encoding change rather than a limit: a debounced search fire stores a **prefix
length** instead of repeating the query text twenty times. At the shape the map had
been carrying, one ordinary twenty-five-character phrase would have cost 88% of the
whole budget for one channel; at forty characters it would have cost 120%.

The gate is therefore a **budget** device throughout this record, never a privacy
one. Nothing about the dial's position protects anybody, and §11 says what does.

### Consent at the export is the whole of the protection

Field-level data classification was designed across two rounds of
[#212](https://github.com/palebluebytes/inventoria/issues/212) and then refused. So
was a redacting export processor. The reasoning is recorded in §11 and the condition
that would reopen it is named there, because a mechanism designed and then dropped is
the one an author six months later re-proposes as if it were new.

The consequence is that ADR-0054 §1's `sensitivity` field and ADR-0053's sentence
justifying it are both **deleted rather than softened**. A record that ships the
user's typed query while carrying a badge saying the channel is "personal" is worse
than one that ships it and shows it: the review sheet already renders the byte-exact
payload, and a person reading their own search text in a `<pre>` learns strictly more
than the badge tells them.

### The alternatives that were live

**Amend ADR-0054 in three places and keep the instrument.** The original shape of
#212, and it was worked far enough to be sure. #213 and #215 resolved under it and
survive whole; #214 resolved under it and is half reversed here. What killed it is
the paragraph above about ADR-0054's own Context: the gaps were not three, they were
the framing.

**Adopt a logging library.** Rejected. Every general-purpose logger is levels plus
**push** sinks, and none models "the user presses a button and reviews the payload
first". OpenTelemetry has the right shape and the wrong weight — roughly 60 KB
gzipped across dozens of packages, with an open bundle-size issue. This record takes
its `record → processor → exporter` **shape** and its `SeverityNumber` scale, and not
the package.

**WASM for the facility core**, so that the no-transport property is enforced by an
environment with no ambient `fetch`. Rejected on price: its one good argument is
bought for an afternoon by rescoping the closure test (§11), and it would be a fourth
WASM payload on the boot path that
[#125](https://github.com/palebluebytes/inventoria/issues/125) already broke once.
Revisit if the facility leaves `localStorage`, or if a native shell arrives.

**Privacy-preserving aggregation — DAP, Prio, Poplar, Divvi Up.** Structurally
inapplicable rather than expensive: they need two or more non-colluding aggregation
servers and a crowd to hide in. There is no server and there is one device, and at
n=1 the aggregate _is_ the individual.

**A remote sink, even an optional one.** Rejected permanently, as ADR-0054 §5
rejected it, and §11 keeps it a rule about future changes rather than a description
of current code.

### Scope

This record governs what a Log channel declares, where a level sits on a record, what
gates capture, how records are retained, what bounds the total, and what the export
carries. It replaces ADR-0054 whole.

**It changes no consent surface's shape.** The model-C export ADR-0034 §8 established
and ADR-0085 §2 made a recorded consent is untouched, as is the per-Facet split
ADR-0080 §5 drew over it.

**It does not decide [#142](https://github.com/palebluebytes/inventoria/issues/142)**,
and it does not move ADR-0053 §7's bar. What it does is give that bar a denominator
it has never had, by recording the sessions that succeeded.

**It is a plan, not a build.** Nothing here has shipped. The impl tickets cut from
[#216](https://github.com/palebluebytes/inventoria/issues/216) carry it, and two of
them are hard blockers named in §13.

## Decision

### 1. Every record carries a level; the channel is a namespace, not a gate

This record **supersedes ADR-0054** whole, and the two clauses it reverses by name are
§1's _"channels rather than levels. There are no severity levels"_ and §2's _"a channel
may not be added unless its `reader` names a real consumer and a decision that consumer
will take"_.

A **level** is a whole number on the OpenTelemetry `SeverityNumber` scale, carried by
every record, and it is the axis that decides **one** thing: whether the record is
captured at all (§4). It decides nothing about retention (§6) and, after §10.1, nothing
about disclosure either — the export carries the dial as a label and applies no filter.
What a level buys after capture is that a reader can tell an error from a boot line
without parsing either.

A **channel** survives, doing everything except gating. It owns one `localStorage` key,
it names the Tracked Domain whose act writes it, it declares the prose that says what
it is for, and it is the unit the export selection and the per-channel recording switch
are chosen over. Three exist: `search` (ADR-0053), `scan` (ADR-0071, specified and
waiting on [#207](https://github.com/palebluebytes/inventoria/issues/207)) and `app`,
which this record authorises and §13 blocks.

**A channel is no longer removed when its question is answered**, because two of the
three have no question. `search` still has one, and ADR-0053 §7's close trigger still
fires; what changes is that firing it is not the end of the channel's life.

### 2. What a channel declares

```ts
interface LogChannel<E> {
  readonly name: string;
  readonly domain: TrackedDomainId | null; // §13
  readonly purpose: string; // was `reader`
  readonly cap: number;
  readonly counters?: readonly string[];
  readonly tally?: (entry: E) => readonly string[];
  readonly parse: (raw: unknown) => E | null;
}
```

Gone from what shipped: **`sensitivity`** (§11), and ADR-0054 §2's two kinds of channel
along with the `kind` discriminator #214 proposed for them. Never built and now not
built: a `view` field, whose entire justification was a compile-time guard that a
standing channel must declare a surface, and which died with the kinds. A bespoke
surface for a channel — ADR-0071 §6's counters view — gets built because somebody builds
it, not because a string says so. This record therefore amends ADR-0071 §4, §5 and §6,
and the Amendment appended there says what each of them keeps.

**`reader` is renamed `purpose`, and the field gets more load-bearing rather than
less.** The word `reader` named _a consumer and the decision it takes_, which is
precisely ADR-0054 §2's discipline, and it would be a lie on two of three channels. The
prose stays, rendered verbatim in both views and carried into the export, because with
§11's classification refused it is the only thing on the review sheet that says what a
channel contains before somebody hands the file over.

**Nothing else is declared.** In particular: no default level (§3), no dial position
(§4), no field-to-level map (§3.2), no `maxRecordBytes` (§8) and no staleness stamp.

### 3. Where a level sits

#### 3.1 A record's level rides on the envelope, beside the version

[#215](https://github.com/palebluebytes/inventoria/issues/215) established a
facility-stamped envelope `{ v, entry }` with a per-channel `version`, and that `parse`
never sees `v`. The level joins it: a stored record is **`{ v, lvl, entry }`**, and
`parse` never sees `lvl` either.

Three reasons, none of which is retention — §6 sheds by age and never reads `lvl`.

It transfers #215's stated reason for the wrapper verbatim: **an entry shape keeps no
dependency on the envelope**, which is exactly why `v` sits there and why `parse` is
written against the channel's own shape and nothing else. A reader of an exported
file, or of the review sheet, can sort and scan by level **without parsing any record**,
including the ones whose channel cannot. And one facility-stamped wrapper carrying both
facility-owned fields is simpler than a wrapper for one and a convention for the other.

_Two arguments this field once had are gone: §6 no longer sheds by level, and §10.1
withdrew the export filter. The three above are what remain, they are enough, and the
field does not move — but a reader should know it is carried for less than it once was._

**A record written before `lvl` existed simply has no level.** It is retained, it appears
in the review if its channel can parse it, it stays redactable and clearable, and it
leaves the ring by age like everything else. Nothing invents a level for it, and nothing
treats its absence as a reason to shed it first.

#### 3.2 A channel asks the facility what is being captured; it never declares a field map

One field in the facility rides inside a record whose own level is set elsewhere:
`search`'s fire sequence is captured at DEBUG inside a session record that is usually
WARN. That is expressed as **one facility predicate**, `capturedAt(level)` or equivalent,
which the channel's own entry builder calls. The declaration carries nothing about fields.

**No general rule is stated about fields carrying levels.** An earlier draft made one, and
it describes a single call site. The predicate is the whole mechanism; a second field
wanting the same thing calls it too, and nothing else has to exist first.

A declarative field-to-level map would require the facility to reach inside an entry
shape it deliberately does not understand; per-channel `parse` exists precisely so that
it never has to. It would also be a second, partial structural description of the entry
that has to stay in sync with both `parse` and the builder, and #215 already killed one
duplicate of that kind.

**The concrete killer is `search`.** The fire sequence accumulates _across_ a session, so
include-or-omit is decided at session **start**. A declarative post-hoc filter would
accumulate the array all session and then discard it, paying the memory and the work
whatever the dial says, which defeats the point of a capture gate.

**The asymmetry to carry into the build:** a _record's_ level is computed at session
**end**, because the outcome decides it; a _field's_ level is decided at session
**start**. Both are the builder calling the same predicate at different moments.

**Stated as a cost rather than glossed:** which fields a channel omits at which dial
position is a property of that channel's builder, checked by nothing. With one such field
today that is a comment; if it becomes several, it is a comment in several places. #214
§13's precedent applies — an honestly-accepted weakness written down beats a checkbox that
re-stamping satisfies.

### 4. One dial for the whole facility, at three positions

The dial is a **threshold on the continuous `SeverityNumber` scale**, not three
categories. A position includes everything at or above it, so widening later moves a
number rather than migrating records.

| Position              | Threshold   | Reads                                          |
| --------------------- | ----------- | ---------------------------------------------- |
| **Errors & warnings** | ≥ WARN (13) | Only what went wrong                           |
| **Normal** (default)  | ≥ INFO (9)  | Every session, and every error                 |
| **Noisy**             | ≥ DEBUG (5) | Everything, including the app's internal trace |

**The default is `Normal`.** At `Normal` the fifteen boot-narration lines and the
per-fire search sequence are never written, so `Noisy` is something switched on to
reproduce a bug rather than a standing cost — which is what makes §8's arithmetic a
worst case somebody chose rather than the ordinary one.

**The scale's direction is a real choice, not the obvious one.** #264 found it is not
universal: OTel ascends, winston descends, Go's `slog` uses negative numbers, and
`os_log`'s values are not ordinal at all. OTel's is taken because a numeric threshold
is what makes "a ceiling automatically includes anything more severe" true without a
table.

**There is one dial, facility-wide, and that is a deliberate departure from universal
practice.** #264 found the opposite shape everywhere: dials are per-logger and resolved
from the logger's name — OTel JS pattern-matches the instrumentation scope, pino
inherits through child loggers, winston and journald put the dial at the sink, journald
running six independent thresholds. **The reason that evidence does not carry is that
every one of those dials serves a developer turning up one subsystem while draining to
an unbounded sink.** None of them arbitrates a shared fixed ceiling. This dial lives in a
non-technical person's Settings and governs 256 KiB split three ways; a per-channel dial
would ask a user to reason about buying room in one channel by narrowing another, which
no view can present honestly.

**The dial is not an off switch.** "Off" is deliberately not a position. The per-channel
recording switch (`setChannelRecording` / `inventoria_logs_paused`) is untouched and
orthogonal: the dial says _how much detail_, the pause says _whether this stream at all_.

**The dial lives in `localStorage`, beside the pause, and never in a `settings/` datom.**
`log-facility.ts` already writes the reason — a switch that syncs would silence an
instrument on a device its owner has never seen — and a budget dial is per-device by
nature. ADR-0085's rule points the same way: this is a device's own state, not a
preference that should travel.

**Implementations resolve the threshold once and cache it.** #264 found every fast one
does: pino rebinds disabled level methods to `noop` so a gated call is not even a branch,
and Rust's `log` elides the call site entirely. A read of `localStorage` per search fire
is the thing to avoid.

### 5. What level each thing is

> **ERROR (17)** — the app failed at something the user asked for.
> **WARN (13)** — a dependency failed or the app degraded, and the user may not have noticed.
> **INFO (9)** — something the user did, which completed.
> **DEBUG (5)** — the app's internal trace, _and any field whose only reader is a person reproducing a bug_.

A record's level is **the severity of what happened, not the importance of the record**.
An empty search is a WARN because the app failed to answer, not because #142 wants to
read it.

The fourth clause is the load-bearing one. It puts the search fire sequence, a stack
trace and a barcode at DEBUG by one sentence rather than three arguments — and, read
backwards, it keeps `attempt` and `door` **out** of DEBUG, because #208's counters tally
them and a counter is not a person reproducing a bug.

**Only the four anchors 5, 9, 13 and 17 are used.** No FATAL (21): the closest candidate
is the in-memory-database fallback, and that is a degradation. Values between anchors
would change capture not at all, since the dial reads three thresholds, and §6 does not
read a level at all — so a fifth value would buy a table nobody can hold in their head
and nothing else.

#### 5.1 `search`

| Session                               | Level       | ≥13 | ≥9  | ≥5  |
| ------------------------------------- | ----------- | --- | --- | --- |
| `nothing` (settled empty)             | **WARN 13** | ✓   | ✓   | ✓   |
| `resolved_after_correction`           | **WARN 13** | ✓   | ✓   | ✓   |
| `rescued_by_vocabulary`               | **INFO 9**  | —   | ✓   | ✓   |
| found its food                        | **INFO 9**  | —   | ✓   | ✓   |
| abandoned mid-word (`settled: false`) | **INFO 9**  | —   | ✓   | ✓   |
| _the per-fire sequence field_         | **DEBUG 5** | —   | —   | ✓   |

The three positions read _only what went wrong_ / _every session and its final query_ /
_every session plus the keystroke timeline_.

**Both bar-eligible outcomes are at WARN, and that is the reason to have put them
there.** It makes ADR-0053 §7's bar **dial-proof by construction**: the positions do not
differ over the population the bar counts, so the bar reads the same at all three. That
is a consequence of this table rather than a mechanism, and it is stated out loud rather
than relied on silently.

**`Noisy` records every fire.** The ten superseded prefix states are the point:
`raw aubergin` returning 0 while `raw aubergine` returns 3 is only visible if both were
recorded, and it is not derivable afterwards. Recording only a "rested on" query was
rejected — it is new state in `FoodStager` and a definition nobody can validate against
anything.

#### 5.2 `scan`

| Session                      | Level        |
| ---------------------------- | ------------ |
| `refused` (400/403)          | **ERROR 17** |
| `unreachable`                | **WARN 13**  |
| `absent`                     | **WARN 13**  |
| `found`                      | **INFO 9**   |
| abandoned (`settled: false`) | **INFO 9**   |

The two that are not obvious. **`absent` is WARN, not INFO**, because consistency with
§5.1 demands it: the reference data does not have what the user asked for and they now
have manual work, which is the same event as a search returning `nothing`. **`refused` is
ERROR, above `unreachable`**, because an outage is the network's and a 403 is ours.

`attempt`, `door` and `settled` ride at the record's level, by the DEBUG clause read
backwards.

**After this, `scan` has no DEBUG field at all** — `Noisy` writes for that channel
exactly what `Normal` writes. The natural candidates would be the raw HTTP status or the
retry timing, and neither is added here: ADR-0071 §3's field set is closed, and this
record assigns levels to it rather than widening it.

#### 5.3 `app`

One channel named `app`, and **the facility's write also calls the matching `console.*`
method**. One call site, records _and_ devtools output, which is what every framework
does — so "which of these survive as records and which stay devtools-only" stops being a
question. All of them do both.

The census, corrected: **38 real call sites, not the 41 first counted.**
`db.worker.ts:55-56` are `print:` / `printErr:` _bindings_ handed to sqlite, not calls.

| Population                                                                              | Count | Level                   |
| --------------------------------------------------------------------------------------- | ----- | ----------------------- |
| `console.error`                                                                         | 20    | **ERROR 17**            |
| `console.log` — boot narration in `db.client.ts`, `db.worker.ts`, `ReloadPrompt.svelte` | 15    | **DEBUG 5**             |
| `console.warn` — OPFS unsupported, falling back to an in-memory database                | 1     | **WARN 13**             |
| `console.info` — `[DEFERRED STUB]` markers                                              | 2     | **not recorded at all** |

The single `warn` is the most consequential line in the population: it means nothing the
user records will survive the tab. The two `info` calls (`plate-estimator.ts:65`,
`ai-autofill.ts:83`) are scaffolding marking unbuilt features rather than events, and
recording them at INFO would write a record every time somebody opens the camera.

**`err.name` and `err.message` are captured at the record's level. No stack traces.**
The message goes in because #214 §5's exclusion was capture-time discipline and §11
retires that as the protection — and because 20 of the 38 sites pass an `err`, so a
record reading "Ledger import failed" with no message is a record of nothing. The stack
stays out on two grounds, neither of them privacy: **no sourcemaps ship** (there is no
`build.sourcemap` key in `vite.config.ts`, so Vite's default `false` applies and a
production stack is minified frame names, which is the thing it would be wanted for), and
a stack is 1–3 KB against a record measured in hundreds of bytes.

### 6. Retention is the last `cap` records, oldest dropped

**A channel keeps its most recent `cap` records and nothing else.** One order, by arrival.
No level is read, no record is refused, and no slot is reserved. This is `capEntries`
exactly as it ships, and `shedToBudget` keeps its plain oldest-first `shift()`.

**The ring is a recency window and nothing more.** That sentence is the whole of the
retention model, and everything that needs a stable figure across a long life is carried
by a counter instead (§9), which is never shed and not subject to the cap.

#### 6.1 A level-ordered ring was designed here, and dropped

An earlier draft of this record shed the lowest level present first, refused an incoming
record below that level, and capped the high-severity share at half the ring to stop the
resulting ratchet. It is recorded here as considered, because it is the obvious thing to
reach for and somebody will reach for it again.

It was dropped for one reason, and the reason is what the log is for. **A log is read as
a sequence.** An ERROR whose surrounding INFO and DEBUG records were evicted to keep it
is an error with no story, and the story is the thing somebody reproducing a bug came
for. Level-ordered shedding systematically destroys the context around the record it
preserves, which inverts the purpose of keeping the record.

Two concrete failures made that abstract argument checkable, and both land on the dial
position the design was supposed to make safe:

- **`Noisy` would delete exactly what `Noisy` is for.** `search`'s DEBUG fire sequence is
  the keystroke timeline, the single most useful artifact the facility holds, and it is
  the lowest level in its channel — so it is the **first** thing a level-ordered ring
  sheds. The channel converges on 200 WARN session records and no timelines.
- **A full channel would refuse the record you turned the dial up to capture.** Under the
  refusal rule, `app` holding 100 ERRORs rejects an incoming DEBUG boot line outright. So
  a person switches to `Noisy` to reproduce a boot problem, and the channel writes
  nothing at all.

**The problem it was invented for had already been solved somewhere else.** The stated
motive was that a capped ring throws away an error to keep a boot line, and that it
forgets its own denominator. §9's counters answer the second directly, and they are the
reason ADR-0071 §5 already says a rate is read from a counter and never from the ring.
Once the aggregates are carried outside the ring, the ring's only remaining job is recent
context, and recency is the correct key for a recency window.

**The dial answers the first.** At the default `Normal`, DEBUG is never captured, so a
boot line cannot displace an error: `app` holds a hundred error-class events and no
narration at all. The only position where volume can push errors out is `Noisy` — which
is the position somebody chose, for a session, to see that volume. A capture gate placed
before the ring does the job a shed order was being asked to do after it, and it does it
without deleting anybody's context.

**#264 found no precedent for level-ordered shedding in any system read**: Sentry's
breadcrumb ring is `slice(-maxCrumbs)` and never reads `level`, journald vacuums the
oldest files, and OTel JS drops the incoming record at `maxQueueSize`. The one system
that beats age is Android's `logd`, which sheds the noisiest UID. That absence was
originally written down as novelty. It is better read as agreement: every one of those
systems is read as a sequence too.

#### 6.2 What this costs, and it is not nothing

**ADR-0053 §7's numerator loses the protection it was leaning on.** An earlier reading
took level-ordered shedding as a safety for #142 — successes at INFO would shed before
empty sessions at WARN, so no empty session could be lost before there were 200 records.
Under age, 200 successful searches scroll every empty session out of the ring.

That protection was worth less than it appeared, and this record should not pretend it is
giving up something clean. A level-ordered ring corrupts the same fraction from the other
end: the high-severity share only rises, so the ring converges on all-WARN and the rate
read from it climbs towards 100% whatever the true rate is. Neither rule yields a stable
sample; they spoil different halves of it.

So the honest position, stated rather than engineered around: **a measurement that needs a
stable sample must be carried by a counter, or read from an export taken before the ring
turns over.** #142's denominator is a counter (§9). **Its numerator is neither**, because
ADR-0053 §4 requires the vocabulary flags to be recomputed at read and a write-time
counter would freeze them. The bar is therefore folded by a person over an export, and it
is that person's job to take the export while the sessions are still there. ADR-0080 §6
already handed them the fold; this hands them the timing with it.

### 7. Every field is bounded, and a fire stores a prefix length

Three bounds, and one encoding. Together they are what makes §8's invariant computable
at all.

**A fire element is `{ l, n }`** — the prefix length and the result count — falling back
to `{ q, n }` only when the fire is **not** a prefix of the final query, which is a paste
or a mid-string edit. It is lossless: the reader reconstructs `query.slice(0, l)`, because
the query is already in the record. The sequence was storing the query text twenty times.

**Retention within a session is the first 3 fires and the last 7.** The sequence's job is
how the query started and what it was doing when it settled; the middle is the least
informative part. **A truncated sequence says so**, with a `fires_dropped` integer — four
bytes at zero. The reader is a person holding a JSON file with no access to the rule that
produced it, and without that count a marathon session and an ordinary one are
indistinguishable.

**The query is truncated at capture at 48 characters, never on the input.** `FoodStager`
has no `maxlength`, so a 2,000-character paste would be a 50 KB record and no invariant
could be stated at all. The log must not constrain the app: a user types whatever they
like and the search answers it; what is bounded is what gets **recorded**. 48 is nearly
twice the longest realistic food phrase. The truncation announces itself with a
`query_truncated` flag rather than silently shortening a string a reader will take as
literal.

**An `err.message` is truncated at 256 bytes**, which clears every message the 38 real
call sites produce, so nothing in use is truncated.

**Caps.** `search` keeps 200 and `scan` keeps 200. **`app` takes 100.** Its steady state
is a function of the dial rather than of usage: at the default `Normal` it holds a hundred
error-class events and no narration at all, and at `Noisy` a boot burst is 15 lines, so
the ring holds roughly six recent boots — which is what somebody debugging a startup
problem needs, since the boot they care about is the last one. `search`'s 200 is
load-bearing for ADR-0053 §7's bar; `app`'s is not.

### 8. One budget, an invariant, and no partition

**The budget stays 256 KiB across all channels together**, and it is not partitioned per
Facet. It cannot be: the root Facet holds all six Tracked Domains, so the channels of the
root are a strict superset of the channels of Rations and `search` would sit in two
budgets at once.

What replaces the partition is an invariant:

> **Σ over channels of (cap × maximum record bytes) ≤ `LOG_BUDGET_BYTES`.**

With §7's bounds in place every field is bounded and that maximum is computable. The
consequence is the finding underneath the whole question: **`shedToBudget` provably never
runs.** That matters beyond tidiness, because with channels owned by Tracked Domains its
largest-first eviction crosses the boundary ADR-0080 §5 drew — the root's `app` errors
evicting Rations' search records, silently, on a device where Rations is the only thing
installed. The caps bound the total, so the crossing cannot occur.

**The invariant is a unit test, and not a declared field.** A `maxRecordBytes` a channel
author writes down is a claim about a shape, and this map established three times over
that such claims are wrong by factors of two to four. A test that **builds** the
worst-case record cannot drift from the type, because it stops compiling when the type
moves, and it fails when a sixteenth field or a fourth channel breaks the sum rather than
when a user hits a quota. The declaration in §2 stays exactly as closed: it is read by
every future channel author, and a number none of them can compute correctly does not
belong in it.

#### 8.1 Where the budget lands

Worst case: every retained fire at full length, the query at its cap, `corrected_by`
present at the cap, every `app` record an error at the message cap. Every per-record
figure is measured — the declared shape serialised with `JSON.stringify` and weighed with
`TextEncoder`, the way `serialisedBytes` does it — over the real strings at the 38
censused call sites. The session counts are estimates, and the cap is used for them.

| Channel                                                     | B/record | KiB       | % of 256 KiB |
| ----------------------------------------------------------- | -------- | --------- | ------------ |
| `search`, cap 200, 48-char query, 10 fires kept, `{ l, n }` | 785      | 153.3     | 60%          |
| `scan`, cap 200, worst enum combination                     | 124      | 24.2      | 9%           |
| `app`, cap 100, 256 B message                               | 364      | 35.5      | 14%          |
| **Total**                                                   |          | **213.1** | **83%**      |

**42.9 KiB of headroom**, which is a fourth channel of `scan`'s size. Realistically — a
thirteen-character query typed straight through, ordinary error messages — the total is
around 110 KiB, or 43%.

The encoding in §7 is the single change that makes this hold. At `{ q, n }` with twenty
fires kept, a twenty-five-character query is **225 KiB, 88% of the whole budget for one
channel**, and a forty-character one is **306 KiB, 120%**. Neither the budget nor a cap
moves; the shape does.

**One note on units, because the constant has two readings.** The budget is measured in
`TextEncoder` bytes, and browsers charge `localStorage` in **UTF-16 code units** — so
256 KiB here costs about **512 KiB** of the roughly 5 MB origin quota, which is under 7%
of it either way. Fourteen `inventoria_pref_*` keys now share that origin with the log
(ADR-0085), and the secrets did already.

### 9. Counters

A channel may declare **counters**: named whole numbers that only ever increase, are
never shed, are not subject to the cap, and are cleared only when the channel is. The
three constraints ADR-0054's Amendment placed on them stand and are carried here — a
counter is a running total of a field the entries already record and never a new fact, it
is a whole number and nothing else, and it is shed last.

**Counters live under their own key, `inventoria_log_<name>_counters`.** The shed-last
promise is _false in code_ while counters share the entries' key, because the write path
removes the key outright when the record list empties. A separate key is the only shape
under which that promise is literally true rather than true-until-the-ring-empties, and
it keeps counters out of the byte measurement — which is what the Amendment already
argues, "a few integers are not what filled 256 KB".

**A Facet-scoped wipe takes the counter key.** ADR-0079 §1's wipe is a sanctioned
deletion of that Facet's data, and a permanent counter is the part of it that most needs
to go. `facetStorageKeys` enumerates the store rather than a name list, so this is one
entry in the key derivation — the same lesson
[#311](https://github.com/palebluebytes/inventoria/issues/311) already found once, that
the registry alone misses a channel's key.

**The dial does not gate counters. The pause does.** The write tallies first and gates
second, so a counter increments even when the record it would have counted is not
captured. The argument is the dial's own nature: §4's gate is a **budget** device, and a
counter is not bytes — it is a fixed-width integer that never grows. The reverse reading
is worse than it looks: counters exist because a capped ring cannot report a rate, and
gating them would let a global setting silently hole the one number that exists to
survive shedding. So the dial means the right thing: **turn it down and you keep the
rate, you lose the detail.**

**The pause still stops counters**, which is a smaller version of the same hole and is
accepted. Pausing is an explicit, visible, per-channel act shown in Settings beside the
count, where the dial is a global setting whose effect on any given counter is invisible.
The alternative — a counter that keeps running while the channel reads "not recording" —
makes "stop recording" stop meaning what it says.

**A rate is read from a lifetime counter and never from the ring.** §6 makes the ring a
recency window, so a rate taken over it is the rate of the last `cap` sessions wearing a
lifetime label. `search` therefore declares a lifetime `sessions` counter as its
denominator, carried in the export. **This applies a rule the facility already holds
rather than adding one**: ADR-0071 §5 says exactly that of `scan`, and §6.2 is why it
generalises. A plain session tally freezes nothing, so ADR-0053 §4's recompute-at-read,
which forbids a frozen **numerator**, is untouched.

**Each channel carries one `counters_since`**, exported beside the counters, because a
number without its epoch is a dishonest label.

### 10. The export discloses the dial, and does not filter

```ts
interface LogExport {
  artifact: "inventoria-local-log";
  exported_at: number;
  dial: SeverityNumber; // in force when Export was pressed
  channels: ExportedChannel[];
}

interface ExportedChannel {
  name: string;
  purpose: string;
  entries: unknown[];
  counters?: Record<string, number>;
  counters_since?: number;
}
```

`sensitivity` is gone from the payload. **Export selection is per channel, all or nothing,
and that is the only granularity on offer.** The per-Facet split ADR-0080 §5 drew over it
is untouched, and §13 adds the jar-wide channels to both Facets' lists.

**The payload carries the dial position in force when Export was pressed.** At _Errors &
warnings_ a log looks like a quiet app rather than a filtered one, and a reader could
conclude "nothing happened" when the truth is "nothing was recorded". This is the failure
`counters_since` was invented for — a number without its epoch is a dishonest label —
applied to the entries instead of the counters, and an exported file outlives the screen
that would have explained it. It also completes §9: **counters run regardless of the dial
and entries do not, so the dial position is precisely what explains the gap between the
complete rate and the filtered detail.** A reader holding both can tell quiet from
filtered.

_Stated out loud:_ the value is the dial **at export time**, and records older than the
last change to it were captured under a different one. Per-record dial position was
rejected — bytes on every record to answer a question nobody asks, when the record's own
`lvl` already says what it is.

#### 10.1 An export-time minimum level was specified, and is withdrawn

A `min_level` argument was designed to sit beside `dial`, defaulting to it, on the
justification _"share the errors, not everything I typed."_ **That justification is false
of the channel it was written about**, and the design is withdrawn rather than rebuilt.

- **The WARN records are the ones carrying the query.** `search`'s two WARN outcomes are
  `nothing` and `resolved_after_correction`, and both hold the text the person typed. A
  filter at ≥ 13 keeps the most sensitive subset and drops the least.
- **It cannot remove the keystroke timeline at all.** The fire sequence is a _field_
  captured at DEBUG inside a session record whose own level is WARN (§3.2, §5.1). A filter
  over records keeps that record whole, sequence included.

What a level filter would actually have done is _share the failures and not the
successes_, which is a real capability and is the one the **dial's own low position**
already provides, one step earlier and without a second axis on the consent surface. So
the export offers no level control, and the second clause of _the dial gates capture, the
export filters on it_ is withdrawn as a no-op rather than given a referent it cannot
honour.

**Rejected with it:** having the payload builder strip DEBUG-captured fields from records
it keeps, so the filter would mean what it claimed. That is the facility reaching inside
an entry shape per-channel `parse` exists precisely so it never has to, and a second
structural description of every entry to keep in sync — which §3.2 already refuses once.

**Counters are exported whole**, as they always were: they are aggregates over everything
that happened.

### 11. No transport the user did not perform, and the payload that leaves is the payload that was reviewed

This is ADR-0054 §5, restated rather than changed, and it is now the **whole** of the
protection.

**Both clauses are load-bearing, and the second is the one that was implicit.** It is
what ADR-0053 §6 was actually protecting, and it is why an export-time processor is not a
sink: a processor runs on a payload the user is about to read, and a sink runs on one
they will not.

**The guarantee is structural, in two clauses:**

- `src/lib/logs/` reaches **no egress API at all**; and
- egress lives in **exactly one named module outside it**.

The test that claimed this before was checking one file for `fetch(` and friends, and it
proved there is no _second_ transport rather than no transport. Two things were wrong
with it. The real egress is the review sheet — a `Blob`, `createObjectURL`, and an anchor
click — which is a different file, and `createObjectURL` was not on the list anyway. And
**the closure ran the wrong way**: the sheet imports the facility, not the reverse, so any
closure rooted at `log-facility.ts` walks away from the egress.
[#223](https://github.com/palebluebytes/inventoria/issues/223) makes both clauses
checkable with `scripts/worker-closure-check.mjs`'s `tsc --listFiles` technique.

**A `LogDestination` seam was considered and deferred, not overlooked.** Deferred because
what makes the property checkable is the fence, not the interface, and because no second
vehicle exists anywhere in `src/`. Under the restated rule, adding Web Share or the
clipboard later is a change inside one module rather than a new record.

#### 11.1 Field classification and a redacting processor are refused, not deferred

Both were designed across two rounds and then dropped. The decision is that **consent at
the export is the whole of the protection**, on the ground that if a person decides to
share their logs then what they share is theirs to share.

`ChannelSensitivity` is **deleted, not replaced**, and ADR-0053's sentence justifying it —
_"a food search is a record of what someone was thinking about eating, and for a
health-adjacent app that can imply a condition, a pregnancy or a disorder"_ — is deleted
with it. Leaving that claim standing over a record that ships the query unprotected is
worse than not making it. **The fields themselves stay:** `query` and `corrected_by` are
what the vocabulary flags are computed from and what
[#123](https://github.com/palebluebytes/inventoria/issues/123) exists to read, and a
search log without them is not a complete picture of anything.

**No warning badge replaces the `personal`/`technical` slot in either view.** Any
replacement would be field classification wearing a different word, one round after the
concept was deleted rather than renamed. The surface does not get thinner: the review
sheet renders the byte-exact payload under "What the file will hold", and a person
reading their own search text there learns strictly more than a badge saying "personal".

**Considered and shelved rather than refused:** a level-mix summary in that slot — "3
errors · 12 normal · 185 noisy" — which is a statement of fact about the records rather
than a claim about their sensitivity, and which §3.1 makes derivable from `lvl` without
parsing. Not needed for consent, and an impl ticket somebody chooses rather than
something this record mandates sight-unseen.

**The condition that reopens this is a recipient other than the person who pressed the
button.** Every argument above rests on the payload going to somebody the user chose,
after they saw it. A destination, an automatic upload, or a second party reading it
without that act puts classification back on the table, and §11's two clauses are what
would have to fall first.

### 12. The guards

The reason to prefer a compile-time guard is
[#221](https://github.com/palebluebytes/inventoria/issues/221): registration is an import
side effect, so a runtime throw is either a boot crash or a channel that silently
vanishes from the review and the export.

**Compile-time:**

- `purpose` must be a non-blank string **literal** — the existing branded conditional
  type, unchanged in mechanism, still rejecting a runtime-computed `string` as firmly as
  it rejects `""`. A purpose assembled at runtime is a purpose nobody wrote down.
- `tally` is present **if and only if** `counters` is declared, both directions, keyed off
  the presence of `counters`.
- `tally`'s return type is the union of the declared `counters` members.
- **Every write names a level**, as a required parameter typed to the `SeverityNumber`
  union rather than to `number`.

**Runtime, and only these three:** a whitespace-only `purpose` (the type catches `""` and
the widened `string` but cannot see through a space), `cap < 1`, and a duplicate `name`.
That is exactly the set that ships today; the redraw changes what is compile-checked and
leaves the runtime throws alone.

**No default level is inheritable from the declaration.** Severity decides what is
captured, and an inheritable default on that field means a site that should be ERROR
records as INFO because somebody omitted it — and then vanishes at any dial position above
`Noisy`, which is the one failure nothing downstream can detect. Every framework read for
#264 names severity at the call site and reserves inheritance for the dial. A channel's
own module may hold a local constant; that is the module's business, not the
declaration's.

**Rejected:** making `name` a central literal union to catch duplicates at compile time.
It would only catch typos, duplicates would still need the runtime check, and it
re-introduces the central registry #221 exists to remove.

### 13. A jar-wide channel belongs to every Facet, and is wiped by none of them

A channel names the Tracked Domain whose act writes it, which is how a Facet's Local Logs
card, its review sheet, its export and its scoped wipe are all derived — `channelsOfFacet`
is the single source for the four of them. `app` has no such domain: boot narration, the
OPFS fallback and `db.core.ts` errors belong to none of `food`, `media`, `items`,
`habits`, `calendar` or `notes`, and picking one arbitrarily would put database errors
behind **Rations'** export consent.

**The field widens to `TrackedDomainId | null`, where `null` means jar-wide.** It says the
true thing — the app's own narration has no domain — rather than inventing an owner to
satisfy a rule written for something else. The code's comment reaches for ADR-0086 §1,
_an entity has exactly one owner and the owner is a Tracked Domain_; a Log channel is not
a Ledger entity, and that borrowed rule has no answer here.

What `null` then means for the four surfaces is **not** what an earlier draft of this
record claimed, and the correction matters more than the widening:

> **A jar-wide channel appears in every Facet's card and every Facet's export, each behind
> that Facet's own consent. A Facet-scoped wipe never takes it.**

Both halves are ADR-0080's clause (b) — _the Facet that writes it governs it_ — applied to
a channel that every Facet writes. A Rations user's OPFS failure is written by Rations'
running code, so Rations governs its disclosure. And a Facet-scoped wipe is
[ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §1's _delete all
my food data_, which the app's own narration is not; deletion is irreversible, so that
control stays jar-wide while visibility and export follow the writer.

Concretely, two filters rather than one: `channelsOfFacet` admits a channel whose `domain`
is `null` to every Facet, and `facetStorageKeys` excludes exactly those from the wipe.

**Why the earlier draft was wrong, recorded because the claim looked obviously true.** It
said the root's holding all six domains would give it every channel, so a null-domain
channel would join the root's set and never reach Rations. `channelsOfFacet` builds a
`Set` of six domain **id strings** and asks `owned.has(channel.domain)`, so a `null`
domain is in no Facet's set at all — the root's included. Built as written, `app` would
have been invisible in every card, absent from every export, untouched by every wipe, and
still spending the budget: a permanent invisible record, which is the exact thing this
record's own anti-sprawl argument says cannot happen here.

**And root-only would have been wrong even with the bug fixed.** ADR-0080 §5 rejected
leaving the log-export consent at the root in these words: it _"ships a facility that
records a user's searches and can never show them the file."_ A Rations-only install is a
supported install — ADR-0076 makes Rations installable on its own and ADR-0078 gives it no
way out — so its user cannot open the root to read their own diagnostics. Recording a
person's database errors where only somebody else can see them is that same rejected
shape with a different payload.

**Two hard blockers on the `app` channel, and neither is a preference:**

1. **The domain widening above**, together with the two derivation filters, which is a
   change to a type and a function that four surfaces read.

   **Discharged by [#351](https://github.com/palebluebytes/inventoria/issues/351)**:
   `domain` is `TrackedDomainId | null`, `channelsOfFacet` admits a null domain to every
   Facet, and `facetStorageKeys` excludes one from every Facet-scoped wipe. A test in
   `tests/unit/facet-wipe.test.ts` declares a null-domain channel and holds both filters
   pointing opposite ways, so the mechanism is proven before the first channel uses it.

2. **[#227](https://github.com/palebluebytes/inventoria/issues/227).** §5.3 captures
   `err.message`, and `db.core.ts:388` interpolates an entity id that on the scan path is
   `gtin:<barcode>`. An unfixed #227 therefore puts a barcode into an exported log through
   the one path ADR-0071 §4's _shape_ argument cannot cover. `search` and `scan` are not
   blocked by it; `app` must not ship before it lands.

   **Discharged on 2026-09-05**: #227 landed. Both throws now name the failing field and
   the shape of what was there rather than the row, and a test holds every interpolation
   a message under `src/lib/db/` carries to a per-file allowlist.

**Both blockers are now discharged**, so `app` is unblocked on this record's terms.
[#382](https://github.com/palebluebytes/inventoria/issues/382) is not a third: the entity
ids it names are rendered on the receive door and reach no channel.

## Consequences

**The anti-sprawl guard is gone, and no mechanism replaces it.** This is a loss accepted,
not a gap papered over. ADR-0054 §2 existed because a channel could be added on "it might
be useful later" at no cost anyone could see, and two things now make sprawl
self-limiting that did not hold when it was written: a fourth channel takes bytes from
the existing three under a shared budget with a computable invariant, and every channel
is a line on the review sheet and a checkbox in the export selection — conspicuous on the
surface that is now the whole of the protection. A registered-channel count cap was
rejected specifically: the number would be arbitrary, and #214 §1's singleton is the
cautionary case, a count encoding a discipline rather than a constraint, firing as a
compile error at the exact moment somebody legitimately needs one more. **`purpose`
non-blank is the only surviving check, and it checks that a sentence exists, not that it
is true.**

**Entries and counters can now disagree for two reasons, and `counters_since` sees
neither.** Redaction deletes an entry and does not decrement a counter (#214 §8), and the
dial suppresses an entry that was already tallied (§9). Both are deliberate. The cost is
that a person reconciling the two numbers in an export needs to know this record exists,
and there is no in-app reader left to do the reconciling for them: ADR-0080 §6 deleted
the vocabulary-bar readout, so ADR-0053 §7's bar is folded by a person over an exported
channel.

**A field omitted at the wrong dial position is caught by nothing** (§3.2). One channel
does this today, in one place.

**A level-ordered ring is the obvious thing to reach for, and §6.1 exists so the next
author finds it already considered.** The short form: a log is read as a sequence, and
level-ordered shedding deletes the context around the record it saves. The capture gate
does that job better because it runs before the ring rather than inside it.

**The invariant is a hand-written worst case, so a field nobody thought of is a field it
does not price** (§8). That is weaker than a runtime assertion, and it is the same
honestly-accepted weakness this record takes in §3.2. What it buys is failing at the
commit that breaks the sum rather than on a user's device at a quota error.

**A busy channel forgets fast, and at `Noisy` it forgets faster.** That is the price of a
ring, it is paid by every system surveyed, and §9's counters are what stand behind it. A
person who needs a specific stretch of history exports it while it is there.

**The facility has a permanent part**, and that has been true since counters were added.
Everything else is capped, shed, redactable and mortal; "delete the entry" is no longer
the whole answer to what the app remembers, and clearing the channel is one action
further away than deleting a row.

**A standing record of what somebody searches for is no longer foreclosed.** ADR-0054's
Amendment forbade a `personal` standing channel outright, on the ground that an unending
record of what somebody was thinking about eating is not something this device keeps.
That prohibition dies with `sensitivity`, and `search` becomes exactly such a record: it
now keeps the successes too, it does not end, and its retention is a cap rather than a
question closing. **This is the largest thing this record gives up**, it is given up
knowingly, and what stands in its place is §11 — the export is the only way out, the
review shows the bytes, and the person who presses the button is the person the record is
about.

**#142 gets a denominator it has never had.** Recording only empty sessions made the
_rate_ of empty searches unmeasurable, because successes left no trace. ADR-0053 §7 keeps
its numbers unchanged — moving a threshold in the same act that makes it measurable is
the rationalisation §7 was written to prevent — and gains a note that #142 may
**re-pre-register before reading it**.

**A filter written as "not X" over a closed union stops being correct the moment the
union opens.** The bar's numerator was expressed as _settled and not
`rescued_by_vocabulary`_, which was equivalent only because the outcome union had three
members and no `found`. Complete recording adds one, and that filter would count every
successful session into the settled-empty denominator, closing #142 as a settled no on a
population of successes — silently, and in the direction of closing a question. The rule
survives in ADR-0053 §7's prose and is corrected there. Whatever expresses it next must
be an **allow-list**, `nothing` or `resolved_after_correction`, pinned by a test that
adds a fourth outcome member and asserts the denominator does not move. #215's _strict
discriminants_ is the write side of this; this is the read side.

**#142's numerator has no guarantee of surviving the ring** (§6.2), and this record
accepts that rather than engineering around it. Its denominator is a counter; its
numerator cannot be one, because ADR-0053 §4 requires the vocabulary flags to be
recomputed at read. The bar is folded by a person over an export, and taking that export
before another `cap` sessions arrive is part of the fold. A level-ordered ring would not
have rescued this — it spoils the denominator instead.

**The `search` entry's `version` moves**, which is the first real use of #215's envelope
and the mechanism working rather than a conflict. Old records are kept, unparseable, and
leave by age with everything else, never deleted by a reader that cannot read them.

**A figure in a decision that cannot be reproduced from any declared shape is an unstated
decision hiding inside a measurement.** This map priced the search channel wrongly three
times, and each time the error was the same kind: a byte figure quoted without the shape
it was measured over. §8.1 states the shape beside every number for that reason, and the
invariant test is what keeps them honest from here.

**`app` duplicates every record to devtools**, so nothing is lost to a developer watching
live, and the 38 `console.*` calls become one call site each rather than two. It is also
the channel most likely to be exported by somebody who has been asked for it, which is
what §13's blockers are protecting.

**The export gains no control, and disclosure stays per channel, all or nothing** (§10.1).
Somebody will want to hand over the errors without the searches; the answer is to uncheck
`search`, which is coarser than a level filter and is the only granularity that means what
it appears to mean. A level filter was specified, found to keep the query text while
dropping the successes, and withdrawn.

**A jar-wide channel is visible from a Facet that cannot delete it** (§13). Rations shows
`app`, exports `app`, and can clear it from its own card, but _Delete all my food data_
leaves it standing — correctly, since it is not food data, and confusingly, since it sits
in the same card as two channels the wipe does take. The card is where that has to be
said.

## Amendment (2026-09-05): one module owns the keyspace, and §12 gains a fourth runtime throw

§12 says "Runtime, and only these three", and the third of them — a duplicate `name` — was
argued from the `localStorage` key: "two channels sharing a key would each read the other's
records as unreadable and shed them". That argument covers less than it appears to. A
channel's name is not its key, it is one input to **two** keys, and a comparison of names
sees a collision only when the names are equal.

§9 made that live rather than theoretical. `inventoria_log_<name>_counters` sits **inside**
the channel keyspace, where the pause and the dial sit outside it by the single character
between `logs_` and `log_`. So a channel named `<x>_counters` claims `<x>`'s counter key,
the two names are different, and the duplicate-name check passes. The code said so and
declined to act, on the ground that the suffix is this record's own literal key, that no
suffix is unclaimable while names are free strings, and that the collision needs two
channels one of which is named after the other. That is a sound reason not to ship a fourth
ad-hoc `throw` beside three ad-hoc ones. It is not a reason to have no guard once a seam
owns the keyspace.

### The seam

`src/lib/logs/log-keyspace.ts` is the only module that builds a log key or reads or writes
under one. It owns all four shapes, the `_counters` suffix included, and the stored shape
of each — which was an assumption spread across four private functions, where anything
widening it would have made every existing record read as malformed and vanish on the next
write.

The guard falls out of it. `channelKeys(name)` is every key a channel claims, whether or not
it has written one; `heldKeys` is what the reserved keys and the registered channels already
hold; `keyCollision` intersects the two sets. Set against set is what makes it symmetric —
it refuses `notes_counters` after `notes` and `notes` after `notes_counters`, where a check
written from the collision somebody noticed catches one order and passes the other.

**A fifth key shape is then guarded by the edit that adds it**, and so is a Facet-scoped
wipe, which asks the same function what a channel claims (ADR-0079 §2). The note this
replaces had to be re-argued for every future key shape; the guard costs nothing per key.

### The fourth throw, and why it is not the third

A duplicate name and a key collision are different failures and both are kept. A duplicate
name is about the **registry**: the map is keyed by name, so the second declaration replaces
the first and the review shows one row where two channels are writing. A key collision is
about **`localStorage`**, and it is the one a name comparison cannot see.

Registration is still an import side effect, so #221's objection to a runtime throw stands
in full: this is a boot crash rather than a review comment. It is taken for the same reason
the other three are — a channel whose keys are somebody else's is a channel that silently
destroys another channel's records, which is worse than failing to start, and there is no
compile-time device that could catch it without the central literal union §12 rejects.

### The shed stops pairing channels by array index

Unrelated to the keys and fixed in the same act, because it is the same class of defect.
`enforceBudget` walked three arrays — the registry, the before-state and the after-state —
by one index, so any future divergence between them would write one channel's entries to
another channel's key, silently. `shedToBudget` stays pure and its result is now applied by
**name**: `channelsThatShed` pairs before against after by name and skips a name the shed
did not receive, because a shed cannot invent a channel and the conservative answer to a
divergence is to write nothing.

"Budget shedding only ever walks entries" was a real property of the pure function and an
implicit assumption of the loop that consumed it. It is now neither implicit nor an
assumption.

## Amendment (2026-09-05): one module owns the roster, which is not the central registry §12 rejected

§12 rejects a central literal union of channel `name`s and gives three reasons for it. The
third — that a union "re-introduces the central registry #221 exists to remove" — is wrong
about #221, and the same sentence appeared in `log-facility.ts` beside the rejection. #221
is the observation that registration is an import side effect, and what it asks for is a
central list. `src/lib/logs/channels.ts` is now that list.

The two are different things and the distinction is what makes both decisions right at
once. A union of **names** declares a channel's name away from the channel, catches typos
only, and leaves the duplicate check standing; it is still rejected, unchanged. A list of
**modules** declares nothing about any channel and is the one thing no build can derive:
which channel modules exist is a fact about intent, and until it was written down the
answer was whichever modules some screen happened to import.

The first two reasons for the rejection are untouched. So is §1's declaration-and-
registration-in-one-act, which the roster does not weaken — it fixes the order in which
those acts run and guarantees they all run.

**Two properties follow, and neither was true before.** A channel whose only importer went
away no longer vanishes from the Local Logs card, the review sheet and the export while its
records stay in `localStorage` unreachable and unredactable — the state §11's reviewed
export exists to make impossible. And the order channels appear in a review and in a file
somebody hands over is the order the roster states, rather than import order.

The roster is also the door: `channelsOfFacet` is taken from it, and no caller outside
`src/lib/logs/` takes it from `log-facility.ts` directly. Reading a registry-derived list
through the module that fills the registry is what makes the answer independent of the
caller's own imports — which is the whole defect. The Facet-scoped wipe asks the same door,
for a sharper reason than a screen has: a wipe that missed a channel would report success
having left records behind (ADR-0079 §2).

**The roster decides order, never membership**, and the two halves are separate on purpose.
The order is applied where a surface asks, rather than left to the registry's own filling
order — that order is module evaluation order, which agrees with the roster today and stops
agreeing the moment somebody reorders one without the other. Membership stays the registry's:
a registered channel the roster does not name is still returned, last, because a channel in
the registry is a channel writing records and a surface that cannot show it cannot redact it
either. Reading the roster at that point is also what keeps its imports reachable from the
screens, so no future `"sideEffects": false` can shake the registrations out.

`tests/unit/log-channels.test.ts` holds all of it — that importing the roster alone fills
the registry, that it names exactly the channels expected, that every module in `src/`
declaring a channel is imported by it, that a Facet's surfaces get the roster's order, that
an unrostered channel is still shown, and that the other door stays shut.

## Amendment (2026-09-05): `scan`'s per-record figure is 129 B, not §8.1's 124

[#207](https://github.com/palebluebytes/inventoria/issues/207) built the scan channel,
and `tests/unit/log-budget.test.ts` weighed the record §8.1 could only project. The
dearest record `ScanLogEntry` admits — the longest member of each of the three enums, a
thirteen-digit clock, and the ERROR envelope — is **129 bytes**, five more than the table
says.

| Channel                                                     | B/record | KiB       | % of 256 KiB |
| ----------------------------------------------------------- | -------- | --------- | ------------ |
| `search`, cap 200, 48-char query, 10 fires kept, `{ l, n }` | 785      | 153.3     | 60%          |
| `scan`, cap 200, worst enum combination                     | **129**  | **25.2**  | **10%**      |
| `app`, cap 100, 256 B message                               | 364      | 35.5      | 14%          |
| **Total**                                                   |          | **214.0** | **84%**      |

**41.9 KiB of headroom** rather than 42.9, which is still a fourth channel of `scan`'s
size. §8's invariant is unaffected and the caps do not move.

The correction is recorded rather than made in place because of what it is evidence of.
Every other figure in §8.1 was **measured** over a shape that existed; this one was the
one row projected from a type nobody had written yet, and it was wrong by 4% in the
direction §8 warns about — an author's claim about a shape rather than a weighing of one.
That is the third instance this arc has of exactly that, and the reason §8 refuses a
`maxRecordBytes` field on the declaration at all.
