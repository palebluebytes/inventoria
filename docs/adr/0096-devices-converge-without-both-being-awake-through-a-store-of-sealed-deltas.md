# ADR 0096: Your own devices converge without both being awake, through a store that holds one sealed delta per lane

**Status:** Accepted  
**Date:** 2026-09-05  
**Amends:** [ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md) (§1's both-awake requirement is lifted; §2 is replaced wholesale; §3's three fields become a rule; §4's duality sentence and its Devices screen go; §5 loses its room half and gains a named construction; §6 loses its unqualified identity claim; §11 gains two states; §13 gains a ceiling and survives verbatim; §14 gains a ninth refusal and §14.6 is restated)  
**Amends:** [ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md) (§5's closing paragraph is withdrawn and its rule transfers here in full; §9 may not be cited for R2; §11's bounds go uniform and its _nobody builds anything on this pipe_ argument is re-made twice; §12 is narrowed to the relay; §13 gains three rows; §14's withdrawal clause becomes operational)  
**Amends:** [ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) (§8's debt is discharged by a carried deletion, and the Consequences' claim that a wiped user's food _comes back_ is corrected: the re-supply is partial, nondeterministic and torn)  
**Amends:** [ADR-0086](0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) (§1's sentence survives word for word; its subject widens, so a Tracked Domain need not have a screen and need not belong to a Facet)  
**Amends:** [ADR-0067](0067-a-ledger-comes-back-by-merging-never-by-replacing.md) (§1's two-deliberate-steps argument gains a case it does not know about: an import does not apply held carried deletions)  
**Implemented:** #391 — §8's _the relay's bounds go uniform_ alone, in `worker/src/relay.ts`: ADR-0072 §11.2's frame tally and §11.3's wire ceiling are gone for every room, and the per-frame Durable Object read and write that enforced the first go with it, so a room writes three storage rows however much crosses it (#372 §3.5). #392 — §13's registry half: the Jar domain is on the roster in `src/lib/facets/registry.ts` owning `deletion:` alone, with no screen and in no Facet, and `scripts/entity-ownership-check.mjs` carries the biconditional that keeps it there. Nothing mints the prefix yet, and the pairing, the deposits and the carried deletion itself are all unbuilt. #393 — the store's route exists: `/api/store` on the same Worker puts, gets and deletes one sealed object at a client-supplied address (`worker/src/store.ts`, whose bucket interface has **no `list`**), the 16 MiB ceiling of §1 is enforced on our own route, `worker/r2-lifecycle.json` carries the 30-day backstop, and `scripts/worker-config-check.mjs` fails the build if Workers Traces are switched on (§15) or the bucket binding leaves the EU. §16's conditional write is proved against a real bucket rather than a fake in `tests/store-route.spec.ts`. **The bucket itself is not yet provisioned**: the three clauses that live on the Cloudflare account — versioning off, no notifications, not public — are written down as commands in `docs/how-to-operate-the-store.md` and have not been run, and `wrangler deploy` fails until they are, because `wrangler.toml` now binds a bucket the account does not hold. §17's threshold, billing alert and withdrawal procedure are on that page for the same reason: no build can see them. The addressing (§4) and the collection (§5) that hold up §1's other two clauses are still unbuilt, so what exists is the route, its bounds and its gates rather than a working convergence. #394 — pairing, up to the point of transfer: `src/lib/p2p/pairing-code.ts` mints §8's code in a carrier whose character set has no colon in it, so it cannot parse as a URL or as a bare `scheme:` shape; `pairing-act.ts` mints the 256-bit pairing secret **inside the sealed room** and hands it over as the first frame; `pairing-chain.ts` is §4's named construction, seeding both `state₀`s through the same ratchet step it exports and overwriting the secret on the way out; and the root's Settings gains the **Paired devices** section, which expands in place and offers a QR and a paste and no link. This discharges #392's _the pairing ... unbuilt_ and instances §4's addressing, which #393's entry called unbuilt. It stops where guard 1 does: there is no vector exchange, no deposit and **no Paired Device record on either side**, because a pairing is not complete until its first sync completes (§2) and #395 is that sync. #395 — §2, §8's act past the secret, and §9. Guard 1 is built as an absolute: `src/lib/p2p/first-sync.ts` converges the two ledgers live and `src/lib/stores/paired-devices.ts` is written from exactly one line, on completion, so an abandoned attempt leaves nothing on either side to clean up. §8's **closing vector exchange** is the one field of the record that is not derived chain state, and without it both sides would finish holding the peer's pre-sync state. §9's rule is checkable and is checked: a test derives every address and seal key off the chains and asserts none of them, and no byte of the pairing secret, appears in what is written. The record keeps both indices at zero, because §4's index advances on collections and #396 is what collects. What the pairing section now shows is §11's first-sync progress, on both sides, with the sentence about keeping the tab open; steady state showing nothing is #397's, because nothing here runs twice. Two things this ticket found. §8's _repeated pairing is a resume, not a retry_ has a **surface** cost the record does not name: an ending part way through a transfer cannot be worded like an ending while nobody had arrived, or the screen tells somebody their transfer was lost when it was banked, so `pairing-words.ts` carries two maps over the room's five endings rather than one. And §5's generation is not needed on this path and is not built: a live room has one stream per lane under one key, so the sequence and the lane are the whole of the additional data, and the generation joins them when a deposit can exist at one address twice. #396 — §3 and §5, so the arc's whole point is now true: `src/lib/p2p/wake.ts` collects the incoming lane and deposits the outgoing one, per pairing, on an open of the root Facet (`wake-errand.ts`, called from `App.svelte` rather than from `facets/startup.ts`, because §7's Rations-only user never converges). `deposit-store.ts` is the client half of #393's route, and the two statuses the design turns on are outcomes rather than errors there: a 404 is a collection finding nothing, and a 412 is the conditional rewrite refused. `sealed-deposit.ts` is the object — a generation, then length-prefixed chunks each sealed under `{index, generation, seq, final}`. The Paired Device record gains **one field beside the two lanes**, the standing of this device's own outstanding deposit: the etag its `PUT` returned, and what an acknowledgement for that index will _mean_. **Five things the record does not say, found in building it.** **No version vector crosses, and none needs to**: §3 says a deposit carries an acknowledgement and a delta, §6 refuses a statement about a third device, and a re-asserted vector would be one — so each side keeps its view of the other from what it has _observed_, merging the rows it collected (which the peer held, to send them) and, on an acknowledgement, what its own collected object carried. Understating what a peer holds costs a re-sent row an import ignores; overstating it would withhold a row permanently, so the inexact direction is the safe one and the exact one was never needed. **And the word that makes that sound is _oldest_.** §1's _deposits its oldest 16 MiB_ reads like a figure of speech and is a requirement: a version vector can summarise a set that is downward-closed in stamp order and nothing else, and the ledger's primary key is entity-first, so a key-ordered walk cut short by the ceiling puts `event:aaa` stamped 900 ahead of `event:bbb` stamped 100 and the vector that follows withholds the older row **permanently**. `readLedgerPage` therefore takes an order, and a deposit is the one caller that asks for the stamp's; every walk that runs to the end is unaffected, which is why the first sync never met this. **The final marker needs no count on the wire**: the last frame in the object is the one opened as `final`, so a stream cut short ends on a chunk sealed as `more` and refuses, which is how _delete only after the final chunk verifies_ becomes a property of the object rather than a rule a collector has to remember. **The generation is in the clear and has to be**, at the head of the object, because the collector derives every label from it before it can open anything; it is not trusted either, since a generation anyone rewrote simply yields labels nothing verifies under. And **a datom wider than a whole deposit is the one case the drain cannot reach** — `readLedgerPage` hands back one row however large it is, so the walk never stalls and that lane would. It is reported rather than repaired, because splitting a value across deposits is a decision and not a line of code. **One correction, and §1 is where it lands.** _An expiry costs one wake of latency and never data ... its next wake rewrites the full outstanding delta at the same key_ cannot hold alongside §5 as §5 is written. A conditional rewrite against an etag whose object **expired unread** is refused exactly as one whose object was **collected** is, and the depositor cannot tell the two apart — so a rule that recreated after the first would recreate after the second, which is the permanently orphaned object §5 exists to remove. §5 is what is built: a refused rewrite writes nothing more at that index, and only a sealed acknowledgement advances it. §1's _never data_ survives untouched, because the ledger is intact and re-pairing recovers; what goes is _one wake of latency_, since an object that expires unread freezes that lane until §11's K = 200 shows the one-sided state. That is the reaping §11 already describes rather than a new failure, and it needs the depositor gone long enough for the backstop to fire — but the sentence as written is optimistic and should not be read as a promise. **And one hole, which is §5's and is filed as [#410](https://github.com/palebluebytes/inventoria/issues/410).** A deposit is one object carrying both an acknowledgement and a delta, so a lane the conditional rewrite has closed is a lane that **cannot acknowledge** — and if both lanes of a pairing close, neither can say the word the other waits for and both chains freeze. One failed `PUT` reaches it: a peer that collects and then cannot deposit leaves this device rewriting into a refusal while its own next rewrite is refused in turn. Writing at the closed index does not help, because the collector advanced on collecting and will never read it again; advancing on the refusal is the absence-as-acknowledgement §5 refuses outright; a second object per lane is what §1 refuses; and a collector looking back one index is the scan window §3 and §4 are built to have at zero. So the repair is this record's to make rather than an implementer's, §5 is what is built, and §11's K = 200 is what bounds it meanwhile — losslessly, since both ledgers are intact and re-pairing recovers #397 — §3's 2026-09-06 Amendment, and the third deposit trigger the 2026-09-12 one adds. `src/lib/p2p/wake-cadence.ts` is the whole of **when**: it collects once on the open, deposits whenever the ledger grows (debounced five seconds, flushed best-effort on `visibilitychange` and `pagehide`), and collects again on an hourly floor it skips while nothing has changed locally and nothing is owed. `wake.ts` gains a second entry point beside `convergeWithPeer` — `depositToPeer`, the deposit alone — and both now share one reading of what a deposit acknowledges: the highest index this device has taken. `wake-errand.ts` wires the two syncs to the store, the ledger and the browser's own signals, and `App.svelte` holds the wake for the life of the shell rather than firing one errand at mount. **The claim the whole repair rests on is asserted rather than argued**: three deposits before a collection leave one key in the bucket at one index, which is what makes depositing on every change spend nothing of §4. **Three things found in building it.** **The floor's skip rule and the prize it is said to buy do not both hold.** The Amendment says the floor buys _the propped-open tablet refreshing while you log on the phone beside it_, and says in the sentence before it that a collection skips when nothing has changed locally — but a propped-open tablet is precisely a device on which nothing changes, so under the stated rule it skips every tick and never sees the phone's meal. The rule is built as written, because it is written twice (here and in #397) and the alternative is an unbounded poll this record refused. What recovers most of the prize is a reading rather than an exception: **rows a collection imports are a local change**, so the mark is cleared before a sync and re-set by what that sync brings, and a pair keeps collecting while it keeps exchanging. The residual is real and is named in the module: a ledger still for a whole hour skips, so a peer that starts logging after that skip waits for the next open. **The skip needs the second clause for a reason the first Amendment could not have known.** _Nothing is owed_ is not symmetry with _nothing has changed_ — under the 2026-09-12 commit point a deposit-only sync cannot settle a collection, because it reads nothing, so a skipped tick after an unsettled take leaves the depositor rewriting at an index nobody has said the word for. The two clauses answer to different amendments and neither is decoration. **A productive collection costs one extra rewrite, and it is the right one.** The import that a collection performs fires the same growth signal a logged meal does, so a deposit follows it by the debounce — an acknowledgement-only rewrite at the address the lane was going to use anyway. Telling the two apart was available (the worker sends a populated attribute list for an append and an empty one for everything else) and was refused: rows collected from one peer are rows a **third** device lacks, so under §10's fan-out the broader reading is the correct one and the narrower would be a bug waiting for #401. The signal is four broadcasts rather than two, since a Facet-scoped wipe and a `clear` raise it as well; each costs the same single rewrite, of whatever the deletion left. **And the flush on hide cannot be made better than best-effort, for a reason that is a number.** The Amendment calls it best-effort and names its residual; what it does not say is that the usual repair is unavailable rather than merely unpleasant. A `fetch` with `keepalive` survives a discarded tab, but keepalive caps a request body at 64 KiB against §1's 16 MiB ceiling — so it would carry the small deposits and silently refuse exactly the backlogs that most need carrying. The two hide events are not equal either: a backgrounded tab keeps running and its `PUT` completes, and only a discarded one loses it. The residual stands as written, and this is why it cannot be closed. What is **not** built here is §11's counter, which is #399's. The one thing this ticket owes it is the shape: `OpenWake.productive` folds every sync of one wake into one set of pairings, because K counted per sync would quietly become K = 25 #398 — §6's closed list, built as its one member: every deposit's envelope now carries the depositor's own `device_id`s beside the acknowledgement (`src/lib/p2p/wake.ts`), `wake-errand.ts` reads the whole Paired Device list once per round so a pairing frozen at §11's counter is named rather than omitted, and `src/lib/stores/paired-devices.ts` gains `peer_roster` — replaced whole by each deposit, never merged with the local list and never relayed onward. The root's **Paired devices** section resolves each stated id against the rows beside it and says nobody where it cannot, with no notification, no badge, no toggle and no consent. **Three things found in building it.** **The member is narrower than the table row says.** §6 names it as _the set of `device_id`s it is paired with_, and what is built trims the peer of the lane it rides, on §6's own necessity clause — that peer already knows, so its id answers no question, which is the same clause that refuses the chain index. It also keeps the far end's sentence honest: a collector resolves stated ids against the devices it is paired with, and the one id it could never resolve that way is its own, so an untrimmed roster would have the screen call the reader _a device you are not paired with_. **This narrowing is a departure from the record as written** and is recorded in `CONTEXT.md`'s **Device roster**; widening it back is a surface change rather than a protocol one, because the extra id would have to be resolved rather than merely carried. **An absence and an empty list are different news, all the way to the screen.** A build predating this ticket states no roster at all, and reading that as the empty list would have the screen report _paired with no other device_ — a positive claim that peer never made — so the absent field reads as `null` and draws nothing. **And the roster is what makes §10's residual findable.** A revoked device's mail waits at a lane the revoker cannot reach, and §10 calls the roster the hunt list for it; that only holds if the list is unfiltered, so no pairing's health is looked at anywhere on the path. #399 — §11 whole: K = 200, the stop, and the coarsened last-met date. The counter is two fields on the Paired Device record (`src/lib/stores/paired-devices.ts`), `src/lib/p2p/wake-counter.ts` is K and the fold, and `wake-errand.ts` skips a stopped pairing in both syncs while `localRoster` still names it — §10's hunt list reads the whole list and this one reads the served part, which is why the two are separate functions over it. The root's **Paired devices** section gains the two lines and nothing else gains anything: no spinner, no toast, no badge. **Five things found in building it.** **The counter settles at the front of a wake and not at the back.** Folding `OpenWake.productive` at `close()` — the shape #397 left for this ticket — would never advance on a discarded tab, which is exactly the abandoned phone this bound exists for. Burning the wake after its **first** sync and letting every later sync of the same wake only ever _reset_ gives the same answer as folding the whole wake and gives it before the tab can go, so `OpenWake.productive` is deleted rather than read. **The order matters and is the opposite of the obvious one.** Burning the wake _before_ its sync would stop a pairing at 199 without asking it, so the peer that came back on wake 200 is never seen. **A take that imported rows and did not settle reaches the caller as a throw, not as `settled: false`.** `convergeWithPeer` settles whenever anything was taken, so `collected > 0 && !settled` cannot be observed on a normal return and `wake-errand.ts`'s line testing for it is vacuous; the unsettled take arrives down the `catch`, which marks the pairing unproductive and owes its peer a word. The requirement holds — such a take does not reset the counter — by a route the record does not describe. **A wake that could not reach the store counts.** §11 says _produced nothing_ flatly and it is built flatly, so 200 offline opens stop every pairing and the screen says _one-sided_ where ADR-0075 §12 insists the news is _the network failed_ and is different. It is reported rather than repaired, because the rule is written twice; the repair, if it is one, is to exclude a sync that threw `StoreUnreachableError` and it is a decision. **And _reversible_ is one-sided.** §11's _a peer waking on day 900 collects it, acknowledges, and the chain resumes one batch behind_ is true of the **peer**: the stopped device touches nothing, so no acknowledgement can reach it and its own chain resumes only when the user unpairs or pairs again. That is the 2026-09-12 Amendment's _the exit is a live act by the user in a room_, and nothing is lost either way #400 — §11's two-phase revocation, whole: `src/lib/p2p/unpair.ts` marks the pairing revoked and keeps every field on the row, deletes both lane objects, and removes the record only once both deletes have returned. The mark is what stops the lanes — `wake-errand.ts` skips a revoked pairing in both syncs, `wake-counter.ts` stops counting it, and §6's roster stops naming it — so depositing and collecting end before any delete has left the device, and the row survives only because it carries the two addresses the withdrawal spends. Nothing is sent: the whole act is two `DELETE`s. **Six things found in building it.** **The sweep has no id, and that is what makes the retry, the tap and the re-pairing one function.** A pending revocation is retried on any later open, so `withdrawRevoked` runs at the front of the wake's converge; the tap is the same sweep after a mark; and the **pairing act** runs it too, immediately before guard 1's one line — because `rememberPairedDevice` replaces by `device_id` and overwrites both indices and the etag, which are the only things reaching a pending withdrawal's objects. That third caller is the hole the record does not name and `paired-devices.ts` had flagged as this ticket's: a re-pairing is online by definition, so it is the one moment such a withdrawal is sure of a chance, and where it still cannot land what it abandons is sealed under a chain nothing will use again and §1's backstop reaps it. **A revoked pairing is the one row §6's roster drops, and this narrows #398's clause rather than reversing it.** #398 recorded that the roster is what makes §10's residual findable and that this only holds if the list is unfiltered, so no pairing's _health_ is looked at on that path. A mark is not health: it is whether the pairing exists. A stop is a pause a timer noticed and is named precisely so the far end can hunt, while a mark is an act the user took, and naming it would state a pairing this device has dropped. The hunt loses nothing either, because it runs on what a **peer** states: a device that revokes C learns who still feeds C from B's roster and never from its own. **The claim lives beside the mechanism.** `unpairClaim` is in `unpair.ts` rather than on the section, so a later change to what the deletes reach meets the sentence in the same file; it names the device, refuses household completeness, refuses to reach what the peer already collected, and carries the 2026-09-12 Amendment's qualifier that the emptiness is not permanent. The pending state is the second sentence and it is not decoration — the mark is synchronous and the withdrawal is two round trips, so without it the claim is a lie in exactly the window that matters. **§11's _zero when the revoker is online_ is a gloss rather than an exact figure, and the inexactness is named at its site.** A wake runs its pairings on one promise chain and takes its list once at the top; an unpair runs off a tap and joins no chain. So a sync already inside `convergeWithPeer` for the pairing being severed can `PUT` after both deletes have returned, leaving one deposit the peer may still collect at a lane the row no longer exists to reach, cleared only by §1's backstop. `wake-errand.ts` re-reads each row immediately before serving it, which closes every case a tap during some _other_ pairing's turn reaches and is the mirror of `updatePairedDevice`'s existing guard — that one stops a stale write coming back, this one stops a stale read going out. What is left is the seconds inside the revoked pairing's own sync, and closing that means routing the tap through the wake's queue, which is a decision about who owns that queue rather than a line of code. Reported rather than repaired. **And the ticket's acceptance list contradicts its own body on one line.** _The peer's next rewrite is refused rather than recreating a deleted object_ was written before the 2026-09-12 Amendment, which the same ticket's body then states correctly: the rewrite is refused **and answered by a recreate**, which is what stops the lane falling mute and is the reason revocation's breach of the acknowledgement-before-delete invariant is safe. What is built is the Amendment's behaviour, which #396 and #410 had already shipped in `wake.ts`; the revoker's side simply never reads that lane again

## Context

[ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md) §1
says two devices converge only while both are awake, and says plainly that it did not
choose this: ADR-0072 §5 refuses store-and-forward at any layer, and §1 adds a scoping
argument of its own, that _a sealed blob parked in a Durable Object is still your ledger
sitting on somebody else's disk — the seal changes who can read it, not what it is._

**One bar moved, and it is the only reason this record exists.** A service we run is
admissible if everything on it is **sealed** so that it can never be read. That overturns
§1's second argument in terms, and it overturns the entry in
[#185](https://github.com/palebluebytes/inventoria/issues/185)'s Out of scope that refused
_a sync server that stores datoms_. **"Sealed" is the word and "encoded" is not**: base64,
gzip and NDJSON are encodings and are readable by anyone who bothers. The bar is AEAD under
a key the server receives by no path. And sealing is **necessary, never sufficient** —
endpoint, timing, size and frequency survive any seal, which is why §5's addressing
constraint sits alongside it rather than underneath it.

The cost §1 names is the largest thing a user could reasonably expect and not get:
_a phone that is never opened alongside another device never converges._ This record
removes it.

### The alternatives that were genuinely live

- **A sealed replica** — the whole ledger, sealed, parked. Refused in §1 below, and its
  first count is the one that holds: **it cannot restore anything**, because bootstrapping
  needs a pairing secret that can only have come from a peer awake moments earlier. Its
  third count, that addressing cost scales with retention, was **wrong** and is withdrawn:
  [#282](https://github.com/palebluebytes/inventoria/issues/282) measured eleven products
  and found the stable handle is the price of _addressing_, not of retention. Syncthing and
  Tailscale pay it in full and get zero retention for it.
- **A clock-windowed mailbox**, the deposit dropped on a timer. Chosen first and then
  overturned on ease of use: a device asleep for a month must still find its mail, and no
  clock-sized promise delivers that. What the window was really bounding was **size**, not
  completeness (§2).
- **Web Push.** Refused in §14, on a mandatory notification and on reachability, after
  being priced in full. Its price list survives as the record of what was refused rather
  than of what was unavailable.
- **Periodic and one-shot Background Sync.** Silent, free, and needing only a one-line
  cache. Refused with push, because the closed-browser wake exists on Android alone and
  Chrome's engagement gate names the rarely-used device as ineligible
  ([#259](https://github.com/palebluebytes/inventoria/issues/259),
  `docs/research/259-background-wake-mechanisms.md`).
- **PIR, Oblivious Message Retrieval, Fuzzy Message Detection, Oblivious HTTP.** The
  cryptographic answers to addressing, refused on **population** rather than on cost
  ([#281](https://github.com/palebluebytes/inventoria/issues/281),
  `docs/research/281-retained-mailbox-addressing.md`). All of them hide _which_ record among
  N and our N is one household's; at one user FMD's adversary advantage is 1, and OMR's
  129 MB detection key exceeds the Worker request-body limit outright. RFC 9458 forbids one
  entity operating both OHTTP ends, both relays are enterprise-gated, and a same-origin PWA
  re-supplies the IP join regardless.
- **A group key, a shared address, mint-scoped deposits, relay on the first sync only.**
  The economies available at three or more devices. All four refused in §10.
- **A designated always-on device**, and **a remote store the user holds** (their own Drive,
  WebDAV or S3). Both out of scope: the first is the hub ADR-0075 §4 refused on _authority_
  rather than on availability, and the second is a different product with a per-provider
  integration and an auth surface.

Research notes commissioned for this record:
[`250-addressing-a-sleeping-peer.md`](../research/250-addressing-a-sleeping-peer.md),
[`251-a-third-audience.md`](../research/251-a-third-audience.md),
[`257-ios-pwa-background-capabilities.md`](../research/257-ios-pwa-background-capabilities.md),
[`259-background-wake-mechanisms.md`](../research/259-background-wake-mechanisms.md),
[`266-r2-key-name-logging.md`](../research/266-r2-key-name-logging.md),
[`281-retained-mailbox-addressing.md`](../research/281-retained-mailbox-addressing.md),
[`282-e2e-mail-prior-art.md`](../research/282-e2e-mail-prior-art.md),
[`283-retained-store-leakage.md`](../research/283-retained-store-leakage.md) and
[`372-convergence-operating-cost.md`](../research/372-convergence-operating-cost.md).

### Scope

**A decided design that ends here.** It cuts no implementation tickets, for ADR-0075's
reason unchanged: **cutting tickets for a design layered on an unbuilt design is how two
plans drift apart**, and the layer beneath this one is ADR-0075, which is entirely unbuilt.
`src/lib/p2p/` is meal send and receive only — there is no Paired Device, no pairing act, no
version vector and no chain anywhere in the tree, and ADR-0075 carries no `Implemented:`
trailer.

**The blocker is not the transport, and the map's own wording on this is corrected here.**
[#248](https://github.com/palebluebytes/inventoria/issues/248) was charted saying
implementation waits on the person-to-person half **existing**, which was true on
2026-08-30 and false by the time this record was written:
[#230](https://github.com/palebluebytes/inventoria/issues/230) to
[#239](https://github.com/palebluebytes/inventoria/issues/239) all closed and the arc
reached `main` on 2026-09-01, so ADR-0072, ADR-0073 and ADR-0074 are built. **What is
unbuilt is the record this one amends.** Whoever picks the sleeping-peer half up builds
ADR-0075 first, and they build it from a shape this record has already moved in nine places
— §2 wholesale, and §1, §3, §4, §5, §6, §11, §13 and §14 in part. Tickets cut against the
pre-amendment shape would be wrong on arrival, which is the drift the rule exists to stop.

It covers **own-device convergence only**. Person-to-person sends keep their synchrony,
where it is load-bearing rather than incidental: it makes the code's lifetime self-limiting
(ADR-0072 §5), makes ADR-0073 §10's transient hold safe, and keeps "delivered" honest
(ADR-0072 §7). A mailbox for meals would spend all three.

It does not build the **third audience** — a nutritionist reading a client's food — and it
does not foreclose it; §19 records what that would break. It does not reopen the
transport, and it does not reopen [ADR-0084](0084-a-hand-off-belongs-to-the-facet-that-owns-what-it-carries.md)
§6's assignment of this whole surface to the root Facet, whose consequences §7 states and
declines to repair.

## Decision

### 1. What the store may hold, and for how long

**The store holds sealed objects at keys nobody can enumerate, none larger than 16 MiB,
none older than 30 days. For each lane it holds at most one: its depositor's outstanding
delta, until its collector takes it.**

Two sentences rather than one, because one cannot be honest. The first bounds **everything
in the bucket**, including a blob a stranger wrote at an invented key. The second bounds
**what this design puts there**. The draft that was on the table — _the service may hold
sealed bytes it cannot read for at most N, and nothing else, ever_ — fails on exactly that
seam: _and nothing else, ever_ is false the moment anyone can `PUT`, and nothing in the
design stops them.

**Unlike ADR-0072 §12 this is not met by construction**, so the record says what holds each
clause up rather than leaving a reader to assume:

| clause                       | held up by                                                             |
| ---------------------------- | ---------------------------------------------------------------------- |
| nobody can enumerate         | the key derives from a chain the server has never seen (§4)            |
| none larger than 16 MiB      | our own route                                                          |
| none older than 30 days      | the bucket's lifecycle rule, which runs whether or not anyone is alive |
| at most one per lane         | supersede-in-place, **and object versioning being off** (§16)          |
| until its collector takes it | the collector's delete after the final chunk verifies (§5)             |

**Five clauses, five different mechanisms, only one of them the platform's.** That is the
whole difference between this bar and the one it replaces, and it is why the sentence has
to be written out rather than inherited.

**ADR-0072 §12 no longer covers the common case, and that is an admission rather than
something to be noticed.** _It may hold nothing that outlives one room_ was a claim about
the whole system when the relay was the whole system. It is now a claim about the relay
alone, and the common case — a device that was asleep — never enters a room at all.

**N = 30 days, written so the anchor cannot matter.** Nothing Cloudflare publishes says
whether superseding an object resets R2's lifecycle clock, and a privacy claim that turns
on an undocumented behaviour is not a claim. So this record takes **the unfavourable
reading on each axis separately** — for the promise, that the clock does not reset, so an
object may sit up to 30 days however often its lane is refreshed; for the bill, that it
does, so an actively refreshed lane never ages out and expiry trims nothing. Both readings
are safe at once, so the design needs no experiment to be sound.

**An expiry costs one wake of latency and never data.** Under either reading the
depositor's chain index has not advanced when its object vanishes, so its next wake
rewrites the full outstanding delta at the same key. True loss needs the depositor gone
forever **and** the collector asleep past 30 days, which is the case §11 already reaps at
K = 200.

**The ceiling drains rather than refuses.** 16 MiB bounds **a deposit** — not a lane, not
an account — and it declines nothing. Because an acknowledgement is for an index (§5), a
depositor whose outstanding delta exceeds the ceiling deposits its oldest 16 MiB at index
_i_; the collector takes it and acknowledges _i_; the depositor advances and deposits the
next 16 MiB. **A backlog empties one ceiling per round trip instead of jamming**, which is
why **ADR-0075 §13 survives verbatim**: _a rule that refuses your own data is a rule against
convergence_, and this rule reorders delivery without declining any of it. No one-sided
state, no re-pairing, and a draining lane is a healthy lane. 16 MiB is twice a whole year's
sealed ledger (8.89 MB/yr) and sits far under the Workers 100 MB request-body cap, so the
route is never the binding constraint.

**A ceiling exists at all because there is now a disk.** That is precisely the licence
ADR-0075 §13 named when it refused one, and it is the only thing that changed.

### 2. Guard 1 stands alone, and it is load-bearing twice over

> **A pairing is not complete until its first sync completes. An incomplete pairing
> deposits nothing and collects nothing.**

Pairing already requires both devices awake and in one live room (§8), so **a first sync
never crosses the store**. The server therefore only ever holds **a diff against a base it
has never seen**, on every lane, at any device count — the line is drawn at _completeness_
rather than at duration.

The guard was originally written as _a device that has never converged **directly** with
its peer must do so live_, which is decorative at its edge: ADR-0075 §11 lets an interrupted
first sync resume later, so a sync that stopped at 1% would drop the outstanding 99% into
the store and _a diff against an unseen base_ would be true in letter and worthless in
substance. Made absolute, it resumes live or not at all.

**Two things rest on it, and if it is ever relaxed for convenience the design becomes the
sealed replica this record refuses.** It is what bounds what the store can accumulate, and
it is what makes a fresh pairing cost a live session rather than a whole-ledger upload. It
is stated here as a load-bearing fact, not as a happy accident.

Its sibling guard — _the deposit is dropped on collection, so the store cannot reconstruct
by accretion_ — was traded away on ease of use and is gone. It was bounding **size**, not
completeness, and its job now belongs to the ceiling and to the backstop expiry.

### 3. A wake, a lane, a deposit, and one key per wake

- A **wake** is one open of the app. **One app-open is one wake however long it stays
  open**, because a collection at the start of an hour-long session and a deposit at the
  end are the same IP and are trivially regrouped.
- A **lane** is one direction of one pairing. A pairing has two.
- A **deposit** is one sealed object at a lane's current chain index, carrying an
  acknowledgement and a delta, **either of which may be empty**.
- A **collection** is a `GET` of the peer's lane followed, after the final chunk verifies,
  by a `DELETE`.

> **A device converges once per app open: it collects what its peer left, deposits what its
> peer lacks, and joins a live room only to complete a pairing.**

**A wake touches exactly one address per lane.** This is the invariant that makes the
address chain unlinkable, and it is stated as one key per wake rather than as strict
alternation: a device with nothing of its own to send still touches one key, because it
collects. Alternation is forced only on a wake with both jobs to do.

**An acknowledgement-only deposit is a real deposit.** A device with nothing to send still
spends a wake depositing, or its peer's chain stalls at an index the conditional rewrite
(§5) will not let it recreate — the read-mostly tablet would otherwise be a permanent
chain-stopper for the device that actually writes.

**The promise is stated in opens and never in a duration:** _your data reaches your other
device the first time you open the app on each of them; the batch after that needs a second
open on each._ There is no clock anywhere in this design and a duration would smuggle one
back in.

### 4. The address and the seal key come off one chain, and the pairing secret does not survive its own pairing

ADR-0075 §5 says _both the room id and the session key are derived per session from the
pairing secret and a rotating epoch — `KDF(secret, epoch)`_ and then delegates: _the KDF and
the epoch length are implementation._ Read literally, the address and the key have
**identical inputs**, and the operator necessarily sees the address. An implementer
following those words hands the operator the key. That is near-certainly not what §5 meant,
which is exactly why it has to be written down — the record was read literally by two
tickets and rotted once. **The fix is a property plus one named conforming construction,
not a property alone.**

> **Property.** _An operator holding every address a pairing ever used learns nothing about
> any key that sealed anything._

> **Construction (the conforming instance).**
> `HKDF-SHA-256(ikm = stateᵢ, info = "inventoria/v1/" ‖ purpose ‖ "/" ‖ direction)`, with
> `purpose ∈ {addr, seal}` and `direction ∈ {a2b, b2a}`; ratchet step
> `stateᵢ₊₁ = HKDF-SHA-256(ikm = stateᵢ, info = "inventoria/v1/ratchet/" ‖ direction)`.

The **direction** label is load-bearing rather than tidy: without it both lanes of one
pairing derive from the same state, and §3's one-key-per-wake invariant depends on a wake
touching exactly one key.

**The index advances on collections, never on the clock.** An address findable after an
absence of _T_ must live for _T_ — but it does not follow that it rotates every _T_, only
that it may not rotate **during** _T_. So the address is fixed by the absence itself and
free to change the moment the two devices are in contact again, which is the theoretical
floor. **The scan window every event-indexed chain in the literature ships** — HOTP's
look-ahead, BIP-44's gap limit of 20, the Double Ratchet's `MAX_SKIP` — **is zero here**,
because one key per wake means no session ever touches two steps of one chain.

**A ratchet with old state dropped, not an indexed KDF of the pairing secret.** The indexed
form `KDF(pairing_secret, direction, index)` is reconstructible from the secret forever, and
a device compromised in 2030 would open every object ever left, back to pairing. Under the
ratchet it opens the current index and nothing behind it. **The prize is the seal rather
than the address**, because under retention the objects _are_ the record. The cost is
stated: a device that loses its chain state cannot resynchronise without re-pairing, which
is affordable precisely because pairing already needs both devices awake and because §17
refuses every recoverability claim.

**The pairing secret is destroyed at the end of pairing.** It seeds both `state₀`s and is
then gone, or a compromised device regenerates `state₀`, ratchets forward, and forward
secrecy is worth exactly nothing. The asymmetry generalises and belongs in the record:
**the half that stores needs forward secrecy; the half that stores nothing does not.** The
live room holds nothing at rest, so a permanent root would be safe there — and after §8
there is no permanent root there either, because the room is single-use and minted fresh.

**Two of the Double Ratchet's three properties, and the record says which one is missing.**
Resilience and forward secrecy hold. **Break-in recovery does not**, because that property
comes from fresh DH entropy injected at each step and a hash chain has none. Injecting it is
not merely expensive but unavailable: it needs an exchange, and the whole construction
exists because the two devices cannot talk during an absence. A device compromised at index
_i_ yields every future index forever, and re-pairing is the only recovery. It is a §18
entry, beside ADR-0072 §13.5.

**The bound worth claiming: _a compromised device opens at most one outstanding object per
lane, and nothing behind it._** One sentence covering the K = 200 stop, the frozen chain of
an absent peer, and every orphan.

**And the honest ceiling, unhedged.** The operator can always tell it is _a_ pairing: a
mailbox object is written from one endpoint and read from another, and that is structural at
any population. **The achievable property is that it cannot cheaply tell it is _the same_
pairing across absences** — unlinkability of one pairing's successive exchanges against the
operator's own records. That is defence in depth and it is not anonymity, and this record
claims exactly that and nothing borrowed from the provenance of the mechanism.

### 5. The conditional rewrite, the acknowledgement, and what the seal binds

**The depositor supersedes conditionally and forgets only on acknowledgement.** There is one
live object per lane, rewritten at the current index with the **full outstanding delta**,
and the depositor advances only when an acknowledgement inside the seal says the peer
collected.

**The rewrite carries `onlyIf: { etagMatches }` against the etag the depositor's own `PUT`
returned.** If the peer has collected, the etag is gone, the write is refused and **the
object is simply not recreated**. That is what removes the permanently orphaned object
rather than tolerating it — and an orphan is a leak rather than untidiness, because one
`list()` returns the whole series of keys, exact lengths and write times at any later
moment.

**This is not absence-as-acknowledgement.** A refused write may **not** advance the index;
only the sealed acknowledgement does. So a hostile or buggy delete costs a deferred rewrite
and nothing else, where absence-as-acknowledgement would hand the operator control of the
chain and desynchronise addressing permanently. One key is touched either way.

**Never rewriting an index was weighed and is worse**: the depositor's newest data would
never reach the store until the chain advanced, so a device that goes dark strands the
remainder — reintroducing exactly the staleness this record exists to remove.

**An acknowledgement is for an index, and an acknowledgement for any other index is
discarded.** A bare flag would be an advance signal an operator could trigger by replaying
bytes it holds, and under a ratchet with old state dropped an advance past an uncollected
index is **permanent, unrecoverable desynchronisation** rather than a lost delta.

**The AEAD's additional data binds `{index, generation, chunk seq, final}`.** ADR-0075 §7
binds the chunk sequence; the final marker makes a truncated collection re-collectable
rather than destroyed, with the collector deleting only after the final chunk verifies. The
**generation** is the one nobody had: several distinct sealed objects exist at the same
address under the same key over the life of one index, so without it a chunk from rewrite 3
verifies inside rewrite 7's stream — same key, same index, same sequence, seal passes. An
operator that kept a superseded copy could splice a stale delta into a fresh collection and
the collector would import it as authentic. Not hypothetical: R2 overwrites the object, but
nothing stops whoever holds the disk from keeping the bytes.

### 6. What a deposit carries beside datoms, and the list is closed

> **A deposit carries datoms, and beside them only what a device states about _itself_: the
> least that answers a question its peer cannot otherwise answer, re-asserted whole in every
> deposit, never a statement about a third device and never an instruction to any device.**

ADR-0075 §7's exclusion was structural because _the payload is the `datoms` table_. A deposit
is not the payload: it is an envelope, and §5's acknowledgement is per-lane state that is not
a datom. So the door was already ajar before this question was asked, and what was left to
decide was the **rule** rather than a verdict on any one passenger.

**The obvious rule is wrong.** _A device may state anything about itself_ permits the chain
index, which §4 refuses because the collector derives its own address and the index therefore
answers no question. **Necessity** is a required clause, and it is what makes the rule
reproduce that refusal instead of contradicting it.

|                                           | about itself? | needed?                             | verdict     |
| ----------------------------------------- | ------------- | ----------------------------------- | ----------- |
| The set of `device_id`s it is paired with | yes           | yes                                 | **crosses** |
| Chain index                               | yes           | no                                  | **refused** |
| Push subscription material                | yes           | no consumer, since §14 refuses push | **refused** |

**Today the list has exactly one member.** Adding a second is an **ADR amendment**, in
ADR-0079's voice for the sanctioned deletions — a closed list with a dead member is a door
left ajar with a sign on it, so push's return costs an amendment rather than a judgement
call.

**The ledger can tell you a device _existed_; only a device can tell you it is _still_
paired.** `datoms` carries `device_id` in its primary key, so `SELECT DISTINCT device_id`
looks like a free roster — but that set only ever grows, and an append-only ledger names a
phone sold two years ago forever. That is why the roster passes the necessity clause rather
than failing it, and the distinction is stated because _we already have `device_id` on every
row_ is the cheap alternative whose defect is invisible until you have owned two phones.

**The typed names do not cross**, and lose nothing: an id resolves to a name locally exactly
where a name is wanted, and where it does not resolve, the device is one you are not paired
with and the honest sentence names nobody.

**It travels one hop.** A device states its own pairings and never relays a peer's, which is
also what stops the roster becoming an authority: nobody holds a view they did not each
separately receive.

**It rides every deposit, superseding, never accumulating and never merged.** Once-at-pairing
fails **silently** as pairings change, and a design whose failure mode is silence is the one
nobody catches. Two devices' rosters disagreeing is legitimate under pairwise pairing, so
there is nothing to reconcile and a merge would invent the authority ADR-0075 §4 declined.

**A roster is evidence, never an instruction.** ADR-0075 §14.6's stated reason for refusing a
revocation message is that an instruction may be missed while the surface reports success; a
roster claims no success, so that reason does not transfer to it. **That holds only while it
is a list you go and look at** — never an event, a notification or a badge, or §14.6's
refusal arrives by observation instead of by message.

**Nothing about a pairing enters the ledger**, for ADR-0075 §3's reason unchanged. It extends
the **Paired Device** record (§9), it names a pairing stopped at K, and it is automatic with
no toggle and no consent — the peer is you, so a switch would be asking your own permission
to tell yourself something.

### 7. Convergence happens on wake, and the live room survives for one job

**ADR-0075 §2 is replaced wholesale, not amended.** Three of its four weighed alternatives
were priced against a world with no store, and the fourth is the verdict being overturned.
**One sentence is carried over verbatim**, because it is untouched and load-bearing:
_"Silently" means no inbox and no approval, not unprompted._

§2 rejected on-open-only because it _"misses the case where the second device is opened
later, which is most of them."_ A retained deposit is collected by the later-opened device on
**its own** open, so the rejected trigger is not a concession — it is newly right, and the
store is what makes it so.

**The live room survives for exactly one job: completing a pairing.** Keeping a recurring
room is not the cheap `if` it looks like. A live session collects nothing and only a sealed
acknowledgement advances a chain, so a mostly-live pairing **freezes its chain** at an index
nobody collects, and §11's K counter counts wakes in which nothing was acknowledged and
nothing collected — which is every wake of a perfectly healthy entirely-live pairing. A phone
and a laptop converging live every day would show the one-sided state on day 200. Three
couplings, one of them a live defect.

**Scoping the room to pairing takes every prize that dropping it outright would.** ADR-0075
§5's room half evaporates, because §5 exists only to stop a _remembered_ secret re-deriving a
_recurring_ room; a single-use room needs no epoch, no adjacent-epoch skew probe and no stored
`root_room`, so the two constructions collapse to one and `purpose` reduces to `{addr, seal}`.
And **ADR-0072 §5 transfers to this half unqualified**: a room inside a deliberate pairing act
_is_ its _the recipient enters receive deliberately, every time._ §5's closing paragraph —
_"This rule does not transfer to the own-device half. Silent convergence requires a
listener"_ — is **withdrawn**. Silent convergence requires no listener; it requires a poll.
ADR-0075 §2's sanctioned divergence therefore **disappears** rather than narrowing.

**What is paid, in full and not smuggled.** ADR-0072 §12 is spent for **every ordinary
sync** — every steady-state convergence is now an R2 operation, carrying 31 days of
`objectName` (§15). And **two devices open side by side converge no faster than one
app-open**: a tablet propped on the counter is stale until it is closed and reopened, because
polling again mid-session would touch a second index inside one IP session and merge two of
§4's unlinkable components. **This is the first place this arc makes the app visibly worse
rather than invisibly different, and it is accepted deliberately.**

**A wake is an open of the root Facet, and a Rations-only user never converges.** ADR-0084 §6
makes own-device convergence the root's; both Facets are separately installable and launched,
so a user who opens Rations daily and the root never gets no wakes at all. Under a recurring
room that hole was incidental — the room was joined by whichever surface was open. Under a
wake-triggered store it is the whole mechanism. **Stated, not repaired**: reaching across
would re-open ADR-0084 §6 from the wrong side and would put convergence inside a Facet
[ADR-0078](0078-a-facet-contains-no-way-out.md) gives no way out of.

### 8. Pairing is an act, and the code carries no pairing secret

**The order inverts.** A one-shot **room id and a fresh 256-bit key** are minted exactly as
`src/lib/p2p/send-code.ts` already mints a Send code, and the **256-bit pairing secret is
minted inside the sealed room** by the device that minted the code. Nothing a camera can see
carries it.

**The sentence this record exists to carry: today's pairing QR is a stronger credential than
either device's own disk.** A photographed QR under ADR-0075 §3 regenerates both `state₀`s
and with them every deposit address and every seal key from pairing onward — passively,
retrospectively, forever, against a store that retains — where §4's bound concedes a
compromised device one outstanding object per lane. Destroying the secret on disk buys
nothing against a photograph, because the photograph is not on disk.

**ADR-0072 §13.1 does not transfer**, and the reason is in ADR-0072's own words. §13.1
declines to defend against someone reading your screen because _proximity is assumed benign_,
and §4 says why that is affordable there: _a QR on a screen leaves nothing behind_ — which is
true **only** under §5's synchrony. A pairing QR under the status quo leaves everything
behind, so §13.1's premise is simply absent here.

**What the inversion does not fix, stated rather than glossed.** Photograph **and** race
inside five minutes and you take the second socket and become a paired device, permanently.
But that attack is **active and loud** where today's is passive and silent: the legitimate
second device is refused, so one device says paired and the other says pairing failed. The
trade is an undetectable permanent compromise for a detectable five-minute one, not the
elimination of a risk.

**The relay's bounds go uniform: two sockets, five minutes, and nothing else.** ADR-0072
§11.2's one frame each way and §11.3's byte ceiling are dropped **for every room**, because
the relay cannot tell a pairing room from a meal room and telling it would hand the operator
a free classification of a surface three decisions were spent keeping it out of. Neither
bound was load-bearing: §11.3 calls itself _a crude backstop_ and §11.2 was a description of
a meal, while ADR-0073 §9's decoded check is what actually refuses one. **The five-minute
clock becomes the byte bound.**

**ADR-0072 §11's abuse argument is re-made rather than inherited**, against a pipe now
unbounded in bytes within its five minutes: _both ends must be present simultaneously,
holding an unguessable id, for at most five minutes, with no resume, no addressing and no
storage._ That still describes nothing anyone would build on, and it is a weaker sentence
than the one it replaces, which is why it is written out.

**Scan, or the bare code pasted. Never a link.** A link exists to cross a distance between two
people and there is none between two devices you are holding — and a link would charge the
root a receive route, a URL fragment and an [ADR-0082](0082-a-safari-tab-on-ios-hands-the-code-to-the-app-it-is-not.md)
handover page for reach nobody needs. **The code is a labelled token that must not parse as a
URL**, and not a `scheme:` shape either, because `new URL("x-pair:abc")` parses: a URL-shaped
QR is a link **in the operating system's hands** whatever this app calls it. The refusal lives
in the shape, not in the naming.

**The act, end to end.** The pairing section on the root's Settings expands in place, on
ADR-0074 §3's _the panel turns into the code_. The user picks **"Show a code"** or **"Read a
code"**; capability decides only what is _offered_, never what is chosen, and the reader is
live-camera `BarcodeDetector` only, absent on every iPhone, with paste as the second carrier.
Then: room opens → readiness signal → the sealed pairing secret crosses → both derive both
`state₀`s → vectors exchange → chunks both ways → **closing vector exchange** → each side
writes its Paired Device row on receipt of the peer's closing vector.

**The closing vector exchange is required and is not new machinery.** ADR-0075 §6 exchanges
vectors at handshake only, so a completed session leaves each side believing the peer holds
only its pre-sync state — a defect in the live design today, before any store exists. There is
exactly one live session left in this design, so the fix is needed in one place instead of
everywhere.

**Pairing is not atomic, and the residual is named rather than removed.** The last frame is
unacknowledged, so exactly one side can commit alone. It cannot be bounded tighter than K,
because a provisional pairing cannot distinguish _the peer never paired_ from _the peer is
asleep_. So the failure is made cheap instead: **a pairing is keyed by `device_id`, and
pairing again replaces it** — losslessly, cleaning the stale lanes by §11's deletes from
whichever device holds the stale row, which is always the side holding the indices and etag
needed to delete them. **"Pair a device" must work with no row present**, which is that repair
path, and **"Pair again" promises nothing**, because `device_id` is not learned until the act
is spent.

**An interrupted first sync re-scans, and there is no successor room.** The secret is consumed
and gone. A re-scan costs a scan and never a re-transfer, because rows already imported are
real data and the next vector exchange skips them. A successor room derived from the secret is
**refused**: it puts back the derived room chain §7 deleted, and moves the whole-pairing
credential from a QR onto disk, to save a scan.

**There is no "cannot finish" state, and the record must say so or someone will lift the
deadline.** Five minutes is now the byte bound on a whole first sync, so a large ledger over a
slow link can time out — but **repeated pairing is a resume, not a retry**, because imported
rows are real and the version vector is queried rather than kept. Pairing again picks up where
it left off.

**Contributory minting is refused**, on the record, because it will be proposed later as free
hardening: the room's own key is already a single-source draw from the code-minter's CSPRNG,
so an attacker who can predict that RNG opens the room and reads both contributions. **It adds
a term to a product that already has a zero factor**, and minting at the code-minter keeps the
set of devices whose RNG must be sound at one.

### 9. A Paired Device holds derived state and never a reusable credential

**ADR-0075 §3's _three fields_ is replaced by a rule rather than re-enumerated.**

> **A Paired Device record holds derived, per-lane chain state and never a reusable
> credential. Nothing in it can regenerate the pairing, only advance it.**

What actually broke in §3 is its justification: _what sits on disk is a seed rather than a
credential in use_ is false once **nothing** sits on disk. The rule is checkable, it is what
§4's forward-secrecy bound needs, and it is a **strengthening** — today's record holds a
secret that regenerates everything, and after this a stolen record opens at most one
outstanding object per lane.

The record accretes from six decisions and belongs to this record because this is the only
place all six are in view: both chain states and both indices, the depositor's own etag, the
revocation phase, K's counter, the coarsened last-met date, the peer's last-stated roster, the
`device_id`, and a name **typed locally, about the peer, after the act** and never sent. A row
reads by short `device_id` until it is named.

**It stays in `localStorage`**, and §3's two arguments are untouched: secrets never live in the
undeletable, syncing ledger, and a revocation cannot live in an append-only log the revoked
device also writes to. [ADR-0085](0085-a-setting-is-never-a-datom-and-a-consent-is-not-a-setting.md)
§1 is **not** what puts it there — that record governs settings, and chain state is no more a
setting than the pairing secret was. It is derived material, it lives where the seed lived, and
it inherits the seed's rules: never a datom, never in an ADR-0064 export.

### 10. Three or more devices: one deposit per pair, and the fan-out is forced

**A device with N−1 peers deposits N−1 times per wake**, and a wake serves every one of its
pairings, one key each. Sessions in different wakes share no key, so serving all of them merges
components **within** one wake and never along a chain across time: the operator sees an
unlinked star per wake and cannot join one wake's star to the next.

|                                                  | expression | N = 2 | N = 3 | N = 4 |
| ------------------------------------------------ | ---------- | ----- | ----- | ----- |
| Pairings                                         | N(N−1)/2   | 1     | 3     | 6     |
| Lanes, and therefore live objects                | N(N−1)     | 2     | 6     | 12    |
| Deposits, and R2 operations, per wake per device | N−1        | 1     | 2     | 3     |
| Worst-case simultaneous copies of one row        | (N−1)²     | 1     | 4     | 9     |

The last row is the one that makes the store's volume **superlinear** in device count rather
than linear: a row minted by X sits in every lane that does not point at its minter until
acknowledgements circulate, which is transient in a busy household and **permanent against a
sleeping peer** — the case this record exists for.

**Guard 1 is a property of pairing, not of N**, so the store holds a diff against an unseen
base on every lane at three devices as at two.

**ADR-0075 §4's duality sentence has expired and is replaced rather than repeated.** It reads:
_convergence that routes around a sleeping device and revocation that is complete in one act
are the same property seen twice._ The store dissolves the purpose §4 named, because a deposit
waits for the sleeping device directly. The verdict survives on a **substituted duality the
store cannot touch**:

> **A peer that can hand you the whole ledger is a peer that can hand the whole ledger to
> anyone it is paired with.**

Full relay is what lets a surviving device rebuild a lost one **and** what lets an incomplete
pairing graph converge at all; it is therefore also what feeds a device revoked elsewhere.
Same property, two signs. It is untouched by the store, because relay is a property of what a
deposit _contains_ and the store only changes _when_ it is read.

**Relay is a bonus, never the plan.** Two devices converge because they are paired, not because
a third relays for them. A pairing never made is a route the store cannot supply — the N ≥ 3
form of ADR-0075 §1's _a phone never opened alongside another never converges_.

**Four economies, all refused:**

- **A shared or per-device address**, in every form including the strongest nobody had stated,
  a per-device address seed handed to each peer at pairing needing no group negotiation. Its
  index can advance only on an event **all** peers observe, so the address rotates at the rate
  of the least-used device; the first collector's delete strands the rest, because §5's etag
  precondition reads disappearance as _the one collector took it_; and re-keying after a
  revocation would need every remaining device awake at once. It saves one `PUT` at three
  devices.
- **A group key**, or any seal readable by more than one peer.
- **Mint-scoped deposits**, refused by ADR-0075 §4's own hub-replacement argument: a new phone
  pairs with the laptop and pulls everything, and everything includes the **lost phone's** rows.
- **Relay on a first sync only**, mint-scoped thereafter. It survives that objection and dies on
  a better one, twice. No device could see the pairing graph, so an incomplete one would diverge
  **silently and permanently** — the failure ADR-0075 §6 refused the scalar watermark for. That
  condition was then tested and the refusal came back **harder**: §6's roster does make an
  incomplete graph detectable, but §12's carried deletion **depends on full relay**, so
  mint-scoping strands a tablet's wipe one hop from a phone paired only with the laptop.

**Revocation's completion time is set by the household's least-used device**, and this is a cost
the store **creates** rather than inherits. Before the store, convergence required opening the
laptop, so N−1 revocation acts were N−1 taps on devices you were using anyway; the store's whole
purpose is to remove that requirement. §11's two-phase revocation is **local**, so unpairing on
the phone is complete for the phone's lane and pending on every other device until that device
is next opened. **§11's _zero residual when the revoker is online_ is an N = 2 property and is
labelled as one.**

**And the residual is latched.** A revoked device's mail waits at its own lane indefinitely,
content-bounded by the depositor's last wake and unbounded in time, at an address the revoking
device does not hold and cannot reach. **Paid for at the surface only**: an unpair is **scoped
to this pairing** and must not claim household completeness, and §6's roster is the hunt list.

**Propagating a revocation to your own other devices is refused** on ADR-0075 §14.6's stated
reason rather than a new one: the peer may never come online, so the instruction is missed while
the surface reports success. It is besides an authority any device would hold over any other's
pairings, and it loses the race it is entered in, travelling the same store at the same speed as
the deposit it chases.

### 11. Stopping and revoking: K = 200, and a revoked device collects nothing it has not taken

**A pairing whose peer stops collecting freezes the depositor's chain index.** No acknowledgement
arrives, so the depositor rewrites at **one frozen key on every wake, indefinitely** — which
collapses its entire usage history into a single column value and is precisely ADR-0075 §5's
_with a constant it is a `GROUP BY`_. It is not revocation-specific: a lost device, a dead device
and a phone in a drawer all do it, and the mirror holds, because a device with nothing to deposit
touches its absent peer's frozen key just as repeatedly.

**A frozen key during a genuine absence is already accepted** — §4's whole finding is that an
address must not rotate _during_ an absence. What needs bounding is the **infinite** case.

> **After K = 200 consecutive wakes in which a pairing produced nothing — no acknowledgement
> received and nothing collected — a device stops touching that pairing's keys and shows the
> one-sided state.**

Both halves of the counter are needed: unacknowledged deposits catch the silent depositor, empty
collections catch the read-mostly device on the other side of the same silence.

**The stop is lossless and reversible.** The store still holds the full outstanding delta, so a
peer waking on day 900 collects it, acknowledges, and the chain resumes one batch behind.
**Hitting K never unpairs** — auto-removal would convert a recoverable pause into an irreversible
act taken by a timer on the user's behalf, and the user cannot re-pair without the other device in
the room.

**K = 200 is generous on purpose.** A daily phone burns roughly 30 unproductive wakes per healthy
month and about 90 against a quarterly laptop, so anything under about 100 stops a _working_
pairing. 200 is about seven months of daily use. **A self-advancing index is refused** — the
depositor advancing on its own wakes orphans an object per wake and forces the collector to scan,
trading a bounded leak for an unbounded one. **An adaptive K is refused** as a knob in a design
that has refused knobs.

**Revocation is two-phase, and the ordering is the whole mechanism:**

1. Mark the pairing revoked, **keeping the pairing state and both chain indices**. Depositing and
   collecting stop immediately; that half was always local, immediate and unforgeable.
2. Delete **both** lane objects — the revoker's outstanding deposit, and the peer's deposit to it.
3. **Only then** remove the Paired Device row.

Discarding the row first throws away the addresses, which is what would make the withdrawal
best-effort. Keeping it until the deletes land makes a pending revocation **retryable on any later
open**; a delete of an already-collected key is a no-op that succeeds; and the peer's next rewrite
is refused by the etag precondition and never recreated. `DeleteObject` is free, so this costs
nothing.

**The wall it is built against: the store cannot distinguish a revoked collector from a legitimate
one**, because the address derives from a secret both devices hold and revoking cannot un-tell a
peer what it knows. So "cannot collect" has exactly three doors and no fourth:

- **Remove the bytes.** Taken.
- **Have the server refuse to serve.** Refused: per-pairing state at the store needs a stable thing
  to address it by, which is exactly the join §4 forbids, and it puts back an authority ADR-0075 §4
  built the design without.
- **Make the bytes useless**, by deferred release. Refused: it costs §3's one-open promise and
  protects only the final batch, since a lost device is revoked days after the deposit.

**The residual window, named:** whatever the peer collected before the revocation, plus anything
between the tap and the deletes landing — **zero when the revoker is online**, which is when people
revoke. **And the one case the deletes cannot reach** — a revoking device that never comes online
again — is what makes §1's backstop expiry a requirement rather than an option.

**The surface claims exactly what the delete achieves**: _unpairing removes anything that has not
yet been picked up_, carrying a **pending state** until the deletes land, or the sentence is a lie
in precisely the window where it matters.

**ADR-0075 §12 survives untouched.** The store's _nothing here_ is the live room's _alone in the
room_: neither distinguishes revocation from absence, both sides reach the one-sided state, and
neither learns it was revoked. §12 works because it waits.

### 12. A wipe carries a deletion, and it is a datom naming the prefixes it took

ADR-0079 §8 hands the first convergence design to reach `main` an unowned debt: _a Facet-scoped
wipe and a syncing peer are incompatible without a deletion the peer can carry._ Retention makes it
strictly worse than §8 modelled — §8 assumed a live peer re-supplies the wiped rows, and a retained
deposit re-supplies them with **no peer awake at all**.

**The scope of the act is _your data_, not _this device's_.** The control is called "Delete all my
food data", and a design in which that means _this device's copy_ is a design that has to reword the
control down to something nobody asked for.

**The carried deletion names the prefix list itself**, derived from the wiping device's registry at
the instant of the act and then frozen — never the Facet and never the domain. A re-derivation is
evaluated against the **peer's** registry, and two devices are not on the same build: an older peer
deletes less, a newer one deletes more, and both report success. **The set a wipe took is a fact,
and a fact does not get recomputed by whoever reads it.** It looks like the second hand-written list
ADR-0079 §3 forbids and is the opposite of one: §3's fear is a list authored _beside_ the registry
that drifts, and this is derived _from_ it, once, and cannot drift because nothing re-derives it.

**It takes rows stamped at or before its own stamp, and nothing after.** That is the ledger's own
semantics — a later fact wins — so the wipe deletes history and never the future and the outcome is
order-independent. It deliberately takes rows the wiping device never saw, or _my food data_ means
the subset that happened to have converged and the act is a function of sync history again.

**It applies to every arriving batch, not once.** Firing once leaves a hole at N ≥ 3: a third device
asleep through the wipe wakes later, syncs with the peer that already deleted, and re-supplies the
rows one hop out.

**It is a physical delete, never a fold-time filter**, so ADR-0079's _a wipe that grows the file is a
lie_ argument is untouched, and the freed pages are reusable on both devices. **The peer's delete is
a fourth sanctioned destructive operation** that meets ADR-0079 §1's closure condition by
**inheriting the local wipe's proof** rather than asking for an exemption: it removes the same set by
the same predicate, so it is the same act rather than a re-enactment of it.

**A user-chosen ADR-0067 import is exempt.** A peer's payload _arrives_ and a file is _chosen_, and
_wipe, then import_ is already the sanctioned way to make a file the only truth — a composition
ADR-0067 §1 kept as two deliberate steps because the destructive half should be chosen rather than
implied. The divergence is deliberate and is stated in terms, because it is the kind of asymmetry a
later reader tidies away: **convergence applies carried deletions because it must converge; import
does not, because the user chose the file.**

**The wipe deletes its outgoing lane object and re-deposits in the same wake**, carrying the
deletion. Leaving the old object would let an already-addressed collection hand the peer the very
rows the wipe removed. **The incoming lane is left alone**: it holds the peer's habits, media and
items as well as its food, and destroying it to stop the food arriving is a data loss rather than a
deletion. Per-batch application is what makes leaving it safe, and that is the difference between a
deletion and a data loss.

**The peer shows a one-shot notice of a completed act, and never a prompt.** ADR-0079 §5's ethic is
that a wipe counts and enumerates before it acts; the remote half cannot ask, so it enumerates
afterwards — naming the prefixes **it** recognised, which is what that device actually deleted.
**No undo**, because there is nothing to undo and offering one would be the recoverability claim
§17 refuses.

**The jar-wide `Wipe Database` unpairs instead, and it was the catastrophic case rather than the
Facet-scoped one.** Measured: `db.worker.ts`'s `clear` calls `resetLedgerSchema`, which drops and
recreates `datoms` and touches **no `localStorage` at all** — so today it leaves the Paired Device
list standing behind an empty ledger, every vector is empty, and the next sync is ADR-0075 §6's
empty-vector case: **the whole ledger comes back.** `Wipe Database` on a paired device is a no-op
with extra steps. So it takes the pairing with it, and re-pairing afterwards honestly means _pull it
all back from the laptop_ — ADR-0067 §1's two-deliberate-steps argument applied to convergence
instead of to import.

**Breaking the pairing is refused for the Facet-scoped wipe**, where it is the worst remedy rather
than the cheap one: unpairing does not protect the wipe, it converts a partial resurrection into a
**total** one, because re-pairing is a first sync and a first sync is the empty-vector case. It
works only for a user who never does the obvious next thing.

**ADR-0075 §14.6's _no tombstone_ is spent, narrowly and on the record.** §14.6 sits in §12 and its
subject is a **relationship** — one device telling another what to believe about a pairing, the
authority §10 refuses. A carried deletion is a fact about the ledger travelling in the ledger's own
payload between two replicas of one person's data, which is where _the peer is you_ is load-bearing
rather than incidental. **§14.6 keeps its full force for revocation and is restated rather than
deleted.**

### 13. A jar-wide minted entity lives in a Tracked Domain with no screen that no Facet declares

The carried deletion must sit **outside every Facet's prefix set**, or a wipe deletes its own record
of itself. ADR-0086 §1 says the owner of an entity prefix is a Tracked Domain and there is no second
kind of owner, and the roster was six content domains.

**ADR-0086 §1's sentence survives word for word. What widens is its subject: a Tracked Domain need
not have a screen and need not belong to a Facet.** The seventh is the **Jar domain** — `id: "jar"`,
_the jar's own record of what has been done to it_, distinct from the Jar, which is where things are
kept. Named for the class because this record answers for the class and admits **one** member; a
second costs an amendment.

**The home is true by construction rather than by a rule someone has to keep.** `entityPrefixesOf` is
the union of `domainsOf(facetId)`, which filters the roster by the Facet's own list, so a domain no
Facet names is absent from **every** Facet's wipe predicate as arithmetic, not policy. The same
absence pays the screen problem: `checkViewContainment` compares `facet.domains` against
`screensOf(facet.id)`, and a domain in neither set leaves the check unchanged rather than excused. And
`resetLedgerSchema` still takes the rows.

**The entity is per-act:** `deletion:<hlc_ms>_<hlc_ctr>_<device_id>`, the act's own datom key — unique
across devices by construction, legible in the raw database, and needing neither a clock read nor a
random of its own. ADR-0014's determinism rule does not bind it, because two devices never perform the
same wipe. **A singleton is wrong rather than unfashionable**: two wipes are two facts with two stamps,
and one entity under _a later fact wins_ keeps only the newer prefix list, stranding rows under any
prefix that retired between builds.

**It carries `deletion/prefixes` and nothing else.** The attribute namespace is `deletion/`, on
ADR-0086 §5's rule that a namespace names what it is — not `wipe/`, which is the local control's name
and would make the travelling record read as the button. **A frozen human label was recommended and
then refuted**: a peer that does not recognise a prefix deleted nothing under it, so a name derived
from `deletion/prefixes` ∩ its own registry names what that peer actually did, where a frozen phrase
claims rows that are still there.

**The gate that pays for it is one biconditional in `check:entities`**, and it is load-bearing rather
than tidy:

> **A domain with views is declared by at least one Facet; a domain with no views is declared by
> none.**

True today for all six and true for the seventh. Its **second half is what stops a Facet ever
swallowing the carried deletion**, which is the one fatal move. Its first half repairs a coverage
nobody had asserted: every domain sat in the root, so ADR-0083 §5 covered the roster **incidentally**,
and a content domain added next year with a forgotten Facet entry would get no screen, no install and
no failure.

**It is called a carried deletion, not a tombstone**, taking ADR-0079 §8's own words, because
`CONTEXT.md` already spends _tombstone_ on the retraction row ADR-0079 refused.

**Refused, with reasons:** a seventh domain **the root declares** (measured — `screenOf` is
`domain.views[0]`, so `screensOf` yields `[undefined]`, and giving it the jar-wide view surface fails
harder, since Rations reaches four of those modules and would have to declare the domain); the Jar
domain claiming that view surface, which would close ADR-0083 §10's _claimed by nobody_ seam and is
fatal for the same reason, so **the seam stays open, now refused with a measurement**; widening
ADR-0086 §1's owner space, the move §1 refused by name; writing it against an existing domain's
entity, whose unstated variant survives its own arrival and still dies on a second wipe and on the
peer's own wipe; **not a datom at all**, which is available at §6's price and loses transitive reach
(envelope state travels one hop, so a tablet paired only with the laptop keeps its food) and a durable
home for the held set; and a `jarWide` marker field, on ADR-0080 §8.

**ADR-0085 is not engaged.** §1's rule is the categorical _is this how the app is configured?_, not
its opening motive sentence, and a deletion is not configuration.

### 14. Nothing runs while the app is closed, and the refusal is restated on reachability

**Push is refused outright — a ninth entry in ADR-0075 §14 — and so are Periodic and one-shot
Background Sync.**

ADR-0075 §14.2 refuses four things in one breath and grounds them in ADR-0072 §5. But §5's own
sentence is not a list; its stated payoff is a single property. **§14.2 compressed that into an
enumeration and lost the reason**, so it is restated on the line the platform itself draws:

> **A device may look. A device may not be reachable.**

That sorts every mechanism without further argument. A poll the device schedules for itself creates no
address and no reachability. Push is a **permanent, non-rotatable, per-device endpoint** that anyone
holding it can fire.

**Push falls on two independent grounds.** A **mandatory, permanent, user-visible notification on
every sync** — unsuppressable on iOS as a published WebKit position — which destroys §11's _steady
state shows nothing at all_ on the collecting device and delivers the staleness signal §17 refuses to
a lock screen as a household presence oracle. And **reachability**, which ADR-0072 §5 already refuses
in its own words.

**Not deferred.** Deferral implies waiting on a condition, and the only condition is WebKit reversing
a published position.

**Measured across all five platforms, the silent polls fall too.** The closed-browser silent wake is
**Android-only** — the OS handoff is compiled `#if BUILDFLAG(IS_ANDROID)`, desktop schedules a
`OneShotTimer` inside the live browser process, and macOS is not on the rescuing policy's supported
list at all. Firefox and Safari have nothing on any platform: two negative Mozilla standards-positions
and WebKit bug 204117 **WONTFIX**. And Chrome's engagement gate is **an off switch rather than a
frequency limit** — `TimeDelta::Max()` at score 0, with the origin joining the suspended set — so **a
monthly-opened installed app is suspended, which is the device this record exists for.**

**The finding is the shape:** _every silent wake the web offers is a poll, and the only
remotely-triggerable one forces a notification._ Silence and reachability are mutually exclusive on
every engine, which is why refusing push is a different act from refusing the polls, and why the two
refusals want different sentences.

**Push was priced in full before it was refused**, and the price list is kept as the record of what
was refused rather than of what was unavailable: browser-to-browser push is **impossible** on the
floor platform (Apple answers a CORS preflight `405` at the **method** level and therefore
path-independently; FCM carries no CORS header at any status; `no-cors` cannot rescue it because
RFC 8030's `TTL` is mandatory and unsafelisted). A per-subscription VAPID keypair minted by the
collector would have made our Worker structurally a forwarder. A push would have carried **no
information but a proof**, and its notification would have been **a function of nothing**.

**Three findings surfaced by push bind the store anyway**, and they are stated unconditionally,
because putting a live constraint behind a refused feature is how ADR-0075 §5's clause rotted in the
first place:

- **The rotation asymmetry.** The deposit address is logged 31 days and **rotation repairs that past
  the window**; an identifier that cannot rotate has nothing to repair it.
- **The traces gate.** `[observability.traces] enabled = false` is enforced by a build gate rather
  than by a comment, in `scripts/worker-closure-check.mjs`, on ADR-0072 §9's own argument that _a
  posture enforced only by review is a posture that lasts until the first debugging session_. It
  deliberately does **not** also fail on `observability.enabled = true`, because which value wins is
  undeployed and unknowable from documentation, and a gate that guesses asserts a fact nobody has
  measured.
- **The rule that permits the store and forbids an endpoint.** _No identifier in a URL_ is the
  tempting sentence and is false on its face, since the deposit address **is** an object key and is
  logged. So:

  > **An identifier that cannot rotate must never enter a retained surface; one that rotates may, and
  > pays an intra-window join.**

**Two more refusals, each closing a key-carrying pipeline:** no event notifications on the deposit
bucket, and **the bucket is never public**.

### 15. What the operator can still learn

In ADR-0072 §13's voice, and split in two because an unqualified claim goes false the day the provider
changes.

**What any store discloses by its nature.** That a key was written, its byte length, when, and from
which IP. True of every provider and not fixable by sealing.

**What this provider additionally discloses**, dated, named as replaceable, and re-measured on any
pivot:

- **`r2OperationsAdaptiveGroups`, field `objectName`, retained 31 days, with no setting, flag or plan
  tier documented to disable it.** There is no off; it is not a default of on.
- **ADR-0072 §9 cannot be cited for R2 at all** — and not because the switch is weak.
  `workers_trace_events` has no subrequest, binding, R2 or URL field, so Workers Logs never recorded a
  binding call and the surface is **empty rather than uncontrolled**. §9 is not weak here; it is
  irrelevant here, which is a different and more useful thing to record. Two further narrowings of §9's
  own reach: Workers Logs is **on by default** on new Workers, and §9's switch is documented against a
  _stored_ record rather than against live observation.
- **`r2StorageAdaptiveGroups`** carries `objectCount` and `payloadSize` against `datetime`: how many
  deposits are waiting and how many bytes they come to, over time.
- **One `list()`** returns address, exact byte length and write time for every object, at any later
  moment, with no logging pipeline and no expiry window.
- **Billing telemetry outlives the analytics window.** Audit logs exclude data-plane operations in
  terms, and no first-party source states any internal retention.

**The load-bearing consequence: rotation buys _unlinkability of exchanges more than 31 days apart_,
not unlinkability.** The dataset performs the intra-window join for free. What it does **not** carry is
a client identity, and its `datetime` bucketing is unestablished — so the operator holds **key,
operation and time for 31 days**, and this record stops there rather than claiming the retained dataset
_is_ the session graph.

**The guard given up has a name: metadata forward secrecy.** With deletion, reading the past required
deciding to watch at the time. With retention **the objects are the record**, retrospectively available
to a court order, a breach, an acquirer or a later maintainer.

**Size discloses which door a food came in through.** An AEAD adds a constant, so against this repo's
own rate card a sealed length separates **1,373 B (USDA search), 22,129 B (barcode scan) and
310,958 B (label photo)** — 16× and 14× apart. **Padmé is adopted**, at ≤6.25% overhead, taking length
leakage from 20.00 to 7.81 bits across 225 buckets. **Padding narrows the alphabet and does not close
it**: 225 buckets still keep the three doors apart, and only fixed-size deposits close the gap, at
239× on the common case. Stated in the same breath as the thing it does not fix, rather than implying
a seal.

**Timing's neighbours are strong**, and the cadence is not incidental, because a deposit exists only
when something was logged. No paper measures this exact channel, which is said plainly rather than
papered over — but PNAS 2016 telephone metadata (n = 823) identified a romantic partner from **call
counts alone at 81%**, and Peek-a-Boo recovered home entry and exit at **93%**. Superseding in place
also makes a lane's sizes **monotone non-decreasing** between collections, a cumulative activity curve
whose first differences give the volume series back inside the 31-day window.

**Residency: `jurisdiction: "eu"` on the bucket.** In this record rather than left to implementation,
because it is a claim the bar sentence can make and an implementation note is not.

**Legally, _until collected_ is not a period** under Art. 5(1)(e), and Recital 26 keeps sealed bytes
personal data — which is a second, independent reason the backstop date in §1 exists. Art. 34(3)(a)
excuses notifying individuals and not the authority, and it does not cover the metadata.

### 16. Portability: a property plus one named conforming construction

**Scope: the store is the binding requirement; the relay is a noted ambition.** The store is the new
thing and the thing holding user data, and its verbs are `PUT`, `GET`, `DELETE` and a TTL. The relay is
a Durable Object whose hibernation, coalescing and alarm behaviour is load-bearing on cost; porting it
is a real rewrite, it is ADR-0072's to speak for, and claiming otherwise would be a promise nothing in
the repo backs.

**A pivot is an abandonment, not a migration — and that is a property, not a plan.** Addresses are
client-derived, chain state lives on the devices, and a lost object costs a rewrite rather than data.
So the route is repointed and each depositor re-fills its lane on its next wake, at a cost of at most
one wake per lane — the same cost the backstop expiry already imposes and the design already absorbs.
A migration would need **bulk read of both providers**, which is the `list()` that is the loudest
surface in the whole design. **We do not build an enumerator in order to leave**, which is why bulk
export is deliberately absent from the list below.

**What a candidate provider must have:**

1. **Conditional write on a caller-supplied etag.** §5's orphan design rests on it, and a refused write
   may not advance the index. The one genuinely load-bearing property, and recent enough that it must
   be checked rather than assumed.
2. **Expiry the provider enforces on its own clock**, not a sweeper we run — the point is that a
   depositor who never returns still has its object removed. Bucket-wide by rule is sufficient.
3. **Prompt, durable delete.** An eventually-consistent delete measured in days silently reopens the
   window retention closes.
4. **No client-reachable listing.** No default-public path, no anonymous enumeration.
5. **A nameable region, EU.**

**What it must not have, or must have switched off:**

6. **Object versioning.** The sharp one. Supersede-in-place is how a lane holds exactly one object;
   under bucket versioning **every superseded deposit is retained and §1's bar sentence becomes false
   with nothing in our code changing**. R2 has versioning, so it is named as a must-not rather than
   left as a default.
7. **Retention locks or compliance holds** — the same failure from the other side, a provider rule that
   refuses our delete.

**Plus an obligation rather than a property:** the provider's disclosure surface must be **measured
before adoption**, in the manner `docs/research/266-r2-key-name-logging.md` measured R2's.

**And the rule that makes all of it checkable: the client never names the provider.** The store is
reached only through our own route, so the client speaks our protocol and the entire provider surface
sits behind one module.

**Today's construction is R2**, and it is named as an instance rather than as the design.

**Refused: a Privacy-Pass-family token issuer.** It would buy unlinkable authorisation without a client
identity, and it is refused anyway, because it introduces **an issuer** — an authority ADR-0075 §4
built the entire design without.

**Withdrawn during the session that produced this record**, so it is not inherited as a fact: there is
**no server-side read-once** in R2, in the S3 API, in presigned URLs or in lifecycle. The collector
deletes client-side after the final chunk verifies; an abuser would simply not delete.

**The abuse answer, re-made rather than cited.** The store is an unauthenticated anonymous key-value
store whose server cannot tell a derived address from an invented one, so ADR-0072 §11's _nobody builds
anything on this pipe_ stands here on three legs: **an anonymous blob of at most 16 MiB, gone in 30
days, at a key you must already hold, with no listing and no directory of any kind.**

### 17. Cost, the threshold, and the withdrawal clause

**The free plan bears it comfortably.** At one deposit and one collection per device-day, **R2 Class A
binds first at ~33,333 users** at N = 2 and ~11,111 at N = 3; Workers' 100,000/day is next at 50,000
and Class B at 333,333. Two crossovers fall out independent of N, wake rate and user count, which is
what makes them worth recording rather than the numbers: Class A binds ahead of Workers exactly when
the deposit share exceeds 1/3, and ahead of Class B above 1/11. **A read-mostly household moves the
binding limit off R2 onto Workers.** Past the free tier the money is small: about $14.00/mo at 100,000
users.

**Stored bytes are the sleeper.** Healthy lanes are trivial; an **abandoned lane reaches 4.88 MB**
under K = 200. **Once about 4.2% of users have a permanently abandoned device, stored bytes overtake
Class A as the binding limit** — and the backstop expiry does **not** move that, under the unfavourable
reading in §1 that an actively refreshed lane never ages out: an abandoned lane is bounded by K at
4.88 MB either way. **The backstop is a privacy and disposal control, not a cost control**, and K is a
bound rather than a fix.

**ADR-0072 §14's protection does not transfer to this substrate, and the clause must be re-made rather
than repeated.** Durable Objects and Workers both state a **hard stop** on the free plan, which is what
made _reopened rather than silently upgraded to a paid plan_ structurally guaranteed rather than a
policy: on DO you cannot silently upgrade, because the thing stops. **The R2 pricing page contains no
equivalent sentence** — R2 is a separate subscription whose free tier is an allowance deducted from a
bill — so there **is** a silent upgrade path here.

**So the cost control is operational: a stated threshold and a billing alert, and this half is enforced
by our diligence where the send half is enforced by the platform.** A structural cap is **refused**,
because it needs exactly the aggregate counter ADR-0072 §12 refused by name.

**The withdrawal clause, and it is materially stronger than the one it echoes:**

> **If operating the store stops being tenable, the deposit is removed and convergence between two
> devices that are awake together remains.**

ADR-0072 §14 falls back to a file export because removing the send removes the only path. Removing the
store removes only the **asleep** path: the feature degrades to the ADR-0075 design this record amends,
not to a manual export. **The threshold being crossed is the tenability test.**

**Disposal is enforced by the bucket rather than by a tool we write.** Setting `--expire-date` empties
the store on the platform's own clock, so **shutting down never requires the `list()`** that is the
loudest surface in the design. Pivot and withdrawal are therefore **one procedure with two endings**:
set the expire date, let it run, then repoint the route or remove it.

**Two operating facts worth writing down because they are load-bearing on cost.** `acceptWebSocket` is
what keeps the relay hibernation-eligible, and losing that eligibility is a **347-pairings-per-day
cliff**. And the per-frame `storage.get`/`put` that enforces the one-frame rule §8 deletes would, if it
outlives the rule, bind the whole design by roughly **50×** against DO SQLite row billing — **the code
that enforces a withdrawn rule is not dead weight, it is the binding limit.** Removing the byte ceiling
is otherwise nearly free: a whole first sync of an 8.89 MB sealed ledger is **2.75 billable requests**
against a meal send's 2, because the relay's bill is dominated by opening the room rather than by what
crosses it.

**And a number in a record this one amends is corrected.** ADR-0072's _the free plan binds on duration
first, at roughly 10,000 sends a day_ rests on an unsourced ten active seconds per send. Under
hibernation, duration accrues only while executing JavaScript, so **the send half binds on requests at
about 50,000 sends a day**.

### 18. What is deliberately not defended against

Extending ADR-0072 §13 rather than replacing it. §13.1 to §13.6 stand for the send; three rows are added
or changed for this half.

1. **A compromised or lost device yields every future index of its own lanes, forever.** §4 has forward
   secrecy and no **break-in recovery**, because a hash chain has no fresh entropy to inject and an
   absent peer cannot supply any. Re-pairing is the only recovery.
2. **A photograph of a pairing QR, raced within five minutes.** §8 removes the passive, permanent,
   retrospective version of this attack and leaves an active, loud, five-minute one. **ADR-0072 §13.1's
   _proximity is assumed benign_ does not transfer**, and the reason is §13.1's own licence: _a QR on a
   screen leaves nothing behind_ is true only under §5's synchrony.
3. **Traffic analysis by the store operator**, per §15, and by Cloudflare's network regardless of any
   switch. This posture governs what **we** retain and what anyone reading our records can learn; it
   cannot make the network not observe the connection.

### 19. The refusals, recorded so nobody later "fixes" them

Extending ADR-0075 §14. Refusals 3, 5, 7 and 8 stand unchanged; 1, 2 and 6 change as follows, and the
rest are this record's.

1. **§14.1's _no store-and-forward, no queue, no parked bundle_ is reversed for this half, and only
   under §1's bar.** Person-to-person keeps it whole.
2. **§14.2 survives whole and is restated on reachability** (§14): _a device may look; a device may not
   be reachable._ No push, no Periodic or one-shot Background Sync, no service-worker wakeup, nothing
   that runs when the app is closed.
3. **§14.6 is spent for deletion and keeps its full force for revocation** (§12). No revocation message
   and no unpair notification; a carried deletion is not a tombstone in §14.6's sense.
4. **§14.8's _no payload narrowing_ stands unchanged, and its licence is named.** It is licensed by _the
   peer is you_, and it **inverts for a third audience**: a coach handed a client's food diary would get
   the Compliance Events with it. For own-device convergence the refusal is untouched; this is wording,
   not a change of verdict.
5. **No sealed replica.** §1's guard 2 is gone but guard 1 is absolute, and a design that deposits a
   whole ledger is the replica by another name.
6. **No stable address, and no scan or probe window in any form.** §4.
7. **No shared or per-device address, no group key, no mint-scoped deposits, no relay-on-first-sync-only.**
   §10.
8. **No self-advancing index and no adaptive K.** §11.
9. **No hub, no always-on device, no designated main device.** ADR-0075 §4, on _authority_ rather than
   availability, and nothing here engages that argument.
10. **No per-pairing state at the store, no subscriber set, no reference counting, no token issuer.**
    §11 and §16. Pairwise means exactly one collector per object.
11. **No structural cost cap and no aggregate counter.** §17, on ADR-0072 §12's own reason.
12. **No vestigial live path kept solely as a degradation route**, which is the recurring room in
    disguise. §17's two postures replace it.
13. **No mid-session second sync**, and no room as a pure accelerator over a store that runs anyway.
    §7. The second is strictly dominated: it pays R2 for the common case regardless.
14. **No link as a pairing carrier, no telling the relay which kind of room it is, no second route for
    the own-device half, no successor room, and no contributory minting of the pairing secret.** §8.
15. **No recoverability claim of any kind.** Everything is sealed under a key only the devices hold, so
    if both are lost the store holds unopenable ciphertext until the backstop expires. The design must
    not **look** like it offers recovery, in the voice
    [ADR-0065](0065-the-browser-is-asked-once-to-keep-the-ledger-and-its-answer-is-on-screen.md) already
    uses for _browser storage is not a backup_. Its sibling is **no claim beyond what the delete
    achieved** (§11).

## Consequences

**The store is a policy where the relay was a construction.** ADR-0072 §12 met its bar by there being
nothing to enforce; §1 meets its bar by five separate mechanisms, only one of which belongs to the
platform. That is strictly weaker and it is the price of the capability, stated once here so that no
later reader has to discover it.

**Guard 1 is the only structural guard left, and everything rests on it.** If it is ever relaxed for
convenience — a first sync allowed to finish through the store, an interrupted one allowed to spill —
the design becomes the sealed replica this record refuses, and no other clause catches it.

**Two devices open side by side converge no faster than one app-open.** The one place this arc makes
the app visibly worse rather than invisibly different.

**A user who opens only Rations never converges.** ADR-0084 §6 made convergence the root's and a wake
is an open of the root Facet. Stated rather than repaired, because repairing it would re-open a Facet
decision from the wrong side.

**Revocation now takes as long as your least-used device**, in a design whose whole purpose is that you
no longer need to open it, and the residual it leaves is **latched** rather than transient. The surface
pays for this by claiming less: an unpair is scoped to one pairing.

**ADR-0075 §6's identity claim is unsound under any local mutation of the past, in both directions, and
this record does not repeat it unqualified.** _The watermark is not stored, it is queried_ holds only
while the ledger is append-only: **a maximum cannot express a hole.** A wipe opens holes below the
maximum, so a peer re-supplies exactly the rows minted after the wiping device's newest surviving row
and silently keeps the rest deleted — a **torn** food graph whose shape depends on whether you happened
to log a habit after your last meal, which is worse than either clean outcome and which corrects
ADR-0079's Consequences in the direction that matters. The mirror is a **live defect today**, before any
store exists: an ADR-0067 restore recovers rows carrying their original stamps, below the maximum, which
are therefore never re-sent, leaving both vectors agreeing they are converged. The carried deletion is
unaffected, because it is addressed by prefix rather than by stamp. **Both are filed as defects rather
than fixed here.**

**A restored backup and a carried deletion disagree permanently**, on two independent grounds: the
import exemption keeps the food locally while the peer applies the same deletion per batch, and the
restored rows are never re-sent anyway. Named once here so it is not later re-derived as a bug.

**The nutritionist is not foreclosed and is not built, and the four things that would break are recorded
so they are not re-derived.** A coach is refused by ADR-0075 §3's **symmetric secret** rather than by
anything in this record — no derivation can express direction, because the address comes from a secret
both parties hold, and a domain separator partitions lanes rather than permissions. ADR-0075 §7's
refusal 8 would hand a coach the client's Compliance Events with the food diary; ADR-0073 §7's clock
argument bites in the direction such a relationship actually uses; and re-minting would assert the coach
ate the meal. Four independent arguments converge on a per-client sidecar with its own clock domain,
stated as a result rather than proposed as a design.

**Nine facts nobody has measured, each claimed at its worst reading.** All are settleable by experiment
on a deployed bucket or relay, and none is ticketable here, because this record cuts no implementation
and nothing is deployed.

| fact                                                                         | the unfavourable reading this record takes                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Does superseding reset R2's lifecycle clock?                                 | **Both**, on separate axes: for the promise, it does not; for the bill, it does |
| The `datetime` bucketing of `r2OperationsAdaptiveGroups`                     | Fine enough to order key touches                                                |
| Does `DeleteObject` emit an `objectName` row?                                | It does, so a collection is as visible as a deposit                             |
| Does a refused conditional `PUT` emit a row, and is it billed?               | It does, and it is billed Class A                                               |
| Which value wins when `observability.enabled` and `traces.enabled` disagree? | Traces may be on, which is why rotation is what repairs the window              |
| Is a 404 `GetObject` billed?                                                 | It is                                                                           |
| Is `serializeAttachment` a metered row?                                      | It is                                                                           |
| Is R2's free tier per account or per bucket?                                 | Per account                                                                     |
| Is a Durable Object billed wall-clock while a large frame arrives?           | It is, which is the only one whose failure would change a verdict               |

Beside them sits a fact nobody holds at all: **the fraction of users who abandon a paired device**,
which is what §17's stored-bytes crossover turns on.

**The vocabulary lands with this record, and the rest is owed to whoever builds.** Six decisions each
owed part of `CONTEXT.md` and one edit is cheaper than six, so **Store**, **Deposit**, **Lane**,
**Wake**, **Pairing** and **Pairing code** are added here, and three entries are corrected: **Relay**,
whose _Avoid_ line carried _sync server (nothing stores datoms)_, which this record makes false;
**Paired Device**, whose three fields become §9's rule and which names the **Paired devices** section;
and **Send code**, whose _Avoid_ line distinguished the two codes by per-send versus remembered, a
distinction that is gone. **Facet-scoped wipe**'s _Avoid_ line on _tombstone_ is deliberately **not**
edited, which is the whole reason §13 renames the thing.

**What waits for the registry**, because it cannot land without the entry it describes: **Jar domain**
and **Carried deletion** in `CONTEXT.md`, **Tracked Domain**'s _"there are six"_ and _"one domain is one
screen"_, `deletion:` and `deletion/` in `docs/eavt-vocabulary.md`, and the case in
`docs/how-to-add-a-tracked-domain.md` step 4 where a domain joins no Facet. `AGENTS.md` requires the
registry and the vocabulary to move in one change, and this record adds no code.

**The largest thing a user could reasonably expect and not get has moved.** ADR-0075's was _a phone that
is never opened alongside another device never converges_. This record's is smaller and is stated in the
same voice: **at three or more devices, a pairing never made is a route the store cannot supply**, and
**a device you never open at all still never converges** — because a wake is an app-open and there is
nothing else.

## Amendment (2026-09-06, #385): a wake stops meaning one sync, and live-first is refused on a measurement

This record was reviewed the day after it was written, against an objection with two halves:
_if devices are awake next to each other they should auto update_, and _we only need the store
for sleeping devices_. The second is refused. The first is a real defect and is repaired here,
by amending §3 rather than by changing the transport.

> **A wake is one app-open, and a session syncs as often as it has reason to: it deposits
> whenever its delta grows, and it collects on open and then no more than hourly. What carries
> a sleeping peer is unchanged.**

### The requirement this is checked against

Stated because it was nowhere in this record and every number below answers to it:

> **A user may close any device at any moment, and a device opened later picks up exactly where
> they left off.**

There is no dependable end-of-session — `pagehide` is unreliable and a large `PUT` will not
complete inside one — so a deposit fired at _open_ goes out before that session's meals exist.
Three meals logged at 10:05 and a laptop opened at 14:00 would converge on nothing. §3 half-saw
this in the phrase _a deposit at the end_ and did not follow it.

### §3 is amended: the wake is unwelded from the sync

A wake stays one app-open, because the **promise** is stated in opens and that is unchanged:
_your data reaches your other device the first time you open the app on each of them._ What goes
is the identity between a wake and a single collect-and-deposit.

**Deposit and collect are different problems and only one of them is a cadence.**

- **A deposit is triggered by the delta growing, debounced by seconds, with a best-effort flush
  on hide.** It costs no unlinkability whatever: the index advances on **collection**, so every
  rewrite before a collection lands on **the same address**. Depositing at 10:05, 10:12 and 10:19
  is three writes to one key — it merges no components and spends nothing of §4. It costs three
  Class A operations, and because the trigger is the ledger growing rather than a clock, the cost
  is set by how often a person actually logs something. **The residual is named:** a device closed
  inside the debounce window defers to its next open, which is the existing promise rather than a
  regression.
- **A collection is the only real cadence, because a device cannot know its peer deposited without
  asking.** At open it is unconditional and free, and it is the whole of the requirement above.
  **A session that stays open collects again no more than hourly**, and skips when nothing has
  changed locally either. That floor buys exactly one thing — the propped-open tablet refreshing
  while you log on the phone beside it. It is a **floor rather than a schedule**, so it is a rate
  limit and not the clock this record refused. _Never_ was coherent and is what §7 shipped; it is
  rejected because the side-by-side case is the defect this amendment exists for.

**The ground for allowing a second sync at all is that §3's own justification undercut the refusal
of one.** §3 fixes a wake as one app-open _because_ a collection and a deposit an hour apart _"are
the same IP and are trivially regrouped"_ — the merge is free and unavoidable, which is what lets
the definition stand. [#364](https://github.com/palebluebytes/inventoria/issues/364) then refused a
mid-session sync **on the ground that it merges components**, which is the merge §3 has already
conceded is free. What genuinely costs something is **continuity**: a lane touched twice a day is
hard to follow across a change of IP, and one touched every five minutes is trivial to follow by
contiguity alone. §4's property is a **frequency** property, so a bounded re-sync is affordable and
only an unbounded one is not.

### §4 keeps its property and loses its reason

_"One key per wake means no session ever touches two steps of one chain"_ is false once a session
may sync more than once. **The zero scan window survives on a substituted justification:** both
sides advance on the same acknowledged collection, so the collector never has to guess. The
property is unchanged; only the argument holding it up is replaced, in the voice §10 uses for
ADR-0075 §4's expired duality sentence.

### §5 gains the sentence it was missing

§5 says when the **depositor** advances and never says when the collector does. The consistent
reading, written down so it is not re-derived: **the collector advances on collecting; the
depositor on receiving the acknowledgement.** Between the two, the depositor rewrites at the old
index while the collector finds nothing at the new one, and it self-heals only because the
acknowledgement is **re-asserted in every deposit**, exactly as §6 re-asserts the roster. **A
collector finding nothing is normal** — this is stated plainly because an implementer will
otherwise read it as a bug and repair it with the scan window §4 boasts of not needing.

### §7's accepted cost is withdrawn

_"Two devices open side by side converge no faster than one app-open"_ was called the first place
this arc makes the app visibly worse rather than invisibly different. It is repaired rather than
accepted, and the sentence goes with it. The rest of §7 stands: convergence still happens on wake,
and the live room still survives for exactly one job.

### §11 is unchanged, with one clarification

**K is counted in wakes, never in syncs.** A session that polls eight times against an absent peer
is **one** unproductive wake. Otherwise K = 200 quietly becomes K = 25 and _"about seven months of
daily use"_ is wrong by an order of magnitude.

### §1 is untouched, in words and in force

Said explicitly because a reader will expect the bar to have moved and will read its stillness as
an oversight. All five clauses, guard 1, the 30-day backstop and the 16 MiB ceiling bound the
**absent-peer** path, and nothing here alters that path. The store remains what carries a sleeping
peer, on exactly the terms §1 sets. Nor does the cost picture move where it binds: stored bytes
overtake Class A at about 4.2% abandonment, an abandoned lane is untouched by any of this, and the
extra work falls on healthy lanes that were never the constraint.

### Live-first is refused, and the measurement is the durable half

The proposal was that two open devices converge over a live relay session, leaving the store to
carry only a genuinely sleeping peer — winning back ADR-0072 §12 for households whose devices are
often open together. **The prize does not exist.** The relay is not a quieter surface than the
store; it is the same leak with the same shape, and by one reading a worse one.

- `durableObjectsInvocationsAdaptiveGroups`, `durableObjectsPeriodicGroups` and
  `durableObjectsSubrequestsAdaptiveGroups` carry **`name`** and **`objectId`** as dimensions,
  `name` being _"The name the Durable Object was created with"_ — the exact twin of the
  `objectName` field §15 records on `r2OperationsAdaptiveGroups`.
- **Our room id is that name.** `worker/src/index.ts:73` routes with
  `env.RELAY.get(env.RELAY.idFromName(room))` and ADR-0072 §10 has the room id client-minted, so
  there is no indirection between the two.
- **There is no off switch.** `[observability]` governs Workers Logs, a separate system with a
  published 3–7 day retention. Nothing documented disables or shortens the `durableObjects*`
  datasets — the same posture as R2, an absence of a switch rather than a weak one.
- **The 20:1 WebSocket discount is billing-only**, and _"does not affect Durable Object metrics and
  analytics, which reflect actual usage"_. So every incoming frame is its own analytics row
  carrying the room name at minute resolution, where the store leaves two opaque keys a day. That
  is a **richer** usage record than the one being escaped.
- **R2's retention is a published 31 days; the Durable Object datasets' retention is undocumented.**
  The swap trades a bounded claim for an unbounded one, which is the opposite of what §1 needs.

Neither surface records a client IP against the object. Two further operating facts, recorded
because they would have bitten a build: a long-lived socket is a fiction — Cloudflare updates the
runtime _"a few times per week"_ and _"may restart servers, which terminates WebSockets
connections"_ — and the documented WebSocket **idle timeout has no published duration**, with no
statement of whether the runtime's automatic pong resets it.

**This puts a hole in a record this one already amends, and it is bigger than this amendment.**
ADR-0072 §12's _"after five minutes no record anywhere says the room existed"_ is false as shipped,
§9 cannot be cited for the relay any more than for R2, and this record's narrowing of §12 to the
relay narrows it to the one place it is now known to be wrong. That is a claim in an Accepted record
about deployed code, and the meal-send half owns most of it — a **Send code**'s room id is retained
exactly as a **Pairing code**'s would be. It goes to
[#386](https://github.com/palebluebytes/inventoria/issues/386) rather than being settled here, and
§15 is incomplete until it reports.

### Refused with it, so they are not re-proposed as free wins

All of the following were worked out as live-first's machinery and lapse with the verdict.

1. **A room that dies with its participants** rather than on a five-minute clock. Needed because
   [#371](https://github.com/palebluebytes/inventoria/issues/371) refuses telling the relay which
   kind of room it is, so an unbounded own-device room makes **every** room unbounded — including
   the meal room whose synchrony this arc's locked scope kept — and ADR-0072 §11's _nobody builds
   anything on this pipe_ would have to be re-made a third time. Rejoining a fresh five-minute room
   instead is priced out at roughly 700 devices against the free tier.
2. **A completed live session as a mutual acknowledgement**, advancing both chains and deleting the
   outstanding object. It has a two-generals failure: a lost final frame leaves the lane in the
   state §5 calls _permanent, unrecoverable desynchronisation_. It was survivable — the room chain
   would be clock-derived and self-synchronising where the lane chain is event-derived, so a
   desynchronised pair repairs at its next live meeting — but it is machinery bought for nothing.
3. **The rotating recurring room** and its returning `root_room`. It **passed** locked decision 7,
   on [#279](https://github.com/palebluebytes/inventoria/issues/279)'s own precedent that _an
   identifier that cannot rotate must never enter a retained surface; one that rotates may, and pays
   an intra-window join_. It is refused on the measurement, **not** on decision 7 — the distinction
   matters, because a later reader will conclude the room was inadmissible and it was not.
4. **The clock-skew probe, deleted a second time.** #364 deleted it and #385 expected it back. It
   need not return even under live-first: with both devices migrating rooms at the epoch boundary
   they re-join within seconds of each other, and the only unserved case — a fresh join whose clock
   straddles the boundary — degrades to a deposit and costs one wake.
5. **Two clocks inside the mechanism**, an epoch for the room and a wait before falling back to a
   deposit. Live-first could avoid neither, and §3's _there is no clock anywhere in this design_
   would have had to be narrowed to the promise. It survives intact instead: the debounce and the
   floor above are rate limits, not schedules.
6. **N−1 room joins per wake at three or more devices**, forced by pairwise pairing and the relay's
   two-socket bound — a linear-in-N room cost beside §10's superlinear store volume.
7. **Evicting the oldest socket when a third arrives.** Under a room that no longer dies on a clock,
   with no keepalive on an idle socket, a stale socket holds one of two slots forever and locks a
   pairing out of its own room — a denial of service on the healthiest pairing there is, the same
   shape as the K defect #364 found. The repair would have narrowed #371's _two sockets and five
   minutes, and nothing else_.
8. **Citing cost in live-first's favour.** It is cost-neutral at best and worse in the asymmetric
   household — a room opened that finds nobody, then the deposit anyway.

**Two things established while testing it, which survive the refusal.** A foreground socket is
**not** the reachability §14 refused — ADR-0075 §2 sanctioned exactly that, and the refusal is of
running while **closed**. And **WebRTC is not the transport**, per ADR-0072's first three refusals.

**And the number nobody holds is sizing rather than a gap.** How often two devices in one household
are open together is not in this repo, this arc or the provider, and it blocks nothing: when devices
are never open together, this design _is_ the design. The fraction sets the size of a prize, never
the correctness of a choice — so it sits beside the abandonment fraction, unchased.

## Amendment (2026-09-07, #386): §15 was incomplete — the relay retains an identifier too

Dated and numbered separately from the amendment above rather than folded into it, because
they are two events a day apart, and folding would make this record claim it knew on the sixth
what it learned on the seventh.

**§15 lists what the operator can learn and names one retained surface.** There are two.
[ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md)'s own amendment carries
the finding and the repair; what belongs here is the row §15 was missing:

| what any relay session discloses                                                                                            | what this provider additionally retains                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| That two endpoints met in a room, when, for how long, and roughly how much crossed. Structural, and not fixable by sealing. | The Durable Object's **`name`** — the room id, hashed from #386 onward — on three always-on datasets with **no documented off switch**, at **one row per frame** (the 20:1 WebSocket discount is billing-only), for an **undocumented** period. |

**Three consequences, and the third is the one to carry.**

- **§9 is spent twice over.** This record already wrote that ADR-0072 §9 may not be cited for
  R2. It cannot be cited for the relay either, and for the same reason: `[observability]`
  governs Workers Logs, which is not where these dimensions live.
- **The store's window is the documented one.** R2 publishes 31 days; the Durable Object
  datasets publish nothing, so the unfavourable reading is _longer_. The pairing act therefore
  leaves a mark whose lifetime this record cannot state, where a deposit leaves one whose
  lifetime it can. That is the reverse of what §15 implied.
- **§1 is untouched, in words and in force.** Said explicitly because a reader will expect the
  bar to have moved. §1 bounds **what the store holds**; nothing here is in the bucket. What
  was wrong was §15's completeness, which is a disclosure claim, and the two are different
  things — the distinction §12 collapsed and this arc's own §1/§15 split had already fixed.

**The standing invariant survives whole.** _The user's data is sealed whenever it is not on a
device they own_ holds on both surfaces: sealing is not what failed here, enumeration of the
metadata around it is. **Two is still the final count.**

**And this strengthens §19's refusal of live-first rather than softening it.** Hashing bounds a
leak of the dataset; live-first's problem was the **volume** of rows and the **undocumented**
window, and a hash touches neither.

## Amendment (2026-09-12, #410): a collection commits on its acknowledgement, and a refused rewrite is answered by a recreate

§5 as written freezes a pairing permanently, from one dropped `PUT` on a healthy lane or from
one object reaching §1's backstop. The defect was found while building #396, is named at its
site in `src/lib/p2p/wake.ts`, and is repaired here rather than by the implementer, because
both exits an implementer can reach from §5's text are ones §5 forbids.

### The defect is reachability, not writability

[#410](https://github.com/palebluebytes/inventoria/issues/410) states it as _a lane that may
not be written to is a lane that cannot acknowledge_. That is the symptom. The mechanism is
one step further back:

> **A collector advances alone. From that moment the depositor's only writable address is one
> the peer has stopped reading, and the depositor may advance only on an acknowledgement it
> can deliver nowhere else.**

The distinction is load-bearing, because it disqualifies the repair that looks obvious. Letting
the refused rewrite recreate its object does **not** fix this: the object comes back at an index
the collector left, and nobody reads it. Writability was never the thing that was lost.

Both lanes reach the state from one failed `PUT` — #410 walks it — and one lane reaches it alone
from an expiry, after which the other follows within a round trip. §11's K = 200 reaps the result
into the one-sided state, so nothing is lost and re-pairing recovers; but the exit is a live act
by the user in a room, which is the act this whole record exists to make unnecessary.

### The fifth exit: a collection commits on its acknowledgement

#410 lists four exits and refuses all four correctly. All four accept that a collection is
complete the moment its rows are imported, and that unilateral advance is what creates a debt
the other lane may be unable to pay. The fifth moves the commit point instead:

> **A collection is `GET`, verify, import, **deposit the acknowledgement**, advance, `DELETE`.
> A collection whose acknowledgement does not land does not advance and does not delete, and is
> retried whole on a later wake.**

So **a lane's object is deleted only after the acknowledgement for it is in the store**. A
depositor meeting a refusal therefore knows its peer has already said the word, and since a wake
collects before it deposits, it will have read that word before it can be refused at all.

The doubly-mute state becomes **unreachable rather than rare**. It needs `A` taken at _i_ and `B`
taken at _j_ at once; `A` taken at _i_ means `B` deleted `A@i`, which means `B` had deposited
`ack(i)` at _j_ and `A` then collected that object — which is what made `B` taken at _j_, and
which carried the acknowledgement that advances `A` past _i_. The state contradicts itself.

**This spends nothing.** §1 still holds one object per lane; §3's _a wake touches exactly one
address per lane_ is untouched, because the `GET` and the `DELETE` are the same address; §5's
_absence is never an acknowledgement_ is not weakened by a word. What it costs is a re-`GET` and
a re-import of the same object on each wake until the acknowledgement lands.

**That re-read is a requirement, not an inefficiency.** A device must not record _I took index i,
I owe `ack(i)`_ and skip the read next time. The depositor keeps rewriting at _i_ until it is
acknowledged, and it merges the `brings` of whatever it last wrote there — so an acknowledgement
sent against a take from three wakes ago credits the peer with rows that arrived after it, and
those rows are never sent again. The alternative is binding the generation into the
acknowledgement as well as into the seal, which is machinery bought to avoid a read. **Nothing
persists between wakes**: the imported rows stay, because the ledger is append-only and a
re-import is a no-op, and the `peer_vector` fold stays, because collecting rows from a peer
proves the peer holds them whether or not it was ever told so.

**The index the acknowledgement names is the one just taken.** Written down because the
deposit now precedes the advance: a wake with a collection pending acknowledges its collect
lane's **current** index, and a wake with none re-asserts the index behind it. Both are _the
highest index this device has taken_, which is the sentence that stays true through the change.

### §5's orphan clause is amended: a refusal is answered by a recreate

The commit point alone leaves the other half open. An object that vanished **uncollected** —
§1's backstop firing, or a delete by the operator — is refused identically, and its peer is
still sitting at that index with nothing coming.

> **A refused rewrite is answered by an unconditional write at the same index. It still may not
> advance the lane: only a sealed acknowledgement does that.**

`DepositStanding` loses its `taken` arm: a lane holds a live object or none.

**One rider, and it is the whole correctness of the thing. A recreate may not advance `brings`.**
If the peer took rewrite #3 and the recreate is a fuller #4, acknowledging that index would merge
#4's `brings` and permanently skip the rows only #4 carried. The recreate keeps the refused
object's. Understating what a peer holds costs a re-sent row an import ignores; overstating it
costs the row — the same asymmetry the #396 trailer records for the version vector, arriving by
a second route.

**§5's orphan argument is narrowed rather than dropped.** _An orphan is a leak rather than
untidiness_ stands. What goes is the claim that none is ever created: a recreate answering a
refusal the peer's acknowledgement caused **is** an orphan. It is rare, because the collect-first
order means that acknowledgement has normally already been read; and it is bounded, because §1's
backstop reaps it. The clause becomes **the depositor never creates an orphan it can avoid, and
the ones it cannot are bounded by the backstop that caused them.**

### §1's expiry sentence is restored, and #396's correction to it is reversed

§1 says _an expiry costs one wake of latency and never data ... its next wake rewrites the full
outstanding delta at the same key_. The `**Implemented:** #396` trailer corrects that sentence,
withdrawing _one wake of latency_ on the ground that **the depositor cannot tell an object that
expired unread from one that was collected**, so any rule that recreated after the first would
recreate after the second and manufacture the permanent orphan §5 exists to remove.

**That argument was sound and is no longer.** It prices the recreate against §5's old commit
point, where a collected object's acknowledgement might never arrive and the orphan would be
permanent. Under the fifth exit a collected object's acknowledgement is already in the store, so
the orphan is transient and backstopped, and the two cases no longer need to be told apart —
**the same answer is correct for both**. §1's sentence is reinstated word for word, and the
trailer's correction is superseded by this amendment rather than left to be read as current.

### §11 gains a clause, and its counter counts completed collections

**Revocation is the one deliberate breach of the new invariant.** §11 step 2 deletes both lane
objects and acknowledges nothing, and it must keep doing so. It is safe only because of the
recreate: the peer's rewrite is refused, it puts its object back, and it never falls mute.
**The two decisions in this amendment hold each other up — remove either and the frozen pairing
returns by the other road** — and that is why they are recorded together rather than as two
independent repairs.

The cost lands on a surface sentence. _Unpairing removes anything that has not yet been picked
up_ now holds only until the peer's next wake, so it gains its qualifier: **a peer that has not
yet learned of the unpairing may leave one more sealed object, under a chain the revoker has
destroyed, which nothing can open and which the backstop reaps.** The residual window §11 names
is unchanged; what changes is that the emptiness is not permanent, and the record says so rather
than letting the surface claim more than the delete achieves.

**And K counts completed collections.** §11 makes a wake productive when an acknowledgement was
received **or** something was collected. A wake that takes rows and fails to acknowledge them now
has a name — it is a take that did not settle — and it will repeat identically on the next wake.
Counting it as productive would let a pairing getting nowhere never reach K, which is the
infinite case §11 exists to bound, wearing productive clothes. So: _no acknowledgement received
and no collection **settled**_.

### §3's amendment gains a third deposit trigger

The 2026-09-06 Amendment lists two: the delta growing, debounced by seconds, and a best-effort
flush on hide. A settled collection is now a third, and it is not a cadence but a consequence —
the deposit is part of the collection rather than a thing scheduled after it.

It costs nothing of §4, for that amendment's own reason: the index advances on the
acknowledgement, so every deposit before the peer takes one lands on the same address. Its
collection floor needs one narrowing, though — _skipped when nothing has changed locally either_
was written when a collection cost a `GET` and nothing else, and a skipped wake can now leave a
peer unacknowledged. It reads **skipped when nothing has changed locally and nothing is owed**.

### What this claims, and the condition on it

> **A pairing cannot freeze while both devices can reach the store.**

Stated with its condition rather than absolutely, because a device that cannot reach the store
converges on no wake at all and that is not this defect. And stated as a claim resting on two
coupled decisions and one named exception, in the voice §2 uses for guard 1: the commit point
fixes reachability, the recreate fixes writability, revocation breaches the first and is carried
by the second, and a later reader who deletes one of them because the other "already handles it"
reopens this hole.
