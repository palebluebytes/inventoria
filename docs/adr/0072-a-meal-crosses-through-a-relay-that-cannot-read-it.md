# ADR 0072: A meal crosses to another person through a relay that cannot read it

**Status:** Accepted  
**Date:** 2026-08-29  
**Amends:** [ADR-0070](0070-the-proxy-is-part-of-the-site-it-serves.md) (its one-Worker shape now carries the relay as well as the proxy, and §9 turns the script's invocation logs off, which the proxy pays for)

## Context

Inventoria has never had a way to hand a meal to another person. The Ledger export
([ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md)) and
the merging import ([ADR-0067](0067-a-ledger-comes-back-by-merging-never-by-replacing.md))
gave the ledger a way out and a way back in for its own owner, and ADR-0067's Scope
deferred peer-to-peer to [#179](https://github.com/palebluebytes/inventoria/issues/179).
This record and the three beside it are what #179 was waiting for.

This one covers the **wire and the server**: how bytes reach the other device, what
addresses them, and what the thing in the middle is allowed to be.

### The alternatives that were live, and what ruled each out

Six were priced. Four died on decisions rather than on measurements, which is worth
recording, because each carries a research note that a later reader may otherwise
mistake for the reason.

- **iroh** ([#193](https://github.com/palebluebytes/inventoria/issues/193),
  `docs/research/193-iroh-in-the-browser.md`). Refused as a **shape**: an iroh endpoint
  is a persistent listener at a persistent address, which §5 forbids. Its measured
  costs — 2,608,331 bytes of WASM, a Rust toolchain entering `pnpm build`, and a
  `iroh-relay` that binds a listening socket and therefore cannot be a Worker — are
  corroborating and were never load-bearing. It would have been refused at zero cost.
- **magic wormhole** ([#195](https://github.com/palebluebytes/inventoria/issues/195),
  `docs/research/195-magic-wormhole-guarantees.md`). Refused as a **shape**, in both
  halves: §4 refuses the spoken code, which deletes the reason for the PAKE, and §5
  refuses store-and-forward, which deletes the mailbox. #195 documented an enforcement
  stack for making a small secret safe; §3 decided never to have a small secret.
- **QR carrying the payload**
  ([#198](https://github.com/palebluebytes/inventoria/issues/198)). Measured on two
  phones: one symbol carries **four foods**, and one symbol is the rule, because a
  multi-symbol chain is a slideshow the sender holds steady while the recipient films
  it. A path that works silently at four foods and refuses at five is worse than no
  path, and the cliff moves with _where the recipient's foods came from_. Refused.
- **Two-QR WebRTC with `iceServers: []`.** The only option that needs **no server at
  all**, measured at 122 ms from the second code landing to the payload delivered,
  host-to-host on LAN addresses. Deferred as a named future enhancement, not refused;
  see Consequences.
- **One-scan WebRTC with a hosted rendezvous.** Built and working
  ([#198](https://github.com/palebluebytes/inventoria/issues/198), 904 ms from reading
  the code to a verified meal). This was the real contest, and §1 is why it loses.
- **The file export, shared by whatever people already use.** The honest baseline. It
  is beaten on exactly one thing, in Consequences.

### Scope

This record covers the transport, the code that addresses it, the confidentiality
property both must meet, and the relay's operation. It does **not** cover what is put
on the wire or what happens to it when it lands
([ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md)), where a
person taps to send or receive
([ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md)), or
how one person's own devices converge
([ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md)).
The relay is shared with that last one; the session models differ and the wire does not.

Research notes: `docs/research/193-iroh-in-the-browser.md`,
`docs/research/194-serverless-browser-transports.md`,
`docs/research/195-magic-wormhole-guarantees.md`, and the `src/lib/p2p-probe/` prototype
from [#198](https://github.com/palebluebytes/inventoria/issues/198).

## Decision

### 1. The transport is a live relay we operate, carrying bytes it cannot read

A Cloudflare **Durable Object** holds at most two WebSockets for one room and forwards
opaque frames between them. There is no peer-to-peer path, no ICE, no DTLS, no STUN and
no TURN, at any stage.

The observation that decided it against the one-scan WebRTC flow, and which no upstream
investigation had stated: **a rendezvous does not work offline either.** So the choice
was never zero-server against server-backed; it was **two different servers, one much
smaller**. Once a server is on the path in both designs, WebRTC's only remaining
advantage is that the bytes take a direct route, and it charges ICE, DTLS, mDNS
obfuscation and `<uuid>.local` resolution that resolves about half the time under an
Internet-Draft that expired in 2022; a **mandatory STUN service** the moment two people
are not on the same link, since host candidates are link-local by RFC 6762; and TURN
behind that whenever a NAT does endpoint-dependent mapping, at a rate no honest figure
could be sourced for. A design that refuses TURN accepts an **unsized failure rate**.

The relay does not manage that risk. It **retires** it: there is no traversal, so there
is nothing to traverse and nothing to fail. Cross-network works by construction rather
than by negotiation.

### 2. The seal is the whole binding, and transport TLS is not a confidentiality control

**WSS terminates at Cloudflare.** The operator would therefore hold plaintext, and the
map's standing bar — a server may exist but must never read — is met **only** by an
application-level seal.

- The sender generates a fresh **256-bit AES-GCM** key per send, in the browser.
- The key rides **in the code**, beside the room id, and reaches the relay by no path.
- The relay is handed ciphertext and forwards frames it structurally cannot open.

Transport TLS is not a control here and must never be cited as one. It is recorded as a
refusal in §15 so that nobody later argues the seal is belt-and-braces.

### 3. The code is a single-use secret of at least 128 bits

The property, stated so an implementation can be measured against it:

> **A send code is a single-use secret of at least 128 bits. An attacker who does not
> hold it cannot read the payload, cannot substitute a payload of their own, and cannot
> cause either device to complete a session believing the other is its intended peer —
> and no server on the path holds enough to do any of those three either.**

Concretely the code is **room id + 256-bit key**, about 100 characters, which renders as
a QR **version 5** symbol read in 931 ms on hardware. It does not grow with the meal: the
same code carried a four-food meal and a 60-food, 232 KiB feast.

**Four omissions, all deliberate, recorded so a later reader does not "fix" them: no
attempt ceiling, no rate limit, no expiry policy beyond §6's deadline, and no detection
requirement.** Every one of those is machinery for making a _small_ secret safe. Guessing
128 bits is not a threat model, it is arithmetic. #195's enforcement stack is the price of
borrowing magic wormhole's code shape; this design does not borrow it.

### 4. Scan and paste are the addressing modes. Speaking a code aloud is refused.

| Mode                                                                | Entropy a human tolerates | What it drags in                |
| ------------------------------------------------------------------- | ------------------------- | ------------------------------- |
| **Scan** (a QR on the other person's screen)                        | 128+ bits                 | nothing                         |
| **Paste** (a link through a messenger the two people already share) | 128+ bits                 | nothing                         |
| **Speak** ("four-purple-sausages")                                  | ~16 to 32 bits            | #195's entire enforcement stack |

The mode that decides the bar is the weakest one, so there is no weakest one. **There is
no read-it-out-over-the-phone flow, and no typed-code entry field, ever.** The remote case
is usually assumed to require speaking; it does not, because 128 bits is 22 base64
characters — not speakable, trivially pasteable.

**The asymmetry is disclosure, not strength.** A QR on a screen leaves nothing behind;
a link routed through a third-party messenger tells that messenger two people exchanged
something at a time. The code is dead by then (§5), but that metadata is not, and it is
the user's choice of messenger rather than the app's.

**The exchange is bidirectional and exactly one leg is human.** Both session halves must
cross — proven structurally and then confirmed on hardware, where an answerer's ICE
reached `connected` one-way in 8.3 s while its `connectionState` waited 45 s for a
fingerprint, so DTLS was the binding half. The relay makes the second leg the network's
rather than a person's, which is the whole of what a one-scan flow buys.

### 5. A send is synchronous, and a device never listens for a send it was not asked for

Both people are present at the same moment. The meal exists in exactly **two places,
never three**: no store-and-forward, no queue, no parked bundle, at any layer.

**Synchrony makes the code's lifetime self-limiting.** The code is alive exactly while the
sender is waiting, so a pasted code sitting in a messenger's scrollback is already dead by
the time it _is_ scrollback. That is the strongest available answer to paste durability,
and it costs no expiry policy to obtain.

There is **no background listener, no push, no persistent address, nothing reachable while
the app is closed**. The recipient enters receive deliberately, every time. That retires
most of the availability threat: a stranger cannot fill anything, because there is no way
to reach a device that is not actively receiving.

**The cost, stated plainly:** you cannot send to someone whose phone is in their pocket.

**This rule does not transfer to the own-device half.** Silent convergence requires a
listener; ADR-0075 §2 owns the sanctioned divergence and narrows it to one clause.

### 6. What burns a code, and the five minutes that bound it

A code dies on:

1. **one successful delivery** into the receiving surface;
2. **any refusal** under ADR-0073 §8 or its ceiling;
3. **the sender cancelling**;
4. **five minutes**, which is the same five minutes as the room's own deadline in §12 —
   one clock and one number, not two.

A transport-level reconnect **within** a live session is not a use and does not burn a
code.

**There is no "try again" on a spent code.** Terminal-on-refusal survives from #195 on new
grounds: at 128 bits a retry loop is not an attack budget, but a refusal means the payload
was malformed or hostile, so retrying the same code with the same payload fails
identically and silently hides a real fault.

Burning on successful delivery makes sending **idempotent from the human's side**: one
code, one delivery, so a meal cannot be sent twice by leaving a screen open.

### 7. The sender learns delivery, never acceptance

The sender is told the payload was delivered and passed the refusal checks. That is
required: it is the moment the code is spent, so it is exactly what the sender needs in
order to know whether to mint another.

The sender is **never** told whether it was accepted. Two reasons that happen to agree: it
is the recipient's private decision about their own ledger, and reporting it would make
**declining socially visible**, a pressure the app has no business creating. Under §5 the
session is over the instant delivery completes, so there is no channel left to carry an
accept signal either — the property and the mechanism want the same thing.

### 8. Two server bars, and which side the relay sits on

The intuition that the words "the server never reads" invite is inverted, and both halves
matter:

- **A relay is admissible.** It carries bytes it cannot decrypt. It **may** learn that two
  devices met, when, from where, for how long, and how much crossed. That is written down
  as a trade, not glossed as "the relay sees nothing".
- **A rendezvous is admissible only if it cannot man-in-the-middle**, because whoever
  carries a session description carries the key material that authenticates the peer.
  **There is no rendezvous in this design**, which removes the attack rather than
  defending against it.
- **Nothing persistent may be learnable.** The room and key are minted per send and
  nothing is stored, so the relay sees unlinkable meetings, never a social graph. §9 and
  §13 are what make that true rather than aspirational, and ADR-0075 §5 answers the same
  clause for the half where the secret is remembered.

### 9. The relay is a route on the site's one Worker, with invocation logs off script-wide

ADR-0070 collapsed `inventoria-proxy` into the site's single Worker. The relay is another
route on that same script, and **the price is `invocation_logs = false` on the whole
script, which the proxy pays.**

Workers observability is configured **per script, not per route**, and a Durable Object is
defined _in_ the script, so it inherits the script's posture with no separate switch. The
lever is `invocation_logs = false`, which drops the automatic per-request record while
leaving `console.log` working. The reason belongs in a comment beside the flag in
`wrangler.toml`, which already carries its reasoning inline.

Three reasons for one Worker rather than two, in the order they weigh:

- **A second Worker means a second dashboard-configured build that nothing in the repo
  records.** That is exactly the failure ADR-0070 was written to end, and re-creating it
  for the relay would undo that record nine days later.
- **The proxy can afford it.** It is a stateless URL fetcher whose failures already reach
  its caller as an HTTP status and a message.
- **Same origin is worth something here specifically.** ADR-0074 §8's receive link is
  same-origin, so app, link and relay socket are one origin: no allowlist to write,
  maintain and get wrong.

**The no-record posture is enforced structurally, not by review.**
`scripts/worker-closure-check.mjs` already pins what the Worker may compile in and runs
under `pnpm check`; it gains a check that the relay module calls no `console.*`. A posture
enforced only by review is a posture that lasts until the first debugging session.

**One fact this deliberately does not need.** Cloudflare's docs do not say whether an
invocation log carries the client IP. The chosen posture makes the question moot, which is
the argument for it under uncertainty. It becomes live again only if someone proposes
turning invocation logs back on, and that proposal has to answer it first.

### 10. Room ids are client-minted, from the same draw as the key

The room id is drawn client-side from the same CSPRNG draw as the key, and the relay
accepts any id it is handed.

**Server-minting is refused** on two counts. It costs a round trip **before the code can
be drawn** — and the sender draws the code first, while the recipient does not yet exist,
so that round trip lands on the person waiting. And it puts a server-chosen identifier
into a code three decisions were spent keeping the server out of.

**What a guessed room id buys an attacker is a socket, and nothing else.** They receive
ciphertext they cannot open and cannot forge, because the AEAD both hides and
authenticates and they hold no key. Room-id guessing is therefore a **denial** attack
exclusively, never a disclosure or substitution one. This is worth stating plainly,
because the intuition that a guessable room id is a security hole is what pulls people
toward server-minting, and here it is simply false.

### 11. Five bounds, fixed as numbers

The relay cannot read a byte, so content-based limits are impossible and every lever is
**shape**. These are the abuse answer, and they are numbers rather than "reasonable
limits":

1. **At most two concurrent sockets per room.** A third is **refused**, never queued.
2. **One payload frame in each direction, then the room closes.** The 1 MiB payload
   ceiling crosses in a single WebSocket frame against Cloudflare's 32 MiB message
   ceiling, so there is no chunking, reassembly, ordering or resume. The reverse
   direction carries §7's delivery acknowledgement and nothing else.
3. **A wire-byte ceiling, as a crude backstop and never as the enforcing bound.**
   ADR-0073 §9's 1 MiB is on **decoded** bytes at the recipient, and that stays the real
   limit. The relay's job is only to stop somebody streaming a gigabyte through it. Since
   the wire payload is deflated and then sealed it is always smaller than its decoded
   size, so a 1 MiB wire ceiling can only ever be more permissive than the recipient's
   check. **Two bounds with different jobs: the recipient's decoded check is the one that
   refuses a meal.**
4. **A room lifetime of five minutes**, which is also §6's fourth burn condition.
5. **Over a bound, the room closes; it is never truncated.** A truncated payload reaches
   the recipient as bytes that fail to open with no explanation, indistinguishable from
   tampering, and ADR-0073 §8 wants a reason the recipient can be shown.

**Reconnection survives, and the relay does not identify who reconnects.** Both parties
hold the same key, so the relay has nothing to authenticate against and cannot tell a
reconnecting sender from a squatter. It does not need to: the cap is on **concurrent**
sockets, and a squatter's entire achievement is occupying a slot, which §10 already
establishes is the whole of the attack.

**There is no per-IP rate limiting, and there will not be.** A per-IP counter is precisely
the persistent, learnable, person-keyed record §8 forbids. The five bounds are the
substitute, and that is the trade rather than an oversight.

**Nobody builds anything on a two-party, 1 MiB, one-frame, five-minute, unaddressable,
non-resumable pipe.** It is not a file host (nothing is stored), not a chat relay (one
frame each way), not a CDN (rooms are unguessable and dead in five minutes), and not an
exfiltration channel worth having (you must hold both ends at once and move 1 MiB at a
time, which any pastebin beats).

### 12. The relay holds nothing that outlives a room

The tempting sentence is "the Durable Object uses no storage". It is false and would rot:
hibernation attachments carry the per-socket metadata a woken object needs, and sweeping a
room at its deadline wants `setAlarm`. Both touch Durable Object storage. So the rule is a
**lifetime** one rather than an API prohibition:

> **The relay may hold state for the duration of a room. It may hold nothing that outlives
> one.**

Under that rule §8's bar is met **by construction rather than by policy**: after five
minutes no record anywhere says the room existed, so there is nothing to correlate,
subpoena or leak.

**No aggregate counters in v1.** A counter needs somewhere to live, and the only somewhere
is the storage this section is keeping empty. If one is ever wanted it must be a single
monotonic integer with no key of any kind, argued then rather than inherited from here.
This and §11's refusal of a rate limiter are the same refusal seen from two sides: a rate
limiter is the one component that would have forced state to outlive a room.

### 13. What is deliberately not defended against

So the design is not judged against a bar it never claimed:

1. **Someone in the room reading your screen.** The QR is on display; physical proximity
   is assumed benign.
2. **A malicious intended recipient.** You chose to send it.
3. **A malicious sender whose meal you accept.** The numbers can simply be wrong. This is
   structurally undetectable, and the preview before accepting is the only defence — a
   human one.
4. **A compromised origin.** The PWA trusts the JavaScript it was served. #125's
   service-worker precache narrows the window but does not close it. **This is the honest
   ceiling on everything above.**
5. **A compromised or lost device.**
   [ADR-0065](0065-the-browser-is-asked-once-to-keep-the-ledger-and-its-answer-is-on-screen.md)
   already says browser storage is not a backup.
6. **Traffic analysis by the relay**, per §8, and by Cloudflare's network regardless of
   §9. This posture governs what **we** retain and what anyone reading our records can
   learn; it cannot make Cloudflare's network not observe the connection.

### 14. The fallback and the withdrawal clause, both named before they are needed

**When the relay is unreachable the send is unavailable, and the app offers the file
export inline** — a button on the failure surface, not a hint to go and find Settings.
ADR-0064's exporter and ADR-0067's reader already exist, and the difference between a
named step-down and a dead end is one button. (ADR-0074 §10 states the one place this is
_not_ offered, and why.)

The two rejected fallbacks, with reasons. The **two-QR zero-server path** is a good
enhancement and a bad fallback: it is reachable only in the same room, which does not
correlate with the relay being down. **QR-only** is refused for the same reason as in the
Context — a size cliff the user cannot see.

**The withdrawal clause.** _If operating the relay stops being tenable, the send is
removed and the file export remains. That is a documented outcome, not a failure._ This is
the only place the record can say that one feature of Inventoria is **operationally
conditional in a way nothing else is**. Every other part of the app survives the
maintainer losing interest — it is a local-first PWA over a ledger on the user's own
device, and it keeps working with the network off and the author gone. The send does not.

### 15. The refusals, recorded so nobody later "fixes" them

1. **No NAT traversal, ever.** Not deferred, not optional.
2. **No STUN and no TURN server.** Neither exists at any stage.
3. **No direct peer-to-peer path in v1, even opportunistically.** "Try direct, fall back
   to relay" doubles the surface and reinstates every unverified WebKit behaviour, to save
   bytes on a route nobody measures.
4. **No store-and-forward at any layer.** §5.
5. **Transport TLS is not a confidentiality control here.** §2.
6. **No per-IP rate limiting or accounting**, at any layer, ever. §11.
7. **No authentication, accounts, tokens or API keys.** The code is the whole of the
   authorisation.
8. **No server-minted room ids.** §10.
9. **No state that outlives a room**, including the aggregate counters §12 declined.
10. **No second Worker.** Reopening ADR-0070 was considered and refused. §9.
11. **No truncation** (§11.5) and **no queueing a third socket** (§11.1).
12. **No spoken code and no typed-code field.** §4.

## Consequences

**What it buys over the baseline, in one sentence: the meal arrives as a meal, not as a
file.** That is the whole justification, and everything else people reach for is false.
Not reach — AirDrop and Quick Share work offline, cross-network, on every platform pair,
and Quick Share reaches iOS. Not size — the baseline caps at 64 MB and our ceiling is
1 MiB. Not "no server" — the direct AirDrop path routes through nothing, and on that axis
the baseline **wins**. What the baseline cannot do is land the payload inside the app,
re-minted onto the recipient's clock, as something they accept or decline. Recording this
stops a later reader believing reach or offline-ness were ever the argument.

**The free plan binds on duration first, at roughly 10,000 sends a day.** Arithmetic off
Cloudflare's published figures rather than a measurement, and labelled as such: a
WebSocket connection costs one request, incoming messages are discounted 20:1 and outgoing
messages are free, so a send is about 2 billable requests against 100,000/day — roughly
50,000 sends. Duration bills at 128 MB, so 13,000 GB-s/day is about 101,500
object-seconds/day; at ten _active_ seconds per send under hibernation that is roughly
**10,000 sends a day**. For a personal food tracker the threshold will never fire. Writing
it down is cheap precisely because of that: it converts "the free plan is obviously
enough" from an assumption into a number a future reader can check. **If either limit is
approached the design is reopened rather than silently upgraded to a paid plan.**

**WebSocket Hibernation is why the money question does not arise**, and why a room that is
open for five minutes but idle for nearly all of them is affordable. Cloudflare's own
worked example moves a comparable workload from $142.95 to $20.65 a month.

**The cost of §5 is real and is not softened.** A send needs both people present at the
same moment. That is the same shape as AirDrop, and it is why §14's baseline comparison
comes down to one sentence rather than a list.

**The offline same-room case is deferred, fully specified, with its evidence attached.**
It is #198's two-QR flow with `iceServers: []`, measured at 122 ms from the second code
landing to the payload delivered, carrying any meal. What carries into v1 from that
prototype is the QR codec, the 100-character code shape, the room model and the sealed
payload discipline; what defers with the enhancement is `sdp-compact.ts`, the candidate
census and the trickle handling. Its unverified WebKit preconditions travel **with the
enhancement** rather than with v1, and ADR-0074 §10 has since made them moot by putting
iOS out of scope. It wakes if somebody wants a send that works with no internet at all.

**Two prior findings are retired rather than answered.** "How often is a relay actually
needed" has the answer _always_, by design. And "a session description does not grow with
what it carries" is a true property that **did not decide this**, because the relay moots
session descriptions entirely; it is recorded so a later reader does not mistake it for
the ratio.

## Amendment (2026-09-01): the #198 prototype this record cites no longer exists

[#239](https://github.com/palebluebytes/inventoria/issues/239) deleted
`src/lib/p2p-probe/` once every part of it that carries into v1 had been ported. Two
pointers above went stale with it, and neither is edited in place.

**The Context's "Research notes:" list** names `src/lib/p2p-probe/` alongside three
files under `docs/research/`. The three files are still there; the prototype is not.
Its findings are in [#198](https://github.com/palebluebytes/inventoria/issues/198) and
in this record, which is where a reader should now go.

**The Consequences' deferred-enhancement paragraph** is the one that could actually
mislead. It says what defers with the offline same-room enhancement is
`sdp-compact.ts`, the candidate census and the trickle handling — which reads as
though that code is parked somewhere, waiting. It is not: it was deleted with the
rest, because a prototype kept for an enhancement nobody has scheduled is a prototype
that rots. **The deferred work restarts from this record and from #198's measurements,
not from a branch.** What defers is the design, and the design is written down.

The ported half is untouched by any of this and is named here so the amendment is a
complete account: the QR writer is `src/lib/p2p/qr-symbol.ts`, the reader is
`src/lib/food/barcode-scan.ts`, the code shape is `src/lib/p2p/send-code.ts`, the
seal is `src/lib/p2p/sealed-frame.ts`, and the room model became the Relay's own wire
contract in `src/lib/p2p/relay-wire.ts` — a rendezvous being the thing §8 refused.
