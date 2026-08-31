# What an installed iOS PWA can do while nobody is looking at it

Research for [#257](https://github.com/palebluebytes/inventoria/issues/257), on the map
[let a device that was asleep converge later](https://github.com/palebluebytes/inventoria/issues/248).

The target was concrete: **make the laptop → pocketed phone path work.** If a laptop can cause a
pocketed iPhone to converge without the user tapping anything, map decision 3 — _push is a latency
budget, not a mechanism_ — is wrong.

## The answer in three sentences

**The bytes can arrive unattended. The notification cannot be avoided. The import still needs the
app open.**

iOS **does** start an installed web app's Service Worker to handle a push with no page open, and
that worker can `fetch`. So a deposit can be pulled onto the phone while it sits in a pocket —
which is more than [#249](https://github.com/palebluebytes/inventoria/issues/249) credited. But
WebKit revokes the push subscription of any handler that does not show a user-visible
notification, as a **stated position rather than a missing feature**, and the Service Worker
cannot open the ledger. So the phone can be _filled_ unattended and can never be _converged_
unattended.

## What #249 got wrong

> "Push does not wake the app — it wakes _you_."

**Refuted.** A Service Worker is started to handle a `push` event even when no page is open
([MDN, `push` event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/push_event)),
and `fetch()` is available inside `ServiceWorkerGlobalScope`
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope)). There is a
genuine unattended execution window on iOS. What does not exist is a _silent_ one.

That correction matters to the map beyond this ticket: **map decision 3 says push "wakes B while A
is still awake", and that is also wrong once a store exists.** With
[#249](https://github.com/palebluebytes/inventoria/issues/249)'s deposit on R2, the phone's woken
Service Worker pulls from **the store**, not from A — so A may be asleep, shut, or gone. Push plus
a store is not "the same meeting, scheduled earlier"; it is a different mechanism.

## 1. Silent push: refused by policy, not absent by omission

This is the load-bearing finding and it is quoted rather than paraphrased. From WebKit's
[Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/):

> "Allowing websites to remotely wake up a device for silent background work is a privacy
> violation and expends energy."

> "if an event handler doesn't show the user visible notification for any reason we revoke its
> push subscription"

**Read the first sentence as the durable fact.** This is not an unimplemented capability that a
future iOS might ship — it is WebKit stating that the capability is undesirable. Designing on the
expectation that it relaxes is designing on a bet against a published position.

**The widely-repeated "three silent pushes and you are cut off" figure is secondary.** It appears
in developer write-ups; the primary source states revocation without naming a number. Treat the
policy as real and the number as unverified.

## 2. Declarative Web Push makes silence structurally impossible

Shipped, and further along than #249 assumed: **iOS/iPadOS 18.4** for Home Screen web apps, and
**Safari 18.5** on macOS, where it also works for any site with notification permission in an
ordinary tab ([Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)).

- It **does not require a Service Worker at all** — it exposes `window.pushManager` and the
  browser renders the notification from JSON with no JavaScript. The payload is a top-level
  `"web_push": 8030` plus a `"notification"` object carrying `"title"` and `"navigate"`, with
  optional `"body"`, `"silent"` and `"app_badge"`.
- A Service Worker, when present, **still receives a `PushEvent`** carrying the _proposed
  notification_, and may display a replacement.
- The penalty disappears — _"there is no penalty for service workers failing to display a
  notification; the declarative push message itself is used as a fallback"_ — **but only because a
  notification is shown regardless.** Declarative push removes the punishment by removing the
  possibility.

**One consequence worth carrying:** a declarative payload must be readable by the _user agent_,
so it is not end-to-end opaque the way an RFC 8291-encrypted classic push payload is. If a push is
ever used to carry a deposit's address, the classic Service-Worker path is the one that keeps that
address out of the browser's plain view — and neither path exposes it to Apple.

## 3. The Service Worker cannot open the ledger, for two independent reasons

**a. `createSyncAccessHandle()` is Dedicated-Web-Worker-only.** MDN carries this as an explicit
note on
[`createSyncAccessHandle`](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle):
_"This feature is only available in Dedicated Web Workers."_ Service Workers and Shared Workers are
excluded. SQLite WASM's OPFS VFS is built on sync access handles, so **a Service Worker cannot
reach the ledger at all** — this is a platform fact, not a configuration.

Even setting that aside, the default `readwrite` mode takes an **exclusive lock**, throwing
`NoModificationAllowedError` on a second handle, so a live tab holding the ledger would block any
other context regardless.

**b. `ADR-0075 §3` put the pairing secret somewhere a Service Worker cannot read it.** The Paired
Device record — including the 256-bit pairing secret — lives in `localStorage`. Web Storage is
synchronous, and synchronous APIs are unavailable inside `ServiceWorkerGlobalScope`
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope)).

**(b) is our own decision, not the platform's**, and it was free when it was made. It is not free
now: **any future in which a Service Worker participates in convergence requires the pairing secret
to move to IndexedDB.** ADR-0075 §3's two arguments — secrets stay out of the syncing ledger, and a
revocation cannot live in an append-only log the revoked device writes to — are both satisfied by
IndexedDB just as well as by `localStorage`, so nothing in the record's _reasoning_ pins the
storage choice. It should be recorded as a soft spot rather than discovered later.

There is a way to sidestep (b) without moving anything: **let the push payload carry the deposit's
address**, so the woken worker fetches opaque bytes and never needs the secret. RFC 8030's 4096-octet
body is ample for an address. That keeps the worker's role to _courier_, which is all it can be
anyway given (a).

## 4. Everything else is absent, and confirmed absent

| Capability                                      | Safari / iOS status                                                                                                       | Source                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Background Sync**                             | Not supported, desktop **or** iOS, through 26.6 and 27 TP                                                                 | [caniuse](https://caniuse.com/background-sync)                                                      |
| **Periodic Background Sync**                    | Not Baseline; no Safari support                                                                                           | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API) |
| **Background Fetch**                            | Not supported                                                                                                             | —                                                                                                   |
| **WebKit's position on Background Sync**        | standards-positions **issue #14 still open**, with power-impact and privacy concerns recorded — no support, no commitment | [WebKit standards-positions](https://github.com/WebKit/standards-positions/issues)                  |
| **Persistent connection from a Service Worker** | Not possible; event-driven, terminated between events                                                                     | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)                          |

**Nothing in Safari 26.0 changes any of this.** Its 75 new features include Anchor Positioning,
scroll-driven animations, WebGPU and the Digital Credentials API; push notifications and background
execution are not mentioned
([WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).

**One Safari 26.0 change does touch this map, in the map's favour.** Every site added to the Home
Screen now **opens as a web app by default, even without a manifest**. That strengthens #248's
locked premise that the app is always installed on iOS, rather than changing this answer.

## 5. The shape that does work

```
laptop deposits sealed bytes to the store        (both devices need not meet)
laptop sends a push carrying the deposit address
  ↓  iOS starts the Service Worker, no page open, unattended
Service Worker fetches the sealed deposit, stashes it in IndexedDB
Service Worker shows a notification                        ← unavoidable, every time
  ↓  user opens the app, whenever that is
page imports from IndexedDB into the ledger — instant, bytes already local
```

**What this buys over the store alone:** the transfer has already happened when you open the app, so
a first-open is instant instead of a wait. **What it costs:** a visible notification per sync, plus
the stable, non-rotatable, per-device push endpoint #249 priced against ADR-0075 §5. That is a
latency optimisation bought with a permanent identifier and a recurring interruption — which is
close to the trade the map already guessed, arrived at by a different route.

**It does not make the phone a server.** Nothing here is on-demand: the laptop cannot query the
phone, cannot pull from it, and cannot converge with it. It can only _deliver to_ it, once, noisily.

## What is not verified, and would need a device

Four things resisted primary sourcing and should not be treated as established:

1. **The Service Worker's execution budget during a push on iOS.** No primary figure found. Whether
   a multi-megabyte `fetch` completes inside it is unknown and is the single fact this shape hangs on.
2. **IndexedDB inside an iOS Service Worker.** Asynchronous and therefore not excluded by the rule
   that kills `localStorage`, but MDN does not state it explicitly and Apple does not document it.
3. **What tapping the notification gives** — standalone launch, cold start versus resume, and whether
   anything survives from the push event.
4. **Push subscription lifetime on iOS** and what invalidates it.

All four are measurable on one iPhone in an afternoon and none is answerable by reading. If the map
wants this shape, that measurement is the next step — a prototype, not more research.
