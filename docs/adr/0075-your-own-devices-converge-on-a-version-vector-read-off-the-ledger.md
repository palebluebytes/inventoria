# ADR 0075: Your own devices converge on a version vector read off the ledger, while both are awake

**Status:** Accepted  
**Date:** 2026-08-29  
**Amends:** [ADR-0020](0020-logical-clock-ordering-over-wall-clock-key.md) (§8 gives advance-on-receive the live **peer** its Consequences were waiting for, and corrects that record's claim that the path has no caller at all)  
**Amends:** [ADR-0018](0018-notes-checklist-crdt-oplog-in-ledger.md) (§9 measures its one-channel promise against a sync transport that now exists, rather than against one that did not)

## Context

Three accepted records have been parked on this. [ADR-0014](0014-namespace-prefixes-for-eavt-entity-identification.md)
made entity ids deterministic so that two devices merge cleanly "upon sync";
[ADR-0018](0018-notes-checklist-crdt-oplog-in-ledger.md) put the Notes and Checklist CRDT
op-log **inside** the ledger specifically to avoid a second sync channel; and
[ADR-0020](0020-logical-clock-ordering-over-wall-clock-key.md) built advance-on-receive for
a transport that did not exist. [#179](https://github.com/palebluebytes/inventoria/issues/179)
held the gap. This record closes it.

The transport is settled and not reopened here:
[ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md)'s relay is
audience-agnostic, forwarding sealed bytes between two live sockets. **One transport, two
session models** — the audiences differ only in where a room id and a session key come
from. Person-to-person mints an ephemeral pair per send. This half derives a pair from a
**remembered** pairing secret, and that single difference is where the interesting problem
turned out to be (§5).

### The alternatives that were live

- **A hub-and-spoke model**, one device holding the pairings and able to revoke the others.
  Refused in §4, and the reasoning matters more than the verdict.
- **A single scalar HLC watermark** instead of a per-device vector. Refused in §6 as
  **wrong rather than coarse**.
- **Send everything every time and let `INSERT OR IGNORE` sort it out.** Correct and
  unaffordable: a photo-bearing ledger is tens of megabytes, paid on every sync rather
  than once.
- **Four sync triggers** — an explicit button, whenever both are open, on open only, on
  write. §2 chooses.
- **Store-and-forward**, so a phone in a pocket could converge later. Refused in §1, and
  not by this record's choice.

### Scope

This record is a **decided design and ends here**. It cuts no implementation tickets;
implementing it waits on the person-to-person half existing, and whoever picks it up starts
from this record rather than from a plan. It does not reopen the transport (ADR-0072), and
it deliberately inverts three payload rules from
[ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) — see §7.

## Decision

### 1. Both devices must be awake, and that is inherited rather than chosen

**Two devices converge only while both are awake and connected. A phone that is never
opened alongside another device never converges.**

This half cannot buy its way out with a server that holds state, for two independent
reasons: ADR-0072 §5 refuses store-and-forward **at any layer**, not merely for the
person-to-person half; and a sync server that stores datoms contradicts the local-first
premise the ledger is built on, which is a scoping decision rather than a technical one. A
sealed blob parked in a Durable Object is still your ledger sitting on somebody else's
disk — the seal changes who can read it, not what it is, and a free tier's 5 GB makes that
look affordable rather than making it right.

So the synchrony rule transfers from the person-to-person half after all, with a **different
argument**: there it exists so a meal is never in three places; here it exists because
nothing is allowed to hold state. The argument is what a later reader needs, not the
citation.

### 2. It runs automatically, and a device listens only while its tab is visible

A paired device **joins its room while the tab is visible and leaves on `visibilitychange`
or `pagehide`.**

On-write is a room join per datom. On-open-only misses the case where the second device is
opened later, which is most of them. A button is honest and makes the secondary device a
chore.

**"Silently" means no inbox and no approval, not unprompted.** That reading is what makes
automatic convergence legal here, and it is written down because the other reading would
have forced the button.

**This is the narrowest possible form of ADR-0072 §5's sanctioned divergence.** That rule —
no background listener, no persistent address, nothing reachable while the app is closed —
is broken by exactly one clause: **a device listens only while a person is looking at it.**
No push, no Background Sync, no service-worker wakeup, nothing that runs when the app is
closed.

### 3. A Paired Device is three fields in `localStorage`, and never a datom

**A Paired Device is `{ device_id, a name the user typed, a 256-bit pairing secret }`**, in
its own module beside `stores/secrets.ts`. It is never written to the ledger and never
leaves in an ADR-0064 export.

Two arguments, and the second is specific to this design:

- Secrets never live in the append-only ledger, because it is undeletable **and it syncs**.
  Putting a pairing secret inside the thing it unlocks is circular.
- **A revocation cannot live in an append-only log that the revoked device also writes
  to.** If the paired-device list were datoms, unpairing on one device would be **undone by
  the next sync from the other**: the deletion is not a fact the ledger can represent, and
  the pairing datom would simply come back. This is a sharper form of
  [ADR-0063](0063-a-setting-is-a-datom-only-if-its-past-matters.md)'s test than that record
  had to consider — not _do its past values matter_ but _would keeping its past make the
  present unrepresentable_.

**The stored secret is never itself a wire key.** §5 derives both the room id and the
session key per session, so what sits on disk is a seed rather than a credential in use.

### 4. Pairwise, with no main device, because there is no authority to concentrate

**There is nothing to authorise.** The relay is a two-socket room, and a device alone in it
receives nothing. Deleting a pairing on either side severs that pair completely,
unilaterally, with no coordination and no message. Every device already holds total power
over its own pairings. And **no model takes your ledger off the device you lost** — it
already has everything up to the moment it went missing. "The power to revoke" is, under
every design, the power to refuse to show up, and it is already distributed.

**A hub would be a convention, not a mechanism.** The pairing secret is symmetric and the
relay is dumb, so nothing could enforce which side is the hub; a spoke that changed its mind
would be one. And **hub replacement has no answer**: the phone is the device most likely to
be lost, stolen or upgraded, and a new phone starts with an **empty** ledger, so a strict
hub model would require a spoke to accept a hub it has never seen — hub election, a problem
this app should not own. Under pairwise, a new phone pairs with the laptop and pulls
everything.

**The hole the hub proposal found is recorded rather than argued away.** At three or more
devices, transitive gossip means a device revoked at A **keeps receiving your new data
through B**, which is still paired with it. Pairwise revocation is N−1 acts and **silently
incomplete if one is missed**.

**It is a duality, not a defect: convergence that routes around a sleeping device and
revocation that is complete in one act are the same property seen twice.** Paths around a
missing device are paths around a revoked one, and a hub is simply the choice to give up the
first in order to have the second. **At N = 2, the actual case, the distinction has no
observable consequence at all.**

What the hub was really for is delivered at the surface instead: **a Devices screen on every
device, listing every pairing that device holds**, so revocation is one visible act rather
than a hunt.

### 5. The room id must not be a stable observable, and the obvious derivation makes it one

**This is the finding that pays for this record, and it belongs to this half alone.**

ADR-0072 mints a room per send, so the operator sees room `X` light up, two sockets, a few
KB, gone — then room `Y`, unconnected to `X`. That is _unlinkable meetings_ made real. Derive
this half's room from a **remembered** secret and the obvious construction —
`roomId = hash(secret)` — produces a **constant for the life of the pairing**: the same
string, twice a day, for years.

That constant is a persistent pseudonymous handle. The relay necessarily sees IP addresses,
and under a fixed room id those addresses **join up** — home, office, café, hotel — all filed
under one key, together with when you use the app, how often, and when you stopped. The seal
means the operator never learns _what_ crossed; a stable id lets them join up **every occasion
on which anything crossed**, which is the protection that actually mattered.

**In one sentence: a stable room id is a join key.** With rotation, correlating your sessions
is traffic analysis on metadata the operator happens to hold. With a constant, it is a `GROUP
BY` — the protocol has done the work and put the answer in a column.

**This is a different breach from the configuration one ADR-0072 §9 fixes.** Turning
invocation logs off cannot help here, because Cloudflare still routes on the id and the
Durable Object's _identity is_ the id. **The two are separate, both are required, and neither
substitutes for the other** — a reader who finds only the logging decision would reasonably
conclude the clause was met. And it is the same trust the design has already declined to
extend: having refused transport TLS as a confidentiality control because the operator would
hold plaintext (ADR-0072 §2), this declines to trust the same operator with the index.

**The decision:** _a stable secret must not produce a stable observable._ **Both the room id
and the session key are derived per session from the pairing secret and a rotating epoch** —
`KDF(secret, epoch)` — which both devices compute independently with no exchange and no extra
round trip. A joiner also tries the adjacent epochs to absorb clock skew, and the failure mode
is the one §12 already handles. The KDF and the epoch length are implementation; the property
is this record's.

**Two honest limits.** It does not hide you from the operator: two devices meeting daily from
the same pair of IPs are re-linkable by IP alone, so this is defence in depth rather than
anonymity. And it is **cheap now and expensive to retrofit**, because changing the derivation
later invalidates every existing pairing and everyone re-pairs.

### 6. What moves: a version vector the ledger already knows how to compute

**The watermark is not stored, it is queried**, so ADR-0067 §2's refusal of an import log
does not apply at all.

Every datom carries the `device_id` that minted it, and a device's own stamps are strictly
monotonic — `Hlc.now` raises `hlc_ms` or increments `hlc_ctr`, and `Hlc.update` likewise. So
the greatest `(hlc_ms, hlc_ctr)` **per originating device**, read straight off `datoms`, is an
exact statement of what this device holds from that device. Each side sends its vector; each
side sends back everything above the other's. **Nothing is missed**, and there is no second
table, no import log and no content hash to fall out of step with the ledger, because the
vector _is_ a read of the ledger.

**A single scalar HLC watermark is wrong, not merely coarse.** A peer can hand you a row
stamped _below_ your maximum — from a third device, or from a device whose wall clock was
behind — and a scalar filter would silently drop it. The bug would be invisible and permanent.

**It adds no assumption the ledger does not already make.** The vector's correctness rests on
per-device stamp monotonicity, which `appendDatoms`' plain `INSERT` already relies on: a
collision there means the clock issued one stamp twice, and that must be heard about.

**Two properties fall out for free.** A **first** sync is just the empty-vector case, so it
needs no separate code path. And **resume after a dropped socket costs nothing**: reconnect,
re-exchange vectors, continue from wherever it got to.

### 7. The payload is unsplit, and three of ADR-0073's rules invert

**Superseded datoms cross** (or it is not a ledger sync), **photos cross**, and **stamps are
kept rather than restamped**. The full `twin/raw_provenance` share — 39.8% of a measured
ledger — crosses too, and the two copies of a label photo at 55.6% together.

The defence, rather than the inheritance: **a device that lacks your photos is not a second
copy of your ledger, it is a lossy one**, and this half exists so that either device can be
the one you keep.

**ADR-0073 §6's skip rule inverts, and this is the sharpest of the four.** Skipping an entity
you already hold is right when a stranger hands you a meal, because a merge would let their
numbers overwrite your corrections. Between your own devices it is exactly wrong: **the whole
point is that a later fact wins.** Merge at attribute granularity, always.

**Chunking is a v1 requirement here, where the other half got to refuse it.** A 1 MiB meal
crosses in one WebSocket frame; a first sync does not. **The chunk is sealed, not the
stream**: a single AEAD seal over 30 MB cannot be verified until the last byte, which means
holding the whole thing in memory before writing a row. So **one seal per chunk, with the
chunk's sequence number bound into the AEAD's additional data**, so a chunk cannot be
reordered, replayed or dropped without the seal failing. That yields incremental
`importLedgerRows` batches — the shape `db.worker.ts` already has, with its `final` flag
driving one invalidation broadcast at the end — and makes §6's resume genuinely cheap: a
dropped socket costs the chunk in flight, not the sync.

**What does not cross is everything that is not a datom**, and that exclusion is
structural rather than a rule anyone has to remember: the payload is the `datoms` table,
so the `localStorage` side-cars stay behind — the secrets, the **Paired Device** list
itself (§3), and
[ADR-0053](0053-an-empty-food-search-is-recorded-locally-and-leaves-only-by-hand.md)'s
local search log, which #179 asked to have carried forward explicitly. A later design that
moves per-device state **into** the ledger has to revisit that, because the exclusion would
stop being structural the moment it did.

§6 confines the whole cost to the **first** sync, which is the answer to whether compaction
becomes a prerequisite. It does not.

### 8. The clock: `Hlc.update` per chunk, against that chunk's greatest stamp

On the receiving side only. This is not new machinery: `importLedgerRows` already returns
`highWater` and `db.worker.ts:168` already feeds it to `hlc.update` on every `ledger_import`
batch. The sync path reuses that seam unchanged.

**A correction to the record, and to this map's own framing.** ADR-0020 says the
advance-on-receive path "is not yet wired to any sync transport, since none exists". The
mechanism **ships today and runs on every Settings → Import Ledger**. What this half adds is
a **peer**, not a first use, and that is a smaller change than three separate documents
assumed.

**It is the exact opposite of ADR-0073 §7, deliberately.** There, everything is restamped and
the local HLC is never advanced, because keeping a stranger's stamps requires advancing to
them and a sender whose phone says 2030 would drag your clock forward permanently. **Here,
keeping the stamps and advancing to them is the convergence mechanism** — you are the sender,
so the risk that argument names does not exist.

### 9. Notes and Checklist ride the ledger, with no second channel

**Confirmed at the ledger layer rather than assumed.** A `notes/op` datom is an ordinary row
keyed on `(entity, attribute, hlc_ms, hlc_ctr, device_id)`, so two devices' ops both survive
`INSERT OR IGNORE` — the device component of the key is what keeps concurrent ops from
colliding. `NotesStore.init` reads **all** `notes/op` rows in ascending HLC order and imports
each, and Loro's ops are commutative, so the merge is correct by construction. **ADR-0018's
central justification survives**: this map adds one channel and both audiences ride it.

**A data-layer guarantee can be entirely correct and entirely unobservable.** `NotesStore.init`
returns early on its `#initialized` guard and **never subscribes to `dbClient.onInvalidate`**,
so ops that land after the tab loaded sit in `datoms` and never reach the live `LoroDoc` until
reload. That already misfires on Settings → Import Ledger today, before sync exists, so it is
an ordinary defect rather than a sync decision and is filed as one.

**Op-log compaction stays deferred.** ADR-0018 said revisit past roughly 500 ops per document.
Two devices append at the sum of their rates, but the deltas are tiny and §6 means an op
crosses the wire once and never again. Nothing here promotes compaction to a prerequisite.

### 10. A disagreement is recorded, not shown

**Nothing is shown per attribute, and the reason is that nothing is destroyed.** The ledger is
append-only, so the losing value is still a row, still queryable, permanently. That is
materially different from a system that overwrites, and it makes the honest answer _the
disagreement is recorded, and surfacing it is a history feature this record does not own_. The
sync surface reports what `importLedgerRows` already returns — rows added — and nothing more.

**One sharp edge, named rather than left to be discovered.** Two edits made before any sync
have no causal relationship, so latest-wins falls through to ADR-0020's `device_id` tiebreak:
**deterministic, identical on both devices, and arbitrary from the user's point of view.**
Advance-on-receive prevents this only _after_ the two clocks have met; it cannot order writes
that never saw each other.

### 11. Steady state shows nothing; a first sync shows progress

"Silently" means no approval, not no feedback, and the two cases genuinely differ. §6 makes
steady-state sync near-instant and invisible. A **first** sync moves tens of megabytes over a
foreground-only socket that dies the moment you switch tabs, and a silent forty-second
transfer that vanishes when you look away is not silent, it is broken.

- **Steady state shows nothing at all.** No spinner, no toast, no badge.
- **A first sync shows progress on the Devices screen** — detectable without a flag, because
  the peer's vector is empty — and says plainly that it needs the tab to stay open.
- **An interrupted first sync is not an error and not a rollback.** Every chunk already
  committed is real data, correctly stamped; reconnecting re-exchanges vectors and continues.

### 12. Silence is the revocation signal

A deletes the pairing; B still holds it and keeps joining the room, waiting alone forever,
learning nothing.

**A device alone in its room times out and says the pairing is one-sided** — not that the
network failed. Those are different news and only one is actionable: unpair it here too, or
pair again.

**A revocation must never be a message A sends B.** A message can be dropped, blocked or
simply missed, and a revocation you can suppress is worse than none, because it reports
success. **Silence is the only signal that cannot be forged**, and the two-socket room produces
it for free.

### 13. No payload ceiling, and the two refusals that do carry

ADR-0073 §9's 1 MiB bounds a payload from **another person**. There is no such peer here, so
**there is no payload ceiling: a ledger is as big as it is, and a rule that refuses your own
data is a rule against convergence.** The bounds that remain are per-chunk (the frame) and
per-session (patience).

ADR-0073 §8's refusals mostly do not transfer — the closure roots, the artifact discriminator
and the entity-reachability check all exist to tell a stranger's meal from a bag of datoms, and
there is no closure here, only a ledger. **Two carry**: a chunk whose seal fails is refused,
and rows failing `importLedgerRows`' column validation are refused. Not because a paired device
is untrusted — the seal is what makes it yours — but because **if the seal held and the rows
are malformed, that is a bug, and a bug that writes to an append-only ledger is undeletable.**

**ADR-0073 §11's arrival mark is never written on this path.** A datom from your own device did
not arrive from elsewhere.

### 14. The refusals, recorded so nobody later "fixes" them

1. **No store-and-forward, no queue, no parked bundle.** §1. A phone in a pocket does not
   sync, and that is the design.
2. **No background listener, no push, no Background Sync, no service-worker wakeup.** §2.
3. **No main device, no hub, no revocation authority.** §4, including the accepted N ≥ 3
   gossip hole.
4. **No stable room id, ever** — not as a v1 simplification to be tightened later. §5;
   retrofitting invalidates every pairing.
5. **No scalar HLC watermark.** §6. It is wrong, not coarse, and its failures are silent.
6. **No revocation message, no unpair notification, no tombstone.** §12.
7. **No per-attribute conflict UI.** §10. Nothing is lost, so there is nothing to report.
8. **No payload narrowing.** §7. Superseded datoms, photos and the full provenance share all
   cross.

## Consequences

**A phone that is never opened alongside another device never converges.** That is the
map's own scoping showing up as a user-visible property rather than a gap in this design, and
it is the single largest thing a user could reasonably expect and not get.

**Revocation is N−1 acts at three or more devices and silently incomplete if one is missed.**
Accepted as the price of convergence that routes around a sleeping device. At two devices it
costs nothing.

**Changing the room-id derivation later invalidates every pairing.** §5 is cheap now and
expensive to retrofit, which is why it is decided here rather than left as a v1 simplification.

**The first sync is the expensive one**, and it pays `twin/raw_provenance` in full — a cost
ADR-0073 avoided for the other half. The Open Food Facts adapter fetching with no `fields=`
filter and storing the whole API envelope (85, 108 and 149 KB measured) is now this half's
cost alone, and it is filed as an ordinary defect rather than carried here.

**The version vector was already in the ledger, and nobody had noticed.** ADR-0020 gave every
datom a `device_id` for a tiebreak; that field turns out to be a complete per-origin sync
watermark, computable by query. ADR-0067 §2's "no state about the ledger outside the ledger" is
honoured without effort rather than traded against.

**A remembered secret's hazard is not the secret — it is the shape of what it derives.** The
map put the confidentiality bar in its own scope rather than letting it be inherited by picking
a library. §5 is the specific place that mattered, and it was not visible until pairing became
remembered.
