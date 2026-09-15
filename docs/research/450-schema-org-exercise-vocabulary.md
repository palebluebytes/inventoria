# Research: what schema.org already names for exercise (#450)

**Parent map:** [#441](https://github.com/palebluebytes/inventoria/issues/441) — recording exercise: Movements, Routines and Sessions.
**Grounds:** map Notes item 10 — _"A domain is backed by a reputable public schema where one exists"_ — and its own admission that items 1–5 were derived from food's app-internal shape "without asking what schema.org already names". The standing instruction it sets is **"conform where schema.org has a name and say so where it does not"**, not conform at any cost.
**Date:** 2026-09-15. **Status:** research only — no code, no ADR, no `CONTEXT.md` or `docs/eavt-vocabulary.md` edit. The decisions this unblocks belong to other tickets.

## Sources, and what each can prove

Primary only. Two instruments, and every claim below says which one it came from:

- _release_ — the machine-readable vocabulary, `https://schema.org/version/latest/schemaorg-current-https.jsonld`, downloaded 2026-09-15 (1,551,177 bytes; 3,219 entries in `@graph`). This is the **only** instrument that can answer a negative — "schema.org has no term for X" — because it is the whole vocabulary in one file. A type page cannot prove an absence.
- _page_ — the term's own canonical page, e.g. `https://schema.org/ExercisePlan`, fetched the same day. This is what the ticket asks be quoted, and it is the instrument for **rendered** facts the release does not carry: the property tables as a human sees them (including inherited properties), the usage counts, and the maturity banners.

**One caveat on the pages, recorded because it bears on every _page_ citation below.** Every `schema.org/<Term>` page fetched on 2026-09-15 carries this banner, verbatim:

> Note : You are viewing the development version of Schema.org . See how we work for more details.

and a footer reading `Schema.org • V30.0 | 2026-03-19`. So the pages served from the bare `schema.org` host are the **development** build of release **30.0**. Where a page and the release disagree, this note says so; they did not disagree on anything load-bearing. The release file is `schemaorg-current-https.jsonld`, the current-version snapshot, and it agreed with the pages on every type and property record checked.

---

## TL;DR — the verdict

**schema.org names more of this domain than the map assumed, and is weaker in exactly one place than the map assumed.** Six findings, in the order they weigh:

1. **`workload` exists and means energy expenditure — the ticket's Q5 prediction is wrong.** Its own description, verbatim: `Quantitative measure of the physiologic output of the exercise; also referred to as energy expenditure.` Range `Energy` | `QuantitativeValue`. But **MET is not a schema.org word at all** — zero occurrences in 3,219 release entries, and `metabolic equivalent` appears nowhere in the 1.5 MB file. So: a property that can _hold_ the figure, **yes**; a MET _value_ or even a _term_, **no**. #443's join finding stands untouched. (§1)
2. **The conformance argument is stronger than Q4 feared, not weaker.** `ExerciseAction` is plain **core**. The other types are `health-lifesci`, which schema.org's own docs call _"simply views into a single collection of schema definitions"_ and explicitly exclude from the `pending`/`meta` development process. **Nothing in this survey is pending or attic.** The `LoginAction` control proves the maturity banner would have rendered had it applied. (§2)
3. **Four of the six verbs conform; two are coinages — and the doubt about `AcquisitionAction` was right.** `OccurrenceAction` and `AcquisitionAction` are both absent from the release, 404 on the site, and 404 in the attic. `OccurrenceAction` is recorded by ADR-0011; **`AcquisitionAction` is mentioned by no ADR at all**, and is the one coinage where core names were available (`TakeAction`, `ReceiveAction`, `BuyAction`, `WantAction`). Reported, not recommended. (§3)
4. **`ExercisePlan` is the dose taxonomy the ticket hoped for, and the ticket's guessed property list is exactly right — all eight.** It multiply inherits `CreativeWork` **and** `PhysicalActivity`, which is the map's Recipe-Twin analogy arrived at independently. (§4.2)
5. **But it has no property for load or for sets.** `workload` is _not_ weight lifted — it is `Energy`, so 80 kg would be a category error. `repetitions` is one number, not sets × reps. Every description on the type is a clinician's prescription, because that is what it is for. And **no `Action` has a duration property at all** — a session's length is `startTime` + `endTime` or nothing. (§4.1, §4.2)
6. **The anatomy axis gets a shape and no vocabulary.** `associatedAnatomy` and a self-referential hierarchy, yes; enumerated muscle names, **no** — and its range is three `MedicalEntity` subclasses, so a conformant value is a nested entity rather than a scalar. `PhysicalActivityCategory` is a closed seven-value set but **physiologic, not anatomical** (three axes jammed into one enumeration). schema.org declines to codify controlled vocabularies by design, and says so. (§4.3, §1.5)

**The position this supports for the decision tickets: conform on the frame, mint on the dose.** The frame — three entities, the verb, the category axis, the anatomy shape, reps, rest, intensity, frequency, energy-as-a-concept — is published and reputable. Load, sets and MET must be minted, and that is three of the things a training log is mostly made of. Nothing above withdraws map decisions 1–5; if anything §4.2 corroborates decision 1 from an independent direction.

**One pre-existing defect found in passing, owned by nobody on this map:** the app writes `event/type: "ExerciseAction"` for **every** Habit tick, not just fitness ones (`src/lib/habits/state.ts:86` defaults it), so a vitamins habit logs as exercise. (§4.1)

---

## 1. Q5 — is there a schema.org property for MET or energy expenditure?

This is the ticket's most load-bearing question, and a **previous agent's unverified lead** on it was the reason this strand went first. The lead was: _"`workload` on ExercisePlan is explicitly 'energy expenditure'"_.

**The lead is true, verbatim, and it is also not the whole answer.** The ticket's expected answer ("no") is half wrong and half right, and which half matters depends on a distinction the ticket's phrasing collapses.

### 1.1 `workload`, quoted rather than paraphrased

From the release, the complete record for the term, unedited:

```json
{
  "@id": "schema:workload",
  "@type": "rdf:Property",
  "rdfs:comment": "Quantitative measure of the physiologic output of the exercise; also referred to as energy expenditure.",
  "rdfs:label": "workload",
  "schema:domainIncludes": { "@id": "schema:ExercisePlan" },
  "schema:isPartOf": { "@id": "https://health-lifesci.schema.org" },
  "schema:rangeIncludes": [
    { "@id": "schema:Energy" },
    { "@id": "schema:QuantitativeValue" }
  ]
}
```

_release_

Its own page, <https://schema.org/workload>, carries the same three facts in rendered form — description, expected types, and the single type it is used on:

> **workload** — A Schema.org Property
> Quantitative measure of the physiologic output of the exercise; also referred to as energy expenditure.
> **Values expected to be one of these types**: Energy, QuantitativeValue
> **Used on these types**: ExercisePlan

_page_

So the **description** is `Quantitative measure of the physiologic output of the exercise; also referred to as energy expenditure.` and the **`rangeIncludes`** is exactly two types: `schema:Energy` and `schema:QuantitativeValue`. Nothing is being read into it — "energy expenditure" is schema.org's own wording for what the property means.

`schema:Energy` is a core `Quantity` subclass whose own comment is: `Properties that take Energy as values are of the form '<Number> <Energy unit of measure>'.` _release_ — so an `Energy` value is a number plus a unit string, not a bare number.

The page also reports usage: `Usage: < 1K Domains — Based on monthly aggregations from Google's web index. (Google - August 2026)` _page_ This is the lowest usage band schema.org publishes.

### 1.2 The three things the ticket's question runs together

The ticket asks one question; schema.org gives three different answers to it. Naming them separately is the finding:

| What was asked for                                  | Does schema.org provide it? | Evidence                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) A property that can _hold_ an energy figure** | **Yes** — `workload`        | Its own description says "energy expenditure"; its range is `Energy`/`QuantitativeValue`. _release, page_                                                                                                                                                               |
| **(b) A published MET _value_**                     | **No**                      | schema.org is a vocabulary, not a dataset. It publishes no rows. Nothing in the release carries a numeric measurement for any activity.                                                                                                                                 |
| **(c) A vocabulary _term_ for MET**                 | **No**                      | `MET` as a whole word appears in **zero** `rdfs:label` values and **zero** `rdfs:comment` values across all 3,219 entries; the string `metabolic equivalent` (case-insensitive) appears **zero** times anywhere in the 1.5 MB release file. _release_ (queries in §1.3) |

**This is the answer to Q5.** Read as "(a) is there a property that could carry a session's energy?" — **yes, and it is called `workload`, and the ticket's expectation of "no" is wrong.** Read as "(b)/(c) does schema.org give us MET, or even a name for MET?" — **no, and #443's join finding stands untouched.**

### 1.3 How the negative was established

A negative needs the whole vocabulary, so these ran against the release file, not against pages:

- `metabolic equivalent`, case-insensitive, over the raw 1,551,177-byte file → **0 matches**.
- `rdfs:label` matching `MET` as a whole word (`(^|[^A-Za-z])MET([^A-Za-z]|$)`) over every entry → **0 matches**.
- `rdfs:comment` matching `METs?` as a whole word, or `[Mm]etabolic equivalent` → **0 matches**.
- `rdfs:comment` matching `energy expenditure|calorie|kcal|kilocalorie|energy burn|burned`, case-insensitive → exactly **three** matches, and they are the complete set of energy-adjacent terms in the vocabulary:
  - `schema:LowCalorieDiet` — `A diet focused on reduced calorie intake.`
  - `schema:calories` — `The number of calories.`
  - `schema:workload` — `Quantitative measure of the physiologic output of the exercise; also referred to as energy expenditure.`

_release_

So the vocabulary's entire energy surface is: one diet enumeration member, `calories` (which belongs to `NutritionInformation` — already mapped by ADR-0021 §5 to `nutrition/info.calories`), and `workload`. There is no third exercise-energy property hiding anywhere.

### 1.4 What this costs, and what it does not

- **It does not move #443.** The join finding was "no corpus carries both MET and anatomy". schema.org publishes no corpus, so it cannot supply a MET value and cannot relieve that join. Map Notes item 6 and its #443 amendment stand exactly as written.
- **It does move where a Session's frozen energy figure lives.** Map decision 1 says a Session Event freezes its energy at write time. `workload` is a schema.org-published name for that figure, which means the map's Notes item 10 applies to it: minting a name for session energy now needs a reason, because schema.org has one.
- **One mismatch to weigh, not to hide.** `workload`'s `domainIncludes` is **`ExercisePlan` alone** _release_ — the _plan_, not the _action_. There is no `workload` on `ExerciseAction`. So conforming on the name is straightforward; conforming on the _domain_ is not, because the map wants the frozen figure on the **Session Event** (an action), while schema.org hangs `workload` on the **Routine** (a plan). See §5 for how the mapping handles this and §7 for the app concepts left homeless.

### 1.5 Why MET is absent is not an oversight

schema.org says in its own words that codifying measurements is out of its scope, which is the reason (c) comes back empty. From <https://schema.org/docs/meddocs.html>, verbatim:

> Note as well that this schema is not intended to define or codify a new controlled medical vocabulary, but instead to complement existing vocabularies and onotologies. As a schema, its focus is on surfacing the existence of and relationships between entities described in content; the specific convention(s) used to name and/or code entities are outside of the scope of this schema. The schema does provide a way to annotate entities with codes that refer to existing controlled medical vocabularies (such as MeSH, SNOMED, ICD, RxNorm, UMLS, etc) when they are available.

_page_ (`[sic]` on "onotologies" — that is the page's own spelling.)

The same page also bounds the whole health section's intent: `The schema is targeted at web use cases and is not designed for clinical markup or clinical data exchange.` _page_

Two consequences for this map:

1. **Waiting for schema.org to name MET is not a strategy.** It declines to codify measurement vocabularies by design, so the absence found in §1.3 is structural rather than a gap that a future release closes.
2. **There is a sanctioned hook for a foreign identifier.** Because `PhysicalActivity` inherits from `MedicalEntity`, it inherits `code` (range `MedicalCode`) — schema.org's own answer to "annotate entities with codes that refer to existing controlled vocabularies". That is the conformant place for a Compendium of Physical Activities activity code, should the corpus ticket want one. See §4.3 and §7.

---

## 2. Q4 — core, or the `health-lifesci` extension, and what maturity?

The ticket frames this as _"conforming to core is a different commitment from conforming to a pending extension, and ADR-0021's 'reputable schema' argument is weaker for the latter"_. **That framing rests on a premise schema.org itself contradicts.** Stated plainly, then evidenced:

### 2.1 The plain statement

| Term                       | Section                             | What that section means                          |
| -------------------------- | ----------------------------------- | ------------------------------------------------ |
| `ExerciseAction`           | **core** (no `isPartOf` at all)     | The plain vocabulary.                            |
| `exerciseType`, `distance` | **core**                            | The plain vocabulary.                            |
| `ExercisePlan`             | `https://health-lifesci.schema.org` | A **named section / view**, not a maturity tier. |
| `PhysicalActivity`         | `https://health-lifesci.schema.org` | Same.                                            |
| `PhysicalActivityCategory` | `https://health-lifesci.schema.org` | Same.                                            |
| `workload`, `repetitions`… | `https://health-lifesci.schema.org` | Same.                                            |

**Not one of the five types or any of their exercise-specific properties is in `pending`.** _release_ (per-property sections are in §3–§4.)

### 2.2 `health-lifesci` is a view, not a maturity level — schema.org's own words

From <https://schema.org/docs/schemas.html>, verbatim:

> As schema.org has grown, we have explored various mechanisms for community extension as a way of adding more detailed descriptive vocabulary that builds on the schema.org core. Some areas of Schema.org were developed as "named extensions", and have dedicated entry pages. **We previously called these "hosted" extensions, but they are best considered simply as views into a single collection of schema definitions.**

> For example, via the auto section there is a property for emissionsCO2, and via the bib section we have a property publisherImprint. **However, from the perspective of a publisher, these are simply schema.org properties.**

> We have a few of these sections: auto, bib, health-lifesci, meta, pending.
> **Note: the 'pending' and 'meta' hosted sections are part of schema.org's schema development process.**

_page_ (emphasis added; wording verbatim.)

So the sections that carry a process/maturity meaning are named, and they are **`pending`** and **`meta`** — plus `attic`, described on the same page as where terms go when _"deprecated from the core and other sections, or removed from pending as not accepted into the full vocabulary"_, with the caution _"Implementors and data publishers are cautioned not to use terms in the attic area."_ _page_ `health-lifesci` is listed alongside `auto` and `bib` as a subject-matter view, and is explicitly **excluded** from the development-process note.

The cautionary language schema.org does publish is reserved for `pending`, verbatim:

> We use the 'pending' section as a staging area for new schema.org terms that are under discussion and review. Implementors and publishers are cautioned that terms in the pending section may lack consensus and that terminology and definitions could still change significantly after community and steering group review.

_page_ **None of that language applies to any term in this survey**, because no term in this survey is pending.

### 2.3 The control: what a term with a maturity caveat actually looks like

The absence of a banner only means something if a present banner is visible on the same site build. It is. `LoginAction` is in `pending` _release_, and its page renders, verbatim:

> This term is in the "new" area - implementation feedback and adoption from applications and websites can help improve our definitions.

_page_ (<https://schema.org/LoginAction>)

The pages for **`workload`, `ExercisePlan`, `PhysicalActivity` and `ExerciseAction` carry no such line** — the rendered text runs from the breadcrumb straight to the description. _page_ (checked on all four; the `LoginAction` fetch proves the banner would have shown had it applied.)

A second confirmation from the same pages: the breadcrumb and cross-reference links for the health-lifesci terms are marked up `class="core"`, identically to genuinely core terms — e.g. on `https://schema.org/workload`, `<span class="core" title="ExercisePlan">ExercisePlan</span>`. _page_ The rendered site does not distinguish them from core at all.

### 2.4 Sizing the section

`isPartOf` across all 3,219 release entries _release_:

| Section                             | Entries   |
| ----------------------------------- | --------- |
| core (no `isPartOf`)                | **1,933** |
| `https://pending.schema.org`        | 842       |
| `https://health-lifesci.schema.org` | **385**   |
| `https://auto.schema.org`           | 27        |
| `https://bib.schema.org`            | 26        |
| `https://meta.schema.org`           | 6         |

`health-lifesci` is the **largest named subject section by an order of magnitude** (385 entries, 97 of them classes), fourteen times `auto` and `bib` together. It is not a fringe annexe.

One more structural fact: <https://health-lifesci.schema.org/> no longer serves a distinct extension site — it returns the ordinary schema.org homepage (`Schema.org is a collaborative, community activity with a mission to create, maintain, and promote schemas for structured data on the Internet…`, footer `V30.0 | 2026-03-19`). _page_ The "dedicated entry page" of the old hosted-extension model is gone; `health-lifesci` now survives **only** as the `isPartOf` tag in the release, exactly as the schemas doc describes.

### 2.5 The verdict on the conformance argument

**The conformance argument is _stronger_ than the ticket supposed, not weaker.** The ticket's worry was "a pending extension". The facts are:

- `ExerciseAction` is **core**, full stop.
- `ExercisePlan` / `PhysicalActivity` / `PhysicalActivityCategory` and all their exercise properties are in a **subject-matter view of the one vocabulary**, with no maturity caveat, no pending status, no attic risk, and no rendered distinction from core.
- They sit in the **same relationship to core** as `auto`'s `emissionsCO2` and `bib`'s `publisherImprint` — which schema.org says are, "from the perspective of a publisher, simply schema.org properties".

So ADR-0021's "reputable schema" reasoning transfers at full strength. The honest caveats are not about maturity; they are two different things, recorded here so no ticket has to rediscover them:

1. **Low adoption.** `workload` reports `< 1K Domains` _page_ — schema.org's lowest usage band. Low adoption is a real argument about whether a future _importer_ will ever meet this markup in the wild (ADR-0021's stated motive was that an importer becomes "a straight map"). It is **not** an argument about the term's standing in the vocabulary.
2. **A medical framing.** `PhysicalActivity` sits under `MedicalEntity`, and the health section is _"targeted at web use cases and is not designed for clinical markup or clinical data exchange"_ _page_. So the section disclaims clinical use — the direction that would have made it _too heavy_ for this app, not too light. See §4.4 for what inheriting `MedicalEntity` actually drags along, which is the real cost here.

### 2.6 A caveat on the page instrument, stated rather than buried

Every `schema.org` page fetched carries `Note : You are viewing the development version of Schema.org.` — yet <https://schema.org/docs/howwework.html> says, verbatim:

> Note : the schema.org site contains the officially released version of schema.org, while staging.schema.org is the very latest work-in-progress development branch of schema.org containing more recent fixes and improvements but which may contain changes that do not represent the consensus of the wider community or of the project steering group.

_page_

These two statements are in tension, and this note does not resolve it — the banner looks like a site-build artifact on the released host, but that is an inference, not a source. **It does not affect any finding above**, because every Q4 and Q5 claim was independently confirmed against `schemaorg-current-https.jsonld`, which is a versioned release artifact rather than a rendered page, and the two agreed everywhere they overlapped. Where only a page can testify (the usage band, the presence or absence of a maturity banner) the claim is marked _page_ and should be re-read against a release-tagged host if a ticket ever turns on it.

---

## 3. Q6 — the six existing verbs, checked one at a time

`docs/eavt-vocabulary.md:311-313` declares `event/type` to be _"the event verb, a closed set of six"_ and names them. Checked against the release, the census is **four conform, two are home-made**:

| Verb in this repo   | In schema.org? | Parent (`rdfs:subClassOf`) | Section | Written at                             |
| ------------------- | -------------- | -------------------------- | ------- | -------------------------------------- |
| `ConsumeAction`     | **Yes**        | `schema:Action`            | core    | `src/lib/stores/calorie.store.ts:171`  |
| `WatchAction`       | **Yes**        | `schema:ConsumeAction`     | core    | `src/lib/media/engagement.ts:21`       |
| `ReadAction`        | **Yes**        | `schema:ConsumeAction`     | core    | `src/lib/media/engagement.ts:54`       |
| `ExerciseAction`    | **Yes**        | `schema:PlayAction`        | core    | `src/lib/habits/habits.ts:60`          |
| `OccurrenceAction`  | **No**         | —                          | —       | `src/lib/cal_events/cal_events.ts:241` |
| `AcquisitionAction` | **No**         | —                          | —       | `src/lib/ingestion/acquisition.ts:15`  |

_release_ for columns 2–4; _measured_ (repo at HEAD) for column 5.

### 3.1 The four that exist, quoted

```
ConsumeAction    subClassOf Action         "The act of ingesting information/resources/food."
WatchAction      subClassOf ConsumeAction  "The act of consuming dynamic/moving visual content."
ReadAction       subClassOf ConsumeAction  "The act of consuming written content."
ExerciseAction   subClassOf PlayAction     "The act of participating in exertive activity for the purposes of improving health and fitness."
```

_release_ (each is the term's complete `rdfs:comment`; none carries `isPartOf`, so all four are core.)

### 3.2 The two that do not exist — established three ways

Both were checked against every instrument that could show them:

1. **Absent from the release.** Neither `schema:AcquisitionAction` nor `schema:OccurrenceAction` appears as an `@id`. A looser grep for `"schema:*[Aa]cquisi*"` and `"schema:*[Oo]ccurrenc*"` over the raw file returns **zero** matches of any kind — so there is no near-miss name either. _release_
2. **404 on the live site.** `https://schema.org/AcquisitionAction` → **HTTP 404**; `https://schema.org/OccurrenceAction` → **HTTP 404**. _page_ (Controls on the same host, same minute: `https://schema.org/ExerciseAction` → 200, `https://schema.org/ConsumeAction` → 200.)
3. **Not deprecated — never existed.** A term retired from the vocabulary lands in the attic, which is separately browsable. `https://attic.schema.org/AcquisitionAction` → **HTTP 404** and `https://attic.schema.org/OccurrenceAction` → **HTTP 404**, while `https://attic.schema.org/ExerciseAction` → 200 and `https://attic.schema.org/ConsumeAction` → 200 on the same host. _page_ So neither name is a schema.org term this app is holding on to past its deprecation; both are original coinages.

The full census of `Action` subclasses in the release is **113 classes**, of which 5 are `pending` (`AuthenticateAction`, `LoginAction`, `PlayGameAction`, `ResetPasswordAction`, `SeekToAction`, plus `MoneyTransfer` under `TransferAction`) and the rest core. Neither minted name is among them. _release_

### 3.3 What the repo's real convention turns out to be

The ticket guessed: _"the repo's real convention is probably 'conform where schema.org has a name, mint where it does not' — but nothing states that"_. **The guess is right about the practice and right that nothing states it — and the practice is less deliberate than the guess implies.** The two coinages were not made the same way:

- **`OccurrenceAction` is a recorded decision.** ADR-0011 mints it in as many words: _"Their logged completions use the new `event/type: \"OccurrenceAction\"` rather than reusing `\"ExerciseAction\"`."_ and defends it in Consequences: _"The `ExerciseAction` / `OccurrenceAction` distinction preserves semantic clarity in the ledger history."_ _measured_ So the map is right to call ADR-0011 a live counter-precedent — but note **what** it is a counter-precedent to. ADR-0011 does not reject a schema.org name in favour of a coinage; it rejects **reusing `ExerciseAction` for calendar completions**, and schema.org offers no better name for "a scheduled appointment happened". It is a counter-precedent to _over_-conforming, not to conforming.
- **`AcquisitionAction` is undocumented.** `grep -rn 'AcquisitionAction' docs/adr/` returns **nothing** — no ADR mints it, argues for it, or mentions it. _measured_ It is declared in `docs/eavt-vocabulary.md:313` and `:350` and written at `src/lib/ingestion/acquisition.ts:15`, with no recorded reasoning anywhere. The ticket author's stated lack of confidence in it was well placed.

**And `AcquisitionAction` is the one coinage that had conformant alternatives.** Unlike "an appointment occurred", "I acquired a physical item" is squarely inside a family schema.org already models in detail — `TransferAction` has ten subclasses, all core, several of which distinguish exactly the thing this app's `event/status` of `wanted` / `owned` is tracking:

> **TakeAction** — The act of gaining ownership of an object from an origin. Reciprocal of GiveAction. … Unlike ReceiveAction, TakeAction implies that ownership has been transferred.
> **ReceiveAction** — The act of physically/electronically taking delivery of an object that has been transferred from an origin to a destination. … Unlike TakeAction, ReceiveAction does not imply that the ownership has been transferred (e.g. I can receive a package, but it does not mean the package is now mine).
> **BuyAction** — [`subClassOf TradeAction`] The act of giving money to a seller in exchange for goods or services rendered.

_release_ There is also `WantAction` (`subClassOf ReactAction`, core) — _"The act of expressing a desire about the object."_ _release_ — which is a published name for precisely the `wanted` half of this app's acquisition status.

**This is reported, not recommended.** Renaming a shipped verb in an append-only ledger is a migration question and it belongs to whoever owns the physical-items domain, not to this ticket. What #450 owes the map is the fact: **the repo has conformed four times, minted twice, recorded one of those two, and the unrecorded one is the only case where a schema.org name was available and not taken.**

### 3.4 One conformance nuance on the food verb, since it bears on the pattern

`ConsumeAction` is core and its use is conformant, but it is the **abstract parent**. schema.org publishes nine subclasses of it, two of which are the food cases exactly: `EatAction` — _"The act of swallowing solid objects."_ — and `DrinkAction` — _"The act of swallowing liquids."_ _release_ The app logs the parent for both.

That is worth naming because it shows the repo's conformance is at the level of **the family, not the leaf**, and an exercise ticket choosing between `ExerciseAction` (the parent-level act) and something narrower is already inside an established house style. It also matters for ADR-0060's millilitre work, where solid/liquid is a distinction the app _does_ make elsewhere — but that is not this ticket's business either.

---

## 4. Q1–Q3 — the three types, their parents and their properties

Property lists below are the **own** properties — the terms whose `domainIncludes` names that type — read from the release. Inherited properties are called out separately, because for two of these three types the inheritance is where the surprises are. Each type's page was checked against the release and agreed.

### 4.1 Q1 — `ExerciseAction`

<https://schema.org/ExerciseAction>. **Core** (no `isPartOf`). _release_

```json
{
  "@id": "schema:ExerciseAction",
  "@type": "rdfs:Class",
  "rdfs:comment": "The act of participating in exertive activity for the purposes of improving health and fitness.",
  "rdfs:label": "ExerciseAction",
  "rdfs:subClassOf": { "@id": "schema:PlayAction" }
}
```

**Parent chain:** `Thing > Action > PlayAction > ExerciseAction`. _release, page_

The parent is not as odd as it looks — `PlayAction`'s own comment is `The act of playing/exercising/training/performing for enjoyment, leisure, recreation, competition or exercise.` _release_, so "exercising" and "training" are named in the parent's definition. `PlayAction` contributes two own properties, `audience` and `event`. _release_

**Its 13 own properties**, complete: _release_

| Property                 | Section        | Range                    | schema.org's own description                                                                                             |
| ------------------------ | -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `course`                 | core           | `Place`                  | A sub property of location. The course where this action was taken.                                                      |
| `diet`                   | health-lifesci | `Diet`                   | A sub property of instrument. The diet used in this action.                                                              |
| `distance`               | core           | `Distance`               | The distance travelled, e.g. exercising or travelling.                                                                   |
| `exerciseCourse`         | core           | `Place`                  | A sub property of location. The course where this action was taken.                                                      |
| `exercisePlan`           | health-lifesci | `ExercisePlan`           | A sub property of instrument. The exercise plan used on this action.                                                     |
| `exerciseRelatedDiet`    | health-lifesci | `Diet`                   | A sub property of instrument. The diet used in this action.                                                              |
| `exerciseType`           | health-lifesci | `Text`                   | Type(s) of exercise or activity, such as strength training, flexibility training, aerobics, cardiac rehabilitation, etc. |
| `fromLocation`           | core           | `Place`                  | A sub property of location. The original location of the object or the agent before the action.                          |
| `opponent`               | core           | `Person`                 | A sub property of participant. The opponent on this action.                                                              |
| `sportsActivityLocation` | core           | `SportsActivityLocation` | A sub property of location. The sports activity location where this action occurred.                                     |
| `sportsEvent`            | core           | `SportsEvent`            | A sub property of location. The sports event where this action occurred.                                                 |
| `sportsTeam`             | core           | `SportsTeam`             | A sub property of participant. The sports team that participated on this action.                                         |
| `toLocation`             | core           | `Place`                  | A sub property of location. The final location of the object or the agent after the action.                              |

(`course`/`exerciseCourse` and `diet`/`exerciseRelatedDiet` are duplicate pairs with identical descriptions — schema.org's own redundancy, recorded as found.)

**Inherited from `Action`** (13 own properties, all core except `provider` which is `pending`): `actionProcess`, `actionStatus`, `agent`, `endTime`, `error`, `instrument`, `location`, `object`, `participant`, `provider`, `result`, `startTime`, `target`. Plus `Thing`'s `name`, `description`, `url`, `image`, `identifier` and the rest. _release_

**The finding that matters for the map.** `ExerciseAction` carries **no dose properties whatsoever**. Of the eight `ExercisePlan` properties, exactly one — `exerciseType` — is also on `ExerciseAction`. There is no `workload`, no `repetitions`, no `intensity`, no `restPeriods` on the action. The only quantity it owns is `distance`. Everything else a Session Event would record is reached **only** through `exercisePlan`, i.e. by pointing at a plan.

Worse for a log-first design: **there is no duration property on any Action.** `duration`'s `domainIncludes` is `Audiobook, Episode, Event, MediaObject, Movie, MusicRecording, MusicRelease, QuantitativeValueDistribution, Schedule, ServicePeriod` _release_ — `Action` is not in that list, and neither is `ExerciseAction`. The only conformant way to express how long a session lasted is `startTime` + `endTime` (both `DateTime`/`Time`, core, inherited from `Action`). _release_ `activityDuration` is on the **plan**.

**So `ExerciseAction` is a thin verb with a rich plan hanging off it.** schema.org's model is: the _dose_ lives on the `ExercisePlan`; the _occasion_ is an `ExerciseAction` that names its plan and its start/end. That is close to the map's Routine/Session split — and see §5 for the one place it diverges, which is the frozen figure.

**On the habit-tick use at `src/lib/habits/habits.ts:60`.** The ticket asks whether that use conforms. It does, **loosely and by luck rather than design**: `ExerciseAction` means "the act of participating in exertive activity for the purposes of improving health and fitness", and a Fitness Habit tick is such an act. But the app writes `ExerciseAction` for **every** Habit tick regardless of the habit's domain — `src/lib/habits/state.ts:86` defaults it (`type: f.type || "ExerciseAction"`) — so a "read for 20 minutes" or "take vitamins" habit tick also lands as `ExerciseAction`. _measured_ That is a real conformance defect, and it is pre-existing rather than anything this map introduces. It also sharpens the map's own note that _"The ExerciseAction verb is already spent"_: it is spent on habit ticks generally, not on exercise.

### 4.2 Q2 — `ExercisePlan`

<https://schema.org/ExercisePlan>. **`health-lifesci`** (see §2 — a view, not a maturity tier). _release_

```json
{
  "@id": "schema:ExercisePlan",
  "@type": "rdfs:Class",
  "rdfs:comment": "Fitness-related activity designed for a specific health-related purpose, including defined exercise routines as well as activity prescribed by a clinician.",
  "rdfs:label": "ExercisePlan",
  "rdfs:subClassOf": [
    { "@id": "schema:CreativeWork" },
    { "@id": "schema:PhysicalActivity" }
  ],
  "schema:isPartOf": { "@id": "https://health-lifesci.schema.org" }
}
```

**Parent: two of them.** `ExercisePlan` is a **multiple-inheritance** class — `CreativeWork` _and_ `PhysicalActivity`. _release, page_ Its full ancestry is therefore both `Thing > CreativeWork > ExercisePlan` and `Thing > MedicalEntity > LifestyleModification > PhysicalActivity > ExercisePlan`. The page renders both chains. _page_

That is a genuinely useful fact for the map, and worth pausing on: schema.org models a Routine as **simultaneously an authored work and a physical activity**. "An ordered authored thing that is also the activity it describes" is exactly the map's Recipe-Twin analogy (decision 1), arrived at independently.

**Its 8 own properties — and the ticket's guessed list is exactly right, all eight, no more and no fewer:** _release_

| Property             | Section        | Range                             | schema.org's own description                                                                                                                                                                                                              |
| -------------------- | -------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activityDuration`   | health-lifesci | `Duration` \| `QuantitativeValue` | Length of time to engage in the activity.                                                                                                                                                                                                 |
| `activityFrequency`  | health-lifesci | `QuantitativeValue` \| `Text`     | How often one should engage in the activity.                                                                                                                                                                                              |
| `additionalVariable` | health-lifesci | `Text`                            | Any additional component of the exercise prescription that may need to be articulated to the patient. This may include the order of exercises, the number of repetitions of movement, quantitative distance, progressions over time, etc. |
| `exerciseType`       | health-lifesci | `Text`                            | Type(s) of exercise or activity, such as strength training, flexibility training, aerobics, cardiac rehabilitation, etc.                                                                                                                  |
| `intensity`          | health-lifesci | `QuantitativeValue` \| `Text`     | Quantitative measure gauging the degree of force involved in the exercise, for example, heartbeats per minute. May include the velocity of the movement.                                                                                  |
| `repetitions`        | health-lifesci | `Number` \| `QuantitativeValue`   | Number of times one should repeat the activity.                                                                                                                                                                                           |
| `restPeriods`        | health-lifesci | `QuantitativeValue` \| `Text`     | How often one should break from the activity.                                                                                                                                                                                             |
| `workload`           | health-lifesci | `Energy` \| `QuantitativeValue`   | Quantitative measure of the physiologic output of the exercise; also referred to as energy expenditure.                                                                                                                                   |

**Read as the dose taxonomy the ticket hoped for, this is a partial match with one big hole.** Map decision 4 says _"A Movement row declares its own dose shape … Exercise has no single axis."_ Lining the axes up:

| Dose axis a gym log needs | `ExercisePlan` property                                          |
| ------------------------- | ---------------------------------------------------------------- |
| Reps                      | `repetitions` ✔                                                  |
| Time                      | `activityDuration` ✔                                             |
| Distance                  | **nothing** — `distance` is on `ExerciseAction`, not on the plan |
| **Load / weight lifted**  | **nothing** — see below                                          |
| Rest between sets         | `restPeriods` ✔                                                  |
| Effort / RPE / heart rate | `intensity` ✔ (its example is "heartbeats per minute")           |
| Energy                    | `workload` ✔ (§1)                                                |
| Sets                      | **nothing** — see below                                          |

**Two absences worth stating plainly, because they are the load-bearing ones for a strength log:**

1. **No property for weight lifted.** `workload` is _not_ it: its own description is "physiologic output … also referred to as energy expenditure" and its range is `Energy`, so putting 80 kg in it would be a category error, not a loose fit. The natural-language trap here is that English "workload" means "how much weight" in a gym; schema.org's `workload` explicitly does not. _release_ (A `weight` property exists in core, but its domain is `Person`, `Product` and the delivery/packaging types — not any exercise type.)
2. **No property for sets.** `repetitions` is "Number of times one should repeat the activity" — one number, not sets × reps. The only home schema.org offers for "3 × 10" is `additionalVariable`, whose own description volunteers for exactly this role: _"This may include the order of exercises, the number of repetitions of movement, quantitative distance, progressions over time, etc."_ — but it is `Text`, so it is a prose escape hatch, not a structured field.

**`additionalVariable` is the honest read of the whole type: this is a clinician's prescription, not a training log.** Every description is written in the second person about a patient — "one should repeat", "one should break", "articulated to the patient", "exercise prescription" — which matches the class's own comment ("activity prescribed by a clinician") and the health section's stated scope (§1.5). It is a real, unpending, reputable schema for the map's Routine; it is simply thinner than a strength-training app needs, and the thinness is concentrated in load and sets.

**Inherited.** From `CreativeWork`: `name`, `description`, `url`, `image`, `author`, `datePublished`, `timeRequired` (`Duration`, core — _"Approximate or typical time it usually takes to work with or through the content of this work"_), and the rest. From `PhysicalActivity`: the four in §4.3, including `associatedAnatomy` and `category`. From `MedicalEntity`: `code` and seven others (§4.4). _release_

Note what multiple inheritance buys: **`ExercisePlan` gets `associatedAnatomy` for free**, through `PhysicalActivity`. So the anatomy axis reaches Routines as well as Movements without any extra conformance argument.

### 4.3 Q3 — `PhysicalActivity`, `PhysicalActivityCategory`, `associatedAnatomy`

**`PhysicalActivity`** — <https://schema.org/PhysicalActivity>. **`health-lifesci`**. _release_

```json
{
  "@id": "schema:PhysicalActivity",
  "@type": "rdfs:Class",
  "rdfs:comment": "Any bodily activity that enhances or maintains physical fitness and overall health and wellness. Includes activity that is part of daily living and routine, structured exercise, and exercise prescribed as part of a medical treatment or recovery plan.",
  "rdfs:label": "PhysicalActivity",
  "rdfs:subClassOf": { "@id": "schema:LifestyleModification" },
  "schema:isPartOf": { "@id": "https://health-lifesci.schema.org" }
}
```

**Parent chain:** `Thing > MedicalEntity > LifestyleModification > PhysicalActivity`. _release, page_ `LifestyleModification` is `A process of care involving exercise, changes to diet, fitness routines, and other lifestyle changes aimed at improving a health condition.` and contributes **zero** own properties — it is a pure grouping class. `MedicalEntity` is `The most generic type of entity related to health and the practice of medicine.` _release_

Its own comment is notably **wider** than the map's scope: it explicitly includes "activity that is part of daily living and routine". That is the map's own "Widening to all physical activity" item, which sits in _Not yet specified_. So conforming to `PhysicalActivity` for the Movement entity buys the widening for free at the schema level, even while map decision 7 ("deliberate training first") keeps it out of scope in the UI.

**Its 4 own properties**, complete: _release_

| Property            | Section        | Range                                                                      | schema.org's own description                                                                                               |
| ------------------- | -------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `associatedAnatomy` | health-lifesci | `AnatomicalStructure` \| `AnatomicalSystem` \| `SuperficialAnatomy`        | The anatomy of the underlying organ system or structures associated with this entity.                                      |
| `category`          | **core**       | `CategoryCode` \| `PhysicalActivityCategory` \| `Text` \| `Thing` \| `URL` | A category for the item. Greater signs or slashes can be used to informally indicate a category hierarchy.                 |
| `epidemiology`      | health-lifesci | `Text`                                                                     | The characteristics of associated patients, such as age, gender, race etc.                                                 |
| `pathophysiology`   | health-lifesci | `Text`                                                                     | Changes in the normal mechanical, physical, and biochemical functions that are associated with this activity or condition. |

Two of the four (`epidemiology`, `pathophysiology`) are clinical and have no use in this app. The two that matter are `associatedAnatomy` and `category`.

**`PhysicalActivityCategory`** — <https://schema.org/PhysicalActivityCategory>. **`health-lifesci`**, `subClassOf Enumeration`, comment `Categories of physical activity, organized by physiologic classification.` _release_

**It has exactly 7 members, and they are physiologic, not anatomical:** _release_

| Member                 | schema.org's own description                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AerobicActivity`      | Physical activity of relatively low intensity that depends primarily on the aerobic energy-generating process; during activity, the aerobic metabolism uses oxygen to adequately meet energy demands during exercise. |
| `AnaerobicActivity`    | Physical activity that is of high-intensity which utilizes the anaerobic metabolism of the body.                                                                                                                      |
| `Balance`              | Physical activity that is engaged to help maintain posture and balance.                                                                                                                                               |
| `Flexibility`          | Physical activity that is engaged in to improve joint and muscle flexibility.                                                                                                                                         |
| `LeisureTimeActivity`  | Any physical activity engaged in for recreational purposes. Examples may include ballroom dancing, roller skating, canoeing, fishing, etc.                                                                            |
| `OccupationalActivity` | Any physical activity engaged in for job-related purposes. Examples may include waiting tables, maid service, carrying a mailbag, picking fruits or vegetables, construction work, etc.                               |
| `StrengthTraining`     | Physical activity that is engaged in to improve muscle and bone strength. Also referred to as resistance training.                                                                                                    |

**This is a closed, published, seven-value vocabulary — and it is not a muscle-group axis.** Read it carefully and it is three different axes jammed into one enumeration: metabolic pathway (`AerobicActivity`, `AnaerobicActivity`), training goal (`Balance`, `Flexibility`, `StrengthTraining`) and social context (`LeisureTimeActivity`, `OccupationalActivity`). A single `category` value cannot say "anaerobic strength training done for leisure", though `category`'s range includes `Text` and `Thing`, and nothing in schema.org forbids repeating a property — so multiple values are expressible if the app wants them.

It is still worth having: it is a reputable closed set for the "what kind of training is this" facet, which the map's guided selection needs, and `StrengthTraining` / `AerobicActivity` / `Flexibility` / `Balance` covers the deliberate-training scope of map decision 7 almost exactly.

**One caution on `category`'s range:** `CategoryCode` is itself in **`pending`** (`schema:source` → `https://github.com/schemaorg/schemaorg/issues/894`). _release_ `PhysicalActivityCategory`, `Text`, `Thing` and `URL` are not pending, so pointing `category` at a `PhysicalActivityCategory` member avoids the pending term entirely. Worth knowing so nobody reaches for `CategoryCode` by accident.

**`associatedAnatomy`** — the anatomy axis, and here the finding is a **shape without a vocabulary**.

Its range is three classes, all `health-lifesci`, all `subClassOf MedicalEntity`: _release_

- `AnatomicalStructure` — `Any part of the human body, typically a component of an anatomical system. Organs, tissues, and cells are all anatomical structures.` Own properties: `associatedPathophysiology`, `bodyLocation` (`Text`), `connectedTo`, `diagram`, `partOfSystem` (`AnatomicalSystem`), `relatedCondition`, `relatedTherapy`, `subStructure` (`AnatomicalStructure`).
- `AnatomicalSystem` — `An anatomical system is a group of anatomical structures that work together to perform a certain task. Anatomical systems, such as organ systems, are one organizing principle of anatomy, and can include circulatory, digestive, endocrine, integumentary, immune, lymphatic, muscular, nervous, reproductive, respiratory, skeletal, urinary, vestibular, and other systems.` Own properties: `associatedPathophysiology`, `comprisedOf`, `relatedCondition`, `relatedStructure`, `relatedTherapy`.
- `SuperficialAnatomy` — surface landmarks; its long comment is about palpation and phlebotomy. Not relevant here.

**What this does and does not give the map.** Map decision 6 calls anatomy "the ambition, not the floor", and #443 found no corpus carries it alongside MET. schema.org's contribution is precisely:

- ✔ **A published property name** for the axis (`associatedAnatomy`) and a published **self-referential hierarchy** to express it in: `subStructure` nests structures, `partOfSystem` hangs a structure on a system, `comprisedOf` goes the other way. "Quadriceps is a substructure of the muscular system" is directly expressible.
- ✘ **No enumerated muscle names.** `AnatomicalStructure` is a _class_, not an enumeration — there is no `Quadriceps`, no `Deltoid`, no member list of any kind. The only free-text handle is `bodyLocation` (`Text`).
- ✘ **Not a lightweight value, either.** Because the range is three `MedicalEntity` subclasses, a conformant `associatedAnatomy` value is a **nested entity with its own identity**, not a string. In EAVT terms that is a reference to another entity, not a scalar on the Movement row — a real modelling cost, and the reason §5 maps it as a reference and §7 flags it.

This is exactly what §1.5 predicted: schema.org declines to codify controlled vocabularies and instead offers the annotation hook. So if the anatomy layer is ever built, the conformant shape is a `movement/` reference to an anatomy entity, optionally carrying `code` (`MedicalCode`) into MeSH or SNOMED — and **the muscle names themselves still have to come from somewhere else.** schema.org does not relieve #443's sourcing problem on the anatomy side any more than it does on the MET side.

### 4.4 What inheriting `MedicalEntity` drags along

Because `PhysicalActivity` (and therefore `ExercisePlan`) descends from `MedicalEntity`, it inherits these 8 own properties: _release_

`code` (`MedicalCode` — _A medical code for the entity, taken from a controlled vocabulary or ontology such as ICD-9, DiseasesDB, MeSH, SNOMED-CT, RxNorm, etc._), `funding` (**pending**), `guideline`, `legalStatus`, `medicineSystem`, `recognizingAuthority`, `relevantSpecialty`, `study`.

Seven of the eight are clinical furniture this app will never write. **One is genuinely useful: `code`** — schema.org's sanctioned hook for a foreign controlled-vocabulary identifier, and therefore the conformant home for a Compendium of Physical Activities activity code (§7).

The cost is presentational rather than structural: nothing obliges a publisher to emit properties it has no value for, and the app stores snake_case EAVT rather than JSON-LD anyway (ADR-0021 §1). But it is worth recording that **the map's Movement entity would, on a strict reading, be a kind of medical entity** — which is a framing an ADR should either accept out loud or explicitly set aside.

---

## 5. Q7 — the mapping, in ADR-0021 §5's style

**This is a mapping, not a decision.** It shows what a lossless snake_case EAVT expression of the conforming types looks like, so that the three decision tickets can accept, amend or reject it with the conformance cost already priced. Entity prefixes below are illustrative — minting them belongs to [Movement, Routine and Session Event in ledger terms], not here. Nothing in `docs/eavt-vocabulary.md` or `CONTEXT.md` has been touched.

The alignment it assumes is the one §4 found, which is the map's own frame:

| Map entity (Notes item 1) | schema.org type    | Section        |
| ------------------------- | ------------------ | -------------- |
| **Movement**              | `PhysicalActivity` | health-lifesci |
| **Routine**               | `ExercisePlan`     | health-lifesci |
| **Session Event**         | `ExerciseAction`   | **core**       |

### 5.1 Movement ⇄ `PhysicalActivity`

| schema.org/PhysicalActivity                   | EAVT                                               |
| --------------------------------------------- | -------------------------------------------------- |
| `name` (from `Thing`)                         | `movement/name`                                    |
| `description` (from `Thing`)                  | `movement/description`                             |
| `url` (from `Thing`)                          | `movement/url`                                     |
| `image` (from `Thing`)                        | `movement/image`                                   |
| `category` → `PhysicalActivityCategory`       | `movement/category` (the closed 7-value set, §4.3) |
| `associatedAnatomy`                           | `movement/associated_anatomy` **(reference)**      |
| `code` → `MedicalCode` (from `MedicalEntity`) | `movement/code`                                    |
| `epidemiology`                                | **no home — not mapped** (clinical)                |
| `pathophysiology`                             | **no home — not mapped** (clinical)                |

`movement/category` takes a member label verbatim: `AerobicActivity`, `AnaerobicActivity`, `Balance`, `Flexibility`, `LeisureTimeActivity`, `OccupationalActivity`, `StrengthTraining`. Storing the label rather than the URL matches how `event/type` already stores `ConsumeAction` rather than `https://schema.org/ConsumeAction`. _measured_

`movement/associated_anatomy` is marked **(reference)** deliberately, per `docs/eavt-vocabulary.md`'s own marker convention: §4.3 established that `associatedAnatomy`'s range is three `MedicalEntity` subclasses, so a conformant value is an entity, not a scalar. A `Text` scalar here would **not** be lossless.

`movement/code` is the Compendium hook (§1.5, §4.4) — one `MedicalCode`-shaped identifier per Movement, e.g. a Compendium activity code, so the corpus's own row identity survives ingestion. This is the conformant equivalent of what `fdc:` and `gtin:` do for food.

### 5.2 Routine ⇄ `ExercisePlan`

| schema.org/ExercisePlan                                                                       | EAVT                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `name` (from `CreativeWork`)                                                                  | `routine/name`                                           |
| `description`                                                                                 | `routine/description`                                    |
| `url` / `isBasedOn`                                                                           | `routine/url`                                            |
| `image`                                                                                       | `routine/image`                                          |
| `exerciseType`                                                                                | `routine/exercise_type`                                  |
| `activityDuration`                                                                            | `routine/activity_duration`                              |
| `activityFrequency`                                                                           | `routine/activity_frequency`                             |
| `repetitions`                                                                                 | inside `routine/movements[].repetitions` — see below     |
| `intensity`                                                                                   | inside `routine/movements[].intensity`                   |
| `restPeriods`                                                                                 | inside `routine/movements[].rest_periods`                |
| `workload`                                                                                    | inside `routine/movements[].workload` — **but see §5.4** |
| `additionalVariable`                                                                          | `routine/additional_variable` (the `Text` escape hatch)  |
| `category`, `associatedAnatomy`, `code` (inherited from `PhysicalActivity` / `MedicalEntity`) | as §5.1, under `routine/`                                |

**The one structural divergence from schema.org, and it is the same one ADR-0021 already made.** schema.org puts `repetitions`, `intensity`, `restPeriods` and `workload` **directly on the `ExercisePlan`** — one set of numbers for the whole plan, because a clinician's prescription is "do this, twenty times, three times a week". The map's Routine (decision 1) is _"an ordered list of references to Movements with doses"_ — a dose **per movement**.

These are not compatible at the same granularity, and the map's shape is the right one for a training log. The resolution is the precedent ADR-0021 §3 set for recipes: `recipe/ingredients` holds **pure references** `{ ref, amount, unit }`. By the same pattern:

```jsonc
"routine/movements": [
  {
    "ref": "movement:squat_",     // a pure reference, per ADR-0021 §3
    "repetitions": 10,            // schema.org repetitions
    "sets": 3,                    // NO schema.org property — see §5.4
    "load": { "value": 80, "unit": "kg" }, // NO schema.org property — see §5.4
    "rest_periods": "90s",        // schema.org restPeriods
    "intensity": "RPE 8"          // schema.org intensity
  }
]
```

**How to describe that honestly:** it is a **lossless superset**, not a divergence. Every `ExercisePlan` property has a named home; a plan-level schema.org document maps into a single-element `routine/movements` (or onto the plan-level keys where it is genuinely plan-wide, as `activityDuration` and `activityFrequency` are). Nothing schema.org can say is inexpressible. The reverse does not hold, which is the next section.

### 5.3 Session Event ⇄ `ExerciseAction`

| schema.org/ExerciseAction                                                                                                                                                                                      | EAVT                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| the type itself                                                                                                                                                                                                | `event/type: "ExerciseAction"`                                       |
| `startTime` (from `Action`)                                                                                                                                                                                    | `event/time` — the ledger's own `time` column                        |
| `endTime` (from `Action`)                                                                                                                                                                                      | `event/end_time`                                                     |
| `exercisePlan`                                                                                                                                                                                                 | `event/target` **(reference)** — the Routine                         |
| `object` (from `Action`)                                                                                                                                                                                       | `event/target` **(reference)** — a bare Movement, per map decision 3 |
| `distance`                                                                                                                                                                                                     | `event/distance`                                                     |
| `exerciseType`                                                                                                                                                                                                 | `event/exercise_type`                                                |
| `location` / `exerciseCourse` / `sportsActivityLocation`                                                                                                                                                       | `event/location`                                                     |
| `actionStatus` (from `Action`)                                                                                                                                                                                 | `event/status` (the app's existing per-type enum)                    |
| `agent`, `participant`, `opponent`, `sportsTeam`, `sportsEvent`, `diet`, `exerciseRelatedDiet`, `fromLocation`, `toLocation`, `course`, `result`, `error`, `instrument`, `actionProcess`, `provider`, `target` | **not mapped** — no app concept                                      |

`event/target` already carries exactly this polymorphism: `docs/eavt-vocabulary.md` describes it as _"polymorphic. It references **any** twin, across all four food prefixes … as well as media and physical-item twins, and a Habit Blueprint."_ _measured_ A Routine or a bare Movement is one more case, and schema.org happens to split it across two properties (`exercisePlan` vs `object`) where the ledger uses one. That is a **narrowing on read**, recoverable from the referenced entity's prefix, so it is lossless in the direction that matters.

### 5.4 Properties with no sensible home, and app concepts schema.org cannot name

The ticket asks for both lists. They are short, and the second is the one that decides things.

**(a) schema.org properties with no sensible EAVT home** — mapped nowhere, and should not be:

| Property                                                                                                      | Why not                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `epidemiology`, `pathophysiology`                                                                             | Clinical. On `PhysicalActivity`, meaningless for a personal log.                                                                              |
| `guideline`, `legalStatus`, `medicineSystem`, `recognizingAuthority`, `relevantSpecialty`, `study`, `funding` | Inherited from `MedicalEntity`. Clinical furniture (§4.4). `funding` is also `pending`.                                                       |
| `opponent`, `sportsTeam`, `sportsEvent`, `audience`                                                           | Competitive/spectator framing. Outside map decision 7.                                                                                        |
| `diet`, `exerciseRelatedDiet`                                                                                 | The app models food as its own domain; coupling a session to a diet entity has no use and would duplicate ADR-0021's work.                    |
| `course` / `exerciseCourse`, `fromLocation`, `toLocation`                                                     | Route-shaped, and the map rules GPS and route recording **out of scope**. `location` alone suffices.                                          |
| `additionalVariable`                                                                                          | Mapped, but only as a `Text` escape hatch. Worth flagging that anything routinely landing here is a signal the app needs its own key instead. |

**(b) App concepts schema.org has no property for** — the load-bearing list:

| App concept                                     | Status in schema.org                                                                                                                                                   | Consequence                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Load / weight lifted**                        | **Nothing.** `workload` is `Energy` and means energy expenditure (§1.1); core `weight` has domain `Person`/`Product`/packaging types, not any exercise type. _release_ | A name must be minted. For the single most basic fact a strength log records. Unavoidable.                                                                          |
| **Sets** (as distinct from reps)                | **Nothing.** `repetitions` is one number (§4.2).                                                                                                                       | A name must be minted, or sets folded into prose via `additionalVariable`, which loses structure.                                                                   |
| **MET**                                         | **Nothing** — not the value, not even the term (§1.2, §1.3).                                                                                                           | A name must be minted. #443's join stands.                                                                                                                          |
| **A session's measured energy**                 | `workload` exists and means this — **but its `domainIncludes` is `ExercisePlan` alone** (§1.4). _release_                                                              | Either extend `workload` to the event (conformant on name, off-domain), or mint. **This is a real choice a ticket must make, not a gap.**                           |
| **A session's duration**                        | **Nothing on any `Action`.** `duration`'s domain excludes `Action`; `activityDuration` is on the plan (§4.1). _release_                                                | Use `startTime` + `endTime` (fully conformant), or mint a duration. Note `src/lib/habits/habits.ts` already takes a `duration?: number` in its metadata. _measured_ |
| **Muscle group / equipment / movement pattern** | A property (`associatedAnatomy`) and a hierarchy, but **no vocabulary** and no lightweight value (§4.3).                                                               | The shape conforms; the names must still be sourced. schema.org does not relieve #443 here.                                                                         |
| **Which Habit slot a Session discharged**       | **Nothing.** Habits are this app's own concept.                                                                                                                        | `event/target_id` already exists for this. Mint-free, but unconformable by nature — and fine.                                                                       |
| **Meal-type-style "when in the day"**           | Not applicable.                                                                                                                                                        | —                                                                                                                                                                   |

**The headline for the map:** conformance covers the _skeleton_ — the three entities, the verb, the category axis, the anatomy axis's shape, reps, rest, intensity, frequency, duration-of-plan, and energy-as-a-concept. It does **not** cover **load, sets, or MET**, which are three of the things a training log is mostly made of. So the honest position for an ADR is _"conform on the frame, mint on the dose"_, with the mints named and justified rather than silent — which is precisely what map Notes item 10 asks for ("no ticket here may invent a name or a shape that schema.org already publishes **without saying why**").

---

## 6. Gaps and what could not be established

Recorded explicitly rather than dropped, per this note's own standard.

- **The maturity banner tension in §2.6 is unresolved.** `schema.org` pages say they are the development version; `howwework.html` says `schema.org` is the released version. Both are quoted; neither is reconciled by a source. Every affected claim is independently confirmed against the release file, so nothing here rests on it.
- **`https://schema.org/docs/schemas.html` would not decode as plain UTF-8** on the first fetch (gzip without a matching header). Re-fetched with `curl --compressed`, which succeeded; the §2.2 quotes are from that second, successful fetch. No claim rests on the failed attempt.
- **Usage figures are Google's, not schema.org's own measurement.** The `< 1K Domains` band for `workload` is labelled on the page as `Based on monthly aggregations from Google's web index. (Google - August 2026)`. _page_ It is reported as what it is; this note has no independent way to check it.
- **Not surveyed, because out of the ticket's scope:** `Diet`, `SportsActivityLocation`, `SportsEvent`, `SportsTeam` and the `MedicalEntity` clinical subtree beyond `code`. Each is named above where it touches the mapping, none is expanded.
- **No claim here rests on a secondary source.** Two instruments only, both first-party (§"Sources"). No blog post, wiki or summary was read.
