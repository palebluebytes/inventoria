# Addressing a peer that was asleep

Research for [#250](https://github.com/palebluebytes/inventoria/issues/250), on the map
[let a device that was asleep converge later](https://github.com/palebluebytes/inventoria/issues/248).

The question was whether a device that has been asleep can find what was left for it **without a
stable address**, given that
[ADR-0075](../adr/0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md) §5
derives the address as `KDF(secret, epoch)` on a rotating wall-clock epoch, and that map decision 7
makes a stable room id unspendable.

All outside claims below were verified on **2026-08-31**.

## The answer in three sentences

**An address that two devices can compute without talking can only be a function of their shared
secret, of what they both knew when they last spoke, and of the clock — and while one of them is
asleep, only the clock moves.** So the reach of any derivation is exactly the rotation period of the
address it derives, and the ratchet does not escape that: the signal that would advance the chain is
itself a deposit, subject to the same expiry that made the store admissible in the first place. The
mailbox survives anyway, because the reach was never ours to choose — [#249](https://github.com/palebluebytes/inventoria/issues/249)'s
retention window already caps how long a deposit exists, so setting the epoch **equal to the
retention window** buys the largest reach the store can possibly serve, at exactly one probe and one
write per wake, and spends nothing of decision 7.

## What this refutes and confirms, by name

**Refuted: ADR-0075 §5's last sentence.**

> "The KDF and the epoch length are implementation; the property is this record's."

The epoch length is not implementation. It is the **absence budget** — the longest gap between two
devices being used that this design can bridge — and it is the single number that decides what the
map can promise a user. It should be stated in the record, not left to whoever writes the code.

**Refuted: the ratchet, which #250 asked to be investigated first.** It is not merely awkward at
three devices; it is broken at two, and broken by the store's own retention rule. §2 works through
it.

**Refuted: #256's hope.** That ticket wonders whether _"if the address ratchets off successful syncs
rather than wall-clock epochs, a revoked device's derivation may diverge on its own and dissolve most
of this."_ There is no ratchet, and it would not have helped: a revoked device holds the pairing
secret and a clock, so it can derive every future address forever, under **every** construction
considered here. Nothing self-heals. #256 gets no relief from addressing and must answer its question
on its own terms.

**Confirmed and sharpened: #249's parenthesis.** That ticket noted that _"addressing cost scales with
retention"_ and left #250 _"now knowing that the address must survive only a bounded window rather
than indefinitely, which is the easier problem."_ Correct, and stronger than it looks: retention does
not merely bound the addressing problem, it **is** the addressing problem. The two numbers are one
number, and #252 is choosing the product's headline capability while believing it is choosing a
disposal policy.

**Confirmed: map decision 7, in full, and not spent.** The construction recommended below uses each
address for exactly one epoch and never touches two addresses in one request, so consecutive epochs
are unlinkable to the operator by anything except IP — which ADR-0075 §5 already concedes.

**Answered for #260, which is blocked on this ticket:** one deposit per **pair**, never one per
device, and the fan-out is **forced twice over** rather than chosen. See §5.

**Answered for #248's "Not yet specified":** undelivered deposits never accrue, so nothing has to
compact them. See §4.

## 1. Why the reach of an address equals its rotation period

State the constraint before pricing mechanisms against it, because every mechanism in §2 and §3
fails against the same wall.

An address must be computed **independently on both sides**, because the whole premise is that the
two devices cannot talk. So its inputs can only be values both sides hold. There are three families
and no fourth:

- **(a) Shared secrets.** The pairing secret of ADR-0075 §3. Constant for the life of the pairing.
- **(b) Shared state as of the last time they spoke.** The last converged version vector, a chain
  position, a pool of pre-issued addresses. **Frozen for the whole of the absence**, because updating
  it is what the absence prevents.
- **(c) Values both derive from the outside world.** In practice, the wall clock. A public randomness
  beacon is a clock with a third party attached: both sides still have to agree which round, and they
  agree by consulting a clock.

Only (c) changes during an absence. So an address that is different after an absence of length _T_ is
a function of the clock that is constant over a span of at least... whatever span the two sides can
be guaranteed to land in together. That is the trade, and it is not a cryptography problem:

> **Reach and rotation are the same axis. An address findable after an absence of _T_ is an address
> that exists for _T_.**

The two obvious escapes are both closed by inspection, and #250 closed one of them already:

- **Deposit at every future epoch.** Unbounded, ruled out in the ticket.
- **Probe backwards across many epochs.** Ruled out in the ticket, on the grounds that a probe
  _pattern_ identifies you more sharply than one constant does. That argument generalises further
  than the ticket stated it, and the generalisation is what forces the recommendation in §4:
  **consecutive probe windows overlap, and overlap chains.** A collector that probes
  `{E, E−1, E−2}` this week and `{E+1, E, E−1}` next week has handed the operator a three-key
  overlap, and the operator walks that chain from epoch to epoch for the life of the pairing. The
  same is true of a depositor that writes forward more than one epoch. **Rotation survives only if
  each party touches exactly one address per wake**, and any window wider than one silently converts
  a rotating address back into a stable one, computed rather than handed over.

## 2. The ratchet, worked through

The proposal was: derive the next address from the _last successful sync_ rather than from the wall
clock, so a device asleep for a month still knows where it left off.

**At two devices it looks clean and is not.** The chain has to advance on an event both sides
observe. There are only two candidate events, and neither is shared.

- **Advance on deposit.** The depositor knows it deposited; the collector does not. A deposits at
  `A₀`, `A₁`, `A₂` while B sleeps. B wakes holding position 0, reads `A₀`, and never learns that
  `A₁` and `A₂` exist. Diverged on the first extra deposit.
- **Advance on collection.** The collector knows it collected; the depositor must infer it, and the
  only thing it can observe is that the object is **gone**. Under
  [#249](https://github.com/palebluebytes/inventoria/issues/249) the object is also removed by an R2
  lifecycle rule, whose granularity is whole days and which removes objects _"typically within 24
  hours"_ of expiry ([Cloudflare, R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)).
  So **absence is ambiguous between collected and expired**, and the depositor that guesses wrong
  advances alone: it writes at `A₁` forever while the collector reads `A₀` forever. Permanent, silent,
  and caused by the very expiry rule that made the store admissible.

**The repair fails for the reason that matters.** Sync is bidirectional, so the obvious fix is to
carry the acknowledgement on the reverse chain: B, on collecting `A₀`, writes its own deposit
carrying _"A:0 collected"_, and A advances when it reads that. This is the construction to beat, and
it dies on one line: **the acknowledgement is itself a deposit, and it expires on the same retention
clock as everything else.** If A sleeps longer than the retention window — which is the entire
premise of this map — the ack is gone before A ever sees it, A never advances, and the pair is stuck
for good. A ratchet whose advance signal is as perishable as the payload is exactly as unreliable as
the thing it was supposed to make reliable.

**At three devices it is worse, not merely more expensive.** ADR-0075 §4 is pairwise with a per-pair
secret, so there are three independent chains, each with its own divergence and its own perishable
ack. There is no shared position to recover to.

**Recovery from divergence requires a scan, which is refused.** Once the two positions differ, the
only way back is for one side to try positions it does not believe are current — a probe window,
which §1 shows chains across wakes and defeats rotation. There is no algebraic recovery, because
there is nothing to recover _from_: the chain position is state (b), and both sides believe theirs is
correct.

**A useful thing the ratchet does prove.** State (b) can carry the address for exactly one step past
the last live meeting, and no further. That one step is real and is worth nothing: the epoch
construction in §4 already gives the same reach without any state at all.

## 3. What the outside literature actually offers

Every mechanism below was checked against the source that owns it. The recurring result is worth
stating up front: **no primary source describes an address ratchet.** The two closest constructions
either presuppose a stable address (Signal) or presuppose a pool agreed while both parties were
reachable (Sphinx reply blocks), which is state (b) by another name.

### Signal Sealed Sender — interesting, not load-bearing

Sealed sender hides the **sender**, not the recipient. Signal says so in the sentence that decides
this for us ([Technology preview: sealed sender for Signal](https://signal.org/blog/sealed-sender/)):

> "While the service always needs to know where a message should be delivered, ideally it shouldn't
> need to know who the sender is."

Our problem is the half Signal keeps: _where_. Signal's answer is a stable account identifier, and it
adds a **delivery token** — _"The service requires clients to prove knowledge of the delivery token
for a user in order to transmit 'sealed sender' messages to that user"_ — which is a stable per-user
secret the server holds, i.e. precisely the join key decision 7 refuses.

Worth carrying as a caution rather than a mechanism: even the sender-side anonymity does not survive
a conversation. Martiny, Kaptchuk, Aviv, Roche and Wustrow show the guarantee _"does not compose over
a conversation of messages"_, with delivery receipts making the statistical disclosure attack
practical ([Improving Signal's Sealed Sender](https://www.ndss-symposium.org/wp-content/uploads/ndss2021_1C-4_24180_paper.pdf),
NDSS 2021). A metadata property that holds per message and fails over a relationship is exactly the
failure mode ADR-0075 §5 was written about.

### The Double Ratchet — load-bearing only as a negative result

The Double Ratchet ratchets **keys**, never addresses. Its header carries _"the sender's current
ratchet public key"_ plus the message number `N` and the previous chain length `PN`
([The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)), and the
specification contains no addressing or routing at all: it assumes a transport that already delivers
to a known recipient. Its tolerance for gaps is `MAX_SKIP`, described as a constant _"set high enough
to tolerate routine lost or delayed messages, but low enough that a malicious sender can't trigger
excessive recipient computation"_ — a bound sized against network jitter, not against a fortnight
asleep, and it works only because the receiver **receives the header** telling it how far the chain
moved. A depositor into a mailbox has no such channel; that is the whole of §2.

Header encryption is the one part aimed at linkability, and its stated goal is that _"an eavesdropper
can't tell which messages belong to which sessions"_ — which is what we want and is achieved
**downstream of** an address the eavesdropper already knows.

### X3DH — the deployed answer to a sleeping peer, and it is a stable identifier

X3DH exists because _"Bob has published some information to a server"_ and _"Alice contacts the
server and fetches a 'prekey bundle'"_, and the server _"can store messages from Alice to Bob which
Bob can later retrieve"_ ([The X3DH Key Agreement Protocol](https://signal.org/docs/specifications/x3dh/)).
This is a mailbox for a sleeping peer, in the primary literature, addressed by a **stable per-user
identifier held by the server**. It is the shape we are refused, offered by the most careful
practitioners in the field, which is a fair measure of how hard the refusal is.

### MLS (RFC 9420 / RFC 9750) — declines to answer

MLS assumes a Delivery Service that _"routes MLS messages among the participants"_ and is _"largely
untrusted"_, but the DS's addressing is left to the application rather than specified
([RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html),
[RFC 9750](https://www.rfc-editor.org/rfc/rfc9750.html)). MLS has nothing to say about our question,
and citing it would be citing a gap.

### Sphinx single-use reply blocks — the strongest outside candidate, and it lands on the same wall

Sphinx is the closest thing in the literature to an address ratchet: a recipient prepares
**single-use reply blocks** in advance and hands them out, and the nymserver _"will look up a
previously unused (n₀, M₀, k̃) tuple indexed by that pseudonym... and remove the tuple from its
index"_ ([Sphinx: A Compact and Provably Secure Mix Format](https://www.freehaven.net/anonbib/cache/DBLP:conf/sp/DanezisG09.pdf),
Danezis and Goldberg, IEEE S&P 2009, §3.4–3.5).

Transplanted here: at the last live sync B hands A a pool of `K` random addresses. This genuinely
survives an arbitrary absence — and then hits §1 from the other side. If A always uses the first
unused address and B does not know how many were used, B must probe the pool, which is a window and
chains. If A always overwrites the first one, that address is **constant until the next live
meeting**, which is decision 7's stable id with extra steps. The pool is state (b): frozen during the
absence, and it does not renew itself.

One real advantage, recorded because it is genuine and then dismissed because it is moot: pool
addresses are unlinkable to the pairing secret, so an adversary who later obtains the secret cannot
retroactively compute past addresses, whereas `KDF(secret, epoch)` addresses are retroactively
computable for all time. That is forward secrecy of the address. It is moot because an adversary
holding the pairing secret also holds the seal, and the contents are the larger loss.

### Tor v3 onion services — corroboration that the epoch construction is sound, and why it works there

This is the deployed instance of `KDF(secret, epoch)` and it is worth reading closely, because it
confirms ADR-0075 §5's construction and names its precondition.

Tor derives a per-period blinded key so that _"in each time period... a hidden service host uses a
different blinded private key to sign its directory information"_, the default period is **1440
minutes, one day**, and clients _"always use the current time period when fetching descriptors"_
([Tor rend-spec, deriving keys](https://spec.torproject.org/rend-spec/deriving-keys.html)). Two
details transfer directly:

- **The rotation instant is staggered per service.** _"Each descriptor comes online at a time during
  the period that depends on its blinded signing key"_, explicitly to avoid every service publishing
  at once ([Tor rend-spec, protocol overview](https://spec.torproject.org/rend-spec/protocol-overview.html)).
  A naive `floor(now / R)` rotates every pairing in the world at the same instant, which is both a
  thundering herd and a global correlation point. **The epoch grid should be offset by a value
  derived from the pairing secret.** One line of KDF input, and it is sourced rather than invented.
- **The adjacent period is an overlap, not a courtesy.** _"The keys for the last period remain valid
  until the new keys come online."_ ADR-0075 §5's "adjacent epochs tried for skew" is the same idea,
  and §4 below says what it should become here.

And the precondition, which is exactly what this map removes: **it works because the addressed party
is continuously online and republishes every period.** A service that goes away stops being findable
when its descriptor lapses. The asymmetry that rescues us is that in our case the party who must be
awake to publish is the **depositor**, not the sleeper: the sleeper only reads. So the construction
tolerates a sleeping collector natively, and tolerates a sleeping depositor only for as long as its
last deposit lives — which is the retention window, again.

### Briar Mailbox — confirms that the hard part is the part we refused

Briar solves this problem in production, and solves it by supplying a machine: _"Briar Mailbox is a
helper app for Briar messenger that lets you receive encrypted messages from your contacts while
Briar is offline"_, needing _"a spare device running Android 4.3 or later"_ left _"connected to power
and Wi-Fi"_ ([Briar Mailbox released](https://briarproject.org/news/2023-briar-mailbox-released/),
[briar-mailbox README](https://github.com/briar/briar-mailbox/blob/main/README.md)). Owner and
contacts reach it over Tor, at an address that is stable for the life of the mailbox.

That is #248's out-of-scope _designated always-on device_, and its presence in the one deployed
system that does what this map wants is evidence for how much the refusal costs, not an argument to
reopen it.

### Oblivious HTTP (RFC 9458) — genuinely relevant, and undeployable by us

OHTTP attacks the right thing: it would let an address be stable while preventing the operator from
joining it to an IP. And it is refused by its own text. _"To achieve the stated privacy goals, the
Oblivious Relay Resource cannot be operated by the same entity as the Oblivious Gateway Resource"_
([RFC 9458](https://www.rfc-editor.org/rfc/rfc9458.html)), with the relay learning _"the origin and
destination... yet it does not know the decrypted contents"_ and the gateway learning _"only the
Oblivious Relay Resource and the decrypted request"_.

Our gateway would be a route on the site's one Worker, which is on Cloudflare, and the only credible
relay a project this size could use is also Cloudflare. Same entity, non-collusion assumption void,
privacy goal unmet. **Not load-bearing.** It is worth recording as the mechanism that would change the
answer if this project ever had a second, unrelated operator, which ADR-0072 §9 and ADR-0070 both
refuse for reasons unrelated to privacy.

### Private Information Retrieval — the formal answer, priced and refused

PIR is the correct formal name for "fetch record _i_ without the server learning _i_", and it would
permit a stable address honestly. Its cost is structural, not incidental. From the fastest known
single-server scheme:

> "the server must touch every bit of the database to answer even a single client query, since
> otherwise the PIR scheme leaks information about which database records the client is not
> interested in"
>
> — [One Server for the Price of Two: SimplePIR](https://eprint.iacr.org/2022/949), Henzinger, Hong,
> Corrigan-Gibbs, Meiklejohn and Vaikuntanathan, USENIX Security 2023

That is not an implementation weakness. Beimel, Ishai and Malkin proved the linear bound inherent:
_"even in the multi-server setting, every secure PIR scheme on an n-bit database must incur Ω(n)
total server-side work"_ ([Private Information Retrieval with Sublinear Online Time](https://eprint.iacr.org/2019/1075),
Corrigan-Gibbs and Kogan, EUROCRYPT 2020, restating [BIM04]).

The concrete numbers finish it. SimplePIR reaches _"10 GB/s/core server throughput"_ but _"to make
queries to a 1 GB database, the client must download a 121 MB 'hint'"_; DoublePIR shrinks the hint to
16 MB at 7.4 GB/s/core. Against that, a Cloudflare Worker has **10 ms of CPU per request on the free
plan, 30 seconds by default on paid, and 128 MB of memory per isolate**
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). A 16 MB hint per
client exceeds the deposits it would be protecting, the linear scan runs against R2 rather than
against memory, and the whole apparatus buys a property ADR-0075 §5 already declines to claim: PIR
hides _which_ record you fetched, not _that you fetched_ or _from where_, and §5 concedes that two
devices meeting from the same pair of IPs are re-linkable by IP alone. **Interesting, decisively not
load-bearing.**

### Crowd-based constructions — unavailable to this project, and the reason generalises

The remaining family is _k_-anonymity: put many pairs behind one stable bucket prefix, have the
collector download the bucket and trial-decrypt, and the stable observable identifies a crowd rather
than a person. Mixnets, bucketed retrieval and unlinkable-token schemes such as Privacy Pass
([RFC 9576](https://www.rfc-editor.org/rfc/rfc9576.html)) all rest on the same footing.

It fails here on population, not on cryptography. #249's own R2 arithmetic puts the free tier at _"on
the order of 1,400 users"_ at roughly 7 MB each, and the actual user count today is one household.
**The anonymity set is the user base**, so every bucket that is not empty contains you and nobody
else, and the construction degenerates to a unique identifier while charging _k_ times the bandwidth.

This is the general rule and it disposes of the whole family at once: **a project whose user count is
its anonymity set cannot buy privacy with a crowd.** It also bounds how much anything else in this
note is worth paying for, and it should be read alongside §5's own admission that the property is
defence in depth rather than anonymity.

### Web Push — the one mechanism that genuinely decouples reach from address stability

If the address is **delivered** rather than derived, it need not be derivable at all: it can be a
fresh 128-bit random value per deposit, maximally unlinkable, and the sleeper computes nothing.
[#257](https://github.com/palebluebytes/inventoria/issues/257) established that an installed iOS
PWA's Service Worker does start unattended on push and can `fetch`, and that RFC 8030's
4096-octet body ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030.html)) is ample for an address.

It is not free and the price is exactly the thing being avoided. #249 priced it: a push subscription
endpoint is a **stable, non-rotatable, per-device identifier we must hold indefinitely**, plus a
relationship with Apple or Google who see every wake, and on iOS a mandatory user-visible
notification per delivery. So push does not evade decision 7; it **moves the stable identifier from
the room id to the subscription**, out of the request path and into a table we own, and adds a third
party. Whether that is a better or worse place for it is a decision, not a finding, and it belongs to
the ticket that eventually prices push rather than to this one.

The honest statement of the relationship: **push and the epoch address are alternatives on the
addressing axis, not complements.** With push there is nothing to derive. Without push the epoch
construction stands alone and does not need it.

## 4. The construction that survives

One rule from §1 does all the work: **each party touches exactly one address per wake.** Everything
else follows.

```
key      = KDF(pairing_secret, direction, epoch)
epoch    = floor((now + offset) / R)
offset   = KDF(pairing_secret, "epoch-offset") mod R          ← per-pair, staggered (Tor)
R        = #252's retention window
direction = which device deposited                            ← or the two overwrite each other
```

- **The depositor, on every wake:** one `PUT` at the current epoch's key. If it already wrote in this
  epoch, that is the same key, so the write is idempotent and the overwrite **is** the compaction.
- **The collector, on every wake:** one `GET` at the current epoch's key. On a hit, import, then
  `DELETE` — #249's guard 2, unchanged, on the key it just read.
- **Nobody deletes a stale deposit from an earlier epoch.** The lifecycle rule does it. Touching an
  old key to tidy it up is a second address in one burst, which is the chaining §1 forbids, and
  letting expiry do it removes the collected-versus-expired ambiguity that killed the ratchet.

**What it gives:** two devices converge if **both are used at least once within the same epoch**. Not
at the same moment. With R at R2's day-granularity floor that is _both opened on the same day_; at a
week, _both opened in the same week_.

**Why the epoch must equal the retention window, on both sides of the equality:**

- **Epoch shorter than retention wastes bytes.** A deposit written in epoch _E_ is unreachable from
  epoch _E+1_ under a one-probe rule, so any retention beyond one epoch holds data nobody can address.
- **Epoch longer than retention wastes reach.** The deposit expires before its epoch ends, so a
  collector waking late in the epoch finds an address that is still correct and an object that is
  gone.

Any other choice is strictly worse on one axis, which is a stronger reason than a preference.

**What it costs in observables:** one key per pair per direction, alive for one epoch, written by one
IP and read by another. Within an epoch those sessions join. Across epochs they do not, because the
next epoch's key is unrelated and nothing overlaps. That is ADR-0075 §5's rotation property, intact,
with the join window stated as a number instead of left implicit.

**What must be refused to keep it:** an R2 `list` over a common prefix. It is the obvious
implementation shortcut and it is a stable observable per pairing — the same join key decision 7
refuses, wearing an API's clothes. One `GET` at one derived key, always.

**What happens to ADR-0075 §5's adjacent-epoch probe:** it should be **withdrawn**, not reinterpreted.
It was there for clock skew, and under a one-probe rule a second probe is what chains the epochs
together. Skew smaller than the epoch is absorbed by the epoch's own width; skew larger than a
multi-day epoch is a broken clock, and a broken clock already breaks HLC ordering
([ADR-0020](../adr/0020-logical-clock-ordering-over-wall-clock-key.md)) and is the failure mode
ADR-0075 §12 handles as a one-sided pairing. Trading a real linkage for an imaginary skew is a bad
trade, and it is the one place where the sleeping-peer half must **narrow** §5 rather than inherit it.

**Divergence:** there is none to recover from. The construction holds no chain state, so the two sides
cannot disagree about where they are. That is the third argument for it, and it is the one the ratchet
could not offer at any price.

**Several deposits accruing at one address:** they cannot. A deposit is one object per pair, per
direction, per epoch, rewritten in place. This answers #248's _"whether several undelivered deposits
compact"_ — **they never accrue, so nothing compacts them** — and it hands
[#254](https://github.com/palebluebytes/inventoria/issues/254) a hard constraint rather than a
question: because the depositor cannot know whether an earlier write in the same epoch was collected,
every rewrite must be computed against the **same** base, so a deposit is monotone within its epoch
and re-collection is idempotent under ADR-0075 §6's merge. The over-sending that costs is real and is
#254's to price.

## 5. At three devices (#260)

ADR-0075 §4 is pairwise with a per-pair secret, so the derivation above is per pair by construction,
and a device with two peers deposits twice.

**The fan-out is forced, not chosen, and for two independent reasons.** #260 suspected this and it is
correct:

1. **A shared address needs a shared secret.** N devices cannot derive one key from N different
   pairwise secrets. Minting a group secret creates the shared credential ADR-0075 §4 refused to
   create an authority for, and its rotation, revocation and replacement are the hub-election problem
   §4 declined to own.
2. **#249's guard 2 requires exactly one collector.** _A deposit is dropped on collection_ is coherent
   only when collection is a single event. With N−1 collectors the first one to arrive destroys the
   object for the others, so the guard would have to become reference counting — server-side state,
   per address, that outlives a collection, which is precisely what ADR-0072 §12's posture and #252's
   bar are trying not to hold.

So #260's question 1 answers **one deposit per pair**, and the economy it hoped for is unavailable at
any price. Saying so is, as that ticket put it, worth more than the economy.

Two consequences #260 should carry: the cost multiplies in storage and writes exactly as it feared,
and the blind deposit over-sends **independently** per pair, because each is computed against a
different unknown base. Neither is an addressing problem and neither is fixable here.

## 6. What this costs, stated plainly

**The map wanted a device asleep for a month. It gets a device used within the same window as its
peer, where the window is #252's number.** That is a large narrowing of the ticket's own framing, and
the important thing about it is **where the narrowing comes from**: not from addressing, which is
free once the epoch is set, but from **retention**, which #249 already decided and #252 is about to
size. Addressing was never the binding constraint.

Two failures remain and should be named rather than discovered:

- **Neither device used in the same epoch means no convergence via the store**, and the pair falls
  back to ADR-0075's live path next time they are open together. That is ADR-0075 §1's failure,
  narrowed rather than removed.
- **A deposit written by a device that then never wakes again dies with its epoch.** The depositor
  re-anchors only when it is awake, so a permanently-off laptop's last deposit is reachable for one
  epoch and no longer. Under #249's correction that the un-collected direction is **phone → shut
  laptop**, the shut laptop is the collector rather than the depositor, so this is the rarer
  direction — but it is real.

## 7. Recommendation

**Load-bearing, and the record should carry all of it:**

1. **The epoch length is the absence budget and equals #252's retention window.** One number, stated
   once, appearing in both halves, so the two cannot drift apart. This is the finding.
2. **One address touched per party per wake.** One `PUT` for the depositor, one `GET` plus a `DELETE`
   on a hit for the collector. No windows, no prefixes, no `list`.
3. **ADR-0075 §5's adjacent-epoch probe is withdrawn for this half.** It converts rotation into a
   chain, and it was buying protection against a skew the epoch's own width already absorbs.
4. **Stale deposits are removed by the lifecycle rule, never by the depositor.** Tidying is a second
   address, and inference from absence is what killed the ratchet.
5. **One deposit per pair.** Forced by the secret and forced again by guard 2.
6. **No ratchet, and the reason recorded** — its advance signal is a deposit and expires with one.

**Optional, and cheap:**

7. **Stagger the epoch grid per pairing**, `offset = KDF(secret, "epoch-offset") mod R`, so that
   every pairing in the world does not rotate at the same instant. Sourced from Tor's handling of the
   same problem, costs one KDF input.

**Explicitly not recommended, with the reason attached:** PIR (server cost is provably linear and the
hint alone exceeds the payload), OHTTP (needs two non-colluding operators and we have one), crowd
bucketing (the anonymity set is the user base), pre-issued address pools (state frozen by the absence
they are meant to survive), and any form of scan or probe window (chains across epochs and defeats the
rotation it was meant to work around).

## 8. What is a decision rather than a finding

Three things came out of this that are not this ticket's to settle:

- **Whether push replaces the derivation entirely.** §3 establishes that it would, and that it pays
  with a permanent per-device endpoint plus a third party. That is a trade, and the map has already
  locked push as fog to be priced once the mechanism is settled. It is now settled, so that pricing
  can happen against a concrete alternative rather than against a guess.
- **The retention number.** #252's, but it should now be taken knowing that it is also the reach.
- **Whether the map's promise, restated as "both devices used within the same window", is worth
  building.** It is materially less than "a device asleep for a month" and materially more than
  ADR-0075 §1's "both awake at the same moment". Nobody has said which side of the bar that falls on.

## What is not verified

- **The KDF itself.** HKDF-SHA-256 over the pairing secret is the obvious instantiation and nothing
  here depends on the choice; ADR-0075 §5 already left it to implementation and this note does not
  take it back.
- **Whether R2 key names appear in any Cloudflare-side record we do not control.** ADR-0072 §9's
  posture makes the equivalent question moot for Durable Object names by turning invocation logs off
  script-wide, and #249 noted that _"a Durable Object's name, an R2 key and a KV key are all in the
  request path"_. Whether R2 has its own logging surface that survives that switch was not checked and
  should be before the ADR claims the property.
- **The cost of a `GET` that misses.** Most wakes will find nothing, since a wake happens whenever
  the app is opened and a deposit is waiting only after the peer wrote one. R2 Class B operations are
  cheap and the free tier is 10 million a month, but nobody has multiplied one miss per wake per
  pairing out against a user count.
