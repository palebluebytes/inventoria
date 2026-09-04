# What convergence costs to operate, and what binds first

Research for [#372](https://github.com/palebluebytes/inventoria/issues/372), on the map
[let a device that was asleep converge later](https://github.com/palebluebytes/inventoria/issues/248).

[ADR-0072](https://github.com/palebluebytes/inventoria/blob/main/docs/adr/0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md)'s
Consequences price the **send** half off Cloudflare's published figures — _"the free plan binds on
duration first, at roughly 10,000 sends a day"_ — and close with the clause that makes the number
matter: _"if either limit is approached the design is reopened rather than silently upgraded to a
paid plan."_ The **convergence** half has no such number, and three decisions have since changed the
arithmetic underneath it:
[#371](https://github.com/palebluebytes/inventoria/issues/371) removed the relay's byte ceiling and
frame count, [#364](https://github.com/palebluebytes/inventoria/issues/364) moved steady state onto
R2, and [#260](https://github.com/palebluebytes/inventoria/issues/260) made the fan-out superlinear.
This note supplies the equivalent arithmetic, in ADR-0072's voice, so that
[#252](https://github.com/palebluebytes/inventoria/issues/252)'s bar and ADR-0072 §14's withdrawal
clause rest on a figure.

All Cloudflare figures were read on **2026-09-04** from the URL named, and every source is
Cloudflare's own `developers.cloudflare.com`. No third-party write-up is used for any claim. Each
page carries its own "Last updated" date and that date is given, because Cloudflare pricing moves.

**Three kinds of statement, marked throughout and never mixed:**

- **[published]** — a figure Cloudflare states, quoted or tabulated from the page cited.
- **[computed]** — arithmetic done here on published figures. The method is always given so it can
  be re-run.
- **[assumed]** — a claim about how _this app_ behaves. Every one is isolated in §2 with a value, a
  reason and a note on which way changing it moves the answer. A reader who disputes an assumption
  can change it and redo the sum without touching §1.

**This note decides nothing.** Where the answer depends on a decision not yet taken — chiefly #252's
retention ceiling and backstop expiry — the number is given both ways and the owning ticket is
named.

---

## The answer in six sentences

**The free tier bears convergence for any plausible user base, and the thing that gives way first is
not what ADR-0072's send arithmetic would predict.** A first sync through the relay is **not** a
large multiple of a send in billable terms: at a 1 MiB chunk it is **2.75 billable Durable Object
requests against a send's 2** [computed], because Cloudflare discounts incoming WebSocket messages
20:1 and charges nothing for outgoing ones, so #371's unbounded frame count costs almost nothing —
**the byte ceiling was never what the bill was made of.** Steady state on R2 is the recurring cost
and it is small per user but multiplied by `N(N−1)` wakes: at two devices and one wake each per day
it is **1 Class A and 1 Class B operation per user per day** [computed], and **R2 Class A operations
bind first, at roughly 33,000 users** at N = 2 and **11,000 users** at N = 3 [computed]. Workers'
free daily request budget is the next constraint at about 50,000 users, and it is the only one that
**fails** rather than **bills** — R2 has no free _plan_, only a free _allowance_ on a metered
subscription, so R2 overage is silent where a Workers overage returns Error 1027. **Stored bytes are
the sleeper**: healthy lanes are trivial, but an abandoned lane accumulates until #256's K = 200 stop
at about **4.9 MB** [computed], and once roughly **4% of users** have a permanently abandoned device
the 10 GB-month allowance overtakes Class A as the binding limit — which makes #252's backstop expiry
a cost control and not only a privacy one. And the first paid dollar is small: at 100,000 users the
whole R2 bill is **$9.00 a month** [computed], so the honest form of ADR-0072 §14's clause here is
not "it becomes unaffordable" but "it stops being free, quietly, on a metered subscription".

---

## What this refutes, confirms and hands on, by name

**Refuted: that #371's removal of the byte ceiling and frame count is expensive.** The intuition is
that many frames means many billable messages. Cloudflare applies a **20:1 ratio to incoming
WebSocket messages** and charges **nothing for outgoing ones** [published, §1.1], so a 136-chunk
first sync costs 9.10 billable requests and a 9-chunk one costs 2.75 [computed, §3]. The frame count
is the cheapest axis in the design. §3.

**Refuted, as a matter of arithmetic: ADR-0072's own "the free plan binds on duration first."** That
verdict rests entirely on its stated assumption of _"ten active seconds per send under hibernation"_.
Cloudflare's page says a hibernating object incurs duration charges only _"when it is actively
executing JavaScript"_ [published, §1.1], and a relay's per-message work is a `send()` — Cloudflare's
own worked example uses **10 ms per message**. At 10 ms per message the send half binds on
**requests**, not duration, at about 50,000 sends a day. §3.4 states this as a correction ADR-0072's
Consequences should carry.

**Confirmed: ADR-0072's assumed billing shape still holds, verbatim.** A WebSocket connection costs
one request; incoming messages are discounted 20:1; outgoing are free; duration bills at 128 MB;
Workers Free is 100,000 requests/day and Durable Objects Free is 100,000 requests/day and 13,000
GB-s/day. All four sentences survive re-reading on 2026-09-04. §1.1.

**New, and ADR-0072 could not have had it: Durable Objects now meter SQLite storage, and the free
plan allows 100,000 rows written per day.** Billing was enabled in January 2026 [published, §1.2].
`storage.get`/`put` and every `setAlarm` are billed as rows [published]. `worker/src/relay.ts:256`
and `:271` do a `get` and a `put` **per frame** to enforce ADR-0072 §11.2's frame count. #371 deletes
the rule that counter enforces; if the counter outlives the rule it converts an unbounded frame count
into a metered write on a 100,000/day budget. §3.5.

**Confirmed and sharpened: #283 §1.6's ~48-hour lifecycle floor.** `wrangler r2 bucket lifecycle add`
takes `--expire-days`, "Number of days after which objects expire", with no hours option, and
Cloudflare states objects are _"typically removed from a bucket within 24 hours of the
`x-amz-expiration` value"_ [published, §6]. One day plus a day of slack. #256's backstop expiry is
therefore buildable at any horizon this map would want, and the floor does not bind.

**Handed to [#252](https://github.com/palebluebytes/inventoria/issues/252):** the backstop expiry is a
**cost control as well as a privacy one**, and §5.3 gives the crossover — 4.2% of users with an
abandoned device at N = 2 under #256's K = 200 cap, 2.3% with no cap at all.

**Handed to the destination ADR:** R2 is not on the Workers Free plan. It is a separate subscription
with a checkout flow [published, §1.3], whose free tier is an allowance against a bill rather than a
hard stop. ADR-0072 §14's _"reopened rather than silently upgraded to a paid plan"_ was written
against Durable Objects, where exceeding the free tier **fails with an error**. On R2 it does not
fail; it bills. §5.4.

---

## 1. The rate card, read on 2026-09-04

Everything in this section is **[published]**. Nothing here is inferred.

### 1.1 Durable Objects compute — the relay's bill

Source: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
page dated "Last updated Aug 25, 2026".

|          | Workers Free plan | Workers Paid plan                           |
| -------- | ----------------- | ------------------------------------------- |
| Requests | 100,000 / day     | 1 million / month, + $0.15/million          |
| Duration | 13,000 GB-s / day | 400,000 GB-s / month, + $12.50/million GB-s |

Requests _"Includes HTTP requests, RPC sessions, WebSocket messages, and alarm invocations"_.

The four sentences ADR-0072's arithmetic rests on, verbatim from footnote 2 and footnote 5:

> A request is needed to create a WebSocket connection. There is no charge for outgoing WebSocket
> messages, nor for incoming WebSocket protocol pings. For compute requests billing-only, a 20:1
> ratio is applied to incoming WebSocket messages to factor in smaller messages for real-time
> communication. For example, 100 WebSocket incoming messages would be charged as 5 requests for
> billing purposes.

> Duration billing charges for the 128 MB of memory your Durable Object is allocated, regardless of
> actual usage.

And the one that decides §3.4, from the same page's FAQ:

> A Durable Object incurs duration charges when it is actively executing JavaScript — either handling
> a request or running event handlers — or when it is idle but does not meet the conditions for
> hibernation. An idle Durable Object that qualifies for hibernation does not incur duration charges.

The contrast that makes hibernation load-bearing, from footnote 4: _"Calling `accept()` on a
WebSocket in an Object will incur duration charges for the entire time the WebSocket is connected."_
`worker/src/relay.ts:211` calls `this.state.acceptWebSocket(server)`, which is the Hibernation API,
so the relay is on the cheap side of that sentence.

**Free-plan failure mode, verbatim:** _"If you exceed any one of the free tier limits, further
operations of that type will fail with an error"_ and _"Daily free limits reset at 00:00 UTC."_

Cloudflare's own worked example for a hibernating WebSocket workload uses **10 ms of JavaScript
execution per message** (Example 4: _"it takes 10ms to process a single message in the
`webSocketMessage()` handler"_). That is the figure §3.3 borrows.

### 1.2 Durable Objects storage — a dimension ADR-0072 did not have

Same page. Cloudflare's notice: _"Storage billing for SQLite-backed Durable Objects will be enabled
in January 2026, with a target date of January 7, 2026 (no earlier)."_ ADR-0072 was written before
that took effect.

| SQLite storage backend | Workers Free plan | Workers Paid plan                           |
| ---------------------- | ----------------- | ------------------------------------------- |
| Rows read              | 5 million / day   | First 25 billion / month + $0.001 / million |
| Rows written           | 100,000 / day     | First 50 million / month + $1.00 / million  |
| SQL stored data        | 5 GB (total)      | 5 GB-month, + $0.20 / GB-month              |

Footnotes 2, 3 and 4, verbatim: _"Key-value methods like `get()`, `put()`, `delete()`, or `list()`
store and query data in a hidden SQLite table and are billed as rows read and rows written."_ / _"Each
`setAlarm()` is billed as a single row written."_ / _"Deletes are counted as rows written."_

On the free plan only SQLite-backed Durable Objects exist at all: _"Workers Free plan: Only Durable
Objects with SQLite storage backend are available."_ `wrangler.toml` already declares
`new_sqlite_classes = ["Relay"]`, so this is the relay's storage class.

`WebSocket.serializeAttachment` is documented separately from the Storage API — _"Maximum serialized
size is 16,384 bytes"_, and _"For larger values or data that must persist beyond WebSocket lifetime,
use the Storage API"_
([WebSockets API](https://developers.cloudflare.com/durable-objects/api/websockets/)) — and is **not
named among the metered storage operations**. Cloudflare does not say either way whether an
attachment is billed. §7 records that as a gap.

### 1.3 R2 — and R2 is a subscription, not a plan tier

Source: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), page dated "Last updated Aug 7,
2026".

|                                    | Standard storage         |
| ---------------------------------- | ------------------------ |
| Storage                            | $0.015 / GB-month        |
| Class A Operations                 | $4.50 / million requests |
| Class B Operations                 | $0.36 / million requests |
| Egress (data transfer to Internet) | Free                     |

Free tier, monthly:

|                    | Free                        |
| ------------------ | --------------------------- |
| Storage            | 10 GB-month / month         |
| Class A Operations | 1 million requests / month  |
| Class B Operations | 10 million requests / month |
| Egress             | Free                        |

**Egress is genuinely free**, and the footnote says what "free" covers: _"Egressing directly from R2,
including via the Workers API, S3 API, and r2.dev domains does not incur data transfer (egress)
charges and is free. If you connect other metered services to an R2 bucket, you may be charged by
those services."_ Since the design reaches R2 through a Worker binding, this is the Workers API case
and the exception does not apply.

**Rounding is upward and per billing unit**, verbatim: _"If you have performed one million and one
operations, you will be billed for two million operations"_ and _"If you have used 1.1 GB-month, you
will be billed for 2 GB-month."_ Under the free tier this is invisible; past it, the first billable
Class A operation costs $4.50.

**Storage is metered on daily peak**, verbatim: _"A GB-month is calculated by averaging the peak
storage per day over a billing period (30 days)."_ For a store that retains until collected, the peak
is the number that matters, not the average.

**And R2 is not part of the Workers Free plan.** From
[Get started](https://developers.cloudflare.com/r2/get-started/): _"You need a Cloudflare account with
an R2 subscription… Complete the checkout flow to add an R2 subscription to your account. R2 is free
to get started with included free monthly usage. You are billed for your usage on a monthly basis."_
There is **no sentence anywhere on the R2 pricing page equivalent to the Durable Objects one about
operations failing with an error.** The R2 free tier is an allowance deducted from a bill. §5.4 spends
this.

**One documented carve-out, and only one:** _"Will I be charged for unauthorized requests to my R2
bucket? No. You are not charged for operations when the caller does not have permission to make the
request (HTTP 401 Unauthorized response status code)."_ It is stated for 401 and for nothing else.

### 1.4 Which verb is which class

Verbatim from the same page, in full, because the destination ADR needs to be able to check a verb
against it:

- **Class A** ($4.50/M): `ListBuckets`, `PutBucket`, `ListObjects`, **`PutObject`**, `CopyObject`,
  `CompleteMultipartUpload`, `CreateMultipartUpload`, `LifecycleStorageTierTransition`,
  `ListMultipartUploads`, `UploadPart`, `UploadPartCopy`, `ListParts`, `PutBucketEncryption`,
  `PutBucketCors`, `PutBucketLifecycleConfiguration`.
- **Class B** ($0.36/M): `HeadBucket`, **`HeadObject`**, **`GetObject`**, `UsageSummary`,
  `GetBucketEncryption`, `GetBucketLocation`, `GetBucketCors`, `GetBucketLifecycleConfiguration`.
- **Free**: **`DeleteObject`**, `DeleteBucket`, `AbortMultipartUpload`.

So for this design's four verbs: **a deposit (`PutObject`) is Class A, a collect (`GetObject`) is
Class B, a deletion on collection (`DeleteObject`) is free, and `ListObjects` — which this design
never calls, because a collector derives its address rather than listing — would be Class A.** The
free `DeleteObject` is a genuinely favourable fact: #285 §4's collect-then-delete costs one Class B
and nothing else.

**The refused conditional `PUT`: what can and cannot be established.** #285 §4 has the depositor
rewrite with `onlyIf: { etagMatches }`, and Cloudflare documents the outcome of a failure but not its
price. What is published: _"In the event that a precondition specified in `options` fails, `put()`
returns `null`, and the object will not be stored"_
([Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)).
What is **not** published anywhere: whether that refused call is billed as a Class A `PutObject`.

Three things bound the guess, and none of them settles it:

1. The Class A list names `PutObject` with **no exception for a failed precondition**.
2. The only documented not-charged case is **401**, and Cloudflare states it as a FAQ answer — i.e.
   as a carve-out worth naming, which is weak evidence that other non-2xx outcomes are not carved
   out.
3. Cloudflare notes a latency benefit for a failed conditional `get()` (_"This will make `get()` have
   lower latency"_) and says nothing about a billing benefit for either verb.

**So: assume a refused conditional `PUT` is billed as Class A, and treat that as the conservative
reading rather than a finding.** §4 shows that it does not change the verdict — a refused rewrite
replaces a successful one at the same address rather than adding an operation, so the Class A count
per wake is unchanged either way. The question would only matter to a design that retried.

### 1.5 Workers — the route in front of R2

Source: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), "Last updated
Aug 28, 2026", and
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

|          | Requests                           | Duration               | CPU time                                  |
| -------- | ---------------------------------- | ---------------------- | ----------------------------------------- |
| Free     | 100,000 per day                    | No charge for duration | 10 ms of CPU time / invocation            |
| Standard | 10 million / month, +$0.30/million | No charge or limit     | 30 million CPU ms / month, +$0.02/million |

Failure mode, verbatim: _"Accounts on the Workers Free plan have a daily request limit of 100,000
requests, resetting at midnight UTC. When a Worker exceeds this limit, Cloudflare returns **Error
1027**."_

**Static assets do not consume this budget**, which matters because the same Worker serves the app:
_"Requests to static assets are free and unlimited. Requests to the Worker script (for example, in the
case of SSR content) are billed according to Workers pricing"_
([Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
"Last updated Apr 23, 2026"). `wrangler.toml` sets no `run_worker_first`, so only `/api/proxy` and
whatever matches no asset — which is where an R2 route would sit — invoke the script.

Free-plan subrequest ceiling: **50 per invocation**, with _"Subrequests to internal services: 1,000"_;
a binding call to R2 is a subrequest. One R2 call per invocation is nowhere near either.

### 1.6 The limits a superlinear fan-out could hit

[R2 limits](https://developers.cloudflare.com/r2/platform/limits/), "Last updated Jun 8, 2026":

| Feature                                               | Limit             |
| ----------------------------------------------------- | ----------------- |
| Data storage per bucket                               | Unlimited         |
| **Number of objects per bucket**                      | **Unlimited**     |
| Maximum number of buckets per account                 | 1,000,000         |
| Object key length                                     | 1,024 bytes       |
| Object metadata size                                  | 8,192 bytes       |
| Object size                                           | 5 TiB             |
| Maximum upload size                                   | 5 GiB single-part |
| **Maximum concurrent writes to the same object name** | **1 per second**  |

[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/), "Last
updated Jun 1, 2026", for the relay: **WebSocket message size 32 MiB (received only)** — which
confirms ADR-0072 §11.2's cited ceiling — **storage per account 5 GB on Free**, **storage per Durable
Object 10 GB**, **maximum Durable Object classes 100 on Free**, and **number of objects unlimited**.

**Nothing here binds.** Objects per bucket is unlimited, so #260's `N(N−1)` live objects have no
ceiling to hit; a 1,024-byte key length is far above a derived address; and the one-write-per-second
rule is per key, while this design's keys are distinct per lane per index. §5.5 says why the
one-per-second rule is nonetheless worth writing down.

---

## 2. What is assumed about the app, isolated so it can be changed

Everything in this section is **[assumed]**. §3 onward uses nothing about the app that is not listed
here. Each entry gives the value, where it comes from, and which way the answer moves if it is
wrong.

### 2.1 A ledger's size, from this repo's own formula

[#196](https://github.com/palebluebytes/inventoria/issues/196) §6 refused to publish a whole-ledger
total and published a formula instead, on the ground that its corpus was of its own choosing:

```
raw bytes ≈ 2,501·n_fdc + 144,750·n_gtin + 1,376·n_events + 1,165·n_recipes
          + 411,070·n_custom_with_photo
```

Three ledgers are priced here. The counts are **[assumed]**; the coefficients are #196's
measurements.

| Case                                             | `n_fdc` | `n_gtin` | `n_events` | `n_recipes` | photos | Raw      | Sealed wire |
| ------------------------------------------------ | ------: | -------: | ---------: | ----------: | -----: | -------- | ----------- |
| **Light** — six months, mostly USDA, no photos   |     100 |       10 |        550 |          10 |      0 | 2.47 MB  | 0.41 MB     |
| **Typical** — one year, a barcode every few days |     200 |      100 |      1,095 |          30 |     20 | 24.74 MB | 8.89 MB     |
| **Heavy** — three years of the same              |     500 |      300 |      3,285 |          90 |     60 | 73.96 MB | 26.62 MB    |

The **sealed wire** column is **[computed]** from #196 §4's two compression ratios — _"Text datoms
compress ~6:1; base64 JPEG compresses ~1.34:1"_ — applied separately to the text terms and the
photo term, since #196 is explicit that _"any argument that assumes compression rescues a photo
payload is wrong"_. AEAD expansion is a fixed tag per chunk and is ignored: at 16 bytes against a
chunk measured in hundreds of kilobytes it does not reach the second significant figure.

**Typical is the case every figure below uses unless it says otherwise, and it is 8.89 MB on the
wire.** This is what ADR-0075 §7's _"tens of megabytes"_ resolves to, and it confirms the two shares
that ADR-0075 §7 cites: `twin/raw_provenance` is 14.5 MB of the 24.74 MB raw — 58.5% here against
#196's measured 39.8%, because this ledger has proportionally more `gtin:` twins than #196's corpus —
and the twenty photos are 8.2 MB, 33.2%.

**Which way it moves the answer.** `n_gtin` dominates, because a `gtin:` twin carries the whole Open
Food Facts response verbatim at 144,750 bytes. #196 §7 filed that as an ordinary defect. If it is
ever fixed, every first-sync figure below falls by roughly half and every steady-state stored-byte
figure with it.

### 2.2 The chunk size — stated, because the frame count falls straight out of it

**Nothing in the record fixes a chunk size.** ADR-0075 §7 requires _"one seal per chunk, with the
chunk's sequence number bound into the AEAD's additional data"_ and gives no number; #371 removed
ADR-0072 §11.3's 1 MiB wire ceiling without replacing it; the only published ceiling is Cloudflare's
**32 MiB received WebSocket message** [published, §1.6].

**The assumption used below is 1 MiB, and every table gives 64 KiB, 256 KiB and 4 MiB beside it** so
that a reader can see how little turns on it. The message count is
`ceil(sealed wire bytes / chunk size)` [computed], and 1 MiB is chosen only because it is ADR-0072
§11.3's retired number and therefore the one a reader will have in mind.

| Sealed wire          | 64 KiB chunks | 256 KiB chunks | 1 MiB chunks | 4 MiB chunks |
| -------------------- | ------------: | -------------: | -----------: | -----------: |
| Light, 0.41 MB       |             7 |              2 |            1 |            1 |
| **Typical, 8.89 MB** |       **136** |         **34** |        **9** |        **3** |
| Heavy, 26.62 MB      |           407 |            102 |           26 |            7 |

### 2.3 Six control frames per pairing session

#371's resolution gives the pairing flow end to end: _"room opens → the relay's readiness signal → A
sends the sealed pairing secret → both derive both `state₀`s → vectors exchange → chunks both ways →
closing vector exchange"_. Counting only what a party **sends into** the relay — which is what
Cloudflare's 20:1 incoming ratio meters — that is the sealed pairing secret, two opening vectors and
two closing vectors, plus one slack frame: **six** [assumed]. The readiness signal is outgoing from
the relay and free.

**Which way it moves the answer.** Six against a 9-chunk sync is 40% of the message count and 0.3 of
a billable request. Doubling it changes no verdict.

### 2.4 One wake per device per day

#256's resolution sizes K = 200 against _"a daily phone and a laptop opened weekly or monthly"_ and
computes that _"the phone burns roughly 30 unproductive wakes per healthy month"_, i.e. **one wake per
device per day**. #285 §3 fixes what a wake is: _"One app-open is one wake, however long it stays
open."_ That is the arc's own model and it is used here **[assumed]**.

**Three per day is given beside it throughout**, as the three-meals-a-day reading someone will
reasonably prefer. Every R2 figure scales linearly in this number, so a reader who wants ten wakes a
day divides the user crossovers by ten.

### 2.5 Half the wakes deposit, half collect

#285 §3's invariant is **one key per wake**, and #285 §5 makes a deposit carry _"an acknowledgement
and a delta, and either may be empty"_. A device with both to do must alternate; a device with
nothing to deposit collects every wake. **The split assumed is 50/50** [assumed], which is the
alternating case.

**This assumption is the one that decides which limit binds, and §5.2 gives it both ways.** A
deposit is Class A ($4.50/M, 1M free); a collect is Class B ($0.36/M, 10M free). A read-mostly tablet
shifts the mix toward Class B and moves the binding limit off R2 entirely.

### 2.6 A first sync never crosses R2, and a first sync is never resumed through it

#364's guard 1, made absolute: _"the store never holds an object whose base did not cross live"_ —
an interrupted first sync _"resumes live, both awake, or not at all"_. So R2 never holds a whole
ledger **as a first sync** [published in the arc's own record, not assumed]. What R2 can come to hold
is an _outstanding delta_ that has grown without collection, and §4.3 prices that separately, because
at the limit the two converge in size.

---

## 3. A first sync through the relay, priced

### 3.1 Billable Durable Object requests

Method [computed]: two WebSocket connections at one request each [published, §1.1], plus incoming
messages — `n` chunks and §2.3's six control frames — at the published 20:1 ratio. Outgoing messages
are free, so the relay forwarding each chunk to the peer costs nothing.

```
billable requests per pairing = 2 + (n + 6) / 20
```

| Chunk size | `n` (typical ledger) | Billable requests | Pairings/day within DO Free's 100,000 |
| ---------- | -------------------: | ----------------: | ------------------------------------: |
| 64 KiB     |                  136 |          **9.10** |                                10,989 |
| 256 KiB    |                   34 |          **4.00** |                                25,000 |
| **1 MiB**  |                **9** |          **2.75** |                            **36,364** |
| 4 MiB      |                    3 |          **2.45** |                                40,816 |

**The multiple #372 asked for is between 1.2× and 4.6× a send, not a large one.** ADR-0072's send is
_"about 2 billable requests"_; a whole first sync at a 1 MiB chunk is 2.75. The 20:1 discount and the
free outgoing direction between them absorb almost the entire difference between one frame and 142.

**So #371's removal of the frame count is close to free**, and the reason is worth stating plainly
because it is counter-intuitive: **the relay's bill is dominated by the fixed cost of opening the
room, not by what crosses it.** A design that made the first sync ten times larger would still cost
under four billable requests at a 1 MiB chunk.

### 3.2 Bytes moved, and what they cost

**Nothing.** Cloudflare charges no egress on Workers or Durable Objects, and the request tables have
no byte dimension at all [published, §1.1]. The 8.89 MB crossing the relay is billed only through the
message count in §3.1. This is the single largest difference between the relay half and the R2 half,
where stored bytes are metered directly.

### 3.3 Duration

Method [computed]: duration is billed only while the object _"is actively executing JavaScript"_
[published, §1.1], at 128 MB = 0.125 GB. Cloudflare's own hibernating-WebSocket example uses **10 ms
of JavaScript per message**, and the relay's per-message work — a bounds check and a `send()` — is
strictly less than that example's, so 10 ms is a ceiling rather than an estimate.

```
GB-s per pairing = (n + 6) × 0.010 s × 0.125 GB
```

| Chunk size | Messages | GB-s per pairing | Pairings/day within 13,000 GB-s |
| ---------- | -------: | ---------------: | ------------------------------: |
| 64 KiB     |      142 |           0.1775 |                          73,239 |
| 256 KiB    |       40 |           0.0500 |                         260,000 |
| **1 MiB**  |       15 |       **0.0188** |                     **693,333** |
| 4 MiB      |        9 |           0.0113 |                       1,155,556 |

**Duration does not bind, by one to two orders of magnitude.** At a 1 MiB chunk the relay could carry
693,000 first syncs a day on duration and only 36,000 on requests.

**The one thing that would invert this, named so it can be checked.** If the relay ever stops being
hibernation-eligible between chunks — a pending promise, a non-hibernatable `accept()`, an outbound
connection — Cloudflare's footnote 4 applies and duration is billed for the whole time the socket is
connected. At ADR-0072 §11.4's five-minute room lifetime that is **37.5 GB-s per pairing**
[computed], which is **347 pairings a day** and would make duration the binding limit by a wide
margin. The gap between 693,333 and 347 is entirely the hibernation property, which makes
`state.acceptWebSocket` — `worker/src/relay.ts:211` — the single most expensive line in the design to
get wrong.

### 3.4 A correction ADR-0072's Consequences should carry

ADR-0072 states: _"Duration bills at 128 MB, so 13,000 GB-s/day is about 101,500 object-seconds/day;
at ten active seconds per send under hibernation that is roughly 10,000 sends a day."_ The 101,500
object-seconds is right [confirmed: 13,000 / 0.125 = 104,000; ADR-0072's 101,500 is within rounding].
The **ten active seconds** is not a published figure and does not follow from one.

Under hibernation, active means executing JavaScript [published, §1.1]. A send is two connections and
two frames; at Cloudflare's own 10 ms per message that is **0.04 active seconds**, not ten — a factor
of 250. Redone [computed]: 0.04 s × 0.125 GB = 0.005 GB-s per send, or **2.6 million sends a day** on
duration, against **50,000 sends a day** on the 2-requests-per-send figure ADR-0072 computes in the
same paragraph and then sets aside.

**So the send half binds on requests at roughly 50,000 sends a day, not on duration at 10,000.** The
headline number is five times better and the named limit is the other one. This does not change any
decision ADR-0072 took — both figures are far beyond a personal food tracker — but the destination
ADR inherits this arithmetic, and inheriting it wrong would put the withdrawal clause on the wrong
dimension.

### 3.5 The dimension nobody has counted: Durable Object rows written

ADR-0072 predates SQLite storage billing [published, §1.2], so its Consequences count two dimensions
where there are now three. **Free plan: 100,000 rows written per day.**

`worker/src/relay.ts` writes storage in three places: `setAlarm` at `:214` (one row), a
`storage.get` + `storage.put` of `FRAMES_KEY` **per forwarded frame** at `:256` and `:271`, and
`deleteAlarm` + `deleteAll` at `:320`–`:321` (deletes count as rows written).

| Shape                                     | Rows written per pairing | Pairings/day within 100,000 |
| ----------------------------------------- | -----------------------: | --------------------------: |
| Per-frame counter retained, 1 MiB chunks  |                       18 |                   **5,556** |
| Per-frame counter retained, 64 KiB chunks |                      145 |                     **690** |
| Counter deleted with the rule it enforced |                    **3** |                  **33,333** |

**This is the first place in the whole arithmetic where the answer is uncomfortable, and it is
avoidable.** #371 deleted ADR-0072 §11.2's one-frame-each-way rule. The counter at `:256`/`:271`
exists only to enforce it. If the counter is deleted with the rule, the relay writes three rows per
room and rows-written sits beside requests at roughly the same ceiling. If the counter survives the
rule — as a metric, a debug aid, or by nobody noticing — it turns an unbounded frame count into a
metered write, and at a small chunk size it becomes **the binding limit by a factor of fifty**.

**The destination ADR should state this as a rule rather than a number**, in ADR-0072 §12's voice:
_the relay may hold state for the duration of a room, and it may not write per frame._ ADR-0072 §12
already refused aggregate counters on privacy grounds; this is the same refusal arriving from the
billing side, which is worth recording because it means the two arguments do not have to be traded
against each other.

---

## 4. Steady state on R2, priced

### 4.1 The operations, per wake

From #285 §3 and §7: **a wake touches exactly one key per pairing**, and a wake serves all of a
device's pairings. From #260 §8's table: **deposits — and R2 operations — per wake, per device is
`N−1`**, and live objects are `N(N−1)`.

What each of the two wake shapes costs, against §1.4's class list:

| Wake shape                                     | R2 calls                                                        |           Class A | Class B | Free |
| ---------------------------------------------- | --------------------------------------------------------------- | ----------------: | ------: | ---: |
| **Collect**, mail present                      | `GetObject`, then `DeleteObject` after the final chunk verifies |                 0 |       1 |    1 |
| **Collect**, lane empty                        | `GetObject` returning null                                      |                 0 |       1 |    0 |
| **Deposit**, first write at an index           | `PutObject`                                                     |                 1 |       0 |    0 |
| **Deposit**, conditional rewrite that succeeds | `PutObject` with `onlyIf`                                       |                 1 |       0 |    0 |
| **Deposit**, conditional rewrite refused       | `PutObject` with `onlyIf`, returns `null`                       | 1 (assumed, §1.4) |       0 |    0 |

**Three things this table settles.**

- **A collection is cheap and its cleanup is free.** `DeleteObject` is on Cloudflare's published free
  list [published, §1.4], so #285 §4's collect-then-delete and #256 §3's two revocation deletes cost
  nothing at all. The design's disposal discipline is free to operate, which is a fact worth having
  in the record next to #252's bar.
- **A miss costs the same as a hit.** A wake that finds an empty lane still pays one Class B. #364
  asked _"whether a wake that finds nothing costs anything"_; against the rate card it does, and it
  costs $0.36 per million.
- **A refused rewrite adds no operation.** It replaces a `PutObject` that would otherwise have
  succeeded at the same address in the same wake, so the Class A count per wake is 1 either way and
  §1.4's unresolved question does not propagate into any figure below.

**One `ListObjects` would change the picture and the design does not make one.** `ListObjects` is
Class A [published, §1.4], and a collector that listed to find its mail would pay a Class A on every
wake instead of a Class B — a 12.5× rate difference against a 10× smaller free allowance. #281's
derived address is therefore a **125× cheaper collect** than the obvious alternative [computed]. That
is a cost argument for a construction that was chosen entirely on privacy grounds, and the
destination ADR may as well have it.

### 4.2 Per device per day, and per user per day

Method [computed]: keys touched per user per day is `N × (N−1) × w` where `w` is wakes per device per
day (§2.4); Class A is that times the deposit share (§2.5, 0.5), Class B the rest; and every R2 call
is also one Worker invocation, because the browser reaches R2 through the site's Worker.

|     N | wakes/device/day | Keys/user/day | Class A/user/day | Class B/user/day | Worker requests/user/day |
| ----: | ---------------: | ------------: | ---------------: | ---------------: | -----------------------: |
| **2** |            **1** |         **2** |            **1** |            **1** |                    **2** |
|     2 |                3 |             6 |                3 |                3 |                        6 |
| **3** |            **1** |         **6** |            **3** |            **3** |                    **6** |
|     3 |                3 |            18 |                9 |                9 |                       18 |
|     4 |                1 |            12 |                6 |                6 |                       12 |

**At two devices and one wake each, convergence costs a user two R2 operations a day.** That is the
whole recurring bill in operations. #260's superlinearity shows as the `N(N−1)` column: going from two
devices to three **triples** it, and to four **sextuples** it.

### 4.3 Stored bytes

Two regimes, and they differ by two orders of magnitude.

**Healthy.** A lane holds the depositor's outstanding delta, superseded in place, collected within
about two wakes. From §2.1's typical ledger, a device generates 24.74 MB raw / 8.89 MB sealed per
year, which is **24.4 KB of sealed wire per device-day** [computed]. Two wakes' worth per lane:

|   N | Lanes = `N(N−1)` | Live bytes/user | Users within 10 GB-month |
| --: | ---------------: | --------------: | -----------------------: |
|   2 |                2 |           98 KB |                  102,459 |
|   3 |                6 |          293 KB |                   34,153 |

**Abandoned.** A device that is never opened again leaves its peer depositing into a lane nobody
collects. #256's resolution bounds it on both axes — _"in size, because after K the depositor stops
rewriting, so an abandoned object stops growing"_ — at **K = 200 wakes**, which at one wake a day is
200 days:

```
abandoned lane ≈ 200 × 24.4 KB = 4.88 MB       [computed]
```

Behind one abandoned device there are `N−1` such lanes (#260 §8: _"the abandoned-device case is per
lane, not per household"_), so an abandoned device costs **4.88 MB at N = 2 and 9.76 MB at N = 3**
[computed].

**And without K, or before it bites, the ceiling is the whole outstanding ledger — 8.89 MB
[computed]**, since a lane that is never collected accumulates everything the depositor has. The two
figures are within a factor of two of each other, which is the real finding: **#256's K = 200 caps the
abandoned lane at roughly half a whole ledger, so it is a bound rather than a fix.** #252's backstop
expiry is what turns it into a small number, and §5.3 prices the difference.

**The `(N−1)²` multiplier is on rows, not on this figure, and the distinction matters.** #260 §8's
worst case is _"(N−1)² simultaneous copies of one row across live objects"_ — 4 at N = 3, 9 at N = 4.
That is the multiplier on a **single row's** duplication, and it is already inside the per-lane
figures above, because each of the `N(N−1)` lanes carries its own full outstanding delta. The
stored-byte total scales as `N(N−1)` lanes each holding up to one ledger's outstanding remainder; the
`(N−1)²` number is what a #252 bar sentence needs when it talks about a **datom**, not about bytes.

---

## 5. Which limit binds first, and at how many users

### 5.1 The six dimensions, side by side

At **N = 2, one wake per device per day, an even deposit/collect split** (§2.4, §2.5), per user per
day: 1 Class A, 1 Class B, 2 Worker invocations, 98 KB live. First syncs are once per device pair
ever and are counted separately.

| Dimension                     | Free allowance     | Usage/user/day | Users at the ceiling | Source of ceiling |
| ----------------------------- | ------------------ | -------------: | -------------------: | ----------------- |
| **R2 Class A**                | 1,000,000 / month  |              1 |           **33,333** | §1.3              |
| **Workers requests**          | 100,000 / day      |              2 |           **50,000** | §1.5              |
| R2 stored bytes, healthy only | 10 GB-month        |          98 KB |              102,459 | §1.3, §4.3        |
| R2 Class B                    | 10,000,000 / month |              1 |              333,333 | §1.3              |
| DO requests (pairings only)   | 100,000 / day      |   2.75/pairing |  36,364 pairings/day | §3.1              |
| DO duration (pairings only)   | 13,000 GB-s / day  |  0.019/pairing | 693,333 pairings/day | §3.3              |

At **N = 3, one wake per device per day**, every R2 and Workers figure divides by three: **Class A at
11,111 users**, Workers at 16,667, healthy stored bytes at 34,153. At three wakes a day instead of
one, divide again by three.

### 5.2 R2 Class A binds first — and the hinge is the deposit share, not the user count

The general form [computed], with `U` users, `W = N(N−1)w` keys touched per user per day and `d` the
fraction of wakes that deposit:

```
Class A ceiling:        U = 1,000,000 / (30 · d · W)
Class B ceiling:        U = 10,000,000 / (30 · (1−d) · W)
Workers requests:       U = 100,000 / W
```

Two crossovers fall straight out and neither depends on `N`, `w` or the user count:

- **R2 Class A binds before Workers requests exactly when `d > 1/3`** [computed]. The Workers free
  budget is 3× the daily-equivalent Class A budget while Workers sees 1/d times as many calls.
- **R2 Class A binds before R2 Class B exactly when `d > 1/11`** [computed].
- **Workers requests always bind before Class B**, at every `d < 1` [computed].

**Under §2.5's alternating 50/50 split, `d = 0.5` and R2 Class A is the binding limit** — at 33,333
users at N = 2, 11,111 at N = 3, 5,556 at N = 4 [computed].

**But a read-mostly household inverts it.** A tablet that is opened but rarely logged on collects on
every wake and deposits almost never (#285 §3 permits exactly this: _"A device with nothing to
deposit may collect on every wake"_). Push `d` below 1/3 and **Workers requests become the binding
limit instead**, at 50,000 users at N = 2. So the honest sentence for the destination ADR is not "R2
operations bind first" but **"R2 Class A binds first at any household that writes on more than a
third of its wakes, and Workers requests bind first below that — the two are within a factor of 1.5
of each other and no design change moves them apart."**

### 5.3 When stored bytes overtake, and why that makes #252's expiry a cost control

Healthy lanes never bind: 102,459 users at N = 2 (§4.3), three times the Class A ceiling.
**Abandoned lanes are the whole question**, and the answer is a fraction rather than a count.

Let `f` be the fraction of users with one permanently abandoned device. Per-user peak stored bytes
[computed] is `(1−f)·(lanes × 2 × 24.4 KB) + f·((N−1) × abandoned lane + remaining lanes × 2 × 24.4 KB)`,
against a 10 GB-month allowance metered on **daily peak** (§1.3).

|   N | Abandoned-lane size                         | `f` at which stored bytes overtakes Class A | Users if **every** user has one |
| --: | ------------------------------------------- | ------------------------------------------: | ------------------------------: |
|   2 | 4.88 MB (#256's K = 200 cap)                |                                    **4.2%** |                           2,029 |
|   2 | 8.89 MB (no cap — whole outstanding ledger) |                                    **2.3%** |                           1,119 |
|   3 | 4.88 MB per lane, 2 lanes                   |                                    **6.3%** |                           1,005 |
|   3 | 8.89 MB per lane, 2 lanes                   |                                    **3.4%** |                             556 |

**So the single most consequential number in this note is one nobody has estimated: what fraction of
users abandon a paired device.** Above about 4% at two devices, the binding limit moves from
operations to storage, and it moves by a lot — at `f = 20%` the ceiling is 9,400 users against Class
A's 33,333 [computed].

**Three things follow, and all three are #252's.**

1. **A backstop expiry is a cost control, not only a privacy control.** #256's resolution called it
   _"a requirement rather than an option"_ on privacy grounds and left the horizon to #252. On the
   billing side it is what keeps stored bytes off the critical path: a 90-day expiry caps an
   abandoned lane at 90 × 24.4 KB = **2.20 MB** [computed] and moves the crossover to **9.4%** of
   users; a 30-day expiry caps it at **0.73 MB** and moves it to **29.6%**.
2. **#256's K = 200 is a bound, not a fix.** At one wake a day it caps an abandoned lane at 4.88 MB
   against a whole ledger's 8.89 MB — a factor of 1.8. K bounds infinity, which is what #256 said it
   was for; it does not bound the number that matters here.
3. **A size ceiling on a deposit — #252's open question — would bind this directly**, and it is the
   only lever that reaches the abandoned lane without a clock. It is not costed here because ADR-0075
   §13 refused a ceiling and #252 has not decided whether the disk changes that.

### 5.4 Free plan or paid: the two halves fail differently, and that is the finding

**This is where the withdrawal clause has to be careful, because the two products do not behave the
same way when the allowance runs out.**

**Durable Objects and Workers stop.** Cloudflare states it twice: _"If you exceed any one of the free
tier limits, further operations of that type will fail with an error"_ [published, §1.1] and _"When a
Worker exceeds this limit, Cloudflare returns Error 1027"_ [published, §1.5]. Both reset daily at
00:00 UTC. **This is exactly the shape ADR-0072 §14's clause assumes** — the design cannot be
silently upgraded, because nothing upgrades silently; it simply breaks, visibly, and comes back
tomorrow.

**R2 does not stop. R2 bills.** R2 is reached by _"Complete the checkout flow to add an R2
subscription to your account"_ [published, §1.3], and its free tier is presented as _"included free
monthly usage"_ against _"You are billed for your usage on a monthly basis"_. **The R2 pricing page
contains no sentence equivalent to the Durable Objects one.** There is no documented hard stop, no
Error-1027 analogue, and no daily reset — the allowances are monthly deductions from an invoice.

**So #364's extension of ADR-0072 §14's clause to convergence does not transfer cleanly, and the
destination ADR has to say so.** ADR-0072 §14 could promise _"the design is reopened rather than
silently upgraded to a paid plan"_ because on Durable Objects there is no silent upgrade available.
On R2 there is. The equivalent promise for this half has to be **operational rather than structural**
— a billing alert, a dashboard check, a stated threshold — because the platform will not enforce it.

### 5.5 What it would cost if the threshold were passed

Method [computed]: §4.2's usage at N = 2, one wake a day, `d = 0.5`, against §1.3's rates and
§1.5's, with Cloudflare's upward rounding to the next million and the Workers Paid _"minimum charge
of $5 USD per month for an account"_ [published, §1.5].

| Users   | R2 Class A    | R2 Class B   | R2 storage (healthy) | Workers                           | Total/month |
| ------- | ------------- | ------------ | -------------------- | --------------------------------- | ----------- |
| 33,333  | 1.0 M — free  | 1.0 M — free | 3.3 GB — free        | 66,666/day — free                 | **$0.00**   |
| 50,000  | 1.5 M → $4.50 | 1.5 M — free | 4.9 GB — free        | 100,000/day — at the free ceiling | **$4.50**   |
| 100,000 | 3.0 M → $9.00 | 3.0 M — free | 9.8 GB — free        | 6 M/month, needs Paid → $5.00 min | **$14.00**  |
| 500,000 | 15 M → $63.00 | 15 M → $1.80 | 48.8 GB → $0.58      | 30 M/month → $6.00 + $5.00 min    | **$76.38**  |

**The cliff is not a cliff.** Crossing out of the free tier at ~33,000 users costs $4.50 a month, and
a user base fifteen times larger costs under $80. **What ADR-0072 §14's clause is actually protecting
against here is not expense; it is an unbounded and unwatched commitment** — a bill that grows with
stored bytes nobody is looking at, on a subscription with no hard stop. The relevant risk is §5.3's
abandoned lanes, not §5.2's operation counts: operations empty overnight, stored bytes accumulate.
#364's resolution already made that distinction — _"remembering that stored bytes are cumulative
where compute limits empty overnight"_ — and this is the arithmetic behind it.

**And the relay half never binds at all.** 36,364 first syncs a day (§3.1) is a ceiling on _pairings
created per day_, not on users, and a pairing happens once per device pair for the life of that
pairing. A user base of any size that is not adding 36,000 device pairs a day is nowhere near it.

### 5.6 The limits a superlinear fan-out could hit, and why none of them do

- **Objects per bucket: unlimited** [published, §1.6]. #260's `N(N−1)` live objects have no count
  ceiling. At the largest figure in this note — 500,000 users at N = 3 — that is 3 million live
  objects, against a documented "Unlimited".
- **Buckets per account: 1,000,000** [published]. Irrelevant: this design uses one bucket, and a
  per-user or per-pairing bucket would be both a stable observable (decision 7) and a management
  operation rate-limited to 50/second.
- **Object key length: 1,024 bytes** [published]. A derived address is a hash, so this is not close.
- **Object size: 5 TiB, single-part upload 5 GiB** [published]. A deposit is bounded by §4.3's
  figures, four orders of magnitude below.
- **One concurrent write per object name per second** [published], with _"Concurrent writes to the
  same object name (key) at a higher rate return HTTP 429"_. This design touches one key per wake per
  lane and never writes the same key twice in a wake, so it cannot hit this — **but it is worth
  recording, because it is the limit a future "poll again mid-session" repair would hit**, and #364
  refused that repair on unlinkability grounds. Two independent reasons for the same refusal.
- **Durable Object storage per account on Free: 5 GB** [published, §1.6], and per object 10 GB.
  ADR-0072 §12 keeps the relay's storage empty between rooms, so this is nowhere near — but it is the
  reason §3.5's rows-written dimension is the relay's storage concern rather than a byte one.

---

## 6. The lifecycle floor, re-verified

#283 §1.6 put R2's shortest enforceable expiry at "about 48 hours". Re-read on 2026-09-04 and
confirmed, from two pages rather than one:

- [`wrangler r2 bucket lifecycle add`](https://developers.cloudflare.com/r2/reference/wrangler-commands/)
  takes `--expire-days`, documented as _"Number of days after which objects expire"_, and
  `--expire-date` (`YYYY-MM-DD`). **There is no hours option and no minutes option.**
- [Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), "Last updated
  Apr 21, 2026": _"Objects will typically be removed from a bucket within 24 hours of the
  `x-amz-expiration` value."_ And on a newly applied rule: _"Most objects will be transitioned within
  24 hours but may take longer depending on the number of objects in the bucket."_

**One day of granularity plus up to a day of slack: the floor is about 48 hours, and it is a floor on
enforcement rather than on policy.** The app's own `DELETE` on collection is immediate and free
(§1.4), so the floor constrains only the **backstop**, which #256 made a requirement and #252 must
size. Every horizon this map would plausibly want — 30, 60, 90 days — is far above it, so §5.3's
arithmetic is buildable at any of them.

**One caveat the destination ADR should carry.** The second quotation says a newly applied rule may
take longer than 24 hours _"depending on the number of objects in the bucket"_, with no bound given.
So the disposal path #252 needs for a withdrawal — apply a rule, wait for the bucket to empty — has a
published typical and no published maximum.

---

## 7. What this does not establish

**Nothing here was measured against a deployed bucket.** Every figure is either quoted from a
Cloudflare page or computed from one plus an assumption in §2. #256's resolution already lists two
facts _"settleable only by a deployed bucket"_; this note adds three more below.

**Five things Cloudflare does not say, listed so nobody later reads a silence as an answer.**

1. **Whether a refused conditional `PUT` is billed as a Class A operation.** §1.4 gives the three
   things that bound the guess and none settles it. The conservative reading is used throughout, and
   §4.1 shows the verdict does not turn on it.
2. **Whether a `GetObject` that finds nothing is billed as a Class B operation.** The only documented
   not-charged case is HTTP 401 [published, §1.3]. A miss is a 404, is not carved out, and is treated
   here as billed. If it is in fact free, every Class B figure falls and the Class-A-binds-first
   verdict strengthens.
3. **Whether `WebSocket.serializeAttachment` is billed as a Durable Object storage row.** It is
   documented separately from the Storage API, is not named among the metered operations, and is
   capped at 16,384 bytes [published, §1.2]. Treated here as free. If it is metered, §3.5's
   rows-written figures rise by one row per attachment write — `worker/src/relay.ts:270` writes one
   per frame, which would put attachments in exactly the same trap as the frame counter.
4. **Whether a Durable Object is billed for wall-clock while a large frame is arriving**, before the
   `webSocketMessage` handler fires. §3.3 assumes it is not, on the strength of _"actively executing
   JavaScript"_. If receiving a multi-megabyte frame keeps the object out of hibernation for the
   duration of the transfer, §3.3's worst-case row applies instead and duration becomes the binding
   dimension for first syncs. **This is the single assumption in the note whose failure would change a
   verdict, and it is measurable on a deployed relay in one afternoon.**
5. **Whether R2's free tier is per account or per bucket.** The page says _"You can use the following
   amount of storage and operations each month for free"_ without qualifying the scope. Assumed per
   account, which is the conservative reading.

**Four things about the app that are assumptions and not measurements**, all isolated in §2 and all
capable of being replaced by a real export: the ledger composition (§2.1), the chunk size (§2.2), the
six control frames (§2.3), and the wake rate (§2.4). #196 §6 says what would settle the first: _"Run
`Settings → Export Ledger` and the measuring script reports it directly."_ **No such export has been
run for this note**, so §2.1's three ledgers are a rate card in #196's and #199's sense — plausible
shapes, not a census.

**And the number that matters most is not a Cloudflare figure at all.** §5.3's crossover turns on
what fraction of users abandon a paired device, and nothing in this repo, this arc or Cloudflare's
documentation has anything to say about it. A grilling session that wants to spend §5.3 has to pick
that fraction, and should pick it explicitly rather than let it arrive as a default.
