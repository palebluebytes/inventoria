# Finding retained mail without giving the operator a stable handle

Research for [#281](https://github.com/palebluebytes/inventoria/issues/281), on the map
[let a device that was asleep converge later](https://github.com/palebluebytes/inventoria/issues/248).

The premise changed on 2026-08-31. [#249](https://github.com/palebluebytes/inventoria/issues/249)
decided the store held a diff that was **dropped on collection**, and
[#250](https://github.com/palebluebytes/inventoria/issues/250) welded the address epoch to that
retention window on the strength of a single identity — _reach and rotation are the same axis_. The
[#254](https://github.com/palebluebytes/inventoria/issues/254) session overturned the retention rule
on ease of use: the store now **retains until collected**. Under an unbounded reach that identity
would make the address a constant, which map decision 7 forbids. This note establishes what
constructions get around it.

All outside claims were verified against the source that owns them on **2026-08-31**. Papers were
read as PDF text, not as abstracts or write-ups.

**Evidence classes.** Every claim is tagged:

- **[spec]** — quoted verbatim from an IETF RFC, a W3C specification or an equivalent normative document.
- **[paper]** — quoted verbatim from the published paper's own PDF.
- **[vendor]** — quoted from the operator's own product documentation.
- **[derived]** — my own analysis, built on the above. Not sourced, and said so every time.
- **[unverified]** — could not be checked here. Never dressed up as anything else.

---

## The five answers

| #   | Question the ticket asked                                 | Answer                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Counter-based address chains                              | **They exist, under two names older than this map**, and a KDF chain leaks _nothing_ about its neighbouring addresses. What leaks is not the key, it is the **session that advances the chain**. Every event-indexed chain in the primary literature ships a forward scan window — HOTP's look-ahead `s`, BIP-44's gap limit of **20**, the Double Ratchet's `MAX_SKIP`. A window of zero is reachable here, at a price.          |
| 2   | PIR, Oblivious Message Retrieval, Fuzzy Message Detection | **The cost is not the reason to refuse them; the population is.** All three hide _which_ record among N, and our N is one household's. To buy a real N you must pool every user's mail and pay: OMR is **~$1.02 per million messages** plus a **~129 MB** detection key; SimplePIR is a **121 MB hint per 1 GB** database. Against a 100 MB Worker request-body limit and a 128 MB isolate, the detection key alone does not fit. |
| 3   | Oblivious HTTP (RFC 9458)                                 | **The right mechanism, unavailable twice over.** RFC 9458 forbids one entity operating both ends, and our gateway is a Worker on Cloudflare. Independently: both known relays — Cloudflare Privacy Gateway and Fastly's OHTTP Relay — are **enterprise, contact-sales**, and neither documents a browser client or CORS.                                                                                                          |
| 4   | Is the anonymity set the real problem?                    | **It is a real problem and it is not the first one.** The first is structural and holds at any population: the operator can always tell it is _a_ pairing. The anonymity set decides only whether "a pairing" and "**the** pairing" are the same sentence — and at one household they are.                                                                                                                                        |
| 5   | _(not asked)_ What retention actually changed             | **#250's theorem survives, in a stronger form, and stops being an argument for a constant.** Reach still equals the address's _lifetime_. What retain-until-collected buys is that the lifetime is set by the user's absence rather than by a policy number, and that a chain can rotate **at the first contact afterwards** — which is the theoretical floor.                                                                    |

---

## 1. What retention changed, and what it did not

### The lower bound, stated before any mechanism

#250 established that an address two devices compute without talking is a function of their shared
secret, of what they both knew when they last spoke, and of the clock — and that only the clock moves
during an absence. That stands. But it was used to conclude that the address must **rotate** on the
clock, and that is a second step which does not follow.

**[derived]** Let B have been asleep since `t₀` and wake at `t₁`. The address B computes is a
function of state B held at `t₀` plus B's clock. A must write where B will look. A therefore has two
choices and no third:

- **A writes at a clock-derived address.** Then A must guess which clock value B will read, which it
  can only do if the address is constant over the whole interval `[t₀, t₁]`. Since A does not know
  `t₁`, "constant over the absence" means constant over any absence the design promises to bridge.
  Under retain-until-collected the promised absence is unbounded, so the address is constant. This is
  the ticket's worry, and it is correct.
- **A writes at an address derived from state frozen at `t₀`.** Then the address is fixed for the
  whole absence by construction — but it is fixed by the _absence_, not by a period, and it is free to
  change the moment the two are in contact again.

So the honest form of #250's identity is:

> **An address findable after an absence of _T_ is an address that lives for _T_. It does not follow
> that it rotates every _T_ — only that it cannot rotate _during_ _T_.** **[derived]**

The floor is therefore "the address changes at the first contact after the absence", and it is
reached by a chain indexed on a shared event, not by a clock. That is exactly the counter the ticket
asked about, and the reason it now works is the reason #250 said it could not: #250's ratchet died
because its advance signal was a deposit that **expired on the retention clock**, and there is no
longer a retention clock.

### The one thing that did not change

The store still holds, per pairing, an object written from one endpoint and read from another. That
join is unavoidable in every construction in this note, including #250's. The question is never
whether the operator can see a pairing; it is only how many of a pairing's exchanges collapse into
one observable. Section 3 is that question and it is the whole of the interesting result.

---

## 2. Counter-based address chains: what the literature actually contains

#250 reported that _"no primary source describes an address ratchet."_ That is too strong, and the
sources that do describe one are worth having, because each of them names the resynchronisation
problem and each of them answers it the same way.

### The Pynchon Gate: a hash-chain rendezvous for retained mail, from 2005

This is the closest thing in the literature to the ticket's question, and it is a full instance of
the construction. Sassaman, Cohen and Mathewson chain the shared secret and derive a per-cycle
pseudonym from it **[paper]**:

> The shared secret is updated every cycle, such that, if `S[i]` is the shared secret in a given
> cycle `i`, then `S[i + 1] = H(S[i]|"NEXT CYCLE")`, where `H(·)` is a cryptographic hash and `|`
> denotes concatenation.
>
> […] Finally, the nymserver also generates an different independent identifier for each user every
> cycle: `UserID[i] = H(S[i]|"USER ID")`.

— [The Pynchon Gate: A Secure Method of Pseudonymous Mail Retrieval](https://www.freehaven.net/anonbib/cache/sassaman:wpes2005.pdf),
WPES 2005, §3.2

Three details transfer directly.

- **It is a chain, and the chain is indexed by the clock.** The client _"computes its UserID for the
  day"_. So even here the counter is a cycle number both sides read off the wall, not an event.
- **Old chain state is dropped, deliberately.** _"Once it no longer needs a shared secret or a given
  subkey, the nym server drops it immediately, to limit the impact of key compromise (at the server
  or client) and improve forward security."_ This is the property §2's last subsection prices.
- **Resynchronisation is named as the design driver.** _"We use a separate chain of keys for each
  cycle so that it is easier for a user to resynchronize after missing a few cycles."_ The chain is
  re-derivable from the cycle number precisely because a sleeper cannot be expected to have walked it.

And crucially, the handle is _not_ what protects the user. Retrieval is by
information-theoretic PIR across **k independently operated distributor servers**, so that _"an
attacker cannot tell which bucket the client is retrieving without compromising or controlling all k
of the servers"_ **[paper]**. Retention for infrequent clients is an explicit obligation on those
servers: _"Depending on the length of the cycle, clients may not be able to download messages every
cycle. Therefore, distributors must retain meta-indexes and bucket pools for a reasonable window of
time, to be sure that all clients have time to download their messages."_ **[paper]**

### Pung: the same label construction, and the reason it is not enough on its own

Pung is the modern instance, and it states our design's central hazard in one sentence **[paper]**:

> This label should be unique (to avoid multiple pairs of users overwriting each other's messages),
> and it must also be independent of the users communicating (**otherwise an adversary could link a
> label to a conversation**). Pung achieves both of these properties through a combination of shared
> secrets and a pseudorandom function (PRF).
>
> Each user can derive the corresponding labels for the current round `r`, `labelS(r)` and
> `labelR(r)`, by invoking the pseudorandom function (PRF) keyed with `kL`:
>
> `labelS(r) = PRFkL(r || uidpeer)`
> `labelR(r) = PRFkL(r || uidown)`

— [Unobservable Communication over Fully Untrusted Infrastructure](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/10/pung-osdi16.pdf),
Angel and Setty, OSDI 2016, §3.1

Again `r` is a clock: _"The Pung protocol proceeds in discretized rounds or time epochs. […] The Pung
cluster acts as a point of synchronization for clients and dictates when a new round starts."_ And
again the label alone is not trusted to do the work — retrieval is by computational PIR over the
whole collection, because a plain fetch by label would hand the server the access pattern. Pung's
answer to the infrequent participant is retention plus PIR, not addressing: _"Pung supports
long-lived messages that can be retrieved anytime prior to garbage collection"_ **[paper]**.

**The convergent result across both, and it is the important one:** every published system that
solves "a collector finds retained mail" keeps a derivable per-cycle handle **and hides the access
with PIR across many users**. Nobody solves it with the address alone. That is not a coincidence and
§3 explains why.

### Event-indexed chains do exist — and every one of them ships a scan window

Where the literature does index a chain on an event rather than a clock, the receiver's
resynchronisation problem is solved by a forward probe, and the size of that probe is a documented
parameter:

- **HOTP (RFC 4226) §7.4** — the token's counter advances on use, the server's only on success, so
  they drift **[spec]**:

  > We RECOMMEND setting a look-ahead parameter `s` on the server, which defines the size of the
  > look-ahead window. In a nutshell, the server can recalculate the next `s` HOTP-server values, and
  > check them against the received HOTP client.
  >
  > The upper bound set by the parameter `s` ensures the server does not go on checking HOTP values
  > forever […] `s` SHOULD be set as low as possible, while still ensuring that usability is not
  > impacted.

  — [RFC 4226](https://www.rfc-editor.org/rfc/rfc4226.txt)

- **BIP-44's address gap limit** — the deployed answer for finding which addresses in a derivation
  chain were used **[spec]**:

  > Address gap limit is currently set to 20. If the software hits 20 unused addresses in a row, it
  > expects there are no used addresses beyond this point and stops searching the address chain.

  — [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)

- **The Double Ratchet's `MAX_SKIP`** — the message-number chain tolerates gaps only because the
  header carries `N` and `PN`, and even then bounds the skip **[spec]**; the specification declines
  addressing altogether, saying that how a message is associated with a session is _"outside of the
  scope of this document"_.
  — [The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)

**[derived]** All three are the probe window #250 refused, arrived at independently by three
communities. A naive event-indexed chain here would land in exactly the same place, and #250's
generalisation applies unchanged: consecutive probe windows overlap, and overlap chains. So the
question for this map is not _"can the chain be indexed on an event"_ — it plainly can — but
**whether the window can be made zero.** Section 3 says it can, and what that costs.

### What a KDF chain leaks, cryptographically: nothing

The ticket asked what a KDF chain over a counter actually leaks. The answer, at the level of the keys
themselves, is nothing, and the Double Ratchet specification states the three properties in the form
we need **[spec]**:

> **Resilience:** The output keys appear random to an adversary without knowledge of the KDF keys.
> This is true even if the adversary can control the KDF inputs.
>
> **Forward security:** Output keys from the past appear random to an adversary who learns the KDF
> key at some point in time.
>
> **Break-in recovery:** Future output keys appear random to an adversary who learns the KDF key at
> some point in time, provided that future inputs have added sufficient entropy.

— [The Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/), §2.1

**[derived]** Two consequences the destination ADR should carry.

1. **Per-object unlinkability across sessions holds by construction.** An operator holding `key_i`
   cannot compute `key_{i+1}` or `key_{i-1}`. So the addresses are, on their own, as unlinkable as
   independent random strings. Everything §3 finds is about the _requests_, never about the keys.
2. **The chain has a property `KDF(secret, epoch)` does not: forward secrecy of the address.** Under
   the epoch construction, anyone who ever obtains the pairing secret can retro-compute **every**
   address the pairing ever used and re-read the operator's whole log against it. Under a chain whose
   old state is dropped — Pynchon Gate's rule, quoted above — the past is not recoverable from the
   present. #250 recorded this as a real but moot advantage of Sphinx pools on the ground that the
   secret-holder also holds the seal. **That dismissal is weaker now than it was**, because the store
   keeps objects indefinitely: the seal protects contents, and address forward secrecy protects the
   _shape of the relationship_ recorded in the operator's request log, which the seal never touched.

---

## 3. What actually leaks is the session, not the key

This is the section that does the design work, and none of it is sourced. **[derived]** throughout.

### The observable

Model what the operator holds as a set of events `(key, time, method, source IP)`. Group events into
**sessions** — one device's burst of requests at one wake. Then build a bipartite graph: sessions on
one side, keys on the other, an edge when a session touched a key. The operator's power is exactly
the connected components of that graph, on top of whatever IP grouping it can do independently.

Two facts follow immediately and hold for **every** construction in this note, #250's included:

- **A mailbox object is always a two-session component.** It is written by one device and read by the
  other; that is what a mailbox is. So the operator always learns "these two sessions are a pairing".
  Nothing removes this without PIR or a second operator.
- **Cross-session linkability is therefore only ever about whether components _merge_.** They merge
  if and only if some session touches two keys belonging to different steps of the exchange.

This is the precise form of map decision 7's distinction, and it is worth restating in these terms:
under #250's epoch construction each epoch is its own component, so correlating across epochs really
is traffic analysis. Under a construction whose components merge, correlating is a self-join on one
column — nearer a `GROUP BY` than decision 7's wording admits, and the map should be told that
plainly rather than sold a rotation that does not rotate.

### Three ways to advance a chain, and what each costs

**(a) Absence as the acknowledgement — the obvious one, and it chains.**

Retain-until-collected makes absence unambiguous, which is genuinely new: with no lifecycle rule
there is exactly one reason an object is gone, so #250's collected-versus-expired ambiguity is
removed. So A can wake, `HEAD` its own last address, see a 404, conclude collection, and write at the
next index.

That session touched `addr(i)` and `addr(i+1)`. **Every advance of the chain is a session that
touches both sides of the advance**, so the components merge at every step and the operator walks the
chain forward for the life of the pairing. This is the same failure #250 found in probe windows,
wearing a different hat.

It should also be refused on the ground [#254](https://github.com/palebluebytes/inventoria/issues/254)
already established, which is stronger here than it was there: _absence is a fact the server controls,
and a sealed vector is a fact only the peer can produce._ Under #254 a hostile or buggy delete cost a
delta. Under (a) it also **permanently desynchronises the address chain**, because A advances alone
and the two sides then look at different keys forever, with no scan available to recover. Trusting the
operator with delivery was already the worst of the three trusts; letting it drive addressing is worse
again.

**(b) Acknowledgement in the payload, both lanes per wake — still chains, and chains completely.**

Put the ack inside the seal: each side's deposit says which index of the peer's lane it has collected.
Under retain-until-collected that ack is imperishable, which is the exact clause that killed #250's
ratchet, and it is gone. So the ack works.

But if a wake does its collect _and_ its deposit — the natural full-duplex shape — then A's session
touches `{B(j), A(i+1)}` and B's earlier session touched `{A(i), B(j)}`. They share `B(j)`. Walk it:
`A(i) — B(j) — A(i+1) — B(j+1) — …`. **The entire history of the pairing is one connected component.**
The alternation between the two lanes is itself the join. This is worth stating explicitly because it
is the shape anyone would reach for first, and it is the worst of the three.

**(c) Acknowledgement in the payload, one address per wake, strict alternation — this one does not chain.**

Each device alternates its wakes: collect, deposit, collect, deposit, touching exactly **one** key
each time.

- A's collect wake touches `B(j)` only: `GET`, then `DELETE` on a hit. It reads the ack of `A(i)` out
  of the seal.
- A's next deposit wake touches `A(i+1)` only: one `PUT`, carrying its own ack of `B(j)`.
- B does the same on its own schedule.

Now the components are `{A's collect, B's deposit}` at `B(j)`, and `{A's deposit, B's collect}` at
`A(i+1)`, and no key appears in two components. **The chain does not chain.** This is #250's own rule
— _each party touches exactly one address per wake_ — carried over intact, and it is what makes an
event-indexed chain safe where HOTP, BIP-44 and the Double Ratchet all needed a window.

**What (c) costs, and none of it is small:**

- **A wake does one thing.** A device that has data to send _and_ mail to collect does one of them and
  waits for its next wake for the other. Convergence in one direction takes two wakes per side.
  Retention means nothing is lost by waiting — which is precisely the budget the #254 decision bought
  and this is what it is spent on.
- **A one-wake stale-write window remains.** B may collect `A(i)` and not yet have had a deposit wake
  in which to ack it. If A's deposit wake falls inside that gap, A rewrites at `A(i)`, which B will
  never read again. No data is lost — A retains its outstanding delta until acked — but the object is
  **orphaned in the store forever**, since under retain-until-collected nothing expires it. Deleting
  it later is a second key in a session and re-merges the components, so the orphan is the price of the
  property.
- **At three devices it degrades twice.** ADR-0075 §4 is pairwise, so a device with two peers holds two
  chains. Serving both in one wake puts two pairings' keys in one session and tells the operator they
  share a device; serving one per wake halves the rate again. Both are real and the map should pick
  knowingly. The epoch construction has the first of these problems too.

### The impossibility that bounds all of it

**[derived]** The server must map a request to an object. Either the map is a function of something the
client sends — in which case that something is a deterministic per-pairing value, and the only
question left is how often it changes — or the server does not know which object was wanted, in which
case it must touch all of them, which is the definition of PIR. There is no third shape. So:

> **Every non-PIR mailbox has a server-computable index. The only lever is how often that index
> changes, and the only events that can change it are events both parties observe.** There are
> exactly two such events available to a sleeping pair: the clock, and a collection. The clock buys
> unlinkable rotation and bounded reach; a collection buys unbounded reach and rotation that is
> unlinkable only under rule (c).

**On the ticket's "a server-side secret is admissible".** It is, and it cannot buy this. A secret held
by the operator cannot make the operator unable to link its own observations. What it can buy is
narrower and worth one line each: blinding the stored key (`stored = HMAC(server_secret, address)`) so
that a leak of the bucket at rest is not joinable to addresses observed in the request path; and
unlinkable authorisation tokens (the Privacy Pass family) so that abuse control does not need a client
identity. Neither touches addressing.

---

## 4. PIR, OMR and FMD — priced, and refused for the opposite reason to the one expected

The ticket asked whether these are deployable at **one person with two to four devices**. They are —
trivially, because the database is tiny — and that is exactly why they are worthless here. The
refusal is not cost. It is that these primitives hide _which_ record among N, and our N is one
household's mail.

### The formal cost, which is what makes pooling the escape hatch expensive

The linear-work property is inherent, not an implementation weakness **[paper]**:

> PIR schemes are computationally expensive: the server must touch every bit of the database to answer
> even a single client query, since otherwise the PIR scheme leaks information about which database
> records the client is not interested in.

— [One Server for the Price of Two: SimplePIR](https://eprint.iacr.org/2022/949), Henzinger, Hong,
Corrigan-Gibbs, Meiklejohn and Vaikuntanathan, USENIX Security 2023

And the concrete figures from the fastest known single-server scheme **[paper]**:

> SimplePIR achieves 10 GB/s/core server throughput […] to make queries to a 1 GB database, the client
> must download a 121 MB "hint" about the database contents; thereafter, the client may make an
> unbounded number of queries, each requiring 242 KB of communication. We present a second
> single-server scheme, DoublePIR, that shrinks the hint to 16 MB at the cost of slightly higher
> per-query communication (345 KB) and slightly lower throughput (7.4 GB/s/core).

Against the deployment target **[vendor]**: a Worker isolate _"can consume up to 128 MB of memory"_,
CPU per request is _"10 ms"_ on Free and _"5 min (default: 30 seconds)"_ on paid, and the request body
limit is _"100 MB"_ on Free/Pro
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). A pooled database large
enough to be an anonymity set cannot be resident in 128 MB, and every query would re-read it from R2.

### Oblivious Message Retrieval — the numbers, and the one that ends it

Liu and Tromer's own evaluation **[paper]**:

> Detector's cost for full retrieval is higher than in related schemes, but still quite practical at
> ~0.065 sec/msg (~$1.02 per million messages) on a small cloud VM. […] The one drawback is a one-time
> cost of uploading a detection key of size ~129 MB to a detector.
>
> […] ~9 bits per bulletin board message for retrieval, and ~4.5 bits/msg for just detection […]
> ~20 msec to retrieve 50 pertinent messages out of 500,000.

— [Oblivious Message Retrieval](https://eprint.iacr.org/2021/1256), CRYPTO 2022, §1

**[derived]** Three of those numbers settle it against Workers + R2 without any argument about
anonymity. The **129 MB detection key exceeds the 100 MB Worker request-body limit** on Free and Pro
outright. At 0.065 s/msg, the 30-second default CPU cap answers **about 460 messages per invocation**.
And the scheme's whole benefit is measured against a board of 500,000 messages; ours would have a
handful.

### Fuzzy Message Detection — refuted on population by its own follow-up analysis

FMD is the cheap member of the family: the client sets a false-positive rate `p` and downloads its
true positives plus cover. Beck, Len, Miers and Green's construction lets a recipient _"outsource
detection work to an untrustworthy server, without revealing precisely which messages belong to the
receiver"_ **[paper]** ([Fuzzy Message Detection](https://eprint.iacr.org/2021/089), CCS 2021).

The formal analysis of what that actually buys is the decisive source here **[paper]**:

> We observe that the lower bound for the adversary's advantage in the recipient unlinkability game is
> a negligible function in `U` for a fixed false-positive detection rate `p`. Thus, in theory, the
> number of recipients `U` should be large in order to achieve recipient unlinkability asymptotically.
> […] Our results suggest that a deployment of the FMD scheme should concurrently have a large number
> of users with high false-positive rates in order to provide recipient unlinkability.

— [The Effect of False Positives: Why Fuzzy Message Detection Leads to Fuzzy Privacy Guarantees?](https://fc22.ifca.ai/preproceedings/9.pdf),
Seres, Pejó and Burcsi, Financial Cryptography 2022, §4

The same paper characterises FMD's protection as a _"'dynamic', 'personalized', and 'probabilistic'
extension of k-anonymity"_ and shows this _"enhanced k-anonymity fails to satisfy standard anonymity
notions"_ **[paper]**. At `U = 1` the advantage is not negligible; it is 1.

### The two schemes that would fix it need something we do not have

- **Private Signaling** (Madathil, Scafuro, Seres, Shlomovits and Varlakov, USENIX Security 2022)
  gives full privacy — _"the anonymity set constitutes the entire set of (honest) recipients"_ — but
  its two constructions rest on _"two non-colluding servers, or on the trusted execution environment
  (TEE)"_ **[paper]** ([Private Signaling](https://www.usenix.org/system/files/sec22fall_madathil.pdf)).
  Cloudflare's Workers documentation describes a V8 isolate model and documents no attested enclave
  available to customer code; a second non-colluding operator is the thing this project does not have.
- **The Pynchon Gate** needs `k` independently operated distributors, per §2.

**So the family's verdict is:** every construction in it either needs a population we do not have, or
a second operator we do not have, or both. Flagged as the ticket asked: **each requires a second
non-colluding operator or a hardware root of trust.**

---

## 5. Oblivious HTTP — the right mechanism, and it is not available to us

OHTTP attacks precisely the half of ADR-0075 §5 that a rotating address cannot: it breaks the
client-IP-to-request join. Its own goal statement **[spec]**:

> The combination of encapsulation and relaying ensures that Oblivious Gateway Resource never sees the
> Client's IP address and that the Oblivious Relay Resource never sees plaintext HTTP message content.

And the constraint that decides it for us, in the same document **[spec]**:

> To achieve the stated privacy goals, the Oblivious Relay Resource cannot be operated by the same
> entity as the Oblivious Gateway Resource. However, colocation of the Oblivious Gateway Resource and
> Target Resource simplifies the interactions between those resources without affecting Client privacy.

— [RFC 9458](https://www.rfc-editor.org/rfc/rfc9458.txt), §6 and §1

Our Oblivious Gateway Resource would be a route on the site's Worker, which runs on Cloudflare. So a
Cloudflare relay is the same entity and the privacy goal is unmet by the RFC's own text. #250 reported
this and it is confirmed.

**What #250 did not check, and it is an independent refusal.** Both known relays are gated products,
so the question of collusion does not even arise:

- **Cloudflare Privacy Gateway** — _"Privacy Gateway is currently in closed beta – available to select
  privacy-oriented companies and partners"_, and enterprise-only. Cloudflare runs the **relay**; the
  customer runs the gateway and the client
  ([Cloudflare Privacy Gateway docs](https://developers.cloudflare.com/privacy-gateway/)). **[vendor]**
- **Fastly Oblivious HTTP Relay** — _"To implement Fastly's OHTTP Relay, you must contact Fastly at
  sales@fastly.com to begin the onboarding process"_, billed on _"bandwidth (per GB) and requests (per
  10,000)"_ with pricing only via a customer success manager
  ([Fastly OHTTP Relay](https://docs.fastly.com/products/oblivious-http-relay)). **[vendor]**

Neither vendor's documentation mentions browser clients or CORS at all, so whether a PWA could
`fetch` a relay cross-origin with `Content-Type: message/ohttp-req` is **[unverified]** and would need
the relay to serve CORS headers it does not document.

**Three further facts worth recording before this is ever revisited.**

- **The client-side work is small.** The wire overhead is a Key Identifier, three algorithm
  identifiers and the encapsulated KEM shared secret, followed by the HPKE-protected request
  ([RFC 9458 §4.1](https://www.rfc-editor.org/rfc/rfc9458.txt)) — tens of bytes, not a factor.
  HPKE itself is not a registered Web Cryptography API algorithm, but X25519, HKDF and AES-GCM all are
  ([Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/)), so a PWA would ship a small HPKE
  implementation over WebCrypto rather than needing anything exotic. **[spec]**
- **OHTTP has the same population problem as everything else in this note** **[spec]**:

  > Each active Client configuration partitions the Client anonymity set. […] Client privacy depends on
  > having each configuration used by many other Clients. It is critical to prevent the use of unique
  > Client configurations, which might be used to track individual Clients […]

  A gateway configuration used by one household is a unique client configuration by definition.

- **[derived]** **And a PWA defeats it by being a PWA.** OHTTP would hide the sync request's source
  IP, but the app is served from the same origin, so a page load or a service-worker update check made
  minutes earlier from the same IP re-supplies the join. It would only hold for a fully precached
  install whose sync fetch is genuinely the sole request that origin sees in that window. That is not
  impossible for this app — it precaches aggressively — but it is a property to be engineered and
  proved, not assumed.

---

## 6. The anonymity set of one, said plainly

The ticket asked for this and it deserves an unhedged answer.

RFC 6973 gives the vocabulary **[spec]**: an anonymity set is _"a set of individuals that have the
same attributes, making them indistinguishable from each other from the perspective of a particular
attacker or observer"_, and:

> The size of the anonymity set has a direct impact on identity confidentiality, since the smaller the
> set is, the easier it is to identify the initiator.

— [RFC 6973](https://www.rfc-editor.org/rfc/rfc6973.txt), §6.1.3

**[derived]** So, without qualification:

1. **No construction in this note, or in the literature it draws on, hides from the operator that a
   pairing exists.** The store holds an object written from one endpoint and read from another; that
   is what a mailbox is, and only PIR across a real population removes it. The operator can always
   tell it is _a_ pairing.

2. **The only question the map can actually decide is whether the operator can tell it is _the same_
   pairing over time**, and that is a question about how many exchanges collapse into one observable —
   §3's connected components. That question is real, it is answerable, and rule (c) answers it well.

3. **With one user and two devices there is nothing to hide among, so hiding is not on the table and
   should not be claimed.** The property on offer is _unlinkability of one pairing's successive
   exchanges_, which is defence in depth against an operator's own retained records, not anonymity.
   ADR-0075 §5 already concedes as much and the destination ADR should keep that voice rather than
   inherit a stronger-sounding one from the mechanism's provenance.

4. **A larger user base would not rescue the crowd constructions either**, and it is worth having the
   number. #249's arithmetic put R2's free tier at roughly 1,400 users; FMD's analysis wants a
   population large enough for a birthday-paradox argument, OHTTP wants each configuration used by
   "many other Clients", and OMR's evaluation is calibrated on a 500,000-message board. This project is
   two to three orders of magnitude short of all three even in its optimistic case.

The honest headline, which the ticket asked for in terms: **the operator can always tell it is a
pairing; the achievable property is that it cannot cheaply tell it is the same pairing across
absences; and the anonymity set is not the reason the first half fails — it is the reason no repair
is available.**

---

## 7. What it costs on Workers plus R2

All figures **[vendor]** from
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) and
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/); the arithmetic is
**[derived]**.

| Item                                            | Price                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| R2 Class A (includes `PutObject`)               | **$4.50 / million**, first **1 million/month free**                 |
| R2 Class B (includes `GetObject`, `HeadObject`) | **$0.36 / million**, first **10 million/month free**                |
| R2 `DeleteObject`                               | **free**                                                            |
| R2 standard storage                             | **$0.015 / GB-month**, first **10 GB-month free**                   |
| R2 egress                                       | free                                                                |
| Workers requests (Standard)                     | **10 million included/month, then $0.30 per additional million**    |
| Workers CPU (Standard)                          | **30 million CPU-ms included/month, then $0.02 per million CPU-ms** |

Under §3's rule (c) a wake is one R2 operation plus one Worker invocation. Take two devices waking
twice a day each — 120 wakes per pairing per month, half `PUT` and half `GET`:

- 60 Class A + 60 Class B = **$0.00029 per pairing per month**, plus 120 Worker requests at
  **$0.000036**. Under a third of a hundredth of a cent.
- The binding free-tier limit is **Class A**: 1 million `PUT`s a month is about **16,600 pairings** at
  60 deposits each. Class B and Worker requests are an order of magnitude further away.
- Shape (b) — both lanes per wake — doubles this and is still negligible. **Cost is not the axis on
  which these shapes differ**, which is worth saying so the map does not weigh them on it.

**The cost retain-until-collected genuinely adds is storage, and orphans.** Nothing expires, so an
object deposited for a device that never wakes again is held forever, and §3(c)'s stale-write window
leaves an orphan at a superseded index which nothing will ever collect. At $0.015/GB-month with 10 GB
free, that is cheap in money and unbounded in principle — it is a **policy** question rather than a
billing one, and it is exactly the "retention policy is strictly weaker than nothing to retain"
problem the map's locked decision 4 named.

**One [unverified] item carried over from #250 and now partly checked.** #250 could not establish
whether R2 keys appear in any Cloudflare-side record outside our control. Cloudflare's account-scoped
Logpush dataset list — Access requests, Audit Logs, Gateway DNS/HTTP/Network, Workers Trace Events and
so on — **contains no R2 dataset**
([Logpush datasets](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/account/))
**[vendor]**, so there is no customer-facing log of object keys to switch off. That is not the same as
establishing that no internal record exists, and the ADR should not claim more than the former.

---

## 8. Recommendation

**Load-bearing, and the destination ADR should carry all of it:**

1. **The address is a KDF chain indexed on collections, not on the clock.** `addr = KDF(pairing_secret,
direction, index)`; the index advances only when the depositor learns its object was collected. This
   is the construction the ticket asked for, it is sound under retain-until-collected, and it reaches
   the floor established in §1 — the address lives exactly as long as the absence, and rotates at the
   first contact afterwards.
2. **The advance signal is an acknowledgement inside the seal, never the absence of an object.** #254
   established the principle; §3(a) shows the cost of breaking it is now permanent desynchronisation of
   addressing rather than a lost delta.
3. **Exactly one address per wake, with the two directions alternating.** This is #250's rule, it
   survives the premise change unchanged, and under a chain it is what keeps the components from
   merging. Its price is that a wake moves one direction, which retention makes affordable and which
   should be stated as a promise ("both devices used a few times") rather than discovered.
4. **State the orphan.** A stale write leaves an object nothing will collect, and under
   retain-until-collected nothing removes it. Deleting it re-merges the components, so it must be
   tolerated rather than tidied.
5. **Drop old chain state.** Sourced from the Pynchon Gate. It is what buys address forward secrecy,
   and it is the one property the epoch construction could not have.
6. **Say what is claimed.** Unlinkability of one pairing's successive exchanges against the operator's
   own records — not anonymity, not hiding that a pairing exists.

**Refused, with the reason attached:**

- **PIR, OMR, FMD, Private Signaling, Pynchon-Gate-style bucketing** — each needs a population, a
  second non-colluding operator, or a TEE. §4.
- **OHTTP** — RFC 9458 forbids one entity on both ends, and both relays are enterprise-gated anyway.
  §5.
- **Absence as an acknowledgement** — chains, and hands the operator control of the address chain. §3(a).
- **Both lanes in one wake** — collapses the pairing's whole history into one component. §3(b).
- **Any probe, gap limit or look-ahead window** — HOTP, BIP-44 and the Double Ratchet all ship one and
  the map has refused it; rule (c) is what makes the window zero.

---

## 9. Decisions this note does not get to make

- **Whether half-duplex wakes are an acceptable promise.** §3(c)'s property costs a factor of two in
  wakes and, at three devices, another factor. That is a product judgement and it belongs where #265's
  went.
- **Whether the orphan is acceptable.** It is a permanent unreadable object in a store whose bar is
  incompleteness. It may be small enough not to matter; nobody has said.
- **Whether shape (b)'s single connected component is actually a violation of decision 7.** It is a
  join rather than a `GROUP BY`, so it satisfies the letter; it is a one-line recursive join, so it
  barely satisfies the spirit. If the map is willing to spend that, full-duplex wakes are back and most
  of §3's cost disappears. That should be an explicit decision, not a default.
- **Whether push changes the addressing question.** It does, for one direction only, and not the hard
  one: push can hand a collector a fresh random address with nothing to derive, but push does not reach
  a shut laptop, and the shut laptop is the collector that has to find mail by derivation. Consistent
  with #265's finding, push buys little on this axis.

---

## What I could not verify

- **Nothing here was built or measured.** There is no prototype, no deployed Worker and no R2 bucket.
  Every cost in §7 is list price times arithmetic.
- **Whether a browser can drive any OHTTP relay.** Neither Cloudflare's nor Fastly's documentation
  mentions browsers or CORS, and no relay was contacted. Moot given the availability finding, but not
  established.
- **Whether Cloudflare holds internal R2 request records.** The absence of an R2 Logpush dataset is
  established; the absence of any internal record is not, and cannot be from outside.
- **Whether Workers offers any attested execution environment.** I found none documented and treated
  that as absence of a product, not as proof.
- **The stale-write window's real frequency.** §3(c) shows it exists and is bounded by one wake; how
  often it fires depends on wake patterns nobody has measured.
- **Everything in §3 is my own analysis.** The components argument, rule (c), the impossibility
  statement and the three shapes are derived from the sources, not taken from them. No primary source
  describes an address chain advanced by an in-band acknowledgement, and the destination ADR should
  treat it as this project's own construction, with the review that implies.
