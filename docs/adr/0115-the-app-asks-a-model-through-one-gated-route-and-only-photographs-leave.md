# ADR 0115: The app asks a model through one gated route, and only photographs leave

**Status:** Accepted  
**Date:** 2026-09-28  
**Amends:** [ADR-0034](0034-label-photo-food-capture.md) §4 (AI autofill stops being deferred, and none of §4's grounding survives: not the provider, not the model, not the cost figure), §5 (its "only the three barcode/label doors arrive with photos" is half-shipped), §7 (`method: "ai-confirmed"` becomes writable, under a ratchet, and `fields` never meant authorship), and §1's "dismissible" nudge (shipped, it is merely ignorable)  
**Implemented:** the map is [#474](https://github.com/palebluebytes/inventoria/issues/474); the account-side half is [#490](https://github.com/palebluebytes/inventoria/issues/490) `c748f139` ([`docs/how-to-operate-the-model-route.md`](../how-to-operate-the-model-route.md)). The app-side half is unbuilt and cut as this record's implementation tickets.

## Context

Inventoria does not send readable things anywhere, and that is enforced rather
than merely intended. A meal crosses through a relay that cannot read it
([ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md)); a
deposit is sealed against the store that holds it
([ADR-0096](0096-devices-converge-without-both-being-awake-through-a-store-of-sealed-deltas.md));
`wrangler.toml` turns Workers traces and invocation logs off and
`scripts/worker-config-check.mjs` fails the build if either comes back, holding
those claims _in the user's name_. The one outward path that sends readable data
— the Open Food Facts contribution — is structured text the user typed about a
product on a public shelf, and it ships no photo at all (ADR-0034 §8).

A nutrition-label photograph is none of those things. It is a raw camera frame
from a kitchen, and what else is in it is not knowable in advance.

**What forced the decision.** ADR-0034 §4 deferred AI autofill behind a committed
seam, `src/lib/food/ai-autofill.ts`, and #51 — _"decide the extraction mechanism
by testing on the sample labels"_ — closed **without the test being run**. The
seam has never been called from app code. Every document written on top of it
since has assumed a model could read these labels, at a cost, on a provider, with
a model id, none of which had been checked: #49's catalogue was cached 2026-06-24
and every one of #62's three concrete instructions is wrong against today's tree
([#475](https://github.com/palebluebytes/inventoria/issues/475)). So the question
was not _how do we build this_ but _may we, and can it work at all_ — which is
why the effort was charted as a map rather than planned as a feature.

**The alternatives that were genuinely live, and what ruled each out.**

- **Do not build it.** [#482](https://github.com/palebluebytes/inventoria/issues/482)
  was allowed to kill the lane and did not: `@cf/meta/llama-4-scout-17b-16e-instruct`
  read **154 of 154** printed rows across 18 runs with zero fabrications and zero
  malformed output. Three of its four candidates would have closed the map — one
  invented micronutrients by re-labelling the macro rows, one scored 29.5%, one
  silently omitted printed rows.
- **No consent at all** — #62's configured key silently authorising every send.
  `CONTEXT.md`'s **Consent** term names that failure in terms: _"the switch on a
  settings screen is therefore the default for a consent and never the consent."_
- **Open Food Facts' ceremony**, a default-off master toggle seeding a
  per-capture checkbox. Refused because an OFF contribution is a **rider** on
  "save this food" and needs its own tick to have any moment of agreement at all,
  where a model call is a standalone act the user reached for.
- **A bare `env.AI.run()`**. Cloudflare documents that AI Gateway creates a
  `default` gateway with log collection **on** at the first authenticated
  request, and never says whether a bare call lands in it. §3.4 makes the
  question moot instead of betting on the answer.
- **The extractor in `src/lib/food/`, imported by the Worker** — #62's design,
  refused by `scripts/worker-closure-check.mjs`'s allowlist, and then refused
  again on its own merits (§7).
- **A shared wire type across the boundary.** Refused a third time, on the
  pattern `src/lib/p2p/relay-wire.ts` and `src/lib/p2p/deposit-store.ts` already
  won twice: restate, and let a test assert the two agree.
- **A model-adjudicated density table**, and then a model **naming a density
  class** ([#481](https://github.com/palebluebytes/inventoria/issues/481),
  [#499](https://github.com/palebluebytes/inventoria/issues/499)). Both refused;
  the verdict is [ADR-0108](0108-a-volume-food-is-weighed-by-the-class-you-say-it-is.md)'s
  2026-09-16 Amendment, not this record's.
- **The plate estimator** ([#509](https://github.com/palebluebytes/inventoria/issues/509))
  and **the pairing proposer** ([#247](https://github.com/palebluebytes/inventoria/issues/247)).
  Both measured, both refused. §12.

**Research and measurement this record consumes.** The prototypes are
`prototype/482-label-read` (80 billed calls, four candidates, four photographs,
two resolution arms) and `prototype/509-plate-estimate` (50 weighed dishes);
`docs/research/515-plate-calorie-ground-truth.md` on `research/515-plate-ground-truth`;
and `docs/research/479-workers-ai-spend-backstop.md` on the throwaway branch
`research/479-workers-ai-spend-backstop` (`ad71fbb3`). Every claim below about
Cloudflare was read from primary documentation or measured against the live
account, and dated; none is quoted from memory, which is the rule the map set
itself after #49.

**Scope.** This record covers the capability — one route, one gate, one key, what
leaves, what is agreed, what comes back, what happens when it cannot be reached,
what the ledger records — and the label autofill as its single live consumer. It
does **not** cover: the twelve micronutrient rows' place in the _form_ (still
open, #52/#57's surface); stripping EXIF from photographs already in the ledger
([#492](https://github.com/palebluebytes/inventoria/issues/492)); the label
form's salt row storing a printed gram figure as milligrams of sodium
([#508](https://github.com/palebluebytes/inventoria/issues/508), §6.2); the
origin badge's false hand-authorship claim on a received twin
([#514](https://github.com/palebluebytes/inventoria/issues/514)); a second
provider behind the seam; or multi-user bring-your-own-key. Each is filed, and
each asks no model.

## Decision

### 1. This is a deliberate exception to "nothing readable leaves the device", and it is counted

The posture that breaks is **readable** egress, not egress. A label photograph
already leaves this device today, sealed: ADR-0096 §15 sizes a label-photo
deposit at **310,958 B** going to the store. What is new is that a third party
can read it.

**So the app has exactly one readable egress, it is a photograph, and it is
counted.** Anyone adding a second is adding the second, not continuing a pattern.
A reader asking _when did we decide the app could send a photograph somewhere?_
is answered here, and the sentence is not softened: the user's photographs of
their kitchen go to Cloudflare, who will not say for how long they keep them.

**The EU claim narrows to the store, in this record and in `wrangler.toml`'s own
comment.** That file's `jurisdiction = "eu"` is _"a claim the bar sentence makes
about where sealed personal data rests"_, and the store's promise concerns sealed
data at rest indefinitely. A model call is readable data in flight for one
inference, to a GPU whose location Cloudflare declines to constrain (§3.3). The
promise does not generalise across the two, and the comment the next maintainer
actually reads has to say so as well as the record does.

### 2. The capability: one gated route, task-agnostic, on the site's own Worker

`POST /api/model` on `worker/src/index.ts`, a **fourth route on the same script**
that already carries the proxy, the relay and the store — for the reason those
are: a second Worker means a second dashboard-configured build that nothing in
this repo records, which is the failure
[ADR-0070](0070-the-proxy-is-part-of-the-site-it-serves.md) was written to end.

The provider is **Cloudflare Workers AI**, through an explicit AI Gateway. The
model is `@cf/meta/llama-4-scout-17b-16e-instruct`, chosen by measurement (§5.1),
and it is a **constant in `worker/src/`** rather than anything the client names.

The route is task-agnostic because everything that made this an effort — the
gate, the key, who sees the bytes, what happens when it fails, confirm before
save — is task-independent, and only the payload differs. The generality that
pays is **one string field**, `task`: the Worker needs the switch the moment it
owns two prompts. A polymorphic payload is the generality that does not pay and
is refused.

### 3. What leaves the device, and what is agreed before it goes

#### 3.1 A closed list, stated positively

The request carries **the photographs in the capture array at the moment of the
tap, and the name of the task**. Nothing else: not the barcode, not a name OFF
already returned, not the locale, not a device id, not anything folded out of the
ledger — **and not the prompt** (§5.2). Only photographs leave, which is what
makes the disclosure copy literally true rather than nearly true.

**Every outbound image is re-encoded unconditionally.** `reduceCapturedPhoto`
(`src/lib/food/image-file.ts`) has a `{ kind: "keep" }` branch: a photo whose
longer edge is already ≤1600 px is stored exactly as `FileReader` read it, with
no canvas round-trip, so its EXIF survives — GPS tag included. A canvas
re-encode drops EXIF as a side effect of a pass the outbound path would tolerate
anyway. [ADR-0066](0066-a-captured-photo-is-bounded-before-it-becomes-a-datom.md) §3's
reasoning is untouched: it is about not putting a small upload through a needless
lossy pass _into storage_. An outbound frame is a different reader with a
different threat.

The residue is recorded rather than fixed here: photographs already in the ledger
keep their EXIF and the store already holds sealed copies of them (#492).

#### 3.2 The ceremony: a button whose copy states the egress, plus one first-use sheet

**No checkbox, and no master toggle.** A model call is a standalone act — nothing
else is happening, the user reached for it deliberately, and there is a tap per
send — which satisfies **Consent**'s actual requirement, _an answer given at the
point of the act it authorises_, **provided the button's own copy carries the
disclosure**. That is what makes the tap informed rather than merely deliberate.

The cost is stated rather than overlooked: the fiftieth photograph leaves with
less friction than the first, and an informed tap is a weaker guarantee than an
explicit tick.

**The first-use sheet interrupts exactly once and then stays reachable.** The
persisted flag decides whether the sheet **blocks**, never whether it exists,
because its retention paragraph is the only place in the app where that
disclosure is ever stated, and a strictly one-time sheet would make the app's one
honest sentence about its one egress unreachable by design. The flag lives in
`src/lib/stores/device-settings.ts` — it records how the app is configured on
this device, which is
[ADR-0085](0085-a-setting-is-never-a-datom-and-a-consent-is-not-a-setting.md) §1's
own test — and it is **not** what
[ADR-0086](0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) §2
deleted, since those two seeded a box shown and answered again every time.

**Consent is recorded on the act, not on the outcome.** A failed call does not
re-open the sheet; re-asking would read as retracting a thing the user already
agreed to.

#### 3.3 What is known about retention, and what is not

Read 2026-09-17. Every claim here is replaceable and is to be re-measured on any
provider pivot, in ADR-0096 §15's voice.

**Documented and quotable:** Cloudflare _"does not use your Customer Content to
(1) train any AI models made available on Workers AI or (2) improve any
Cloudflare or third-party services"_; inputs and outputs are Customer Content,
owned by us. Every model in the catalogue is Cloudflare-hosted — third-party
models _"require an AI Gateway and use Unified Billing"_ and cannot be reached on
the bare binding at all.

**Four absences, each stated as an absence, because the app may not claim what
the docs do not say:**

1. **No retention guarantee.** The data-usage page never says inputs are not
   retained, states storage only conditionally, and gives **no duration
   anywhere**. So the app can say _it isn't trained on_; it may not say _it isn't
   kept_.
2. **No documented locality.** Workers AI is **`✘ Not compatible`** with Regional
   Services. Customer Metadata Boundary governs where logs and analytics rest,
   not where inference runs. The model may run anywhere.
3. **Prompt caching is on by default** for select models, duration undocumented.
   Accepted and recorded rather than refused: derived input tensors are a far
   weaker disclosure than the photograph itself, and the proportionate response
   is an honest line rather than a claim that nothing is stored.
4. **Bare-binding logging is undocumented.** §3.4 is the decision that stops it
   mattering.

#### 3.4 The call goes through an explicit gateway with logging off

AI Gateway stores _"logs of individual requests, including the user prompt, model
response"_, and log collection is **on by default for every gateway**, including
one Cloudflare creates for you at the first authenticated request.

So the route names a gateway rather than trusting an absence. **`inventoria-model-route`**
exists, created 2026-09-17, verified by an independent read-back at
`collect_logs: false`, `cache_ttl: 0`, `is_default: false`, rate-limited **20
requests / 60 s, sliding** (#490). The census found **zero gateways** on this
account beforehand, so nothing has ever called bare here and no AI Gateway log
has ever been written.

This is ADR-0072 §9's move applied to a new ambiguity: _"the chosen posture makes
the question moot, which is the argument for it under uncertainty."_ Asserting
instead that no `default` gateway exists would be cheaper and fragile — a claim
about an absence that any future first request silently falsifies.

**Two undocumented facts, measured rather than assumed.** Rate limiting does
**not** require log collection, so there is no trade: logging stays off and the
limit stays on. And the gateway's limit and its logging setting **bind only calls
that name the gateway** — the identical request with the gateway omitted answered
`200` while the gateway was fully rate-limited. A refactor dropping the gateway
from the call options would escape both protections at once, invisibly, and
nothing on the account would notice. That is why §13's call-options constant is
load-bearing rather than belt-and-braces.

**The per-call option is `collectLog`, camelCase and singular**, not the gateway
resource's `collect_logs`. An unknown key is silently ignored, so a constant
spelling it the other way would pin a no-op and its test would pass green. Pass
`{ gateway: { id: "inventoria-model-route" } }` and rely on the account setting,
or spell `collectLog: false` correctly; never `collect_logs`.

### 4. The gate: one operator key, and denial is the reason

#### 4.1 The money argument is void on this account, and the record says so

The account is on **Workers Free**, where 10,000 Neurons/day is a hard stop with
**no overage path**. A leaked key therefore costs **$0 by construction**, not by
configuration — a stronger guarantee than anything Cloudflare sells. The
account-wide dollar cap that the obvious design assumes **does not exist**:
Budget alerts _"are informational only. They do not pause or cap usage"_, and the
old spending-limit endpoint _"always responds 403"_.

A record whose stated reason is false on the deployed plan is worse than no
record, so the gate rests on what survives:

- **Denial, whose blast radius is the whole Worker.** 10,000 Neurons/day is
  exactly what an attacker can burn, and Workers Free carries a second structural
  ceiling on daily requests. The relay and the store are routes on **this same
  script**, so an ungated model route is a denial vector against **meal send and
  device convergence**, not merely against the autofill.
- **An open proxy.** Ungated, the route is free inference for anyone who finds
  it, spent under this account's identity.

**And one harm named as absent, deliberately: a leaked key buys no disclosure.**
The route is provably amnesiac (§13), reads nothing out of the jar, and runs
under `collect_logs: false`. An attacker holding the key learns nothing about the
user. That absence is what makes one shared secret proportionate rather than
lazy.

#### 4.2 The mechanics are `worker/src/store.ts`'s, copied whole

One module, and **one `respond()` through which every branch passes, refusals
included**, so no branch can ship without `securityHeaders` and
`Cache-Control: no-store`. **No CORS headers at all** — a cross-origin caller is
not a case this route has. The shared `corsHeaders` record is **not** touched,
and that is a decision rather than an omission: admitting a `POST` and an auth
header there would silently widen the scraper proxy at the same time.

The key arrives as `Authorization: Bearer <key>`. The comparison is
**constant-time** and **`401` is answered before any `env.AI.run`**, so a bad key
costs zero Neurons — asserted by a fake `Ai` whose `run` throws if called. The
comparison lives behind **one function**, so that _is this key valid_ can later
become _which key is this_ without any caller changing. That one function is the
whole of what "per-user keys are not foreclosed" costs.

**The `Origin` check is refused, and the refusal is recorded** so that _we forgot_
and _we considered it and it catches nothing_ stay distinguishable. The attacker
holds a leaked key and uses `curl`, which sets whatever `Origin` it likes; a
browser on a hostile origin is already stopped by the **absence** of CORS
headers. And there is no perimeter defence to graduate it into: Free-plan WAF
rate-limiting rules **cannot read request headers at all**, count per data centre,
and fail open under load with no visible signal. A check that stops nobody,
shipped beside a comment admitting it stops nobody, teaches the next reader that
this codebase's guards are decorative.

#### 4.3 On the device: a fourth secret, named for the route, with no env fallback

**`model_route_key`**, a fourth `SecretKey` in `src/lib/stores/secrets.ts`, which
stays the single read/write path. The three existing secrets are third-party
credentials the user owns; this one is **ours**, held by the user because they
are the operator, so "API key" borrows the wrong noun. It gates **the route, not
the model**, and that distinction survives a provider pivot.

**No `VITE_` fallback, and the module comment says why**, because _be consistent
with `tmdb_api_key`_ is the obvious wrong move and someone will make it.
`import.meta.env.VITE_*` is inlined into the bundle at build time: a dev's own
TMDB key in their own build is harmless, a **shared operator secret** inlined
ships to every visitor of the deployed site the first time that variable is set
in any build environment. This is the one secret where the fallback _is_ the
leak.

**One `SecretField`, drawn on both settings surfaces**, on **Paired devices**'
precedent — _"one module, drawn on the root's Settings and again on Rations
settings, because a Rations user has no route to the root's copy"_
([ADR-0078](0078-a-facet-contains-no-way-out.md) §7). It is a shared key surface
rather than a Facet-owned control, so
[ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md)'s
irreversibility-or-authorship test does not govern it.

#### 4.4 The real backstop is the plan, and no gate here can see it

**The $0 ceiling is not a setting; it is which plan the account is on.** An
upgrade to Workers Paid — taken for an unrelated reason — silently converts the
hard stop into unbounded overage at $0.011 per 1,000 Neurons, roughly
**$239–$551 for a single hammered day** at the documented rate ceiling. Nothing
warns anyone, and `worker-config-check.mjs` cannot see a plan.

So: **the Free plan is recorded here as load-bearing, and an upgrade re-opens
§4.1 and this section.** And the gateway carries **rate limiting set at creation**
as the one control that survives a plan change with nobody remembering to act.
Gateway **spend limits are refused** on two unverified conditions: `spend_limits`
is absent from the create body and settable only on `PUT`, and its page names
only Unified Billing and BYOK, never Workers AI postpaid.

#### 4.5 What per-user keys would cost later, named now

- **Per-user attribution — closed, and deliberately.** The route is amnesiac and
  runs with logging off; there is nowhere to record who called, and this map
  spent a whole ticket ensuring that. Reaching it later means reversing a privacy
  decision, not extending an auth one.
- **Per-user quota — reachable, and not built.** Cloudflare's Workers Rate
  Limiting binding is `limit({ key })` and does not care whether there is one key
  or many. A binding and a call, whenever it is wanted.
- **Revoking one device without re-keying every device — closed, and this is the
  one that bites.** Rotation is `wrangler secret put` plus re-typing on every
  device, because `localStorage` is per-device and unsynced. It is the only
  recovery path from a leak, which is why it has its own heading in
  [`docs/how-to-operate-the-model-route.md`](../how-to-operate-the-model-route.md)
  rather than being assembled from three sections at 11pm.

### 5. The contract

#### 5.1 The request, and the prompt is not on it

```
POST /api/model
Authorization: Bearer <model_route_key>
{ "task": "label", "images": ["<base64>", ...] }
```

**Exactly two keys.** `task` is a closed enum the Worker owns; today it has one
member. The task goes in the **body**, not the query string, departing from
`RELAY_PATH`'s `?room=` and `STORE_PATH`'s `?key=` deliberately: §13's pinned
key-set test covers the body, so a query parameter would put the one discriminant
selecting the prompt _outside_ the one test enforcing the closed list — and a
task is not an **address** the way a room id or a deposit key is.

**The client does not send the prompt.** The Worker owns the prompt, the response
schema and the model id. This follows directly from measurement: strip the
anti-fabrication sentence and the same model fabricates all twelve
micronutrients as `0` on the same image, 2/2 runs against 0/9 with it. **Absent
is never zero is prompt-carried, not model-carried**, and a safety property that
lives in a sentence cannot live on the wire, where the operator key is the only
thing between it and an arbitrary string. The cost is stated: a prompt fix or a
model swap is a Worker deploy, which is the same cost the store's own provider
pivot already carries, and it is the right side of the boundary for a string that
is load-bearing for safety.

**Two ceilings, controlling different things**, both enforced Worker-side with a
`413`, restated client-side, and held by an equality test —
`deposit-store.ts`'s `DEPOSIT_CEILING_BYTES` pattern for the third time:

- **At most 4 images**, the **cost** control. A single-image read measured 76
  neurons and two measured 133, so the image count is what bounds reads per day
  against Free's hard stop.
- **At most ~6 MB of base64 in total**, the **transport** control. A 1600 px q80
  JPEG runs ~300 KB, so ~410 KB base64; four is ~1.6 MB, and 6 MB is deliberate
  headroom.

Neither is redundant and **nothing bounded this before**: `labelPhotos` sits
behind a `multiple` file input with no cap anywhere, and primary docs give no
help — Workers AI's Limits page is rate limits only, the content array carries no
`maxItems`, `3006 Request too large` states no threshold, and AI Gateway's
documented 25 MB is a _cacheability_ ceiling. **Above the cap the client refuses
and says so** rather than silently sending the first four, because §3.2's copy
interpolates the count and a count that is not the count sent makes the
disclosure false.

#### 5.2 The response, and where normalisation sits

**Two shapes with a normaliser between them.** The Worker owns a flat wire shape
and validates it; the **client** turns it into an `AIAutofillResult`. The wire
shape is declared in `worker/src/` and restated in `src/lib/food/`, held by an
equality test.

```jsonc
{
  "name": "ACEITE DE OLIVA VIRGEN EXTRA" | null,
  "brand": "La Chinata" | null,
  "basis": "per_100g" | "per_100ml" | "per_serving" | null,
  "nutrition": { /* only keys the label printed */ }
}
```

**`name` and `brand` stay.** They are the rule-3-cleanest fields on the wire —
pure transcribed identity, checkable at a glance against the package in the
user's hand. Both came back `null` on the two panel crops, because front-of-pack
is not in frame, and correct on the oil's panel: the N-image array earning its
place for **identity**, not only for completeness.

**Absent may be spelled two ways, and both normalise to omitted.** The prompt
asks for the key to be omitted; the chosen model answered `"fiber_g": null` on
the olive oil, which prints no fibre row, and `"fiber_g": 0` on the Indian paste,
which prints fibre _as_ zero. It got the distinction that matters exactly right
in both directions while disobeying the spelling, and rejecting a correct
response over a spelling would be a validator crying wolf. **The third spelling —
`0` for an absent row — is the one that must never arrive**, is unfalsifiable
from the response, and is exactly what the guard sentence is for.

**`basis` is carried through unresolved, including values the app has no type
for.** `Basis` is `per_100g | per_100ml` and `label-form.ts` records that the
absence of a per-serving member is deliberate. When the model answers
`per_serving` or `null`, **the client's normaliser refuses the whole result** and
the user reads §9's _couldn't read the label_. Dropping to `per_100g` is refused
outright: `invertServingSize`'s fallback is defensible because it reads back a
panel we already stored, whereas guessing the basis of a label we have just read
relabels every row at once.

#### 5.3 The key list is twelve, each named for the unit its label prints

`energy_kcal`, `fat_g`, `saturated_fat_g`, `carbohydrate_g`, `sugar_g`,
`fiber_g`, `protein_g`, `salt_g`, `vitamin_d_ug`, `calcium_mg`, `iron_mg`,
`potassium_mg`.

**The key list you ask for _is_ the fabrication surface** — that is what the
ablation measured — so the prototype's 21 keys drop to 12, each for its own
reason:

- **`energy_kj` is dropped.** `NutritionInfo` has `calories` and no kJ field, so
  the model returned a key with nowhere to go on every run. It could have been
  defended as an _anchor_, since EU panels print kJ first, but every sample
  returned a correct `energy_kcal` beside it, so there is no evidence the anchor
  does work — and an unused key is a key that can be invented.
- **Eight of the twelve micronutrients are dropped**, leaving the four the US
  Nutrition Facts panel mandates. No sampled label prints any micronutrient row
  at all, so the other eight were asking for rows nothing has ever validated,
  defended by a sentence.
- **The four that stay are renamed to the unit the label prints.** The
  prototype's prompt asked for `vitamin_d_mg` and said _"in milligrams as
  printed"_ of rows every label prints in µg — self-contradictory, and the same
  1000× shape as the olive oil's `13,808 g` trap. `vitamin_d_ug` kills both by
  construction.

Eleven transcribed, one derived: `energy_kcal` → `calories`; the six macro rows
straight across to `*_content`; `salt_g` → `sodium_content` **÷ 2.5** (§6.2);
`vitamin_d_ug` ÷ 1e6; `calcium_mg`, `iron_mg`, `potassium_mg` ÷ 1000.

**Eleven of the panel's rows are never proposed** and stay blank: trans fat,
unsaturated fat, cholesterol, and the eight remaining micros. This does not
settle whether those rows earn their place in the _form_, which stays open.

**No barcode is asked for.** A rotated barcode defeated the chosen model 3/3
(`426578483808`, twelve digits), the two-photograph case produced a fifteen-digit
number, degradation defeated the runner-up, and nobody proofreads thirteen
digits. The app already has a real scanner, and leaving it out keeps the response
closed under what §3.1 agreed.

#### 5.4 The faults are ours, and the set has a couldn't-tell member by design

The Worker maps every fault onto a small closed set of **our** statuses. The body
stays a text line, as the store's does; there is no JSON error envelope, because
nothing else in this repo has one.

| status | meaning                 | upstream                                                                   |
| ------ | ----------------------- | -------------------------------------------------------------------------- |
| `503`  | couldn't reach it       | transport, `5xx`, timeout, `3040`, **and any `429` we could not classify** |
| `429`  | not today               | the exhausted daily allocation, when determinable                          |
| `422`  | couldn't read the label | our own schema validation failed                                           |
| `403`  | refused                 | `401`, `5016` — the operator's to fix                                      |
| `413`  | over a ceiling          | §5.1's two caps                                                            |

**The contract names the set, never the mechanism**, and that choice is
load-bearing rather than cautious. `env.AI.run()` throws a bare `Error` whose
code is a substring of the message; the only documented error handling anywhere
in primary docs is `(e as Error).message.includes('2016')`, demonstrated for four
codes and none of ours; `returnRawResponse` appears in one model's usage example
and in no reference table. Worse, the codes themselves are unreliable: the
gateway's rate-limit code `2003` returns **zero matches** across the complete
Workers AI and AI Gateway documentation dumps, and the exhaustion code measured
on the REST path is **`4006`**, documented nowhere, carrying the _exact_ message
Cloudflare publishes under `3036`. **The message text is the stable
discriminant, not the code** — a Worker matching the documented `3036` would
classify exhaustion as _couldn't reach it_ and tell the user to try again in a
moment, all day.

So the set has a **couldn't-tell** member by design, and an unclassifiable `429`
lands on _couldn't reach it_: it misreads only a genuinely exhausted day, and
fails toward retry rather than toward giving up. A contract that shipped
`code: 2003` upward would be exporting a string Cloudflare does not document and
could stop emitting without a changelog.

#### 5.5 The seam, widened

`autofillFromPackageImage(imageBase64: string)` does **not** survive §3.1. It
becomes `autofillFromPackageImage(images: string[]): Promise<AIAutofillResult>`.

`AIAutofillResult` itself is **unchanged** — `{ name, brand, basis: Basis,
nutrition: Partial<NutritionInfo> }`. `basis` stays `Basis`, because
[ADR-0060](0060-an-amount-is-entered-in-its-panels-unit.md) §7 already killed one
parallel basis type. The twelve-key wire narrows into `Partial<NutritionInfo>`
and nothing widens.

**It throws named classes, and `modelOutcomeOf(failure: unknown)` maps them by
`instanceof`**, with a fallthrough to `refused` — `scanOutcomeOfFailure`
(`src/lib/food/off-retry.ts`) a second time. A discriminated return is refused as
a second idiom for a job this repo has solved three times
(`OffUnreachableError`, `StoreUnreachableError`, `ArtifactUnreachableError`); the
distinction belongs in a class so the log and the screen cannot come to disagree
about what happened. `ModelUnusableError` has **two sources** — the Worker's
schema validation, and the client's normaliser refusing a `basis` it cannot
express — one outcome, one line on screen, two places it arises.

### 6. The three rules every consumer obeys

These were each won separately and are written down together here for the first
time, which is most of what makes a second consumer cheap.

1. **A proposal is never truth.** The output reaches a confirm surface, never the
   ledger (ADR-0034 §3/§4).
2. **Absent is never zero.** A row the label did not print is omitted, never `0`
   ([ADR-0030](0030-expanded-food-twin-source-data.md)) — and this is
   **prompt-carried, not model-carried**, so it owes a pinned prompt and a test,
   with a frame that prints no panel among the cases.
3. **A model may transcribe or estimate a number only where the person confirming
   it has the referent in front of them. It may never originate a number the user
   cannot check.**

#### 6.1 Rule 3 could not be written as first stated

Its first wording — _a model may name an identity but never produce a number that
reaches a panel_ — **refuses the plate estimator**, which was on this map's own
roster, and it had never been tested against a second consumer. The referent test
replaces it and sorts all four cases the map actually met: the **label autofill**
is admitted, because the printed panel is in the user's hand and the review is
row by row; the **plate estimator** is admitted, because the plate is in front of
the user and the estimate is checkable as an estimate; **runtime density
conversion** is refused, because nobody can look at olive oil and check
0.913 g/ml; and a **model-named density class** would have passed by
construction, and was refused on value instead, not on this rule.

#### 6.2 Salt is the one row the user cannot check

The wire carries `salt_g` **exactly as printed**, because the ÷2.5 is a computed
number reaching a panel. The client's normaliser is the only thing that divides.

That makes salt the single row whose proposed figure is not the printed figure,
and the confirm step is the entire safety mechanism: a jar printing `Salt 0,6 g`
yields a proposed 240 mg, and the user checking row by row cannot check that one.

**A defect the AI path would inherit rather than cause** was found here and is
filed outside this record (#508):
[ADR-0021](0021-schema-org-recipe-and-nutrition-conformance.md)'s 2026-08-14
Amendment already fixes the rule and ingestion obeys it, but `label-form.ts`
labels the row `"Salt / sodium"` in mg where every EU label prints salt in grams,
and **no ÷2.5 exists anywhere in `src/`** — so a hand-typed `600` from
`Salt 0,6 g` stores 2.5× the sodium, for life, against a 2,300 mg DRV. It asks no
model, so it is out of this map's scope; but it is a **dependency rather than a
bystander**, because the AI path turns a defect a careful person might catch into
one the amber _to review_ chip invites them to wave through. **It should land
with or before the label autofill.**

### 7. Where the code lives, and why neither gate moves

Both gates hold unmoved: `ALLOWED_PREFIXES` does not widen, and
`scripts/worker-config-check.mjs` is not edited at all.

The question _is a model extractor the same kind of shared module as
`src/lib/ingestion/`?_ dissolves once you ask **which side normalises**.
`src/lib/ingestion/` is sanctioned because the Worker and the Vite dev proxy
genuinely share one SSRF guard and one response policy — two runtimes, one
module. A label normaliser has exactly one runtime, the browser. Normalising a
label reading into a panel proposal **is** the _"pure module full of nutrition
arithmetic"_ the closure check's own header disqualifies, so it stays in
`src/lib/food/` and the edge never learns what a `Basis` is.

| Thing                                                           | Home                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The route                                                       | `worker/src/`, its own module, as `relay.ts` and `store.ts` each are                                                           |
| The prompt, the model id, the request builder, the call options | `worker/src/`, exported so they are assertable                                                                                 |
| Response validation                                             | `worker/src/` — refusing malformed model output is the route's job, and is not nutrition arithmetic                            |
| The wire types, the path, and `fetch`                           | a new `src/lib/food/` module, **restated**, held by an equality test                                                           |
| The normaliser                                                  | `src/lib/food/ai-autofill.ts`, which stays pure and loses its stub body and its network ambitions                              |
| The outcome vocabulary                                          | `src/lib/logs/model-log.ts`, because `scripts/log-egress-check.mjs` holds that no module under `src/lib/logs/` reaches `fetch` |
| The classifier `modelOutcomeOf`                                 | beside the normaliser in `src/lib/food/`                                                                                       |

**The client's transport does not go in `ai-autofill.ts`.** A pure normaliser can
be tested against the eight committed sample labels with no network; a module
that fetches cannot.

**`wrangler.toml` gains one table with one key** — `[ai] binding = "AI"`, the only
field the binding accepts. There is no `gateway` field on the binding and no AI
sub-block under `[observability]`, so §3.4's gateway is not expressible in
configuration at all. `worker-config-check.mjs` gains **no fifth claim**:
_exactly one AI binding_ would be cargo-culting the store's clause, which exists
because the account genuinely holds other buckets, and `ai.binding === "AI"` is a
gate crying wolf, since the route fails loudly on the first request without it.

### 8. The offer belongs to the photographs, not to a door

**One control, on the photo row of the label form**, beside the thumbnail it acts
on — not per door. The form is inline markup inside `FoodStager.svelte` reading
that file's own state, and `applyAutofill` is already the single entry point that
rebuilds name, brand, basis, every value and the whole `prefilled` set from one
result. A per-door variant would mean four copies of §3.2's disclosure and four
places for the first-use sheet to fire, to express a difference already expressed
by `labelPhotos.length`.

**The control has two states, keyed on `labelPhotos.length`:**

- **Empty ⇒ it is the camera**, and says so. No model call, no consent moment,
  nothing leaves.
- **Non-empty ⇒ it is the send**, carrying §3.2's disclosure with the count
  interpolated.

That is why the door question dissolves rather than being answered door by door.
ADR-0034 §5's _"the full set is what a future AI call sends"_ is honoured, and its
§1 claim that the three barcode/label doors arrive with photographs is
**half-shipped**: only the desktop-upload variants do. **On a phone, every scan
door arrives photo-less**, so the empty state is the common case and not an edge.

**The offer is never proactive**, the found-but-poor nudge included: there is no
photograph at nudge time, so a _want the model to read your photo?_ banner would
offer to read a photograph that does not exist.

**Open Food Facts' own product shots are refused by name.** At the
found-but-poor door a person can be looking at two photographs with an empty
capture array; they are a third party's images of a different physical pack, and
§3.1's closed list is _the capture array_, not _whatever is on screen_.

**The `edit` door offers it, a read replaces the whole panel, and it must
repopulate `prefilled`.** Filling only the empty rows is refused — a half-applied
result is a form the user cannot trust, half the user's and half the model's with
nothing on screen saying which is which. The shipped code deliberately forces
`prefilled` empty on that door, so **the one door where the proposal overwrites
confirmed values would otherwise be the one door that draws no amber**.

**In the add-ingredient flow the control does not appear at all**, because
`allowPhoto` is off there, so there is no capture array and nothing to send.
`allowPhoto` is **not widened**: that asymmetry is ADR-0034's, and widening it
means a photo-capture surface, a storage path and a `food/label_photos` write for
a case nobody has asked for.

**`unreachable` is not a door and must not become one.** It is deliberately
routed away from `missing` so an Open Food Facts outage cannot poison a `gtin:`
key.

### 9. When the model cannot be reached

**A model call is the third food-path feature in this app that needs a network,
not the first**, and it seats a third member in an existing family rather than
minting a policy. `navigator.onLine` appears **nowhere in `src/`**; neither the
barcode scan nor the bundled-artifact path predicts the network. Both ask, then
report.

**Nine wire states collapse to four the user is told apart:**

| User-visible state          | Wire                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| **Not set up**              | no key on the device — not an error, and nothing is recorded                         |
| **Couldn't reach it**       | transport, `5xx`, timeout, an unclassifiable `429`, capacity, **and `401` / `5016`** |
| **Not today**               | the exhausted daily allocation alone                                                 |
| **Couldn't read the label** | a `200` whose answer the contract cannot read                                        |

`401` and `5016` collapse for the user because they are the operator's to fix and
the user cannot act on them, and they stay **distinct in the log**, because they
mean the account changed underneath the app.

Each line **names the cause, denies the wrong inference, and hands over the
recovery**, which is the house voice already visible in `OFF_UNREACHABLE_COPY`
and `needsNetworkLine`. Here the wrong inference is always the same — the user
will assume their photograph was bad — and the recovery is always the same,
because all four are read while standing in a form that already works. **That
repeated last clause is §9.3's stance, said on screen.**

**Two things the copy may not say.** On Workers Free the app **never suggests an
upgrade**. And the _not today_ line **promises no reset time**: the allocation is
not a UTC day — 2,449 neurons spent since 00:00 UTC were refused as _"used up
your daily free allocation"_, with 8,938 spent the previous UTC day, which fits a
rolling window.

#### 9.1 A failure is atomic and invisible

**Nothing is applied, ever partially.** On any failure the form is identical to
the instant before the press — values, `prefilled`, `toReview`, the basis and the
captured photographs all untouched, as if the button were never pressed. The
message is transient, cleared by the next press or by any edit.

**"Unusable" means schema-invalid, never sparse.** A result carrying 8 of 21
fields is the **correct** answer, not a degraded one: every sampled label prints
the eight EU-mandatory rows and zero micronutrients. And sparseness is **not
detectable from a response** anyway — the runner-up model returned a well-formed,
complete-looking panel that silently omitted four printed rows, `finish_reason:
stop`, 120 completion tokens of a 1200 cap.

#### 9.2 The trigger is always offered, and retry is one press

**Never hidden, never disabled on connectivity**, because a feature that vanishes
on a train is unfindable forever afterwards. **With no key the button stays
visible and enabled** and opens §3.2's first-use sheet, which refuses TMDB's
standing warning `Alert` on a difference in kind: TMDB gates its whole screen,
while this sits beside a label form that is complete without it.

**No automatic retry.** The barcode path's is copied _from_ and then refused on
three specifics: a model call is **seconds**, not the 400 ms an OFF hiccup costs,
so a hidden second attempt doubles a wait the user is already conscious of;
every attempt spends against a hard daily stop with no overage; and an immediate
retry is exactly what re-trips the gateway's 20-per-60-second limit. So: one
**Try again** in the alert, which puts the next wait somewhere the user chose it
— and **no Try again on _not today_**, because it would be a lie.

#### 9.3 The stance, and `check:offline` is untouched

> **AI autofill is a bonus that is allowed to be absent, never a dependency.**
> Every door it appears behind still reaches a complete, saveable panel with the
> radio off.

`scripts/offline-boot-check.mjs` proves a Facet's entry chunk reaches `mount()`
with the network stubbed out. The model route is reached from a button inside an
already-mounted form, adds no precache entry and no boot-path import, so it
cannot be what that gate was written for. Neither arm moves and no Facet's
precache manifest gains a byte.

**What keeps the stance honest is a review rule, not a gate:** _if any path can
only be completed by a model call, the stance is broken and the path is wrong._ A
gate was considered and is refused — the property is about a screen's reachable
endings, which no static check here can see, and a check that cannot see it would
be a gate crying wolf a second time.

### 10. What a confirmed read writes to the ledger

`food/label_capture` keeps every field it has, at `adapter_version: 1`.

**`"ai-confirmed"` means the read was _applied_, not attempted**, and the
**correction count is irrelevant**: sixteen corrections out of eighteen rows is
still a panel a model reached first, and that is the whole of what the word
claims. The test is crisp because §9.1 made failure atomic, so there is no
partial state to classify. One implementation consequence: the flag must **reset
wherever the form resets**, so that a read applied and then abandoned by
switching door does not colour the save that follows.

**A correction threshold is refused by name.** It would make a permanent record
depend on a tuning constant; a reader still could not recover 16-of-18 from
2-of-18 from the stored value; and the instrument it would key on does not
measure what it sounds like — `markVerified` drops a key from `prefilled` on the
input event, so the count is of rows **touched**, not rows changed. That
measurement already has a home with a lifetime that fits it, in §11's Log.
**Per-row provenance is refused** too: it multiplies the envelope by eighteen to
answer a question nobody has asked, on a screen with no way to draw it.

**`method` is a one-way ratchet**, because the hole is the **reverse** journey
that no ticket had priced — a twin saved `"ai-confirmed"` in September, re-opened
in October to fix the brand with **no read**, would write `"manual"` and launder
model output into the stronger claim:

```ts
method = readApplied ? "ai-confirmed" : (prior?.method ?? "manual");
```

Inherit or upgrade; never downgrade. On the manual path with no prior capture
this is exactly today's behaviour, so the shipped flow is unchanged, and the
prior envelope is already in hand at the only call site that needs it —
`openEditForm` receives the whole attributes map and already reads six other
attributes off it. A second capture datom is refused: append-only, latest-wins
per attribute is how every other attribute on this twin behaves, and the earlier
datom is not lost when a later one supersedes it — it stops winning.

**No `model` field, and `adapter_version` is refused as a substitute.** A read is
impossible without photographs and photographs are permanent, so on the device
that authored it every `"ai-confirmed"` twin carries the image that produced it:
a re-audit reads the photo. `adapter_version` versions the **envelope**, and the
model can be swapped with the envelope unchanged, so recording it there would
make the constant lie about its own job. And `food/label_capture` **crosses to a
recipient verbatim**, so a permanent vendor model name would leave the device on
every sent meal — on the one effort whose whole premise is a counted exception to
_nothing readable leaves the device_.

**`adapter_version` stays at 1.** The test is met: every value already in a
ledger means exactly what it meant before. Nothing has ever written
`"ai-confirmed"`, so no historical `"manual"` becomes ambiguous, and the
laundering the ratchet refuses was unreachable until this record made the second
value writable.

**`fields` describes the capture's coverage, never its authorship.** The shipped
code has never computed what ADR-0034 §7's inline comment claims — it builds the
list from what the form ended up _holding_, with no edit tracking anywhere — so
this is a wording defect rather than a schema question, and the same claim stands
uncorrected on **`food/manual_entry`**, whose envelope was minted as its sibling.
Redefining it as what the user changed is refused: it needs edit tracking and
returns `[]` exactly when the feature worked.

**Nothing reads `method`, and that is the answer rather than an oversight.** The
origin badge and `foodSourceView` key on the _presence_ of `food/label_capture`
and never open it. A badge ranking two records the ledger calls equally confirmed
would contradict §6's referent test, under which a confirmed panel is a confirmed
panel however its rows arrived. `method`'s reader is a person auditing the
ledger, which is what an append-only ledger is for — and it stays worth writing
because the ratchet is what keeps it true.

**A received twin arrives `"ai-confirmed"` with no photograph, and the crossing
rule does not move.** Both photo attributes are withheld from a sent meal while
the envelope crosses verbatim, so a recipient holds the claim without the
evidence. The envelope is the honest signal: their panel came through somebody's
label read, not their own typing. Normalising `method` to `"manual"` on receive
is the worst option — it writes a false claim to protect a true one.

### 11. What is recorded locally: a fourth Log channel

A `model` channel, `scan`-shaped and about a third of the 42.9 KiB of headroom
[ADR-0092](0092-a-local-log-records-completely-at-a-level-and-the-export-is-the-protection.md) §8.1
already prices. **`app` is refused**: it is deliberately `domain: null`, so a
food-path model failure would sit outside Rations' export consent scoping — and
for the single feature in this app that sends data off the device, _separately
withholdable at the export_ is the right unit.

**One entry per session, not per call**, on the scan channel's own argument
transferred without a word changed: the fact worth having is a **sequence** — an
outcome, and then what the user did about it — and a sequence split across two
entries could only be rejoined by a key that does not exist here.

```
{ outcome, model, images, saved, corrected, at }   cap 100, ~130 B/record, ~13 KiB
```

- **`outcome`**: `ok | unreachable | exhausted | unusable | refused`. **Not set up
  is not an outcome and records nothing** — nothing was asked, so there is
  nothing to classify.
- **`model`**: from the app's own closed set, **never echoed out of the
  response**.
- **`saved`**: did the form reach the ledger afterwards. True after a _failed_
  read too, which is what tells _gave up_ from _typed the pack in anyway_.
- **`corrected`**: how many proposed rows the user touched before saving; absent
  unless the outcome is `ok`. **It is the whole instrument** — the only way this
  app will ever learn whether the feature is any good against real labels — and
  it records no value, no row name and no food.
- **A duration is refused by name**, so nobody adds it quietly: it answers no
  question anyone has asked, and it measures the network as much as the model.

Levels mirror the scan channel's one for one: `refused` → ERROR, `ok` → INFO,
everything else → WARN. **What must never appear in it**: the prompt, any image
or derivative of one, any nutrition value returned, any name or brand read off
the label, and any provider-authored error text.

### 12. One live consumer, and three refused

The capability is task-agnostic, and after a map that measured every candidate it
ships with **one** consumer. That is the honest count, not a disappointment:
three of the four were refused **on measurement**, and each refusal is cheaper
than the build it prevented.

- **The label autofill — built.** §5's `task: "label"`.
- **Runtime density conversion — refused**, by rule 3: nobody can check
  0.913 g/ml. A model **naming a class** was then refused on **value**, once the
  goal was named as _asking the user less_ rather than being more accurate: a
  three-line rule over the nutrition panel recovers 123 of 124 non-aerated foods
  with no tag at all, reaching the untagged products that were the model's entire
  prize without a tag, a route, a key or a byte leaving the device. ADR-0108's
  2026-09-16 Amendment carries that verdict.
- **The plate estimator — refused, and the verdict rests on confirmability rather
  than on accuracy.** Over 50 weighed dishes it scored 173.3 kcal MAE, 38.9% of
  mean, against the corpus's published direct-2D bar of 70.6 / 26.1%. But the
  disqualifying finding is that **the number does not move when the food does**:
  across near-duplicate clusters, steps under 200 kcal carry 265 kcal of real
  change and move the estimate **9 kcal**, four of six by exactly zero — one
  plate goes 67 → 183 kcal true while the estimate goes 540 → 542. The shippable
  response shape is the **coarser** of the two tested, answering 550 five times
  in thirteen dishes. An estimate a person cannot tell apart from their own
  plate's neighbour is not confirmable at any MAE, so rule 3 admits it and
  measurement refuses it. `estimatePlate` stays the stub
  [ADR-0035](0035-custom-food-intent-chooser.md) §5 shipped — which is now a
  measured position rather than a deferral, and that record needs no change.
- **The pairing proposer (#247) — refused** by its own map, which owns it. It
  never blocked this one.

**What a future consumer inherits**, written here so another map can read it
without this one reaching into its tickets: the same route, a `task` of its own,
the N-image array, both ceilings, the gate, the key, the consent act, the four
outcomes, the fault set and confirm-before-save. It may **not** assume the
label's schema, nor that the wire carries text — the body is `{ task, images }`
and nothing else today, so a string payload is one optional key the first text
consumer adds. A consumer whose numbers are estimated rather than transcribed
owes its own guard sentence and its own pinned prompt test.

### 13. What is enforced, and what is only reviewed

_A posture enforced only by review is a posture that lasts until the first
debugging session._ Four things carry teeth:

1. **The request body is built by one pure function**, and its test asserts the
   body has **exactly** §5.1's two keys, so a later field cannot be added without
   a red test.
2. **`scripts/worker-closure-check.mjs` gains an arm** proving the model route
   **calls no `console.*` and writes to no binding**, copying the relay's shape.
   The second half is load-bearing: a route that carries readable data must be
   provably amnesiac.
3. **The call options are an exported constant** carrying the gateway id, with a
   unit test pinning it. This is the only place in this repo the gateway can be
   pinned at all, and §3.4 measured why it matters: dropping the gateway escapes
   both the rate limit and the logging-off setting at once, invisibly.
4. **The two ceilings and the wire shape are restated and asserted equal**
   across the boundary, the pattern `relay-wire.ts` and `deposit-store.ts`
   already won twice.

Three things are **not** gated, each for a stated reason: the account's plan
(§4.4), which nothing in this repo can see; the gateway's own settings, which
live on the account and are carried as commands with verifications in
[`docs/how-to-operate-the-model-route.md`](../how-to-operate-the-model-route.md);
and §9.3's stance, which is a property of a screen's reachable endings that no
static check here can see.

## Consequences

**What this costs.**

- **The app now has a readable egress**, and its one honest paragraph about
  retention is duller and longer than a reassurance would be. That paragraph is
  the one to defend in review, and it is the only version §3.3 permits.
- **A prompt fix or a model swap is a Worker deploy**, because the prompt is
  server-side. Accepted as the price of a safety property that lives in a
  sentence.
- **The Free plan is load-bearing and invisible to every gate here.** An
  unrelated upgrade to Workers Paid silently buys an unbounded day. The gateway's
  rate limit is the only control that survives it unattended.
- **Rotation is the only recovery from a leaked key**, and it costs re-typing on
  every device.
- **The amber path has never rendered.** `autofillFromPackageImage` is called
  from no app code, so `prefilled` is provably always empty today and the _N to
  review_ chip and _Review & save_ CTA are live code that has **never executed**.
  The label autofill is the first thing that will ever draw them: they are
  unproven, not proven, and the implementation tickets treat them as new work.
- **One vendor is now named in the user-facing copy.** A provider pivot is a copy
  change as well as a code change, which is the right way round — the disclosure
  names who actually receives the photograph.

**What it makes easy.**

- A second question costs a `task` member, a prompt, a schema and a normaliser.
  Everything else is done.
- The three rules are in one place for the first time, so a second consumer
  argues against a written rule instead of re-deriving one.
- The winner read **154 of 154** printed rows with **zero corrections to make**,
  at 3–4 seconds and about **$0.00084** a label — 7 to 24× cheaper than the
  figure this effort had been quoting for a year. The saving is the typing, not
  the verifying, and it is largest exactly where typing is worst: the olive oil's
  prose panel, where a person hunts eight numbers out of a running sentence
  printed twice in two languages.

**What it forecloses, and what it does not.**

- **Per-user attribution is closed on purpose.** Reversing it is a privacy
  decision, not an auth one.
- **Per-user quota and a second provider stay reachable** and are not built.
- **Scoped honestly**: #482's verdict is about **eight EU-mandatory rows in up to
  six languages**, on four photographs of three products, one kitchen, one phone.
  It is **not** a verdict on fine mg/µg micronutrient print, because no sampled
  label contains a micronutrient row. What the set proves decisively is the
  second question, the one that matters more: the chosen model does not invent
  them, and the ablation shows that property belongs to the prompt.

**What would re-open this.** A plan change to Workers Paid (§4.4). A provider or
model pivot, which re-opens §3.3's four absences by name. A second consumer whose
numbers are estimated rather than transcribed, which owes its own guard sentence
and its own measurement. And a measured drop in kcal accuracy would return
`energy_kj` as an **anchor** with a stated reason, never as a field.

## Alternatives considered

- **Don't build it.** The map spent a prototype on exactly this and it survived.
  Three of four candidate models would have closed the lane.
- **A configured key as the agreement** (#62). Refused: it moves the agreement
  away from the act, which is what the **Consent** term forbids in terms.
- **Open Food Facts' checkbox ceremony.** Refused on a difference in kind — a
  contribution is a rider on another act, a model call is the act.
- **A bare binding, trusting that no `default` gateway materialises.** Refused as
  a claim about an absence that any future first request silently falsifies.
- **A third sanctioned prefix in the closure allowlist**, or sharing the wire
  type across the boundary. Both refused; restating with an equality test is the
  pattern this repo has already won twice.
- **A fifth claim in `worker-config-check.mjs`.** Refused as a gate crying wolf:
  the route fails loudly on the first request without its binding.
- **An `Origin` check.** Refused, with the refusal recorded, because the CORS
  absence already stops the only case it would catch and there is no perimeter
  defence on this plan to graduate it into.
- **Gateway spend limits.** Refused on two unverified conditions rather than
  adopted on two guesses.
- **A `VITE_` fallback for the operator secret.** Refused: this is the one secret
  where the fallback _is_ the leak.
- **Asking the model for the barcode.** Refused on measurement — a rotated
  barcode defeated the winner 3/3, and nobody proofreads thirteen digits.
- **Asking the model to convert salt to sodium.** Refused by rule 3; the division
  is the client's.
- **A merge on the `edit` door**, filling only empty rows. Refused: it produces a
  panel half the user's and half the model's with nothing on screen saying which
  is which.
- **A correction threshold, per-row provenance, and a `model` field** on the
  provenance envelope. Each refused by name in §10.
- **A gate for §9.3's stance.** Refused: no static check here can see a screen's
  reachable endings.
