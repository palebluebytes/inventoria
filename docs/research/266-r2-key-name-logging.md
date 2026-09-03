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
calls, generally available since 2026, with `cloudflare.r2.request.key` as a documented span
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
			"invocation_logs": false
		}
	}
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
