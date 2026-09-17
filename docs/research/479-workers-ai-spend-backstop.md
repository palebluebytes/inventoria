# What stops the spend when the operator secret leaks

Research for [#479](https://github.com/palebluebytes/inventoria/issues/479), on the map
[ask a model](https://github.com/palebluebytes/inventoria/issues/474).

The design under test: **one route on Inventoria's own Worker calls Workers AI via
`env.AI.run()`, through an explicit AI Gateway created with `collect_logs: false`, gated by a
single shared operator secret the user types into settings.** The secret is the only door. A
backstop is whatever still holds after that door is open — after an attacker has a valid key and
simply hammers the route. A ticket assumed the backstop was "an account-level hard spend cap".

All Cloudflare figures here were read on **2026-09-17** from the URL named, and every source is
Cloudflare's own `developers.cloudflare.com` — the product docs and the API reference. No
third-party write-up is used for any claim. Each page carries its own "Last updated" date and that
date is given, because both Cloudflare's pricing and AI Gateway's feature set move fast: the spend
limits feature cited below is three months old and the API it replaced is already deprecated.

**Three kinds of statement, marked throughout and never mixed:**

- **[published]** — a figure or behaviour Cloudflare states, quoted from the page cited.
- **[absent]** — the docs do **not** say. Named as an absence, never filled in by inference. These
  are the load-bearing entries: an absence that the design leans on is a risk, not a detail.
- **[computed]** — arithmetic done here on published figures, with the method shown.

---

## The answer in five sentences

**The assumed account-level hard spend cap does not exist, and Cloudflare says so in as many
words.** Cloudflare's account-wide dollar mechanism is **Budget alerts**, and its own page states
_"Budget alerts are informational only. They do not pause or cap usage"_ [published]. What does
exist, and is new, is a **per-gateway** cost-based cap — **AI Gateway spend limits**, which
_"blocks further requests with a `429` response until the window resets"_ [published] — plus
per-gateway **rate limiting** (also `429`), both settable through the AI Gateway REST API and so
scriptable with a verification command. **On the Workers Free plan there is already a hard daily
stop** — 10,000 Neurons a day, after which Workers AI returns internal code `3036` / HTTP `429`
_"You have used up your daily free allocation of 10,000 neurons"_ [published] — which makes "stay
on Free" itself the strongest backstop available, at the cost of being the same stop for the
legitimate user. The two loudest absences: the spend-limits page names **Unified Billing and BYOK**
as what it applies to and **never names Workers AI standard billing** [absent], and **nothing in
the docs says whether rate limiting, spend limits, or the metadata they bucket on survive
`collect_logs: false`** [absent].

---

## 1. Is there an account-level hard spend cap? — Refuted

**No. The account-wide dollar mechanism is a notification, and Cloudflare states that it does not
cap.**

[Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) — updated
**2026-05-29**:

> Budget alerts notify you by email when your account-wide usage-based spend crosses a dollar
> threshold you define.

and, under "How budget alerts work", the sentence the ticket's assumption dies on:

> Budget alerts are informational only. They do not pause or cap usage. Your monthly invoice
> remains the authoritative source for billing.

[published] Availability: _"Budget alerts are available to Pay-as-you-go accounts only. Enterprise
contract accounts are not supported."_ [published] Setup is **Billing > Billable Usage > Create
budget alert** in the dashboard; the page documents no API [absent].

The sibling mechanism is per-product and also only a notification.
[Usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) —
updated **2026-05-29** — describes **usage-based billing notifications** (Professional plan or
higher, configured under **Notifications**, threshold on a product metric such as bytes or
requests), with the same disclaimer:

> The email notifications are for informational purposes only. Actual usage and billing may vary.

[published]

### Per-product spending limits: not for Workers or Workers AI

- The whole [Billing docs index](https://developers.cloudflare.com/billing/llms.txt) — fetched
  2026-09-17, 60 lines, listing every page in the section — contains **no page for a spending
  limit, spend cap, or budget enforcement**; the only dollar-threshold page in it is Budget
  alerts [absent].
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) — updated
  **2026-08-28** — contains **no mention of a spend cap, spending limit or budget** anywhere on the
  page [absent].
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) — updated
  **2026-08-28** — likewise **never mentions a spend cap, spending limit or budget** [absent].
- [Optimize costs](https://developers.cloudflare.com/billing/manage/optimize-costs/) — updated
  **2026-05-04** — is Cloudflare's own page on controlling spend, and under "Monitor and alert" it
  offers exactly two tools: the billable usage dashboard and budget alerts. **Neither stops
  anything** [published].

### The one thing that _was_ an account-level AI spend cap is deprecated

There is a Cloudflare API endpoint `POST /accounts/{account_id}/ai-gateway/billing/spending-limit`,
[Set spending limit (deprecated)](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/billing/subresources/spending_limit/methods/create/),
whose own description reads:

> Deprecated: spending limits can no longer be created, enabled, or modified and this endpoint
> always responds 403. Use the new AI Gateway spend limits instead […]. Existing limits can be
> removed via DELETE /spending-limit.

[published] Its body took `amount` (cents, min 100), `duration` ("daily" | "weekly" | "monthly"),
`strategy` ("fixed" | "sliding"). **This is very likely where the ticket's assumption came from** —
an account-scoped AI spend cap did once exist at the API level, and has been retired in favour of
the per-gateway rules in §4.

**Bottom line for the design: there is no switch anywhere in Cloudflare that says "stop spending
money on this account at $X". The backstop has to be built from per-gateway and per-plan
mechanisms.**

---

## 2. Workers AI billing, free allocation, and what happens when it runs out

All from [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) —
updated **2026-08-28** — unless noted.

**Billing unit.** _"Workers AI is included in both the Free and Paid Workers plans and is priced at
**$0.011 per 1,000 Neurons**."_ [published] The page adds a note: _"Workers AI has updated pricing
to be more granular, with per-model unit-based pricing presented, but still billing in neurons in
the back end."_ [published] Neurons are defined as _"our way of measuring AI outputs across
different models, representing the GPU compute needed to perform your request."_ [published]

**Free allocation and overage**, as the page's own table gives it:

| Plan         | Free allocation        | Pricing                       |
| ------------ | ---------------------- | ----------------------------- |
| Workers Free | 10,000 Neurons per day | N/A - Upgrade to Workers Paid |
| Workers Paid | 10,000 Neurons per day | $0.011 / 1,000 Neurons        |

[published] And: _"All limits reset daily at 00:00 UTC. If you exceed any one of the above limits,
further operations will fail with an error."_ [published]

**What happens at exhaustion — the two plans differ, and the difference is the whole point.**

- **Workers Free: a hard daily stop.** [Workers AI
  errors](https://developers.cloudflare.com/workers-ai/platform/errors/) — updated **2026-07-29** —
  gives internal code **`3036`**, HTTP **`429`**, description _"You have used up your daily free
  allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like
  to continue usage."_ [published] The pricing table's "N/A - Upgrade to Workers Paid" column says
  the same thing in billing terms: on Free there is no overage to buy. **This is a real backstop
  with a hard ceiling of zero dollars.**
- **Workers Paid: a billed overage, with no stated ceiling.** $0.011 / 1,000 Neurons above the
  daily 10,000, and nothing on the page names a point at which billing stops [absent].

**Per-model rates, for sizing the damage.** From the same page's per-model table [published]:

| Model                                      | Neurons per M input tokens | Neurons per M output tokens |
| ------------------------------------------ | -------------------------- | --------------------------- |
| `@cf/meta/llama-3.2-1b-instruct`           | 2,457                      | 18,252                      |
| `@cf/meta/llama-3.2-3b-instruct`           | 4,625                      | 30,475                      |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast`  | 4,119                      | 34,868                      |
| `@cf/meta/llama-3.1-8b-instruct`           | 25,608                     | 75,147                      |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 26,668                     | 204,805                     |

**[computed] — what the Free allocation actually buys.** At `@cf/meta/llama-3.2-3b-instruct` and a
notional 500 input + 500 output tokens per call, one call costs
`0.0005 × 4,625 + 0.0005 × 30,475 ≈ 17.6` Neurons, so the 10,000-Neuron day is **~570 calls**. At
`@cf/meta/llama-3.1-8b-instruct` the same shape costs `≈ 50.4` Neurons, so **~198 calls a day**.
Method given so it can be re-run against whatever prompt shape the route settles on; both numbers
move linearly with token count.

**[computed] — what an unbounded Paid day costs.** On Workers Paid with no gateway cap, the ceiling
is not money, it is the model's own request rate (§5): text generation is 300 requests per minute
[published]. At 300 rpm for 24 hours = 432,000 calls; at the 8b model's 50.4 Neurons per call that
is `432,000 × 50.4 / 1,000 × $0.011 ≈ **$239 a day**` — and at the 70b model's 500/500 shape
(`≈ 116` Neurons) roughly **$551 a day**. These are order-of-magnitude figures to size the
backstop against, not a prediction.

**Note on the plan question.** Some models are gated to paid billing: the pricing page names
`@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `glm-5.3`, `glm-5.3-flash`,
`@cf/deepseek-ai/deepseek-v4-flash-0731` and `deepseek-v4-pro-0813` as requiring _"either the
Workers Paid plan or prepaid AI Gateway credits"_ [published], and the errors page gives `5035` /
HTTP `403` _"This model requires a Workers Paid plan"_ [published]. A Llama model does not fall in
that set.

**An absence worth stating:** the [Usage-based
billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/) products table
(updated **2026-05-29**) lists Workers, R2, Argo, Cache Reserve, Load Balancing, Stream, Images,
Spectrum, Rate Limiting, Log Explorer, Zero Trust, Vectorize and Analytics Engine — and **does not
list Workers AI** [absent]. The billable-usage dashboard's per-product coverage of Workers AI is
therefore not something the docs establish.

---

## 3. AI Gateway rate limiting

From [Rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/) —
updated **2026-06-05**.

**Yes, per gateway.** _"Rate limiting controls the traffic that reaches your application, which
prevents expensive bills and suspicious activity."_ [published]

**Parameters** [published]:

- A number of requests in a time frame — _"you can limit your application to 100 requests per 60
  seconds."_
- **fixed or sliding** window. The page's own worked example: at ten requests per ten minutes
  starting at 12:00, ten requests at 12:09 and ten at 12:11 **all succeed under fixed** (two
  different windows) and **fail under sliding** (more than ten in the last ten minutes).

**What the client gets when it trips** [published]:

> the server will respond with a `429 Too Many Requests` status code and your request will not be
> processed.

The page states the **status code only**. It does **not** document a response body, an error code,
or a `Retry-After` header [absent]. If the route's UI needs to distinguish "rate limited" from
"model failed", that has to be established empirically, not from the docs.

**Yes, via the REST API — and this is the scriptable part.** The page's own API procedure: create a
token with `AI Gateway - Read` and `AI Gateway - Edit`, take the Account ID, and `POST` to the
gateway create endpoint _"include a value for the `rate_limiting_interval`, `rate_limiting_limit`,
and `rate_limiting_technique`"_ [published]. The
[create](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create/) and
[update](https://developers.cloudflare.com/api/resources/ai_gateway/methods/update/) API references
confirm the exact fields [published]:

| Field                        | Type                        | Notes                  |
| ---------------------------- | --------------------------- | ---------------------- |
| `rate_limiting_limit`        | number, minimum 0           | **required** on create |
| `rate_limiting_interval`     | number, minimum 0           | **required** on create |
| `rate_limiting_technique`    | `"fixed"` \| `"sliding"`    | optional               |
| `collect_logs`               | boolean                     | **required** on create |
| `cache_ttl`                  | number, minimum 0           | **required** on create |
| `cache_invalidate_on_update` | boolean                     | **required** on create |
| `authentication`             | boolean                     | optional               |
| `byok_only`                  | boolean                     | optional               |
| `workers_ai_billing_mode`    | `"postpaid"` \| `"unified"` | optional               |

So a gateway with `collect_logs: false` **and** a rate limit is a single `POST`, and a `GET` on the
gateway reads the values back — the shape `docs/how-to-operate-the-store.md` uses.

**Uniformity.** _"This rate limiting behavior will be uniformly applied to all requests for that
gateway."_ [published] There is no per-key or per-user dimension on gateway rate limiting; for that
you need spend limits' metadata dimensions (§4) or the Worker-side binding (§6).

**Does rate limiting require logging to be on?** **[absent] — the docs never say.** The rate
limiting page does not mention logs at all. The
[logging](https://developers.cloudflare.com/ai-gateway/observability/logging/) page (updated
**2026-06-15**) describes turning logs off — _"If you are concerned about privacy or compliance and
want to turn log collection off, you can go to settings and opt out of logs"_ — and says nothing
about any feature ceasing to work [published/absent]. The
[analytics](https://developers.cloudflare.com/ai-gateway/observability/analytics/) page (updated
**2026-04-20**) treats metrics as a separate surface from logs [published]. **Nothing in the docs
establishes either that rate limiting needs logging or that it survives without it.** For a design
that hard-wires `collect_logs: false`, this is the absence to verify by experiment before shipping.

---

## 4. Other gateway-side controls that bound cost or volume

### 4a. Spend limits — the real cost cap, and it is per-gateway

From [Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/) — updated
**2026-09-09**; announced in [Control AI costs with spend
limits](https://developers.cloudflare.com/changelog/post/2026-06-05-spend-limits/), **2026-06-05**.

> Spend limits let you set cost-based budgets on your AI Gateway. When cumulative spend reaches the
> limit within a time window, AI Gateway blocks further requests with a `429` response until the
> window resets.

[published] Mechanics [published]:

- _"Before sending a request to the provider, AI Gateway evaluates all applicable spend limit rules
  at once. If any individual rule is over budget, the request is blocked with a `429` response."_
- _"Spend limits are eventually consistent. The current request's cost is recorded after
  completion, so a burst of concurrent requests can briefly exceed the limit before enforcement
  catches up."_ — so it is a cap with overshoot, not a hard gate.
- _"Cost tracking is a best-effort estimation based on token counts and model pricing."_
- Maximum **20 rules per gateway**.
- Scoping by **provider**, **model**, or **custom metadata** key; each dimension either **split by
  value** (a bucket per distinct value) or **filter by value** (the rule applies only to one
  value). A rule with no dimensions is one shared bucket for everything.
- On breach, either **block** (default) or **fall back to a cheaper model** via a Dynamic Route.

**Configurable via REST API — but only on `PUT`, not `POST`.** The docs say _"Spend limits are
configured for each gateway through the dashboard or the API"_ [published], and the API reference
pins down exactly where: **`spend_limits` is a body parameter of
[update](https://developers.cloudflare.com/api/resources/ai_gateway/methods/update/) (`PUT`) and is
not a body parameter of
[create](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create/) (`POST`)** — on
create it appears only in the response schema [published]. So the scripted sequence is **create the
gateway, then `PUT` the spend limits onto it.**

The `PUT` body shape, from the API reference [published]:

```
spend_limits: { enabled?: boolean, rules?: [ {
  limit: number (> 0),          // dollars
  limitType: "cost",
  window: number (> 0),         // seconds
  id?: string, enabled?: boolean,
  technique?: "fixed" | "sliding",
  model?:    { mode: "filter",    values: string[] },
  provider?: { mode: "filter",    values: string[] },
  metadata?: map[ { mode: "partition" } | { mode: "filter", values: string[] } ]
} ] }
```

**A discrepancy between the two primary sources, recorded rather than resolved.** The prose page
says model and provider dimensions each support both "Split by value" and "Filter by value"; the
API schema admits **only `mode: "filter"` for `model` and `provider`**, and offers `"partition"`
(the split mode) **only under `metadata`** [published, both]. Treat the API schema as the binding
one for anything scripted, and expect a `PUT` with `model: {mode: "partition"}` to be rejected.

**The absence that matters most here.** The page's applicability sentence is:

> Spend limits apply to both Unified Billing requests and BYOK requests for models with known
> pricing.

[published] **It does not name Workers AI on standard (postpaid) billing** — which is exactly what
`env.AI.run()` through a gateway left on the default `workers_ai_billing_mode: "postpaid"` is, and
which is neither Unified Billing nor BYOK. [absent] Workers AI does have published per-model
pricing, so "models with known pricing" is satisfied; but **whether a spend limit fires on a
postpaid Workers AI request is not stated anywhere in these docs**, and the design should not be
built on the assumption that it does without testing it. Switching the gateway to
`workers_ai_billing_mode: "unified"` (§4c) moves the route squarely inside the sentence.

**Second absence, stacked on the first.** Per-user spend limits need custom metadata, and the
[custom metadata](https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/) page
(updated **2026-08-05**) describes metadata purely as a logging feature — _"Metadata values […]
will appear in your logs"_ — and the [binding
reference](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/) (updated
**2026-08-20**) documents the binding's `metadata` option as _"Custom metadata to attach to **the
log entry**"_ [published, emphasis added]. **Whether metadata is still carried, and still usable as
a spend-limit dimension, when `collect_logs: false` is nowhere stated** [absent]. A per-user spend
limit on a no-logs gateway is therefore unverified on two counts at once.

### 4b. Caching

From [Caching](https://developers.cloudflare.com/ai-gateway/features/caching/) — updated
**2026-08-27**.

- **Off by default**; the auto-created `default` gateway ships with _"Caching | Off (TTL of 0)"_
  ([Manage gateways](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/),
  updated **2026-09-15**) [published].
- Set by API with `cache_ttl` on gateway create or update [published]. Minimum TTL 60 seconds,
  maximum one month; cacheable request size 25 MB
  ([Limits](https://developers.cloudflare.com/ai-gateway/reference/limits/), updated
  **2026-05-27**) [published].
- Per-request override from the binding: `skipCache`, `cacheTtl`, `cacheKey` [published].
- **Why it is a weak backstop against an attacker.** The cache key is a SHA-256 of provider +
  endpoint + model + provider auth header + **full request body**, so _"caching is based on **exact
  match** of the entire request. Any difference in the body — including messages, tools, or model
  parameters — will result in a separate cache entry."_ [published] An attacker who varies one
  character per request defeats it entirely. Caching bounds cost for _repeated_ legitimate traffic,
  not for hostile traffic.
- **[absent]** The page states the benefit as _"Minimize the number of paid requests made to your
  AI provider"_, but **nowhere do the docs state whether an AI Gateway cache HIT consumes Workers
  AI Neurons**. Do not assume it is free. (Distinct from Workers AI's own [prompt/prefix
  caching](https://developers.cloudflare.com/workers-ai/features/prompt-caching/), updated
  **2026-04-21**, where the docs _are_ explicit: _"Cached input tokens are billed at a discounted
  rate compared to regular input tokens"_ — discounted, **not free** [published].)

### 4c. Unified Billing — prepaid credits as a de facto ceiling

From [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/) —
updated **2026-09-15**.

- Prepaid credits loaded in the dashboard, spent through the gateway; _"A 5% fee is applied to all
  credits purchased […] a $100 credit purchase will result in a $105 charge."_ [published]
- Workers AI can be put on it: set the gateway's Workers AI billing setting to **Unified billing**
  (API: `workers_ai_billing_mode: "unified"`), and _"Workers AI requests routed through this
  gateway will deduct from your AI Gateway credit balance in real time."_ [published]
- **The catch that stops it being a hard cap** [published]:

  > In rare instances, your credit balance may go negative. If this happens, Cloudflare will charge
  > the payment method on file for the outstanding amount.

  A finite credit balance is therefore a soft floor, not a wall — and **auto-top-up, if configured,
  removes even that** [published].

- Loading credits and configuring auto-top-up are described **only** as dashboard flows; the page
  documents no API for either [absent]. `workers_ai_billing_mode` itself **is** an API field
  [published].
- Side effects of switching to unified: prepaid credits grant access to the paid-only models and
  raise frontier-model rate limits (§5) [published] — both of which _increase_ the blast radius, so
  the switch is not free of cost risk.
- One more ceiling comes with it: **Unified Billing request rate is 200 requests per 60 seconds per
  gateway**, and _"When the limit is exceeded, AI Gateway returns a `429` error. This limit does
  not apply to requests that use your own provider keys through BYOK"_
  ([Limits](https://developers.cloudflare.com/ai-gateway/reference/limits/), **2026-05-27**)
  [published]. On unified billing this is an involuntary rate ceiling you get whether you ask for
  it or not.

### 4d. Dynamic Routing — has the right nodes, wrong endpoint

From [Dynamic routing](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/) —
updated **2026-08-07**. Flows composed of nodes including a **Rate Limit** node (_"Enforces number
of requests quotas (per your key, per period) and switches to fallback when exceeded"_) and a
**Budget Limit** node (_"Enforces cost quotas (per your key, per period)"_) [published]. But:

> The OpenAI-compatible endpoint is marked **Deprecated** for standard single-model chat
> completions, but it remains the required way to call dynamic routes. **Dynamic routing is not
> currently available on the [REST API].**

[published] And routes are called by putting the route name where the model goes, via
`/compat/chat/completions` — **not reachable by `env.AI.run("@cf/…")`** as the design currently
calls it. Dynamic routing is therefore out of scope for this route unless the call shape changes.

### 4e. Everything else on the gateway, and what it is configured with

| Control                                                                                                | What it bounds                                                                                                                                                                                                                                                                 | API-settable?                                                        |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `rate_limiting_limit` / `_interval` / `_technique`                                                     | request volume per gateway                                                                                                                                                                                                                                                     | **Yes** — `POST` create and `PUT` update                             |
| `spend_limits`                                                                                         | dollars per window, per bucket                                                                                                                                                                                                                                                 | **Yes — `PUT` only** (absent from `POST` body)                       |
| `cache_ttl`, `cache_invalidate_on_update`                                                              | repeat-request cost                                                                                                                                                                                                                                                            | **Yes** — create and update                                          |
| `authentication`                                                                                       | who may call the gateway                                                                                                                                                                                                                                                       | **Yes** — create and update                                          |
| `workers_ai_billing_mode`                                                                              | postpaid vs prepaid credits                                                                                                                                                                                                                                                    | **Yes** — create and update                                          |
| `byok_only`                                                                                            | blocks Unified Billing fallback for third-party providers — _"Workers AI requests do not use provider credentials. This setting does not block these requests"_ [published]                                                                                                    | **Yes**                                                              |
| `log_management` (10,000–10,000,000) + `log_management_strategy` (`STOP_INSERTING` \| `DELETE_OLDEST`) | log storage, not spend                                                                                                                                                                                                                                                         | **Yes**                                                              |
| Retries: `retry_max_attempts` (≤5), `retry_delay` (≤60,000 ms), `retry_backoff`                        | **increases** worst-case cost per inbound request                                                                                                                                                                                                                              | **Yes**                                                              |
| Loading prepaid credits / auto-top-up                                                                  | the credit balance                                                                                                                                                                                                                                                             | **Dashboard only** [absent for API]                                  |
| Budget alerts (account-wide)                                                                           | nothing — email only                                                                                                                                                                                                                                                           | **Dashboard only** [absent for API]                                  |
| Dynamic Routing rate/budget nodes                                                                      | per-key volume and cost                                                                                                                                                                                                                                                        | Visual interface or JSON config; **not on the REST API** [published] |
| Guardrails, DLP                                                                                        | content, not cost — and Guardrails _adds_ Workers AI cost: it runs `@cf/meta/llama-guard-3-8b` and _"Usage is billed as Workers AI token-based inference"_ ([AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/), **2026-05-19**) [published] | Yes (`guardrails`, `dlp` on `PUT`)                                   |

Gateway count limits: **10 per account on the free plan, 20 on paid**
([Limits](https://developers.cloudflare.com/ai-gateway/reference/limits/), **2026-05-27**)
[published].

**A gateway-adjacent risk worth flagging for the threat model.** From [Authenticated
Gateway](https://developers.cloudflare.com/ai-gateway/configuration/authentication/), updated
**2026-06-17** [published]:

> The `AI Gateway Read`, `Run`, and `Edit` permissions cannot be restricted to a single gateway —
> unlike R2, which supports per-bucket scoping. Any token with `AI Gateway Run` can send requests
> through every gateway in the account […]. For isolation between gateways or tenants, use separate
> Cloudflare accounts or a Worker-side AI Gateway binding rather than relying on token scope.

Inventoria's design already does the right thing here — the binding, not a token in the client — and
Cloudflare's own page says so. **But it also means the operator secret must never be exchangeable
for a Cloudflare token, and that a _Cloudflare_ token leak is a strictly worse event than an
operator-secret leak, because it bypasses the Worker entirely and every per-gateway control with
it.**

---

## 5. Workers AI's own rate limits, independent of any gateway

From [Workers AI limits](https://developers.cloudflare.com/workers-ai/platform/limits/) — updated
**2026-08-07**. _"Rate limits are default per task type, with some per-model limits defined as
follows"_ [published]:

| Task type                                         | Limit                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Text Generation**                               | **300 requests per minute** (per-model exceptions: `@hf/thebloke/mistral-7b-instruct-v0.1-awq` 400, `@cf/microsoft/phi-2` 720, `@cf/qwen/qwen1.5-0.5b-chat` 1500, `@cf/qwen/qwen1.5-1.8b-chat` 720, `@cf/qwen/qwen1.5-14b-chat-awq` 150, `@cf/tinyllama/tinyllama-1.1b-chat-v1.0` 720) |
| Text Embeddings                                   | 3000 rpm (`@cf/baai/bge-large-en-v1.5` 1500)                                                                                                                                                                                                                                           |
| Image Classification / Object Detection           | 3000 rpm                                                                                                                                                                                                                                                                               |
| Text Classification                               | 2000 rpm                                                                                                                                                                                                                                                                               |
| Summarization                                     | 1500 rpm                                                                                                                                                                                                                                                                               |
| ASR / Image-to-Text / Text-to-Image / Translation | 720 rpm                                                                                                                                                                                                                                                                                |

**Frontier models are limited per account, per model** — 20 rpm on standard Workers AI billing, 50
rpm with prepaid AI Gateway credits, for `@cf/moonshotai/kimi-k2.6`, `kimi-k2.7-code` and
`@cf/zai-org/glm-5.2` [published].

The page also notes _"model inferences in local mode using Wrangler will also count towards these
limits"_ and that _"Beta models may have lower rate limits"_ [published].

**These are rate limits, not spend limits.** They bound requests per minute; they do not bound
dollars, and 300 rpm sustained is the $239-a-day figure computed in §2. The docs give **no
account-level daily request or Neuron ceiling on the Paid plan** [absent] — on Paid, the 10,000
Neurons is an allowance, not a ceiling.

---

## 6. Cloudflare's own suggested pattern for protecting a Workers AI endpoint

**There is no single page in the Workers AI or AI Gateway docs titled "protecting your endpoint
from abuse", and no numbered recommended pattern** [absent]. What the docs do state, scattered:

- **AI Gateway is positioned as the control layer.** [AI Gateway
  overview](https://developers.cloudflare.com/ai-gateway/) (**2026-04-20**): _"control how your
  application scales with features such as caching, rate limiting, as well as request retries,
  model fallback"_ [published]. The [Features
  index](https://developers.cloudflare.com/ai-gateway/features/) (**2026-06-05**) lists Rate
  Limiting's benefits as _"Prevent API quota exhaustion"_ and _"Control costs and usage patterns"_,
  and Spend Limits' as _"Automatic request blocking when budget is exceeded"_ [published].
- **Authenticate the gateway.** The logging page: _"We recommend using an authenticated gateway
  when storing logs to prevent unauthorized access and protects against invalid requests that can
  inflate log storage usage"_ [published]. Auto-created gateways already ship with
  `Authentication | On` [published].
- **Rate-limit large prompts at the WAF.** [Token
  counting](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/token-counting/)
  (**2026-04-16**) is the closest thing to an endorsed recipe. It exposes
  `cf.llm.prompt.token_count` and recommends two rules by name [published]: **block oversized
  prompts** (`cf.llm.prompt.token_count gt 4000`, action _Block_) and **rate limit large prompts**
  (`cf.llm.prompt.token_count gt 2000`, _"10 requests per minute per IP, with an action of Block or
  Managed Challenge"_) — explicitly _"to prevent abuse where attackers send excessively long prompts
  to consume model resources."_ Caveats the page states itself: the count is an estimate from a
  general-purpose tokenizer, **input tokens only**, and extracted only from known provider JSON
  paths. This is part of **AI Security for Apps** (formerly Firewall for AI), which
  [Get started](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/get-started/)
  (**2026-08-25**) says _"is only available in the application security dashboard"_, with the _Log_
  action _"only available on Enterprise plans"_ [published].

### Zone-level Rate Limiting Rules (WAF): availability and how they are expressed

From [Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) — updated
**2026-08-25**. The availability table, reduced to what matters for a hobby-plan Worker route
[published]:

|                                 | Free                   | Pro                                            | Business                        | Enterprise                                                       |
| ------------------------------- | ---------------------- | ---------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| Number of rules                 | **1**                  | 2                                              | 5                               | 100                                                              |
| Fields usable in the expression | **Path, Verified Bot** | Host, URI, Path, Full URI, Query, Verified Bot | + Method, Source IP, User Agent | General request + header fields                                  |
| Counting characteristics        | **IP**                 | IP                                             | IP, IP with NAT support         | IP, Query, Host, Headers, Cookie, ASN, Country, Path, JA3/JA4, … |
| Counting period                 | **10 s only**          | up to 1 min                                    | up to 10 min                    | up to 65,535 s                                                   |
| Mitigation timeout              | **10 s only**          | up to 1 h                                      | up to 1 day                     | up to 1 day                                                      |
| Custom counting expression      | No                     | No                                             | Yes                             | Yes                                                              |

So on **Free you get exactly one rule, matching only on path, counting only by IP, with a 10-second
window and a 10-second block.** That is enough to blunt a single-host flood and nothing more: **the
operator secret is a header, and header fields are not available in the expression below
Enterprise**, so a Free or Pro rule cannot rate-limit _per key_ — only per IP. Client blocked by a
rate limiting rule sees [Error
1015](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1015/)
(**2026-05-14**), _"You are being rate limited"_ [published].

**Three properties that weaken it further**, all from
[Troubleshoot rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/troubleshooting/)
(**2026-05-05**) and the index page [published]:

- **Fail-open.** _"Cloudflare rate limiting rules operate in fail-open mode […] When the underlying
  infrastructure experiences high load, Cloudflare may skip rate counter updates and rate limit
  enforcement […] There is no customer-visible signal for fail-open events."_
- **Per-data-centre counting.** _"Rate limiting counters are maintained per Cloudflare data center.
  Traffic distributed across many data centers may keep per-data-center rates below the threshold
  even when the aggregate rate exceeds it."_ A distributed attacker divides the effective limit by
  the number of colos it reaches.
- **Delay.** _"Rate limiting rules are not designed to allow a precise number of requests to reach
  your origin server. There may be a delay of up to a few seconds […] excess requests could still
  reach the origin before Cloudflare enforces a mitigation action."_

Also relevant if the route ever fetches within its own zone: _"Cloudflare may count Workers
subrequests on the same zone as separate requests"_, excludable with
`cf.worker.upstream_zone` [published].

**How they can be expressed:**

- **Dashboard** — [Create a rate limiting rule in the
  dashboard](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/).
- **API** — yes, via the Rulesets API.
  [Create a rate limiting rule via API](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/)
  (**2026-04-16**): `POST` a rule carrying a `ratelimit` object to the `http_ratelimit` phase entry
  point ruleset, with `characteristics`, `period`, `requests_per_period`, `mitigation_timeout`
  [published]. Rate limiting rules _"must appear at the end of the rules list"_ [published].
- **Terraform** — documented:
  [Rate limiting rules configuration using Terraform](https://developers.cloudflare.com/terraform/additional-configurations/rate-limiting-rules/)
  [published].
- **wrangler — no.** The [Wrangler configuration
  reference](https://developers.cloudflare.com/workers/wrangler/configuration/) (**2026-09-04**)
  contains **no key for rate limiting rules or rulesets** (a case-insensitive search for
  "ratelimit" over the whole page returns zero hits) [absent].
- **DNSControl — not documented by Cloudflare at all.** DNSControl appears nowhere in these pages
  [absent]; it is a third-party DNS-as-code tool and the Cloudflare docs make no claim about it
  either way. Anything DNSControl can do here would have to be established from DNSControl's own
  documentation, which is outside this note's source discipline.

### The Worker-side alternative Cloudflare documents, which _is_ wrangler-expressible

[Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) —
updated **2026-04-23** — is a Workers binding, _"backed by the same infrastructure that serves rate
limiting rules"_ [published]. Declared in the Wrangler configuration file:

```jsonc
{
  "ratelimits": [
    {
      "name": "MY_RATE_LIMITER",
      "namespace_id": "1001",
      "simple": { "limit": 100, "period": 60 },
    },
  ],
}
```

and used as `const { success } = await env.MY_RATE_LIMITER.limit({ key })`, returning `429` in your
own code when `success` is false [published]. Properties [published]:

- `period` **must be either 10 or 60 seconds**; `limit` is any number.
- **The key is yours to choose** — and Cloudflare's own best-practice note recommends _"API keys in
  `Authorization` HTTP headers, URL paths or routes, specific query parameters […] and/or user IDs
  and tenant IDs"_ and explicitly advises **against** IP addresses: _"many users may share a single
  IP, especially on mobile networks or when using privacy-enabling proxies."_ **This is the only
  documented mechanism that lets Inventoria rate-limit on the operator secret itself** (or a hash
  of it) rather than on IP.
- Two bindings sharing a `namespace_id` share counters, _"even across different Workers on the same
  account"_.
- **Locality**: _"Rate limits that you define and enforce in your Worker are local to the
  Cloudflare location that your Worker runs in […] there is a unique limit per Cloudflare
  location."_ Same per-colo dilution as the WAF rules.
- **Accuracy**: _"permissive, eventually consistent, and intentionally designed to not be used as
  an accurate accounting system."_
- **Monitoring**: _"Rate limiting bindings are not currently visible in the Cloudflare dashboard"_
  — observe the 429s through Workers Logs/Traces or emit to Analytics Engine.
- **[absent]** The page states no plan restriction and the docs do not say it is Paid-only.
- **[absent]** The Wrangler configuration _reference_ page does not document the `ratelimits` key;
  only this runtime-API page does. If a build ever validates the config against that reference, do
  not be surprised.

**Also relevant, and free:** the Workers Free plan's own daily request ceiling. [Workers
limits](https://developers.cloudflare.com/workers/platform/limits/) (**2026-09-05**): _"Accounts on
the Workers Free plan have a daily request limit of 100,000 requests, resetting at midnight UTC.
When a Worker exceeds this limit, Cloudflare returns **Error 1027**"_, with a per-route **fail open**
(bypass the Worker) or **fail closed** (`1027` error page — _"Use this for security-critical
Workers"_) choice [published].

---

## 7. Error codes a caller sees

| Condition                                         | Internal code            | HTTP                  | Text / source                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Workers AI daily free allocation exhausted**    | `3036`                   | `429`                 | _"You have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage."_ — [Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/), **2026-07-29**                        |
| **AI Gateway rate limit exceeded**                | —                        | `429`                 | _"the server will respond with a `429 Too Many Requests` status code and your request will not be processed"_ — [Rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/), **2026-06-05**. **No internal code and no response body documented** [absent] |
| **AI Gateway spend limit exceeded**               | —                        | `429`                 | _"AI Gateway returns a `429 Too Many Requests` response"_ — [Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/), **2026-09-09**. **No body documented** [absent]; indistinguishable from the rate-limit 429 on status alone                          |
| **Unified Billing gateway rate (200 req / 60 s)** | —                        | `429`                 | [Limits](https://developers.cloudflare.com/ai-gateway/reference/limits/), **2026-05-27**                                                                                                                                                                                             |
| **Llama terms not accepted**                      | **`5016`**               | **`403`**             | _"User has not agreed to Llama3.2 model terms"_ — [Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/), **2026-07-29**. Confirms the previously noted 5016; note the HTTP status is **403, not 429**, and the text names **Llama3.2** specifically     |
| Model requires a paid plan                        | `5035`                   | `403`                 | _"This model requires a Workers Paid plan."_ — same page                                                                                                                                                                                                                             |
| Account blocked / not allowed for private model   | `3023` / `5018` / `3041` | `403`                 | same page                                                                                                                                                                                                                                                                            |
| Out of capacity                                   | `3040`                   | `429`                 | _"No more data centers to forward the request to"_ — same page. **Shares HTTP 429 with allocation exhaustion and both gateway limits**                                                                                                                                               |
| Workers Free daily request limit                  | **`1027`**               | —                     | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), **2026-09-05**                                                                                                                                                                                         |
| WAF rate limiting rule block                      | **`1015`**               | —                     | [Error 1015](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1015/), **2026-05-14**                                                                                                                                         |
| Request too large / timeout / aborted             | `3006` / `3007` / `3008` | `413` / `408` / `408` | [Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/)                                                                                                                                                                                                   |

**[absent]** The Workers AI errors page documents **no error for a Workers _Paid_ account's Workers
AI spend** — consistent with there being no ceiling to hit.

**A practical consequence for the route's UI:** five distinct conditions — free allocation
exhausted, gateway rate limit, gateway spend limit, unified-billing gateway rate, and out of
capacity — **all surface as HTTP 429**, and only the first and last carry a documented internal
code. Any user-facing message that claims to know _which_ 429 it got is inferring, not reading.

---

## What this means for the backstop

**Ranked by whether it survives a leaked operator secret — i.e. whether it still binds when the
attacker is sending well-formed, correctly-authenticated requests as fast as it can.**

**Tier 1 — survives a leaked key, and stops spend outright.**

1. **Stay on the Workers Free plan.** The 10,000-Neuron daily allocation is a hard stop with a
   ceiling of **$0.00**: internal `3036` / HTTP `429`, reset 00:00 UTC [published]. Nothing else on
   this list caps the bill at zero. Its cost is symmetric — the same stop hits the legitimate user,
   and the ~200–570 calls/day computed in §2 is the whole day's budget for everyone. It is also the
   only Tier-1 item that needs **no configuration at all**, which is the same thing as saying there
   is nothing to misconfigure. **Not API-scriptable — it is a plan choice** (and the verification is
   simply that the account has no Workers Paid subscription).
2. **AI Gateway spend limits.** A dollar budget per window that **blocks with 429** [published].
   The only mechanism on this list that is denominated in money rather than requests, which is what
   the ticket actually wanted. **API-scriptable — but `PUT` only**, so the sequence is `POST`
   create → `PUT` spend_limits → `GET` to verify. **Two unverified assumptions sit under it**: that
   it fires for Workers AI on postpaid billing (the page names only Unified Billing and BYOK), and
   that its metadata dimensions work at all with `collect_logs: false`. Both must be tested before
   the design leans on it. Eventually consistent, so expect overshoot on a burst.
3. **AI Gateway rate limiting.** Fixed or sliding window, uniform across the gateway, **429** when
   tripped [published]. Blunt — no per-key dimension — but that is exactly right here, because the
   threat model has **one** key and it is compromised. **Fully API-scriptable in a single `POST`
   alongside `collect_logs: false`**, with a `GET` reading `rate_limiting_limit`,
   `rate_limiting_interval` and `rate_limiting_technique` straight back: the cleanest fit for a
   how-to with a verification command. Carries the same undocumented interaction with
   `collect_logs: false`.

**Tier 2 — survives a leaked key, but bounds volume rather than money, or leaks around the edges.**

4. **The Workers Rate Limiting binding.** `env.RATE_LIMITER.limit({ key })` inside the route, keyed
   on the operator secret (or its hash) rather than IP — Cloudflare's own best-practice note
   recommends exactly that key choice [published]. Declared **in the Wrangler configuration file**,
   so it ships with the Worker and is reviewable in the repo. Weakened by per-colo locality and by
   being _"permissive, eventually consistent"_ [published], and invisible in the dashboard. Period
   is restricted to 10 or 60 seconds.
5. **Workers Free's 100,000 daily requests → Error 1027**, with the route's `fail closed` mode
   [published]. A second, cruder Free-plan ceiling behind the Neuron one.
6. **Workers AI's own per-task rate limits** — 300 rpm for text generation [published]. Involuntary
   and always on, but they bound the _rate_ of spending, not its total: §2 computes 300 rpm
   sustained at roughly **$239–$551 a day** on Paid. **Not configurable.**

**Tier 3 — does not survive a leaked key.**

7. **Zone-level WAF Rate Limiting Rules.** On Free: one rule, path-only expression, IP-only
   counting, 10-second window, 10-second block [published] — and the operator secret is a header,
   which is **not an available field below Enterprise**, so it cannot count per key. Plus
   **fail-open under load with no visible signal**, **per-data-centre counters**, and a few seconds
   of enforcement delay [published]. Against a distributed attacker with a valid key this is close
   to nothing. Expressible via the **Rulesets API** and **Terraform**; **not in wrangler**, and
   Cloudflare documents nothing about DNSControl.
8. **Caching.** Cache key is an exact hash of the full request body [published]; one varied
   character per request defeats it. Bounds repeat legitimate traffic, not abuse. And the docs
   **never say a gateway cache HIT is free of Neurons** [absent].
9. **Unified Billing credits.** A finite balance looks like a cap until you read the caution: _"your
   credit balance may go negative […] Cloudflare will charge the payment method on file"_
   [published], and auto-top-up removes the floor entirely. It also _raises_ frontier-model rate
   limits and unlocks paid-only models, enlarging the blast radius. Credit loading is
   **dashboard-only**; only `workers_ai_billing_mode` is an API field.
10. **Budget alerts.** **Zero backstop value.** _"Informational only. They do not pause or cap
    usage."_ [published] **Dashboard-only**, Pay-as-you-go accounts only. Worth configuring as
    _detection_ — it is how you learn the key leaked — but it must never be described as a cap.

**API-scriptable versus dashboard-only, at a glance:**

| Scriptable with a `curl` + a `GET` to verify                                                                                          | Dashboard-only                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Gateway create with `collect_logs`, `cache_ttl`, `rate_limiting_*`, `authentication`, `workers_ai_billing_mode`, `byok_only` (`POST`) | Budget alerts                                                |
| Gateway `spend_limits` (`PUT` only)                                                                                                   | Loading AI Gateway credits, auto-top-up                      |
| WAF rate limiting rules (Rulesets API, `http_ratelimit` phase)                                                                        | Dynamic Routing flows (visual/JSON, **not** on the REST API) |
| Workers rate-limit binding (wrangler config, deployed with the Worker)                                                                | AI Security for Apps enablement (app security dashboard)     |

**The shortest honest recommendation this research supports**, with the three tests it still owes:
put the route on a gateway created in one `POST` with `collect_logs: false` **and** a
`rate_limiting_limit` / `rate_limiting_interval` / `rate_limiting_technique: "sliding"`; add a
`spend_limits` rule by `PUT`; add the Workers rate-limit binding keyed on the secret; keep the
account on Workers Free for as long as the route's real traffic fits inside 10,000 Neurons a day,
because that is the only ceiling that is actually zero. Then **verify by experiment**, because the
docs do not say: (a) that gateway rate limiting still enforces with `collect_logs: false`, (b) that
a spend limit fires on a postpaid Workers AI request, and (c) whether a gateway cache HIT consumes
Neurons. Do not write a how-to that asserts any of those three until one of us has watched it
happen.

---

## Sources

Every page below was read on **2026-09-17**; the date given is the page's own "Last updated".

| Page                                                                                                                                                                 | Updated                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| [Billing — Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)                                                                           | 2026-05-29                    |
| [Billing — Monitor billable usage](https://developers.cloudflare.com/billing/manage/billable-usage/)                                                                 | 2026-06-30                    |
| [Billing — Optimize costs](https://developers.cloudflare.com/billing/manage/optimize-costs/)                                                                         | 2026-05-04                    |
| [Billing — Usage-based billing](https://developers.cloudflare.com/billing/understand/usage-based-billing/)                                                           | 2026-05-29                    |
| [Workers AI — Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)                                                                               | 2026-08-28                    |
| [Workers AI — Limits](https://developers.cloudflare.com/workers-ai/platform/limits/)                                                                                 | 2026-08-07                    |
| [Workers AI — Errors](https://developers.cloudflare.com/workers-ai/platform/errors/)                                                                                 | 2026-07-29                    |
| [Workers AI — Prompt caching](https://developers.cloudflare.com/workers-ai/features/prompt-caching/)                                                                 | 2026-04-21                    |
| [Workers — Pricing](https://developers.cloudflare.com/workers/platform/pricing/)                                                                                     | 2026-08-28                    |
| [Workers — Limits](https://developers.cloudflare.com/workers/platform/limits/)                                                                                       | 2026-09-05                    |
| [Workers — Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)                                                       | 2026-04-23                    |
| [Workers — Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)                                                                | 2026-09-04                    |
| [AI Gateway — overview](https://developers.cloudflare.com/ai-gateway/)                                                                                               | 2026-04-20                    |
| [AI Gateway — Features index](https://developers.cloudflare.com/ai-gateway/features/)                                                                                | 2026-06-05                    |
| [AI Gateway — Rate limiting](https://developers.cloudflare.com/ai-gateway/features/rate-limiting/)                                                                   | 2026-06-05                    |
| [AI Gateway — Spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/)                                                                     | 2026-09-09                    |
| [AI Gateway — Caching](https://developers.cloudflare.com/ai-gateway/features/caching/)                                                                               | 2026-08-27                    |
| [AI Gateway — Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)                                                               | 2026-09-15                    |
| [AI Gateway — Dynamic routing](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/)                                                               | 2026-08-07                    |
| [AI Gateway — Manage gateways](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/)                                                           | 2026-09-15                    |
| [AI Gateway — Authenticated Gateway](https://developers.cloudflare.com/ai-gateway/configuration/authentication/)                                                     | 2026-06-17                    |
| [AI Gateway — Request handling](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/)                                                        | 2026-09-14                    |
| [AI Gateway — Logging](https://developers.cloudflare.com/ai-gateway/observability/logging/)                                                                          | 2026-06-15                    |
| [AI Gateway — Analytics](https://developers.cloudflare.com/ai-gateway/observability/analytics/)                                                                      | 2026-04-20                    |
| [AI Gateway — Costs](https://developers.cloudflare.com/ai-gateway/observability/costs/)                                                                              | 2026-04-20                    |
| [AI Gateway — Custom metadata](https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/)                                                          | 2026-08-05                    |
| [AI Gateway — Limits](https://developers.cloudflare.com/ai-gateway/reference/limits/)                                                                                | 2026-05-27                    |
| [AI Gateway — Pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)                                                                              | 2026-05-19                    |
| [AI Gateway — Troubleshooting](https://developers.cloudflare.com/ai-gateway/reference/troubleshooting/)                                                              | 2026-04-20                    |
| [AI Gateway — Workers AI provider](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/)                                                          | 2026-08-07                    |
| [AI Gateway — Workers Bindings](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/)                                                          | 2026-08-20                    |
| [API — Create AI Gateway](https://developers.cloudflare.com/api/resources/ai_gateway/methods/create/)                                                                | (API reference, no page date) |
| [API — Update AI Gateway](https://developers.cloudflare.com/api/resources/ai_gateway/methods/update/)                                                                | (API reference, no page date) |
| [API — Set spending limit (deprecated)](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/billing/subresources/spending_limit/methods/create/) | (API reference, no page date) |
| [Changelog — Control AI costs with spend limits](https://developers.cloudflare.com/changelog/post/2026-06-05-spend-limits/)                                          | 2026-06-05                    |
| [WAF — Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)                                                                              | 2026-08-25                    |
| [WAF — Create a rate limiting rule via API](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/)                                                   | 2026-04-16                    |
| [WAF — Troubleshoot rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/troubleshooting/)                                                 | 2026-05-05                    |
| [WAF — Token counting](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/token-counting/)                                                        | 2026-04-16                    |
| [WAF — Get started with AI Security for Apps](https://developers.cloudflare.com/waf/detections/ai-security-for-apps/get-started/)                                    | 2026-08-25                    |
| [Support — Error 1015](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1015/)                               | 2026-05-14                    |
