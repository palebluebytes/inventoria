# ADR 0071: A scan session is recorded locally and stands, carries no barcode, and is read from a view in the app

**Status:** Accepted  
**Date:** 2026-08-29  
**Depends on:** [ADR-0054](0054-one-local-log-facility-and-no-channel-without-a-reader.md)'s Amendment of 2026-08-29, which admits a standing channel and adds the counters this record relies on

## Context

Nothing records what happens when the app looks a barcode up against Open Food
Facts. [#204](https://github.com/palebluebytes/inventoria/issues/204)'s four
outcome classes, [#206](https://github.com/palebluebytes/inventoria/issues/206)'s
retry and the four capture doors all exist, and none of them leaves a trace.
[#204](https://github.com/palebluebytes/inventoria/issues/204) had to be diagnosed
by reading code, which is the gap
[ADR-0054](0054-one-local-log-facility-and-no-channel-without-a-reader.md)'s own
Context describes: events with real diagnostic value that are unavailable the
moment they matter, which is after the fact.

Two things want that record, and they want it for different lengths of time.

**[#208](https://github.com/palebluebytes/inventoria/issues/208) wants a number
once.** It asks whether a locally captured `gtin:` twin should ever be re-checked
against OFF. A local twin short-circuits the lookup before OFF is reached, so a
capture made for the wrong reason is permanent, and nothing on the twin says
whether it was hand-typed because OFF was wrong or because the network failed.
#204 closes the door that manufactured the second kind — but the `unreachable`
state **offers** a retry, it does not compel one, so whether that door is actually
closed is not knowable from the code. A user who declines to wait and hand-types
the label anyway produces exactly the twin #208 is about, on a barcode OFF carries.
#208 also refuses to be argued without a measurement, citing two of this repo's own
scars: a drop rule's reach must be priced as the population it left
([#144](https://github.com/palebluebytes/inventoria/issues/144)), and an unmeasured
guard is a hole ([#131](https://github.com/palebluebytes/inventoria/issues/131)).

**The device's owner wants a view that does not end.** How often the scan works,
and how often OFF fails them, as an ongoing fact about the app rather than a
question that closes. That is not a reader ADR-0054 §2 admitted when it was
written, and the Amendment of 2026-08-29 is what admits it.

### The alternatives that were live

**A question channel with a pre-registered bar, removed once #208 has its number.**
Drafted in full and rejected on the second reader: it answers #208 forty sessions
wide and then deletes itself, which is the correct shape for #208 alone and gives
the owner nothing standing. The bar it carried — build at 5 `unreachable` sessions
that ended in a capture, close at 40 settled sessions with fewer than 5 — is not
lost. §5 keeps it as the reading #208 takes, without the removal it used to imply.

**Three candidate readers that do not clear ADR-0054 §2 at all**, recorded because
the same three will be offered again:

1. _Decides whether the app should call OFF through its own proxy._ This instrument
   cannot point either way on that fork. OFF rate-limits by IP; behind the proxy
   every user shares one Cloudflare egress, which makes 429s more likely rather
   than fewer, and per [ADR-0070](0070-the-proxy-is-part-of-the-site-it-serves.md)
   that request now draws on the limit the site itself is served from. A 503 from
   OFF is a 503 through a proxy. The proxy's real lever is caching, and cross-user
   cache-hit potential is invisible to a per-device record.
2. _Decides whether #206's single retry is enough._ Not blocked on a reading. Every
   number in the retry policy was chosen by argument, and a second attempt is a
   one-line constant change available today on the same kind of argument.
   [#130](https://github.com/palebluebytes/inventoria/issues/130)'s discipline is
   aimed at unmeasured **mechanisms**, where the build's cost is what makes
   evidence load-bearing.
3. _Decides whether OFF's unnamed 400/403 class deserves its own state._ The
   strongest of the three, and it fails on §2's other half: #204 is closed, and a
   reader naming a closed ticket names nobody.

**Carry the capture door onto the twin as a datom instead.** Not rejected —
deferred, because it is one of the things #208 is deciding and this record must not
pre-empt it. The two are different instruments: a datom says what is true of one
twin forever, a channel says how often something happens across sessions. #208 may
conclude it wants both, or that the Ledger should not be asked to keep the
distinction at all.

### Scope

This record decides what a scan leaves behind, what it may never carry, what stands
permanently, and where it is read. It does not decide the re-check policy, the
recovery path for twins already written, or whether the capture door belongs on the
twin — all three are #208's, and this exists so that #208 argues them over a number.
It changes nothing about the lookup, the retry, or the four capture doors. It adds
no storage, cap, redaction or export mechanism: those are ADR-0054's and are
inherited whole, including §4's per-channel reviewed export and §5's rule that the
facility never gains a transport.

## Decision

### 1. A standing channel, with a surface and a consumer

The channel is **standing** in the sense of ADR-0054's Amendment: it does not end,
it has no bar to clear, and its `reader` names the **view** that displays it.

It also names **#208** as a consumer, and the two are not in tension. §5 sets out
what #208 reads and when. What the Amendment forbids is a standing channel whose
only justification is a ticket, because tickets close and the channel would not.
Here the surface is the justification and #208 is a beneficiary; when #208 closes,
the channel stays and its `reader` loses one clause.

### 2. One entry per scan session, never one per lookup

A **scan session** opens when a barcode lookup starts and settles when the user
stages a food, opens a capture door, or leaves the scan without doing either. It
leaves exactly one entry.

This is [ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)
§2's rule, kept for a different reason. There the unit was the session because a
debounce turned one typed phrase into eleven searches. Here the lookup fires once
per submitted code, so volume is not the argument. The argument is that **the fact
#208 needs is a sequence** — an outcome, and then what the user did about it — and
a sequence spanning two entries has to be rejoined by a key. The only key available
is the barcode, and §4 forbids it.

### 3. The entry's shape

An entry holds four things and a timestamp:

- **`outcome`** — `found`, `absent`, `unreachable`, or `refused`. These are #204's
  classes named directly, never restated as a second list of HTTP statuses.
  `refused` is the 400/403 class #204 deliberately kept out of "failed to answer".
- **`attempt`** — `single`, `retried`, or `gate_skipped`, the third being the retry
  deadline declining to start a second ask. This is what makes a transient #206
  absorbed visible at all, since by design the user never saw it.
- **`door`** — `missing`, `poor`, `unreadable`, or `none`: which capture door the
  user opened after the outcome above, in this session.
- **`settled`** — whether the session reached one of the three endings in §2.

### 4. The barcode is never recorded, and that is what makes the channel technical

**Not the barcode, not the product name, not the brand, not the `gtin:` entity id.**

This is the whole reason §2 makes the session the unit rather than the lookup: with
the outcome and the door already in one entry, the linkage is made, and the
identifier that would otherwise have made it is redundant rather than merely
unwelcome. The privacy property is a consequence of the record's shape, which is
the only kind that survives somebody editing it later without reading this.

Sensitivity is **`technical`**, and ADR-0054's Amendment requires that of a
standing channel rather than merely permitting it. A list of scanned barcodes is a
shopping history; on a device that also holds an eating history, an unending one is
not something this app keeps.

The cap on entries is **200**, oldest dropped, per ADR-0054 §3.

### 5. Counters carry the rate, and the entries carry the detail

The channel declares counters in the sense of ADR-0054's Amendment: whole numbers
that only increase and are never shed.

One per `outcome` value, one per `attempt` value, one per `door` value, and one for
settled sessions. Nothing else. Every one of them is a running total of a field §3
already records, as that Amendment requires, so the counters say nothing the
entries did not say while they lasted.

**The rate is computed from the counters and never from the entries.** A rate taken
over a capped ring is the rate of the last 200 sessions wearing a lifetime label,
and it drifts with nothing looking wrong. The entries are for looking at what
actually happened recently; the counters are for how often.

**#208's reading is a counter reading.** The bar drafted for the question-channel
alternative survives here as the reading rather than as a trigger: #208 concludes
that #204 did not close the door when the channel has recorded **5 or more settled
sessions whose outcome was `unreachable` and whose door was not `none`**, and that
it did close it when **40 settled sessions have accumulated with fewer than 5 of
those**. The numbers are pinned here, before the channel exists, for the reason
ADR-0053 §7 gives — a threshold chosen once the numbers are in is a
rationalisation. The 40 is ADR-0053 §7's number, taken deliberately so that
denominators across the two channels are comparable. The 5 is a detector rather
than an estimate: it separates a door essentially shut from one being walked
through, and does not claim to measure how often.

Counting `unreachable`-then-a-door needs a counter of its own, because it is a pair
of fields rather than one. It is still a running total of what §3 records, so it is
admitted, and it is the only counter here that is not a plain field tally.

### 6. The view is what makes the channel legal

A view in the app shows this channel's counters as counts and as a proportion, and
its recent entries as a list. Without it the channel may not exist, and if it is
ever removed the channel goes with it.

It shows **this device's** scans. Nothing aggregates across people, because
ADR-0054 §5 leaves the facility with no transport and this record does not touch
that. The way a reading reaches anyone else is ADR-0054 §4's export: chosen per
channel, reviewed before it is written, and handed over by the person whose device
it is.

## Consequences

**The owner gets a standing answer to "does the scan work".** That is the thing
asked for and the reason this is a standing channel rather than the question
channel first drafted. It is also the first permanent record this app keeps about
its own behaviour, and it will be argued with the first time somebody wants the
same for something `personal`, which ADR-0054's Amendment forecloses.

**#208 gets its number without the channel dying to give it.** The trade is that
nothing fires by itself. A question channel evaluates its triggers on every write
and cannot be run until it says yes; a standing channel is read whenever somebody
opens the view, which is exactly the pressure §7's window existed to remove. §5
pins the numbers in advance, so what remains is the weaker property that they were
fixed before the data rather than the stronger one that the reading is forced. That
is a real loss and it is the price of the reader the owner asked for.

**With no users, the counters read zero for a long time.** The view will be empty,
correctly, and #208 stays blocked on it — ADR-0053's position on #142 transfers
unchanged: a question that needs usage data is open until there is usage data.

**The scan tab now has to know what the user did next.** Recording the door means
the session's ending reaches the log, so the outcome and the door cannot be written
from two places that do not know about each other. That is a small amount of
coordination in the scan flow and the only new coupling this record introduces.

**`technical` is a promise with a sharp edge.** The moment anyone adds the barcode
to make a future question answerable, this is a `personal` standing channel, which
ADR-0054's Amendment does not permit, and this record is being amended whether or
not its header says so.

**A view of failure rates invites reading causes into them.** A run of
`unreachable` says the service did not answer this device; it does not say whether
OFF was down, the network was, or a captive portal was in the way, and the channel
records nothing that would tell them apart. The view should not imply otherwise.
