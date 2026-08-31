# What a store that retains until collected leaks

Research for [#283](https://github.com/palebluebytes/inventoria/issues/283), on the map
[let a device that was asleep converge later](https://github.com/palebluebytes/inventoria/issues/248).

The map decided in the [#254](https://github.com/palebluebytes/inventoria/issues/254) session that
the store **retains a sealed deposit until it is collected**.
[#249](https://github.com/palebluebytes/inventoria/issues/249)'s completeness argument rested on the
opposite — deletion on collection was what stopped the store reconstructing by accretion what it was
never handed at once — so what a retaining store can accumulate has to be established rather than
inherited. This note establishes it, in
[ADR-0072](https://github.com/palebluebytes/inventoria/blob/main/docs/adr/0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md)
§13's voice: what the operator **can** learn.

**Scope split with [#266](https://github.com/palebluebytes/inventoria/issues/266).** That ticket owns
the narrow question of whether an R2 **key name** survives ADR-0072 §9's log switch. §1.2 below gives
the one fact #266 needs and then stops; the adjudication, and what the destination ADR is allowed to
claim about rotation, are #266's. Everything else here is the wider surface: storage telemetry,
billing, size, timing, accumulation and disposal.

All outside claims were verified on **2026-08-31** against the source named. Cloudflare claims come
from Cloudflare's own documentation; traffic-analysis claims come from the papers themselves, with
the numbers as the papers report them; padding and AEAD claims come from the RFCs. Figures marked
**[computed]** were worked out here and the method is given so they can be re-run.

## The answer in five sentences

**Sealing the deposit does not seal the bucket.** R2 keeps its own operations and storage telemetry
in a pipeline that ADR-0072 §9's Worker switch is not documented to reach, retained 31 days, with no
documented off switch — and one of its fields is `objectCount`, which is a direct, per-`datetime`
read on exactly the backlog retention creates. **A sealed deposit's length is its plaintext's length
plus a fixed tag**, and this repo's own rate card ([#196](https://github.com/palebluebytes/inventoria/issues/196))
separates a USDA-only meal (1.4 KB) from a barcode scan (22 KB) from a label photo (311 KB) by more
than an order of magnitude each, so the size tells the operator **which capture door was used**, and
no padding scheme short of fixed-size deposits closes that. **The deposit cadence is not incidental
metadata; it is a lossy copy of the diary** — a deposit exists only when something was logged, so
the timestamps approximate meal times, and meal times carry waking hours, work rhythm, travel,
fasting and absence. **What n retained deposits give that one does not is a series rather than a
point**: cadence, diurnal profile, gaps, change points and the count n itself, none of which is
defined on a single sample — plus the retrospective read, which is the guard actually being spent.
**And "retains until collected" contradicts
[#250](https://github.com/palebluebytes/inventoria/issues/250)'s finding that the address expires
with its epoch**: a deposit that outlives its epoch cannot be named by the collector, so it can
never be collected and never be deleted by anyone who can address it.

## What this refutes, confirms and hands on, by name

**Refuted: the reading that ADR-0072 §9's switch is the whole no-record posture once a store
exists.** §9 turns off _Workers_ invocation logs. R2's `r2OperationsAdaptiveGroups` and
`r2StorageAdaptiveGroups` are a different product's datasets in the GraphQL Analytics API, and no
Cloudflare document says the Worker setting reaches them. §1 gives what they hold.

**Refuted: "there is nothing to dispose of" as ADR-0072 §14's answer.** §12's _nothing that outlives
a room_ was met by construction. A retaining store meets nothing by construction; it meets a policy.
§5 prices what that costs the withdrawal clause.

**Refuted (as a matter of arithmetic): the hope that padding hides the payload.** Padmé costs at most
**6.25%** over the 1 KiB–1 MiB range and cuts the length channel from **20.00 bits to 7.81 bits** per
deposit **[computed]** — a real and cheap win, and still 225 distinct lengths, which is far more than
the three the three doors need to stay apart. §2.4.

**Confirmed and sharpened: ADR-0072 §13.6.** _Traffic analysis by the relay ... and by Cloudflare's
network regardless of §9._ Correct, and retention does not change the network half at all. What it
changes is that the operator no longer has to be watching: the objects **are** the record. §4.1.

**In tension: the [#254](https://github.com/palebluebytes/inventoria/issues/254) session's
"retains until collected" against #250's "the epoch is the absence budget".** They cannot both hold.
§4.5 states the three exits; picking one is [#252](https://github.com/palebluebytes/inventoria/issues/252)'s
and the destination ADR's, not this note's.

**Interaction nobody has noticed: #250 §7's optional per-pairing epoch offset becomes a join key the
moment several of a pairing's deposits coexist.** It was recommended as cheap. Under retention it is
not free. §4.4.

**Handed to [#266](https://github.com/palebluebytes/inventoria/issues/266):** `objectName` is a
documented field of `r2OperationsAdaptiveGroups`. §1.2.

---

## 1. What Cloudflare records about R2 regardless of what we do

### 1.1 Two datasets, 31 days, and no documented off switch

R2's own [Metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)
page names two GraphQL datasets and their fields. Quoted from the field tables:

**`r2OperationsAdaptiveGroups`** — "the operations taken on a bucket within an account":

| Field                | Documented as                                               |
| -------------------- | ----------------------------------------------------------- |
| `actionType`         | "The name of the operation performed."                      |
| `actionStatus`       | "success, userError, or internalError"                      |
| `bucketName`         | "The bucket this operation was performed on if applicable." |
| `objectName`         | "The object this operation was performed on if applicable." |
| `responseStatusCode` | "The http status code returned by this operation."          |
| `datetime`           | "The time of the request."                                  |

**`r2StorageAdaptiveGroups`** — "the storage of a bucket within an account":

| Field          | Documented as                                  |
| -------------- | ---------------------------------------------- |
| `bucketName`   | the bucket                                     |
| `payloadSize`  | "The size of the objects in the bucket."       |
| `metadataSize` | "The size of the metadata of the objects…"     |
| `objectCount`  | "The number of objects in the bucket."         |
| `uploadCount`  | pending multipart uploads                      |
| `datetime`     | "The time that this storage value represents." |

And the retention, verbatim from the same page:

> Metrics can be queried (and are retained) for the past 31 days.

**The storage dataset is the accumulation telemetry, and it exists whether or not anybody wanted
it.** `objectCount` and `payloadSize` against `datetime` is precisely _how many uncollected deposits
are sitting there, and how many bytes they come to, over time_. It needs no key names, no Worker
logging, and no decision to watch. It is queryable from the dashboard by anyone with account access,
and via the GraphQL Analytics API by anyone holding a token.

**The ceiling on its resolution is unknown.** The page does not state the `datetime` bucketing for
either dataset, and the [GraphQL API limits](https://developers.cloudflare.com/analytics/graphql-api/limits/)
page declines to publish per-node limits at all — "To get exact boundaries and availability for your
zone(s) or account, please refer to settings", i.e. it is discoverable per account by introspection
and not from the docs. So the honest statement is: **at least daily, upper bound unstated.** The
"at least daily" floor comes from a different page — [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
says storage is billed as "a GB-month … calculated by averaging the _peak_ storage per day over a
billing period", which is a documented admission that per-day peak storage is metered.

**There is no documented switch that turns either dataset off.** Not "it is on by default"; there is
no off. Where a source establishes no limit, the limit is unknown and should not be assumed
favourable — so plan on the assumption that both datasets record everything for 31 days.

**One qualification worth stating, because it is the only thing standing between the aggregate and a
household.** `payloadSize` and `objectCount` are _per bucket_. With one bucket serving every pairing
they are sums, and a sum over a large user base says much less than a per-household series. Two
things puncture that: at a small user base the sum is close to the household, and `objectName` in
the operations dataset restores the per-key read directly — which is #266's question.

### 1.2 What ADR-0072 §9's switch reaches, and what it does not

§9's lever is `invocation_logs = false`. Cloudflare's
[Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) page is
the authority on what that is:

> All newly created Workers will come with the observability setting enabled by default.

> Each Workers invocation returns a single invocation log that contains details such as the Request,
> Response, and related metadata.

> Invocation logs can be disabled in wrangler by adding the `invocation_logs = false` configuration.

Retention for what is not disabled: **3 days on Workers Free, 7 days on Workers Paid**, with a stated
platform maximum of 7 days.

**Three limits on that switch, each of which is a ceiling rather than a reassurance.**

1. **It is documented against Workers Logs, which is a different product from R2's analytics.** No
   Cloudflare page says the setting reaches `r2OperationsAdaptiveGroups`, and the two are separate
   products with separate datasets and separate retention (7 days versus 31). Treat the R2 datasets
   as surviving it. `objectName` is a field of the operations dataset — **that is the fact
   [#266](https://github.com/palebluebytes/inventoria/issues/266) needs**, and the rest of that
   argument is #266's, not this note's.
2. **It is documented as controlling a stored record, not live observation.** Cloudflare's
   [Real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/)
   page says real-time logs "captures invocation logs, custom logs, errors, and uncaught
   exceptions" and separately that "Real-time logs does not store Workers Logs". The documented
   `wrangler tail` output object carries `event.request.url`, `event.request.headers` and
   `event.request.cf`. **Whether `invocation_logs = false` suppresses the live tail is not stated
   anywhere in Cloudflare's documentation.** Until it is, the honest posture is that anyone with
   account access can watch request URLs and client headers in real time. This also narrows §9's
   own aside — that Cloudflare "do not say whether an invocation log carries the client IP", and
   that the switch "makes the question moot". It makes the _stored_ answer moot. It is not
   documented to make the live one moot.
3. **It says nothing about what Cloudflare retains internally.** Cloudflare's
   [law enforcement page](https://www.cloudflare.com/trust-hub/law-enforcement/) says it "rarely
   has data responsive to court orders seeking transactional data related to a customer's website
   … because we retain such data (if at all) for only a limited amount of time" — a limit with no
   number attached. An unstated retention is not an absent one.

### 1.3 What is opt-in, and therefore genuinely absent

Three surfaces that would otherwise write down every key, and which are off unless somebody turns
them on. Recording them as absent is worth as much as recording the others as present.

- **R2 event notifications.** Opt-in per bucket. The documented message body carries
  `object.key`, `object.size`, `object.eTag`, `action` and `eventTime` — i.e. the full per-object
  record, delivered to a Queue. Do not enable it.
- **Logpush.** The
  [account-scoped dataset list](https://developers.cloudflare.com/logs/logpush/logpush-job/datasets/account/)
  has **no R2 dataset**. There is no S3-style server access log for R2 to switch off, because there
  is none to switch on. `workers_trace_events` exists and is opt-in (a Logpush job has to be
  created); its documented fields are `CPUTimeMs`, `DispatchNamespace`, `Entrypoint`, `Event`,
  `EventTimestampMs`, `EventType`, `Exceptions`, `Logs`, `Outcome`, `ScriptName`, `ScriptTags`,
  `ScriptVersion`, `WallTimeMs` — `Event` being "details about the source event", which for a fetch
  is the request.
- **R2 Data Catalog.** An Apache Iceberg REST catalog that must be enabled per bucket. It is not on
  by default and has nothing to say about objects that are not Iceberg tables.

**Account audit logs are not a data-plane surface.** Cloudflare's
[audit log documentation](https://developers.cloudflare.com/fundamentals/account/account-security/review-audit-logs/)
describes them as summarising "the history of changes made within your Cloudflare account … account
level actions like login, as well as zone configuration changes", retained **18 months**. Bucket
creation and lifecycle-rule changes land there. Object writes and reads do not. The 18 months is
worth knowing anyway: it is the longest documented retention on this whole page, and it is where a
change to the disposal policy would be recorded.

### 1.4 The bucket itself is the loudest surface, and it needs no telemetry at all

Every object in R2 carries, per the
[Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/):
`key`, `version` ("random unique string associated with a specific upload of a key"), `size` ("size
of the object in bytes"), `etag`, `uploaded` ("a Date object representing the time the object was
uploaded"), `httpMetadata`, `customMetadata`, `checksums` and `storageClass`. A `list()` with a
prefix returns them.

**So the complete series — every retained deposit's address, exact byte length and write time — is
readable by one API call against the bucket, at any time, by anyone holding a read token.** No
logging pipeline is involved and the 31-day analytics window does not apply. This is the single most
important fact in §1 and it is the one that makes retention different in kind from a mailbox that
deletes: with deletion, that call returns at most one row.

Two smaller notes. Objects and their metadata are encrypted at rest with AES-256-GCM under
Cloudflare-managed keys — [Data security](https://developers.cloudflare.com/r2/reference/data-security/) —
which protects against a disk, not against the account. And `etag` is content-derived, so identical
bytes collide; with a fresh AEAD nonce per seal, two seals of the same plaintext do not, so `etag`
is not a cross-deposit correlation channel. It does reveal an exact re-upload of the same bytes.

### 1.5 Billing telemetry, which outlives the analytics

The [pricing page](https://developers.cloudflare.com/r2/pricing/) is a primary source about what is
measured, not only what is charged.

- **Storage** is metered as the average of **peak storage per day**. The invoice is therefore a
  function of the retained backlog, and unlike the 31-day analytics an invoice is a financial record
  kept for years. Its resolution is a monthly aggregate over every pairing at once, so it discloses
  the total and not the household — but it is the one artefact of accumulation with no expiry.
- **Operations** are billed in two classes. `PutObject` is Class A; `GetObject` and `HeadObject` are
  Class B; **`DeleteObject` is free**. Free is not the same as unrecorded, and the docs do not say
  whether free operations appear in `r2OperationsAdaptiveGroups`. Assume they do.
- The docs do not distinguish access paths when listing the billable operations, and a Worker binding
  `put()` is the same `PutObject` a client would issue. **Inference, stated as one:** a binding call
  is metered like any other operation and therefore appears in the operations dataset. Cloudflare
  does not state this in terms.

### 1.6 The disposal mechanism has a floor of about two days

[Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) is R2's own
expiry mechanism, and it is coarser than the map's clock:

- The Wrangler flag is `--expire-days`, "number of days after which objects expire". Days. There is
  no hours option.
- "Objects will typically be removed from a bucket within 24 hours of the `x-amz-expiration` value."

**So the shortest retention R2 will enforce for us is one day plus up to a day of slack — call it 48
hours.** #250's construction contemplates epochs as short as an hour. **A retention window shorter
than about two days cannot be enforced by R2's own mechanism and must be enforced by the app's own
`DELETE` on collection** — which is to say, by exactly the deletion the #254 session gave up. That
is a hard constraint on [#252](https://github.com/palebluebytes/inventoria/issues/252)'s number, and
it is not a policy that can be argued with.

One mitigation that is real and cheap:
[Jurisdictional Restrictions](https://developers.cloudflare.com/r2/reference/data-location/) —
`jurisdiction: "eu"` on the binding — "guarantee objects in a bucket are stored within a specific
jurisdiction", named in the docs for GDPR residency. It costs one line of `wrangler.toml` and
changes nothing else.

---

## 2. Size: what a sealed length discloses, and what padding costs

### 2.1 The seal adds a constant, and nothing else

This is settled by the RFCs and does not need arguing.

**ChaCha20-Poly1305** — [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439.txt) §2.8, verbatim:

> The output from the AEAD is the concatenation of:
> o A ciphertext of the same length as the plaintext.
> o A 128-bit tag, which is the output of the Poly1305 function.

**AES-GCM** — [RFC 5116](https://www.rfc-editor.org/rfc/rfc5116.txt) §5.1, verbatim:

> An AEAD_AES_128_GCM ciphertext is exactly 16 octets longer than its corresponding plaintext.

**Therefore the sealed object's `size` field is the plaintext length plus 16.** The map's standing
note that "size survives any seal" is not a caution; it is an identity.

### 2.2 What that means here, from this repo's own numbers

[#196](https://github.com/palebluebytes/inventoria/issues/196)'s rate card measured real closures
through the app's own mappers. Read as deposit sizes it separates the capture doors by an order of
magnitude each:

| What was logged                           | Gzipped closure | Sealed (+16) |
| ----------------------------------------- | --------------: | -----------: |
| Breakfast, two bundled USDA foods         |           1,357 |    **1,373** |
| Dinner, USDA foods plus a recipe          |           2,174 |    **2,190** |
| Dinner including one barcode-scanned food |          22,113 |   **22,129** |
| Snack, one barcode-scanned food           |          26,993 |   **27,009** |
| Lunch including one label photo           |         310,942 |  **310,958** |

**The ceiling this establishes: a deposit's length tells the operator which door the user came in
through.** USDA search, barcode scan, or label photo, separated by 16× and 14× — not a statistical
edge, a bright line. Barcode use tracks packaged food; a label photo tracks a product with no
barcode match. Neither is a nutrition reading, and both are a behavioural one.

### 2.3 What standard padding schemes cost, measured

The published option is **Padmé**, from Nikitin, Barman, Lueks, Underwood, Hubaux and Ford,
_Reducing Metadata Leakage from Encrypted Files and Communication with PURBs_,
[PoPETs 2019(4):6–33](https://petsymposium.org/popets/2019/popets-2019-0056.php). From the abstract,
verbatim:

> PURBs employ Padmé, a novel padding scheme that limits information leakage via ciphertexts of
> maximum length M to a practical optimum of O(log log M) bits, comparable to padding to a power of
> two, but with lower overhead of at most 12% and decreasing with larger payloads.

The published transport precedents are [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.txt) §5.4,
which provides the mechanism and explicitly declines to provide a policy —

> Selecting a padding policy that suggests when and how much to pad is a complex topic and is beyond
> the scope of this specification.

— and [RFC 8467](https://www.rfc-editor.org/rfc/rfc8467.txt) §4.1, which does provide one, for
encrypted DNS: pad queries "to the closest multiple of 128 octets", responses "to a multiple of 468
octets", on the reasoning that block-length padding "creates a greatly reduced variety of message
lengths".

Applied to a deposit range of 1 KiB to 1 MiB (ADR-0072 §11's payload ceiling), exhaustively over
every integer length **[computed]**:

| Scheme         | Distinct lengths | Bits disclosed | Worst-case overhead     |
| -------------- | ---------------: | -------------: | ----------------------- |
| No padding     |        1,047,553 |      **20.00** | 0%                      |
| Padmé          |          **225** |       **7.81** | **6.25%** (at 32,769 B) |
| Block, 4 KiB   |              256 |           8.00 | 300% (at 1 KiB)         |
| Block, 64 KiB  |               16 |           4.00 | 6,300% (at 1 KiB)       |
| Block, 256 KiB |                4 |           2.00 | 25,500% (at 1 KiB)      |
| Power of two   |               11 |           3.46 | 100%                    |

Method: allowed lengths enumerated for every `L` in `[1024, 1048576]`; "bits disclosed" is
`log2(distinct lengths)`; Padmé implemented as published (`E = floor(log2 L)`, `S = floor(log2 E)+1`,
round up to a multiple of `2^(E-S)`).

**Padmé is the clear buy.** It is the only scheme in the table that is cheap at both ends: 6.25%
worst case here (below the paper's 12% bound, which covers small payloads this range excludes), and
it costs **nothing at all** on the five real sizes above — 2.55%, 5.21%, 1.80%, 2.37% and 0.11%
respectively **[computed]**. Block padding buys the same bit count at 300% overhead on the common
case, which is the wrong trade for a store whose typical deposit is 1.4 KB.

### 2.4 And the ceiling padding does not reach

**Padmé does not hide the door.** 225 distinct lengths over the range is far more than the three
the doors need to stay apart: 1,373 → 1,408; 22,129 → 22,528; 310,958 → 311,296. Every published
padding scheme with acceptable overhead is multiplicative, and the doors are separated
multiplicatively.

**Only a fixed deposit size hides it, and the price is the reason nobody does.** Padding every
deposit to 320 KiB costs **239× on a USDA-only meal** and **12×** on a barcode one **[computed]**;
thirty daily deposits go from 41 KiB to 9.4 MiB. That is the honest trade, and it is a decision
rather than a finding: the door is disclosed unless deposits are fixed-size, and fixed-size deposits
cost two to three orders of magnitude on the common case.

**A cheaper partial: photos are droppable.** #196 established that stripping photos takes the label
meal from 310,942 to 1,222 bytes. If photos do not cross, the top row of the table disappears and
only two doors remain distinguishable. That is [#197](https://github.com/palebluebytes/inventoria/issues/197)'s
decision reappearing as a privacy lever, not only a size one.

---

## 3. Timing and frequency: what a cadence actually gives, with numbers

### 3.1 The signal here is not incidental metadata

Under #250's construction a device touches one address per wake, and it writes only when there is
something to write. **So a deposit exists if and only if something was logged since the last one,
and its timestamp is approximately when.** In a food diary, the timestamps are the second most
sensitive field after the contents: they carry waking and sleeping hours, working pattern, weekend
structure, travel, illness, meal-skipping, fasting, and 2 a.m. eating. The timing channel is a lossy
copy of the very record the seal exists to protect. That is specific to this application and it is
worth saying plainly rather than importing a generic caution.

### 3.2 What the literature establishes, with the actual figures

**No published paper measures this exact channel** — one sealed object per device wake in an object
store. Everything below is a _neighbouring_ channel, and the neighbouring channels are consistently
richer than ours (packet timings, burst shapes, flows). They are reported because they set the ceiling
on what the technique is capable of when the observer has more, and because two of them work from
signals as coarse as ours.

**Pure event metadata, no content: Mayer, Mutchler and Mitchell,
_Evaluating the privacy properties of telephone metadata_,
[PNAS 113(20):5536–5541 (2016)](https://www.pnas.org/doi/10.1073/pnas.1508081113).** 823
participants, 251,788 calls, 1,234,231 text messages, from metadata alone.

- Reidentification: **32%** of 30,000 numbers matched automatically against Yelp, Google Places and
  Facebook; **82%** of a manual 250-number sample.
- Relationship inference: the participant's romantic partner identified from **call counts alone at
  81%**, from days-with-a-call at 77%, texts at 76%.
- Sensitive-trait contact, by share of participants: health services 57%, pharmacies 30%, firearms
  sales or repair 7%, marijuana dispensaries 0.4%; within health, mental health 8%, sexual and
  reproductive health 6%, cardiology 2%.

**This is the closest analogue to our channel and it is the one to quote.** A count of interactions
over time — no content at all — identified an intimate relationship four times in five. Our series is
a count of logging events over time.

**Coarse traffic rates, no packet inspection: Apthorpe, Reisman and Feamster,
_A Smart Home is No Castle_ ([arXiv:1705.06805](https://arxiv.org/abs/1705.06805)), and Apthorpe,
Reisman, Sundaresan, Narayanan and Feamster, _Spying on the Smart Home_
([arXiv:1708.05044](https://arxiv.org/abs/1708.05044)).** Verbatim from the first:

> We would like to reiterate that all of the analyses we performed required only send/receive rates
> of encrypted traffic to successfully identify user behavior. No deep packet inspection is
> necessary.

Their Sense sleep-monitor figure reads the user's night off the send/receive rate: went to bed at
12:30 a.m., briefly up at 6:30 a.m., up for the day at 9:15 a.m. **Report this honestly: it is a
visual correlation over four devices, with no accuracy figure attached in either paper.** The
quantified result in the second paper is device _identification_ at "greater than 95% accuracy"
(3-NN, 10-fold CV, six devices), which is not the same claim.

**Coarse rates, quantified: Acar, Fereidooni, Abera, Sikder, Miettinen, Aksu, Conti, Sadeghi and
Uluagac, _Peek-a-Boo: I see your smart home activities, even encrypted!_,
[ACM WiSec 2020](https://arxiv.org/abs/1808.02741), 22 devices.** User-activity inference from
encrypted traffic: time-independent activities **100%**; **entering or exiting the home 93% accuracy,
0.91 F-score, 95% recall**; walking room to room 95%; door or window open/close 94%. Device-state
classification precision 92%, recall 96%. This is the strongest published presence/absence result
from network metadata rather than from power meters.

**Coarseness is not a defence, and this is the paper that shows it: Schuster, Shmatikov and Tromer,
_Beauty and the Burst: Remote Identification of Encrypted Video Streams_,
[USENIX Security 2017](https://www.usenix.org/system/files/conference/usenixsecurity17/sec17-schuster.pdf).**
Features were byte and packet counts averaged into **0.25-second buckets** — not per-packet. YouTube
detector: 0 false positives at **0.988 recall**; **90% accuracy using packet-arrival timing alone**;
1-of-18 title classification at 0.994. Netflix: 0.93 recall, false-positive rate 0.0005, 1-of-100 at
98%. Open-world, with a rejection class.

**Encrypted messaging, for the size half: Coull and Dyer, _Traffic Analysis of Encrypted Messaging
Services: Apple iMessage and Beyond_, [ACM SIGCOMM CCR 44(5):5–11 (2014)](https://dl.acm.org/doi/10.1145/2677046.2677048).**
From packet sizes only: operating system 100%, user action 96% headline (five actions, 5,000
samples; >99% per-message-type in the finer breakdown), language 98% over six languages, and message
length recovered to an **average absolute error of 6.27 characters** (18.4% error rate). Closed-world,
stated as such by the authors. Attachment sizes were recovered to under 10 bytes.

**Two more for the record, both far richer channels than ours.** Taylor, Spolaor, Conti and
Martinovic, _Robust Smartphone App Identification via Encrypted Network Traffic Analysis_, IEEE TIFS
13(1):63–78 (2018): 110 apps identified **six months later at 96.5%** with classification validation
(74.8% without). Conti, Mancini, Spolaor and Verde, _Analyzing Android Encrypted Network Traffic to
Identify User Actions_, IEEE TIFS 11(1):114–125 (2016): 51 distinct in-app actions across 7 apps,
**precision and recall above 95% for most**, Facebook F1 99%.

### 3.3 The ceiling, stated

The operator holds a timestamped event series for a household. The published work says: a comparable
series identified a romantic partner at 81% (PNAS), home entry and exit at 93% (Peek-a-Boo), a video
title at 99% from quarter-second byte buckets (Beauty and the Burst), and a message's language at 98%
from sizes (Coull and Dyer). **Nobody has measured _our_ series, so no number here is ours.** The
defensible statement is the shape rather than a figure: waking hours, weekday structure, multi-day
absence and change of routine are all first-order reads on inter-arrival times, and every one of them
is available without opening a single object.

---

## 4. Accumulation: what n retained deposits give that one does not

This is the guard the map gave up, so the reasoning is set out rather than asserted.

### 4.1 First, the distinction that has to be made, because it is not the obvious one

**Retention does not change what transits. It changes what is at rest.** An operator who was
recording every write learns the same series either way — retention is not what lets them see the
deposits. So the guard deletion bought is narrower and sharper than "the operator cannot see the
writes", and stating it precisely is what makes the rest of this section tractable.

**With deletion, reading the past requires having recorded it at the time.** §9 turns the Worker
record off; §1.1's R2 datasets keep it for 31 days; after that the series is gone. Reconstruction is
**prospective**: somebody had to decide to watch, in advance.

**With retention, the objects are the record.** §1.4: one `list()` returns key, exact size and
`uploaded` for every uncollected deposit. Reconstruction is **retrospective** and needs no prior
decision, no logging pipeline and no 31-day window. It is available to a court order, a breach, an
acquirer, a future maintainer, or an operator who only becomes curious later.

Call the property being spent **metadata forward secrecy**: an adversary who arrives at time T learns
nothing about deposits before T. It is the property Cloudflare claims for itself in §1.2's quote, and
it is the one thing deletion bought that no amount of sealing replaces. In
[RFC 6973](https://www.rfc-editor.org/rfc/rfc6973.txt)'s vocabulary the exposure is **correlation** —
"the combination of various pieces of information related to an individual" — and §6.1's data
minimisation, "limiting collection, use, disclosure, retention", is the countermeasure the previous
design was using without naming it.

### 4.2 What n gives that one does not, item by item

Take deposits `d_1 … d_n` with sizes `s_1 … s_n` at times `t_1 … t_n`, all sealed, none opened.

**The count itself.** `n` is a number the store holds. Under delete-on-collect it is 0 or 1 and the
quantity does not exist. Under retention, _n uncollected deposits at a pairing's addresses says A has
logged on n occasions since B was last used._ That is a direct read on the **peer's** absence, and a
long uncollected run means the peer is gone: device lost, hospital, bereavement, separation,
abandonment of the app. This is available with no analysis at all, and R2 hands the bucket-wide
version over as `objectCount` without being asked (§1.1).

**Everything that is a function of the joint and not of the marginals.** This is the formal answer to
the ticket's question. One deposit gives one `(size, time)` pair: about 20 bits of length (§2.3) and
a timestamp. n deposits give n such pairs **plus their ordering**, and the ordering is where all of
the following live — none of which is defined on a single sample:

- **Inter-arrival times** `t_i − t_{i−1}`: the logging clock.
- **Diurnal profile**, arrivals modulo 24 hours: waking hours, meal times, night eating.
- **Weekly profile**, arrivals by weekday: work rhythm, weekends.
- **Gaps**: a run of epochs with no deposit. Travel, illness, hospitalisation, a holiday.
- **A volume rate.** Because each deposit is the delta since the last, `s_i / (t_i − t_{i−1})` is
  bytes logged per day — an intensity curve for the diary.
- **Change points.** A step in either series: a diet started or abandoned, a household member joining
  or leaving, a switch of capture door, a device replaced. Detecting a change requires at least two
  observations, by definition.

Human behaviour is heavily autocorrelated, so the joint carries substantially more than n independent
marginals would. That is exactly the surplus every result in §3.2 exploits: each of those papers
classifies a _series_, and none of them would work on one sample.

**Deposit-to-collection latency.** `actionType` distinguishes a `PutObject` from a `GetObject`, so
per object the operator sees written-at, read-at, deleted-at. With n, that becomes a distribution:
how long this household's second device typically sleeps.

### 4.3 What the seal still protects, so the finding is not overstated

The store learns nothing about **which** foods, **what** amounts, **which** meal, or any nutrition
figure. It cannot tell a retracted event from a fresh one, cannot read a name, and cannot link two
deposits by content because a fresh AEAD nonce makes identical plaintexts produce different bytes and
different `etag`s. The accumulation finding is entirely about _shape over time_, and the shape does
not become the contents no matter how long it runs. What it becomes is a behavioural record of the
household, which is a different sensitive thing rather than a weaker version of the same one.

### 4.4 Retention manufactures a join that rotation was designed to prevent

This is the least obvious consequence and the one the map should carry forward.

#250's construction touches one address per party per wake and never two in one request, so
consecutive epochs are unlinkable to the operator by anything except IP. **That argument holds
because there is at most one outstanding deposit.** With retention there are n, under n distinct
rotating addresses, coexisting in one bucket. Two things follow.

**Co-residence is itself a clustering feature.** The n objects share a bucket, were written from one
IP, and their `uploaded` times fall on one epoch grid. #250 §7's optional recommendation 7 —
`offset = KDF(secret, "epoch-offset") mod R`, so that not every pairing rotates at the same instant —
was priced as costing one KDF input. **Under retention it is not free: the offset is constant per
pairing and near-unique across pairings, so the moment several of a pairing's deposits are visible at
once, the offset is the join key the rotation existed to deny.** That is an interaction between two
map decisions that neither ticket noticed, and it should be re-priced before it is adopted.

**The collection burst is worse than a stable address.** When B finally wakes it must fetch all n
backlogged deposits. Done in one wake, that is n `GET`s on n different addresses from one IP within
seconds — and a single such observation joins every one of those addresses into one set, _and_
discloses n, _and_ discloses exactly which epochs A was awake in. A stable address would have leaked
one identifier; this leaks n identifiers plus their epoch indices, in one burst. **The rotation guard
for the entire backlog is spent at the moment of collection.**

The three escapes and why each costs something: collect one deposit per wake (catch-up takes n wakes,
and a probe pattern across epochs is precisely what #250 refused); make the address independent of
the epoch it was written in (that is the stable address map decision 7 forbids); or have the
depositor overwrite one address so `n = 1` at rest (§4.5).

### 4.5 "Retains until collected" and "the epoch is the absence budget" cannot both hold

#250's finding was that an address computable by two devices that cannot talk can only be a function
of the shared secret, of what both knew when they last spoke, and of the clock — so **the reach of
any derivation is exactly the rotation period of the address**, and the recommendation was to set the
epoch equal to the retention window.

Under that construction, an object that outlives its epoch is **unreachable**: the collector derives
one address per wake, and it is not the one the stale object sits at. So a deposit retained past its
epoch can never be collected, and can never be deleted by anyone who can name it — it is pure
liability, contributing to §4.2's series and to §1.5's bill while serving nobody. And the store
cannot bound n by the retention window either, because "until collected" has no window.

**Three exits, and the map has to pick one explicitly rather than let the tension stand.**

1. **Keep expiry at one epoch.** Then `n ≤ 2` (the current epoch's deposit, plus the previous one
   inside R2's removal slack), and §4.2 largely evaporates — the series survives only in §1.1's
   31-day analytics rather than at rest. This is the cheapest fix by a wide margin. It also makes
   "retains until collected" a description of the _common_ case rather than a rule, which is probably
   what the #254 session meant.
2. **Let the depositor supersede in place at the current epoch's address.** Then `n = 1` at rest, but
   sizes become monotone non-decreasing (each deposit is a superset since the last collection), which
   is a cumulative activity curve whose first differences give §4.2's volume series back — in the
   analytics rather than on disk. Better, not clean.
3. **Decouple the address from the epoch** so a stale deposit stays reachable. That is the stable
   address decision 7 forbids, and adopting it means redoing #250's rotation analysis from the top.

Whichever is chosen, §1.6's floor binds: **R2's own lifecycle rules cannot enforce anything shorter
than about 48 hours**, so any tighter window is enforced by the app's `DELETE` and by nothing else —
and a `DELETE` that does not happen because the collector never wakes is exactly the case this whole
map exists for.

---

## 5. Legal and operational exposure, and what it does to ADR-0072 §14

Not legal advice; a record of what the design now has to answer that it previously did not. The
citations are to the Regulation itself.

**The sealed bytes are still personal data.** GDPR Recital 26: "Personal data which have undergone
pseudonymisation, which could be attributed to a natural person by the use of additional information
should be considered to be information on an identifiable natural person." The key is held by the
user, not by us, which is a strong position on Article 32(1)(a) ("the pseudonymisation and encryption
of personal data") — and it is not an exit from the Regulation.

**"Until collected" is not a retention period.** Article 5(1)(e) requires data "kept in a form which
permits identification of data subjects for no longer than is necessary". A policy with no number
does not satisfy a principle that is about a number. §1.6 says what numbers are actually enforceable.
[#252](https://github.com/palebluebytes/inventoria/issues/252) is where the number goes, and it now
has a second reason to exist.

**A breach becomes a thing that can happen.** Article 33(1) requires notification to the supervisory
authority "without undue delay and, where feasible, not later than 72 hours". Article 34(3)(a) then
excuses notifying the _individuals_ where "the controller has implemented appropriate technical and
organisational protection measures … in particular those that render the personal data unintelligible
to any person who is not authorised to access it, such as encryption". **This is the seal earning its
keep in the one place a lawyer would look**, and it is worth writing into the record: the seal does
not prevent the breach, it changes who has to be told. What it does not cover is the metadata in §4,
which is not rendered unintelligible by anything.

**ADR-0072 §14's withdrawal clause loses its cleanest sentence.** The clause reads: _if operating the
relay stops being tenable, the send is removed and the file export remains._ Under §12 that was
costless — after five minutes no record said the room existed, so withdrawal disposed of nothing.
Under retention, withdrawal has to answer three questions it never had to:

1. **What happens to deposits in flight at the moment of withdrawal.** These are a user's data that
   their second device has not yet received. Deleting the bucket loses them; leaving them loses
   nothing but keeps the exposure running with nobody minding it. Article 28(3)(g)'s shape — "deletes
   or returns all the personal data … after the end of the provision of services" — is the right
   instinct, and _returning_ is impossible here by construction, because we cannot open them.
2. **Who deletes, and on what trigger.** With no depositor left running, the only mechanism is the
   lifecycle rule, and §1.6 says it works in days. A withdrawal announcement therefore has to come
   with a date, and the date has to be at least a couple of days ahead of the deletion.
3. **What the operator says when asked.** Under §12 the answer to a disclosure request was _no record
   exists_. Under retention the answer is _here are the sealed objects, their sizes and their write
   times, and we cannot open them_ — which is a materially different answer, and it is available
   about the past rather than only about the present.

**Two operational consequences worth naming.** The store makes us, for the first time, the holder of
other people's health-adjacent data at rest rather than in transit — which is what #185's Out of
scope refused in its strongest terms, and the retained mailbox reaches it by instalments rather than
in one step. And Cloudflare's public position that it "does not have customer content … in the
traditional sense" is a statement about Cloudflare's CDN business, not about an R2 bucket we chose to
fill; the order that produces these objects lands on **us**.

---

## 6. The ceilings, in ADR-0072 §13's voice

What the operator **can** learn from a store that retains until collected, with no key and without
opening anything:

1. **How many sealed deposits are waiting, and how many bytes they come to, over time.** From R2's
   `r2StorageAdaptiveGroups`, 31 days, no off switch. Bucket-wide.
2. **The complete list of retained deposits — address, exact byte length, write time — at any moment,
   from one `list()` call, with no logging pipeline and no expiry.** This is the one that is new.
3. **Which capture door was used**, from the length: USDA search, barcode scan or label photo,
   separated by more than 10× each, and padding does not close it (§2.4).
4. **When the household logs food**, and therefore its waking hours, weekday structure, multi-day
   absences and changes of routine — from inter-arrival times alone (§3).
5. **That the second device has been gone for n occasions**, from the count, with no analysis (§4.2).
6. **Which rotating addresses belong to one pairing**, once a backlog is collected in one burst
   (§4.4) — the guard rotation was bought to provide.
7. **Retrospectively, all of the above**, by anyone who obtains the bucket later, without having
   decided in advance to watch (§4.1).
8. **Per-object operation records including `objectName`**, for 31 days, in a pipeline ADR-0072 §9's
   switch is not documented to reach — [#266](https://github.com/palebluebytes/inventoria/issues/266)
   owns what that means.
9. **Whatever a live `wrangler tail` shows**, which the docs do not say `invocation_logs = false`
   suppresses, and which carries request URL, headers and `cf` (§1.2).
10. **Everything Cloudflare's network sees regardless**, per ADR-0072 §13.6. Unchanged by any of this.

What it still cannot learn: which foods, what amounts, which meal, any nutrition figure, or any link
between two deposits by content.

## 7. What follows, and what it costs

Load-bearing, in the order the cost-to-benefit runs:

1. **Bound `n` — decide §4.5 explicitly.** Exit 1 (expiry at one epoch) is nearly free and removes
   most of §4.2. Everything else on this list is worth less than this.
2. **Pad with Padmé.** 20.00 bits to 7.81, at most 6.25% over the range, 0.1–5.2% on the real sizes.
   There is no argument against it and the algorithm is six lines.
3. **`jurisdiction: "eu"` on the binding.** One line, documented for exactly this.
4. **Give §14 a disposal procedure with a date**, because §1.6 means deletion takes days and because
   deposits in flight are a user's data, not a feature.
5. **Re-price #250 §7's epoch offset before adopting it** (§4.4). It was costed against a store that
   deletes.
6. **Do not collect a backlog in one burst**, or accept that the burst joins the pairing's addresses.
   If exit 1 is taken there is no backlog and this resolves itself.

Not recommended, with the reason: **fixed-size deposits** (239× on the common case, §2.4), and
**bucket-per-pairing** (it moves `objectCount` from an aggregate to a per-household series, which is
worse, and bucket creation is an audit-logged account event retained 18 months).

## What is not verified

- **Whether `invocation_logs = false` suppresses real-time logs / `wrangler tail`.** Cloudflare does
  not say. Treated above as not suppressing it, because the unfavourable reading is the one to plan
  against. This is checkable by experiment on a deployed Worker and nobody has run it.
- **Whether a Worker R2 _binding_ call appears in `r2OperationsAdaptiveGroups`.** Inferred from the
  pricing page metering operations without distinguishing access path. Not stated in terms anywhere.
- **Whether free operations (`DeleteObject`) appear in the operations dataset.** Not stated.
- **The `datetime` bucketing of either R2 dataset.** Not published; discoverable per account via
  GraphQL `settings` introspection, which was not run here. The daily floor comes from the pricing
  page's peak-storage-per-day metering, not from the analytics docs.
- **Cloudflare's internal retention of anything, regardless of customer settings.** Their own words
  are "if at all … a limited amount of time", with no number. Recorded as unknown.
- **Any accuracy number for our own channel.** §3.2's figures are neighbouring channels measured by
  other people on other data. None of them is a measurement of a deposit cadence, and this note does
  not claim one.
- **Whether `r2StorageAdaptiveGroups` counts objects deleted mid-interval**, which decides whether a
  short-lived deposit shows up in the storage series at all.
