# ADR 0054: One local log facility, and no channel without a named reader

**Status:** Accepted  
**Date:** 2026-08-23  
**Amends:** [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md) — its §3 record becomes the first channel of the facility decided here, rather than a store of its own

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
