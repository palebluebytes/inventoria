# ADR 0054: One local log facility, and no channel without a named reader

**Status:** Accepted  
**Date:** 2026-08-23  
**Amends:** [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md) — its §3 record becomes the first channel of the facility decided here, rather than a store of its own
**Amended by:** ADR-0085 §2 (§4's export consent is a recorded consent on its own entity, not a setting), and the Amendment below, which splits §2 into two kinds of channel so that a standing one may exist, and adds lifetime counters beside the capped ring
**Implemented:** #149 `cd77667` (the facility, its caps and its budget), `b990903` (the per-channel review, redaction and export), `b9460df` (the recording switch's key, off the channel keyspace)

## Context

[ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)
decided that empty food searches are recorded locally, kept off the ledger, and
leave only through a reviewed hand-export. Its Consequences flagged the obvious
risk in one line: if more instrumentation follows, that is "a drift worth noticing
early rather than a precedent to lean on."

More instrumentation is wanted, so the drift is now the subject rather than a
footnote. The choice is not whether to instrument; it is whether the second
channel copies the first by hand.

**The status quo is 33 `console.*` calls in `src/lib`.** A projection error, a
failed op-log replay, an AI-autofill stub firing — every one of them writes to a
devtools console that nobody was watching at the time and that retains nothing.
Those are events with real diagnostic value that are unavailable the moment they
matter, which is after the fact.

### The alternatives that were live

**Let each feature keep its own store.** What ADR-0053 shipped, and workable
exactly once. The second one re-derives a cap, a redaction path, a review screen
and an export format, and the third one gets them subtly different — at which
point the consent story is per-feature and therefore not a story.

**Severity levels — `debug` / `info` / `warn` / `error`.** Rejected. Levels invite
"log everything at debug and filter later", which is the correct design for a
server draining to a sink with a retention policy and the wrong one for a device
with a 5 MB quota and a user who may hand the file to someone. Levels also answer
"how bad is this" when the question here is "who reads this, and what does it
decide".

**IndexedDB, or the OPFS SQLite ledger.** Rejected for now on both. The ledger is
out for the reasons ADR-0053's Amendment gives — undeletable and it syncs, while a
log must be redactable and must not travel. IndexedDB would lift the quota and move
writes off the main thread, and it is a second storage technology to own for
volumes that are currently kilobytes. The ceiling is named in Consequences so that
reaching it is a trigger rather than a surprise.

**A remote sink, even an optional one.** Rejected permanently, and §5 makes it a
rule rather than an omission.

### Scope

This record governs where local diagnostic and instrumentation records are kept,
what a channel must declare to exist, how records are capped and redacted, and how
they leave the device. **It does not make anything new be logged** — ADR-0053's
search channel is the only one it authorises.

It does not replace `console.*` for developer-time noise, does not touch the
ledger, does not add a transport, and does not decide #142.

## Decision

### 1. One facility, and channels rather than levels

A single module owns local log storage, and every record goes through it. A
**channel** is a named stream with its own shape, its own cap and its own
sensitivity. There are no severity levels.

A channel declares, in code, at the point it is registered:

| Declares      | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| `name`        | The `localStorage` key suffix and the label in the review UI |
| `reader`      | Who reads this, and the question it decides                  |
| `cap`         | Maximum entries retained, oldest dropped                     |
| `sensitivity` | `personal` or `technical`, which §4 shows in the review      |

### 2. No channel without a named reader and a question

**A channel may not be added unless its `reader` names a real consumer and a
decision that consumer will take.** ADR-0053's search channel reads: _"#142 and
#123; decides whether a per-token vocabulary tier is built, at the bar in ADR-0053
§7."_ That is the standard.

This is the whole of the anti-sprawl guard, and it is deliberately the same
discipline the sweep that produced ADR-0053 was held to: an instrument whose
threshold is chosen after the data arrives is a rationalisation, and an instrument
with no question is a data collection habit. "It might be useful later" is not a
reader.

A channel whose question has been answered is **removed**, not left running.

### 3. Storage is `localStorage`, never the ledger, and the budget is shared

One namespaced key per channel, `inventoria_log_<name>`, through the facility as
the single read/write path — the arrangement `src/lib/stores/secrets.ts` uses, for
the reason its header gives: "The ledger is undeletable and it syncs."

Two limits, because a per-channel cap alone does not bound the total:

- Each channel's `cap` in entries, oldest dropped.
- **A global budget across all channels**, enforced by the facility. Over budget,
  the largest channel sheds its oldest entries first.

**Writing is best-effort and never blocks.** A quota error, a privacy-locked
store, or an absent `localStorage` under the unit runner all read as empty and
write as a no-op. No feature ever fails because a log could not be written, and no
caller awaits one.

### 4. One consent gate, but export is chosen per channel

Export stays the consent event, in the model-C shape
[ADR-0034](0034-label-photo-food-capture.md) §8 establishes: a master setting that
defaults to off, and the payload shown for review before anything is written.

**What is exported is chosen per channel at export time**, not by one switch over
everything. A user willing to hand over a technical channel has not thereby agreed
to hand over what they searched for; bundling a `personal` channel with a
`technical` one behind a single yes is a consent surface that does not mean what it
appears to mean. The review shows exactly the selected channels, with `personal`
ones marked.

Redaction is **deletion from the channel**, in every channel, so what the review
shows is what exists.

### 5. The facility has no transport, and never gains one

There is no sink, no endpoint, no upload, no "optional" remote mode. The only way a
record leaves the device is a file the user exports by hand after reading it.

This is a rule about future changes rather than a description of the current code.
The distinction ADR-0053 rests on — that a local record is not telemetry — holds
only while it is structurally true, and it stops being structurally true the day
this facility learns to send.

## Consequences

**The second channel costs a declaration instead of a subsystem.** Cap, redaction,
review, export and budget are inherited; what a new channel writes is the only new
thing about it.

**33 `console.*` calls are now a visible choice rather than the only option.** This
record does not migrate any of them, and most should stay — developer-time noise
has no reader and no question, which is exactly what §2 excludes. The ones worth
promoting are those a user could be asked about after the fact.

**`localStorage` is the ceiling, and it is low.** Roughly 5 MB shared with secrets
and other app state, synchronous, on the main thread. That is ample for kilobytes
of session records and wrong for anything high-frequency. **A channel that wants
per-keystroke or per-frame volume is the trigger to revisit the storage choice**,
not a reason to raise the budget — and the alternatives are already named above.

**Per-channel export selection is more UI than one toggle.** It buys a consent
surface that means what it says, and the cost is a list with checkboxes and a
review that changes with the selection.

**§2 will be argued with.** Someone will want a channel for something plainly
useful with no reader yet. The answer is that the channel waits for the ticket
that reads it, which is slower and is the point: this facility exists because a
project with no usage data wanted evidence for one decision, not because it wanted
a habit of collecting.

**Nothing here is measured.** ADR-0053 §7 pre-registers what its channel must show;
this record pre-registers nothing, because it decides a shape rather than a
question. A facility whose only channel never clears its bar was still the right
shape to put that channel in, and would still have been overhead.

## Amendment (2026-08-29): §2 admits a standing channel, and the ring gains counters

§2 permits exactly one kind of channel: one that answers a question and is then
removed. That was the right rule for a facility with one channel and one blocked
ticket behind it, and it is too narrow for what the facility is now being asked
for — a view of what Open Food Facts does for this device that does not end.

This record predicted the argument and refused it in advance: _"§2 will be argued
with. Someone will want a channel for something plainly useful with no reader yet.
The answer is that the channel waits for the ticket that reads it."_ That answer is
kept for question channels, and it is not extended to cover a case it was not
written about. What follows is a decision, not a discovery that §2 was wrong.

### The principle §2 was actually protecting

§2 reads as "no channel without a named reader". What it protects is narrower and
more durable: **no collection without consumption.** A record nobody consumes is a
data collection habit, and the ticket-plus-bar construction is one way to prove
consumption, not the only one.

A channel that never ends cannot prove consumption with a ticket, because tickets
close. It proves it with a **surface**: something in the app that displays the
channel to the person whose device holds it.

### The rule

There are two kinds of channel, and every channel declares which it is.

**A question channel** is §2 unchanged. Its `reader` names an open ticket and the
decision that ticket cannot take without the reading, it points at a pre-registered
bar, and **it is removed when its question is answered.** `search` is one.

**A standing channel** does not end and has no bar. In place of a ticket its
`reader` names **a surface in the app that displays it**, and the rule is the
mirror of §2's: **a channel nobody can look at may not exist.** A standing channel
declared without a view, or whose view is later removed, is itself removed.

**A standing channel is `technical`, never `personal`.** This is the load-bearing
restriction and it is not a stylistic preference. A question channel's `personal`
data is bounded in time because the channel dies when its question is answered; a
standing channel's never does, so a `personal` standing channel is a permanent
record of what somebody was thinking about eating. Nothing on this device needs one.
A standing channel that finds it wants a `personal` field wants to be a question
channel instead.

### Why a surface is a real cost and not a formality

The guard §2 provides is that a channel is expensive enough to be argued for. That
survives: a standing channel has to earn a view somebody designed, in a surface a
user will actually open, and a view is more work than the channel. Sprawl shows up
as a review screen nobody can read rather than as a declaration nobody notices,
which is the failure mode that gets fixed because it is visible.

The cheap alternative was rejected: a standing channel that appears in the export
but has no view of its own would satisfy the letter of "somebody can look at it"
while restoring exactly the silent-declaration cost §2 was built to stop.

### The ring cannot report a rate, so the facility gains counters

§3's cap drops the oldest entry, which is correct for a question channel — the
question is answered from recent evidence and the channel then goes away. It is
wrong for a standing view of a rate. A capped ring silently forgets its own
denominator, so "the failure rate since I started using this" computed from 200
retained entries is the failure rate of the last 200 sessions wearing a lifetime
label, and it drifts without anything looking wrong.

**A channel may therefore declare counters beside its entries: named integers that
only ever increase, are never shed, and are not subject to the cap.** They are
written in the same append the entry is, cleared only by the channel's own clear,
and exported with it.

Three constraints, because a counter is the one part of this facility that is
permanent:

- **A counter counts occurrences of a value the channel already records.** It is a
  running total of a field, never a new fact, so nothing can be counted that the
  reviewable entries do not also say while they last.
- **A counter is a whole number and nothing else.** No identifiers, no timestamps
  beyond the channel's own, no sums of anything a user typed.
- **Counters are shed last and cleared together.** §3's budget sheds entries; if
  shedding every entry is not enough, the channel is over budget and the counters
  still stand, because a few integers are not what filled 256 KB.

### What this costs

**The facility now has a permanent part.** Everything before this was capped,
shed, redactable and mortal, and that uniformity was worth something: "delete the
entry" was the whole answer to any question about what the app remembers. It no
longer is. Clearing the channel remains the answer, and it is one action further
away than deleting a row.

**Two kinds of channel is a distinction someone will get wrong.** The likeliest
mistake is a standing channel declared for something that is really a question,
because standing has no bar to pre-register and is therefore easier. The bar was
never the point of a question channel — a threshold chosen after the numbers
arrive is a rationalisation — so the check to apply is not "does this have a
surface" but "would this be removed if the question behind it were answered". If
it would, it is a question channel and it needs its bar.

**A surface can rot.** A view can stay in the code and stop being reachable, or
stay reachable and stop being read, and neither is detectable from the declaration.
This is a weaker guarantee than an open ticket, which at least somebody closes.
It is accepted as the price of a channel that does not end.

**`personal` standing channels are foreclosed, including ones that would be
useful.** A standing view of which foods a person searches for is exactly the thing
ADR-0053 refused off-device and this now refuses on-device as well, for a smaller
reason: not that it would leak, but that it would accumulate without end on a
device holding an eating history. That is a real capability given up.
