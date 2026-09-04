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
large multiple of a send in billable terms: at a 1 MiB chunk it is **2.65 billable Durable Object
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
first sync costs 9.0 billable requests and a 9-chunk one costs 2.65 [computed, §3]. The frame count
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

|                       | Workers Free plan | Workers Paid plan                    |
| --------------------- | ----------------- | ------------------------------------ |
| Requests              | 100,000 / day     | 1 million / month, + $0.15/million   |
| Duration              | 13,000 GB-s / day | 400,000 GB-s / month, + $12.50/million GB-s |

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

| SQLite storage backend | Workers Free plan | Workers Paid plan                            |
| ---------------------- | ----------------- | -------------------------------------------- |
| Rows read              | 5 million / day   | First 25 billion / month + $0.001 / million  |
| Rows written           | 100,000 / day     | First 50 million / month + $1.00 / million   |
| SQL stored data        | 5 GB (total)      | 5 GB-month, + $0.20 / GB-month               |

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

|          | Requests                          | Duration               | CPU time                       |
| -------- | --------------------------------- | ---------------------- | ------------------------------ |
| Free     | 100,000 per day                   | No charge for duration | 10 ms of CPU time / invocation |
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

| Feature                                                 | Limit       |
| ------------------------------------------------------- | ----------- |
| Data storage per bucket                                 | Unlimited   |
| **Number of objects per bucket**                        | **Unlimited** |
| Maximum number of buckets per account                   | 1,000,000   |
| Object key length                                       | 1,024 bytes |
| Object metadata size                                    | 8,192 bytes |
| Object size                                             | 5 TiB       |
| Maximum upload size                                     | 5 GiB single-part |
| **Maximum concurrent writes to the same object name**   | **1 per second** |

[Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/), "Last
updated Jun 1, 2026", for the relay: **WebSocket message size 32 MiB (received only)** — which
confirms ADR-0072 §11.2's cited ceiling — **storage per account 5 GB on Free**, **storage per Durable
Object 10 GB**, **maximum Durable Object classes 100 on Free**, and **number of objects unlimited**.

**Nothing here binds.** Objects per bucket is unlimited, so #260's `N(N−1)` live objects have no
ceiling to hit; a 1,024-byte key length is far above a derived address; and the one-write-per-second
rule is per key, while this design's keys are distinct per lane per index. §5.5 says why the
one-per-second rule is nonetheless worth writing down.
