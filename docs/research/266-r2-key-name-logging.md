# What writes down an R2 key, and which of those we can switch off

Research for [#266](https://github.com/palebluebytes/inventoria/issues/266), on the map
[let a device that was asleep converge later](https://github.com/palebluebytes/inventoria/issues/248).

[#250](https://github.com/palebluebytes/inventoria/issues/250) left this unverified and said it had
to be checked **before the ADR claims the property**, which makes it a prerequisite for the
destination rather than a detail. Under #250's construction the address _is_ the per-pairing derived
key: a key name recorded epoch after epoch is exactly the correlation the rotation spends its whole
design avoiding.

**Scope split with [#283](https://github.com/palebluebytes/inventoria/issues/283).** That note owns
the wider retained-store surface — storage telemetry, size, timing, accumulation, disposal — and
handed this ticket one fact: `objectName` is a documented field of `r2OperationsAdaptiveGroups`
(#283 §1.2). This note owns the key name: every pipeline that can carry one, which of them is on,
which has a switch, and what the destination ADR is therefore allowed to claim. §5 re-verifies #283's
claims from source rather than inheriting them.

All outside claims were verified on **2026-09-03** against the URL named. Every source is
Cloudflare's own — `developers.cloudflare.com`, `blog.cloudflare.com`, `cloudflare.com` — with no
third-party write-up used for any claim.

---

## The verdict

**Yes — an R2 object key appears in a Cloudflare-side record we do not control, in exactly one
pipeline, and it cannot be switched off.** The pipeline is R2's own GraphQL analytics dataset
`r2OperationsAdaptiveGroups`, whose documented field `objectName` is "The object this operation was
performed on if applicable."; it is **retained 31 days**, and Cloudflare's R2 documentation names no
setting, flag or plan that turns it off — there is no off, not merely a default of on. It is a
different product from Workers, so **ADR-0072 §9's `invocation_logs = false` does not reach it**, and
§9 cannot be cited for R2 keys at all. Every _other_ pipeline that could carry a key is either
opt-in and off (R2 event notifications; Workers traces, whose R2 binding spans carry
`cloudflare.r2.request.key`; Logpush, which has no R2 dataset to enable), or does not carry object
keys at all (account audit logs, which Cloudflare states in terms exclude `GetObject` and
`PutObject`, and `workers_trace_events`, which has no binding or URL field). **So the honest sentence
is the narrow one: one uncontrollable pipeline, 31 days, per-object, and the rotation guard holds
only against an operator who does not join across a 31-day window.** That is a real weakening of
#250's construction rather than a fatal one, and the destination ADR must state it rather than claim
a no-record posture it does not have.

---

## What this refutes, confirms and hands on, by name

**Refuted: that ADR-0072 §9's switch has anything to say about a binding call.** §9's lever is
documented against the Workers _invocation_ log — one record per invocation, covering "the Request,
Response, and related metadata". Cloudflare documents a **separate** surface for what a Worker does
_inside_ an invocation, and it is Workers Traces, under a different configuration key
(`observability.traces.enabled`), not `observability.logs.invocation_logs`. §1.2 and §1.3.

**Confirmed, and now stated by Cloudflare in terms rather than inferred:** account audit logs are
management-plane only. #283 §1.3 reasoned this from the audit-log page's general wording; R2's own
audit-log page says it outright. §3.

**Confirmed:** R2 event notifications carry `object.key`, and are opt-in per bucket. §2. Two details
#283 did not have: the notification fires on **lifecycle deletion** as well as on writes and deletes,
and `copySource` carries a second key.

**Newly on the map, and it was not in #283: Workers Traces.** Automatic instrumentation of binding
calls, in open beta since 2025-10-28, with `cloudflare.r2.request.key` as a documented span
attribute — the object key, by name, in a Workers-side pipeline. **It is opt-in and this repo already
has it off** (`wrangler.toml`, `[observability.traces] enabled = false`), which is the right posture
by accident rather than by record: ADR-0072 §9 does not mention traces, and the flag predates the
relay. §1.3, and §6 makes it a recommendation.

**Confirmed as unknowable, which #266 asked to be recorded as the answer:** Cloudflare states no
internal retention period for R2. The only Cloudflare figure with a number attached is a **2013 blog
post** about CDN access logs, and their legal-process page's phrase is "if at all … a limited amount
of time". §4.

**Handed to [#252](https://github.com/palebluebytes/inventoria/issues/252) and the destination ADR:**
the sentence in §6, and the fact that the 31-day window is now the parameter the epoch has to be
argued against.

---

## 1. What ADR-0072 §9's switch is, and what it does not reach

### 1.1 The switch, verbatim

§9's lever is `invocation_logs = false`, set in this repo's `wrangler.toml`. Cloudflare's
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) page is
the authority on what that is:

> All newly created Workers will come with the observability setting enabled by default.

> Each Workers invocation returns a single invocation log that contains details such as the Request,
> Response, and related metadata.

> Invocation logs can be disabled in wrangler by adding the `invocation_logs = false` configuration.

The configuration example on that page fixes its position in the tree:

```jsonc
{
  "observability": {
    "logs": {
      "invocation_logs": false,
    },
  },
}
```

Retention for what is not disabled is **3 days on Workers Free, 7 days on Workers Paid**.

### 1.2 It is a per-invocation record, and a binding call is not an invocation

**The unit is stated in the sentence that defines it: "a single invocation log", per invocation,
containing "the Request, Response, and related metadata".** An R2 `put()` through a binding is
neither the Request nor the Response of the invocation; it happens between them. So on the plain
reading, the switch governs the invocation's own log line and nothing about what the invocation did
inside itself.

**Cloudflare does not state this either way, and the honest answer is not the plain reading alone —
it is that they document a different product for the inside of an invocation.** Two negative checks
support it, and both are worth more than the reading:

- The [`workers_trace_events`](https://developers.cloudflare.com/logs/reference/log-fields/account/workers_trace_events/)
  Logpush dataset is the exhaustive field list for what a Workers invocation record contains:
  `CPUTimeMs`, `DispatchNamespace`, `Entrypoint`, `Event`, `EventTimestampMs`, `EventType`,
  `Exceptions`, `Logs`, `Outcome`, `ScriptName`, `ScriptTags`, `ScriptVersion`, `WallTimeMs`.
  **There is no field for a subrequest, a binding call, an R2 operation or a key.** `EventType`'s
  documented values are the invocation's trigger — "fetch, scheduled, alarm, queue, email,
  worker_rpc, hibernatable_web_socket" — not anything the invocation did.
- The [Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/)
  page says real-time logs "captures invocation logs, custom logs, errors, and uncaught exceptions",
  and the documented `wrangler tail` object carries `event.request.url`, `event.request.method`,
  `event.request.headers` and `event.request.cf` — again the invocation's own request, with no
  binding-call field.

**So the answer to #266's first residual gap is: the switch does not cover a binding call, because
Workers Logs does not record binding calls at all.** That is a better answer than "the switch does
not reach it", because it says the surface is empty rather than merely uncontrolled — and it means
the exposure this ticket is chasing was never on the Workers side of the line.

**One thing the switch still does not settle, unchanged from #283.** Cloudflare does not say anywhere
whether `invocation_logs = false` suppresses the live tail, and the real-time logs page makes no
mention of the setting. Whatever is true there, it is about the invocation's request URL, not about
an R2 key — which is why it stays #283's open item and not this note's.

### 1.3 Workers Traces does record the binding call, by key, and it is a separate switch

This is the surface #283 did not have, and it is the one that would have made §9's switch look like
the wrong control even on the Workers side.

Cloudflare's [Traces](https://developers.cloudflare.com/workers/observability/traces/) page
documents automatic instrumentation of, among others:

> Binding calls — Interactions with various Worker bindings such as KV reads and writes, R2 object
> storage operations and Durable Object invocations

And the [Spans and attributes](https://developers.cloudflare.com/workers/observability/traces/spans-and-attributes/)
reference names what an R2 span carries. Common to every R2 operation:
`cloudflare.binding.type`, `cloudflare.binding.name`, `cloudflare.r2.bucket`,
`cloudflare.r2.operation`, `cloudflare.r2.response.success`, `cloudflare.r2.error.message`,
`cloudflare.r2.error.code`. And on both the GET and the PUT spans:

> `cloudflare.r2.request.key`

alongside `cloudflare.r2.response.etag` and `cloudflare.r2.response.size` on the GET. **That is the
object key, the exact byte length and the etag, per operation, in a Workers-side record** — every
field #283 §4.2 built its accumulation argument out of, without needing the bucket at all.

The announcement post,
[Announcing Workers automatic tracing — now in open beta](https://blog.cloudflare.com/workers-tracing-now-in-open-beta/)
(2025-10-28), says the same thing in prose, which is worth quoting because it leaves no room for a
charitable reading:

> a span generated by an R2 binding call (like a `get` or `put` operation) will automatically contain
> any available attributes, such as the operation type, the error if applicable, the object key, and
> duration

**It is a beta.** The [known limitations](https://developers.cloudflare.com/workers/observability/traces/known-limitations/)
page says "Span names and attribute names are not yet finalized" and "may be refined during the beta
period", and promises "more detailed attributes on each span". So the attribute list above is a floor
rather than a ceiling, and a beta whose stated direction is _more_ attributes is not a surface to
plan on staying small.

**Three properties decide whether this matters, and they are all favourable — for now.**

1. **It is opt-in.** Tracing is enabled by `"observability": { "traces": { "enabled": true } }`. It
   is not implied by `observability.enabled`, and it is not on for a Worker that does not ask.
2. **This repo already has it off.** `wrangler.toml` carries `[observability.traces] enabled = false`
   explicitly. But that line predates the relay by three months — it arrived in `1a1e73a`
   (2026-06-03, an Items-view commit) and **ADR-0072 §9 never mentions traces at all** — so the
   correct posture is currently held by a line that no record defends and no gate protects. §6 fixes
   that.
3. **Cloudflare says the default is going to change, and this repo is on the wrong side of the
   change.** From the Traces page, verbatim:

   > In the future, Cloudflare plans to enable automatic tracing in addition to logs when you set
   > `observability.enabled = true`

   **`wrangler.toml` sets exactly that**: `[observability] enabled = true`, at the top level, above
   the per-signal blocks. It is set deliberately — the comment above it records that a previous
   `enabled = false` under blocks that turned logs on left the outcome "resting on which of the two
   the server lets win", "a question wrangler does not answer, since it forwards both values
   untouched". **That same precedence question is what the traces posture now rests on**: if
   Cloudflare's planned change lands, the account is asking for traces at the top and refusing them
   in the sub-block, and Cloudflare has not published which wins. If the sub-block ever loses — or is
   dropped in a config rewrite — **every relay R2 operation starts being recorded by key**, with
   `invocation_logs = false` still faithfully set and providing no protection whatever. The switch
   that matters for an R2 key is not §9's, and the two are easy to confuse.

Retention if it were on: **3 days Free, 7 days Paid**, the same as logs, with traces "stored in the
Cloudflare dashboard by default" and a `persist: false` option to export without persisting. Default
`head_sampling_rate` is `1` — "100% of requests will be traced if tracing is enabled".

### 1.4 And the one that is on, and has no switch

For completeness in this section, because it is what §9's switch is repeatedly mistaken for: R2's own
[Metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/) dataset
`r2OperationsAdaptiveGroups` — "This dataset consists of the operations taken on a bucket within an
account" — has `objectName`, "The object this operation was performed on if applicable.", retained
31 days. §5.1 re-verifies it in full. **It is an R2 dataset, not a Workers one**, and no Cloudflare
page connects any Workers observability setting to it.

---

## 2. R2 event notifications: the full key, opt-in, and off

[Event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/) are the
loudest key-carrying surface R2 has, and the reason they do not matter here is that nobody has turned
them on.

**They are opt-in per bucket.** The page's instructions are to "Enable event notifications via
Dashboard" or "Enable event notifications via Wrangler"; a bucket with no notification rule emits
nothing. There is no account-wide or default-on variant.

**When on, they carry the key in full.** The documented message body:

```json
{
  "account": "string",
  "action": "string",
  "bucket": "string",
  "object": { "key": "string", "size": "number", "eTag": "string" },
  "eventTime": "string",
  "copySource": { "bucket": "string", "object": "string" }
}
```

`object.key` is the object name; `object.size` and `object.eTag` are documented as present for
creation events; `copySource` is "only present for events triggered by `CopyObject`" and carries a
**second** key.

**Two details worth pinning that go beyond "do not enable it".**

- **The trigger set includes lifecycle deletion.** The documented event types are `object-create`
  (`PutObject`, `CopyObject`, `CompleteMultipartUpload`) and `object-delete` (`DeleteObject`,
  **`LifecycleDeletion`**). So a notification rule would write down not only every deposit and every
  collection but every _expiry_ — which is to say, every address that was minted and never collected,
  the one event no other pipeline announces. That is the exact population #283 §4.5 is trying to
  bound, handed over by key.
- **The destination is a Queue, and a Queue is a store.** "Send messages to your queue when data in
  your R2 bucket changes." Enabling notifications does not merely emit; it deposits the key into a
  second Cloudflare product with its own retention and its own consumers. A key that reaches a Queue
  has left the 31-day window and entered somebody else's.

**Recording this as absent is worth as much as recording the analytics as present.** The correct
posture is not "we have not got round to it": it is a decision, and the destination ADR should say
that R2 event notifications are refused for this bucket, so that a future maintainer wiring up a
delivery receipt or a metrics counter meets a record rather than an empty field.

---

## 3. Audit logs, and Logpush: two pipelines that carry no key at all

### 3.1 Audit logs are management-plane, and Cloudflare says so about R2 by name

#283 §1.3 reasoned this from the general audit-log page's wording. It does not have to be reasoned:
R2 has its own [Audit logs](https://developers.cloudflare.com/r2/platform/audit-logs/) page, and it
states the exclusion in terms.

> Logs for data access operations, such as `GetObject` and `PutObject`, are not included in audit
> logs.

The complete list of R2 actions that _are_ logged is bucket-level configuration and nothing else:
`CreateBucket`, `DeleteBucket`, `AddCustomDomain`, `RemoveCustomDomain`, `ChangeBucketVisibility`,
`PutBucketStorageClass`, `PutBucketLifecycleConfiguration`, `DeleteBucketLifecycleConfiguration`,
`PutBucketCors`, `DeleteBucketCors`.

**So the answer to #266's third residual gap is: bucket-level operations only, no object keys, and
this is stated rather than inferred.** Retention is the longest on this page —
[audit logs](https://developers.cloudflare.com/fundamentals/account/account-security/review-audit-logs/):
"Audit Logs are retained for 18 months before being deleted." Audit Logs v2 is now the current
version, reachable at
[`/fundamentals/account/account-security/audit-logs/`](https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/),
and is also available as the `audit_logs_v2` account-scoped Logpush dataset; the 18-month figure and
the management-plane scope are unchanged by the version bump.

**Three things follow, and the third is the one worth carrying.**

1. No object key ever enters an 18-month record. Good.
2. Enabling event notifications, changing a lifecycle rule, or making the bucket public are all
   configuration changes and therefore _are_ recorded for 18 months. A change to the disposal policy
   leaves a permanent trace, which is a property the destination ADR can lean on rather than one it
   has to defend against.
3. **`ChangeBucketVisibility` is in that list, and it is the pivot.** Which is §3.2.

### 3.2 Logpush has no R2 dataset — but a _public_ bucket routes keys into a zone dataset

The [account-scoped dataset list](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/account/)
was re-read in full on 2026-09-03. The 31 datasets it names are: Access requests, Account Abuse
Protection Events, Audit Logs, Audit Logs V2, Browser Isolation User Actions, CASB Findings, Device
posture results, DEX Application Tests, DEX Device State Events, DLP Forensic Copies, DNS Firewall
Logs, Email Security Alerts, Email Security Post-Delivery Events, Firewall events, Gateway DNS,
Gateway HTTP, Gateway Network, IPSec Logs, Magic BGP Logs, Magic IDS Detections, Magic Network
Monitoring Flow Logs, MCP Portal Logs, Network Analytics Logs, Sinkhole HTTP Logs, SSH Logs,
Turnstile Events, WARP Config Changes, WARP Toggle Changes, WebSocket Analytics, Workers Trace
Events, Zero Trust Network Session Logs. **No R2 dataset.** #283's finding, and #281's before it,
confirmed against the current page: there is no S3-style server access log for R2 to switch off,
because there is none to switch on.

**But the R2 audit-log page names the substitute in the same breath as the exclusion**, and it is a
route to a key that neither #281 nor #283 recorded: for a bucket exposed on a custom domain, the
advice is to "use the HTTP requests Logpush dataset to log HTTP requests made to public R2 buckets".
The zone-scoped [`http_requests`](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/zone/http_requests/)
dataset carries `ClientRequestURI` — "URI requested by the client, which includes the full path and
query string of the requested URL" — `ClientRequestPath`, and `ClientIP`. **For a public bucket, the
object key is the URL path, so the key and the client IP land in the same row.**

Three conditions gate that, and all three are ours to hold:

- The bucket must be **public** — either a custom domain or the `r2.dev` subdomain. A binding-only
  bucket has no zone in front of it and therefore no `http_requests` rows.
- A **Logpush job must be created**, which is opt-in per zone.
- Making the bucket public is `ChangeBucketVisibility`, which §3.1 says is audit-logged for 18
  months.

**So this is not a live exposure; it is a trip-wire.** The destination ADR should state that the
deposit bucket is reached by binding only and is never made public — not because a public bucket
would be insecure (the deposits are sealed) but because publishing it moves the key from a 31-day
aggregated analytics dataset into a row that can be joined to a client IP.

---

## 4. What Cloudflare retains internally: they do not say, and #266 asked for that to be the answer

#266's instruction was explicit — "If they do not say, record that as the answer — an unstated
retention is not an absent one." Four first-party sources were checked, and none of them states an
internal retention period for R2 operations.

**The privacy policy states no number for anything but the DNS resolver.** Cloudflare's
[Privacy Policy](https://www.cloudflare.com/privacypolicy/) §11 is the retention section:

> We store your personal information for a period of time that is consistent with the business
> purposes set forth in Section 3 of this policy or as long as needed to fulfill and comply with
> legal obligations.

The only figure anywhere in it is for the 1.1.1.1 resolver — "the bulk of the limited
non-personally identifiable query data is only stored for 25 hours" — which is a different product
and cannot be read across. §6 of the same policy puts data handled for customers outside the policy's
own schedule: "Cloudflare processes data on behalf of its Customers pursuant to their data processing
instructions." **That is a pointer to the DPA, not a retention period**, and it means the policy is
structurally incapable of answering this question for an R2 bucket.

**The legal-process page states a limit with no number.** The
[law enforcement page](https://www.cloudflare.com/trust-hub/law-enforcement/):

> Cloudflare rarely has data responsive to court orders seeking transactional data related to a
> customer's website, such as logs of the IP addresses visiting a customer's website or the dates

> we retain such data (if at all) for only a limited amount of time

**"(if at all)" is doing the work in that sentence, and it is a hedge rather than a commitment.** The
same page's other well-known line — Cloudflare "is not generally a hosting provider … and does not
have customer content … in the traditional sense" — is a statement about the CDN business and is
**false about an R2 bucket we chose to fill**. #283 §5 already made that point about the deposits;
it applies to the key names identically.

**The only Cloudflare figure with a number attached is thirteen years old and about a different
product.** [What Cloudflare Logs](https://blog.cloudflare.com/what-cloudflare-logs/), published
**2013-04-23**, is the source of the "4 hours" figure that circulates:

> For most customers, we discard access logs within 4 hours of them being recorded.

> By default, we store logs for these customers for 3 days.

> Error logs sent to core are currently kept for 1 week then discarded.

**Do not cite this for R2.** It predates R2 by eight years, it describes CDN edge access logs, and
nothing on the page claims to be a policy that binds later products. It is recorded here only so
that the next reader who finds "Cloudflare keeps logs for 4 hours" knows exactly what that sentence
was about.

**The R2 documentation itself is silent.** The
[Metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/) page's only
retention statement is the customer-facing one — "Metrics can be queried (and are retained) for the
past 31 days" — and **"can be queried for" is not "are deleted after"**. The page says how long we
can read; it does not say how long Cloudflare holds. That distinction is the whole of this section.

**So the answer to #266's fourth residual gap, stated as the ticket asked:**

> **Cloudflare publishes no internal retention period for R2 operations data. The 31-day figure is a
> query window, not a deletion guarantee. An unstated retention is not an absent one, and the
> destination ADR must not write a sentence whose truth depends on Cloudflare having deleted
> anything.**

This is not establishable from outside by any amount of further reading, which is what #281 said when
it handed the question on. The reason it is worth the words anyway is that it converts an open
question into a **closed** one: it is not that we have failed to find the number, it is that no
number exists to find, and further research on this point is not warranted.

---

## 5. #283's claims, re-verified rather than inherited

`docs/adr/README.md` requires re-verification before a claim is extended. Every claim this note leans
on was re-read from source on **2026-09-03**. All five hold; three gained a detail.

### 5.1 The two R2 datasets, confirmed field by field

Re-read from [Metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/).
The field tables are unchanged from #283 §1.1.

**`r2OperationsAdaptiveGroups`** — "This dataset consists of the operations taken on a bucket within
an account":

| Field                | Documented as                                                              |
| -------------------- | -------------------------------------------------------------------------- |
| `actionType`         | "The name of the operation performed."                                     |
| `actionStatus`       | "The status of the operation. Can be success, userError, or internalError" |
| `bucketName`         | "The bucket this operation was performed on if applicable."                |
| `objectName`         | **"The object this operation was performed on if applicable."**            |
| `responseStatusCode` | "The http status code returned by this operation."                         |
| `datetime`           | "The time of the request."                                                 |

**`r2StorageAdaptiveGroups`** — "This dataset consists of the storage of a bucket within an account":
`bucketName`, `payloadSize`, `metadataSize`, `objectCount`, `uploadCount`, `datetime`.

Retention, verbatim: "Metrics can be queried (and are retained) for the past 31 days."

**No off switch, confirmed by absence and by re-reading for it.** The page names no setting, plan
tier or flag that disables either dataset, and describes the dashboard as a consumer of the same
data — "The metrics displayed for a bucket in the Cloudflare dashboard are queried from Cloudflare's
GraphQL Analytics API". There is no off.

### 5.2 The gap #283 left open, still open, and now narrower

#283's "not verified" list carried: _whether a Worker R2 **binding** call appears in
`r2OperationsAdaptiveGroups`_. **Still not stated anywhere.** The page was re-read specifically for
it and mentions neither bindings, Workers, the S3 API, nor any access method; the dataset is
described only as "the operations taken on a bucket", with no access-path qualifier.

The [pricing page](https://developers.cloudflare.com/r2/pricing/) does not close it either. It lists
`PutObject` and `CopyObject` as Class A, `GetObject` and `HeadObject` as Class B, and `DeleteObject`,
`DeleteBucket` and `AbortMultipartUpload` as free, without distinguishing access path — its only
sentence about the binding is about egress, "Egressing directly from R2, including via the Workers
API", which is about data transfer rather than about operation accounting.

**So #283's inference stands as an inference and this note does not upgrade it.** The unfavourable
reading is the one to plan against: **assume a binding `put()` writes an `objectName` row.** But the
distinction now matters less than it did, because §1 established that Workers Logs would not have
recorded the binding call under any setting, so there is no second pipeline whose presence or absence
turns on this question. It is a question about the size of one exposure, not about whether it exists.

### 5.3 The other three, confirmed

| #283's claim                                                                  | Re-verified                                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The account Logpush dataset list has no R2 dataset                            | **Holds.** All 31 datasets re-read; §3.2 lists them.                                                                                                           |
| Workers Logs is on by default                                                 | **Holds**, verbatim: "All newly created Workers will come with the observability setting enabled by default."                                                  |
| `invocation_logs` is documented against a stored record, not live observation | **Holds.** Real-time logs "does not store Workers Logs", the tail object carries `event.request.url`, headers and `cf`, and no page relates the setting to it. |
| Event notifications are opt-in and carry `object.key`                         | **Holds**, and gained `LifecycleDeletion` and `copySource` — §2.                                                                                               |
| Audit logs are configuration-only, 18 months                                  | **Holds**, and is now stated by Cloudflare in terms for R2 rather than inferred — §3.1.                                                                        |

**One correction of emphasis, not of fact.** #283 §1.3 filed event notifications, Logpush and R2 Data
Catalog together as "opt-in, and therefore genuinely absent". That grouping is right but it is
missing its largest member: **Workers Traces belongs in it and was not on the list**, and it is the
only one of the four that records the object key from _inside_ our own Worker rather than from an
external client. #283 §6's ceiling list should be read as having an eleventh item that is currently
zero, and §1.3 of this note says under what conditions it stops being zero.

---

## 6. Every pipeline that can carry an R2 key, in one table

| Pipeline                                                | Carries the key?                                 | On?                                          | Off switch                                   | Retention                  |
| ------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- | -------------------------------------------- | -------------------------- |
| **`r2OperationsAdaptiveGroups`** (R2 GraphQL analytics) | **Yes — `objectName`**                           | **Yes, unconditionally**                     | **None documented**                          | **31 days (query window)** |
| Workers Traces, R2 binding span                         | **Yes — `cloudflare.r2.request.key`**            | No — opt-in                                  | `observability.traces.enabled = false` ✓ set | 3 d Free / 7 d Paid        |
| R2 event notifications                                  | **Yes — `object.key`**, plus `copySource`        | No — opt-in per bucket                       | Do not create a rule ✓                       | The Queue's, not R2's      |
| Zone `http_requests` Logpush                            | **Yes — as `ClientRequestURI`**, with `ClientIP` | No — needs a **public** bucket **and** a job | Keep the bucket binding-only ✓               | The job's destination      |
| Workers Logs / invocation log                           | No — no binding field exists                     | Disabled anyway (§9)                         | `invocation_logs = false` ✓ set              | 3 d Free / 7 d Paid        |
| `workers_trace_events` Logpush                          | No — no binding, subrequest or URL field         | No — opt-in                                  | Do not create a job ✓                        | The job's destination      |
| Account audit logs                                      | No — `GetObject`/`PutObject` excluded in terms   | Yes                                          | n/a                                          | 18 months                  |
| The bucket itself, via `list()`                         | Yes, by definition                               | Yes                                          | n/a — it is the store                        | Until deleted (#283 §1.4)  |

**Read down the "On?" column: exactly one row is both on and unswitchable, and it is the first.**
Four of the five key-carrying pipelines are closed, and three of those four are closed by a line in
`wrangler.toml` or by a bucket setting we hold — which is to say, by something a future change can
silently open.

## 7. What follows

1. **The destination ADR must state the exposure rather than claim a no-record posture.** The
   sentence it is allowed is: _R2 records the object key of every operation in its own analytics
   dataset, readable for 31 days by anyone with account access, with no setting that turns it off._
   The sentence it is **not** allowed is anything of the form "no record of the address exists",
   which is what ADR-0072 §12's voice would otherwise supply by habit.
2. **Do not cite ADR-0072 §9 for R2 keys.** §9 is a Workers control over a record that never
   contained a binding call. Citing it here is not merely imprecise; it would make the destination
   ADR claim protection from a switch that protects nothing on this axis. If §9 is amended, the
   amendment should say so in one clause.
3. **Give the traces flag a record.** `[observability.traces] enabled = false` is currently the only
   thing standing between the relay and a per-key Workers-side log, it predates the relay by three
   months, no ADR mentions it, and Cloudflare has announced an intention to make tracing follow
   `observability.enabled` — which this repo sets to `true`. It should be named in the destination
   ADR beside `invocation_logs`, with the same "anyone proposing to switch this back on has to answer
   first" clause §9 already carries, and it is a candidate for
   `scripts/worker-closure-check.mjs`, which already pins the Worker's posture structurally.
4. **State the two refusals that are currently accidents: no event notifications on the deposit
   bucket, and the bucket is never public.** Each is a one-line decision that closes a key-carrying
   pipeline, and neither is written down anywhere.
5. **The 31-day window is now a parameter [#252](https://github.com/palebluebytes/inventoria/issues/252)
   has to argue against.** #250's rotation defeats an operator who does not join across epochs. The
   analytics dataset joins for them, for 31 days, for free. So the rotation's benefit is not "the
   operator cannot link two epochs" but "the operator cannot link two epochs **more than 31 days
   apart** without having decided in advance to keep the rows" — and an epoch materially shorter than
   31 days buys much less than #250 priced it at, because every epoch inside the window is joinable
   by `objectName` and `datetime` regardless. That is the single most load-bearing consequence in
   this note.
6. **It does not kill the store.** The operator learns the sequence of addresses, not what they
   contain, and #283 §4.3's list of what the seal still protects is untouched. The correct posture is
   the one #250 used: say it plainly, and let the destination ADR spend the guard knowingly.

## What is not verified

- **Whether a Worker R2 binding call appears in `r2OperationsAdaptiveGroups`.** Inherited from #283
  as unverified and re-checked here; Cloudflare states nothing about access paths. Planned against on
  the unfavourable reading. §5.2.
- **Whether `invocation_logs = false` suppresses the live tail.** #283's open item, unchanged. It
  concerns the invocation's request URL rather than an R2 key, so it does not bear on this note's
  verdict.
- **Which value wins when `[observability] enabled = true` and `[observability.traces] enabled =
false` disagree**, if Cloudflare's announced change lands. `wrangler.toml`'s own comment records
  that wrangler forwards both untouched and that Cloudflare does not answer the precedence question.
  Checkable by experiment on a deployed Worker; nobody has run it.
- **Whether the R2 analytics rows are deleted at 31 days or merely become unqueryable.** The docs say
  "can be queried (and are retained) for the past 31 days", which is a read window; no Cloudflare page
  states a deletion. §4.
- **Cloudflare's internal retention of anything.** No number is published for R2 by any first-party
  source. Recorded as the answer, per #266. §4.
- **The `datetime` bucketing of either R2 dataset**, which decides how finely `objectName` rows can be
  ordered in time. Not published; #283 §1.1 left it at "at least daily, upper bound unstated" and
  nothing found here improves on that.
- **Whether free operations (`DeleteObject`) produce an `objectName` row.** Not stated, and it decides
  whether a collection is as visible as a deposit. #283's assumption that they do is kept.
