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

| What was asked for                                | Does schema.org provide it? | Evidence                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) A property that can _hold_ an energy figure** | **Yes** — `workload`        | Its own description says "energy expenditure"; its range is `Energy`/`QuantitativeValue`. _release, page_                                                                                                                                                               |
| **(b) A published MET _value_**                   | **No**                      | schema.org is a vocabulary, not a dataset. It publishes no rows. Nothing in the release carries a numeric measurement for any activity.                                                                                                                                 |
| **(c) A vocabulary _term_ for MET**               | **No**                      | `MET` as a whole word appears in **zero** `rdfs:label` values and **zero** `rdfs:comment` values across all 3,219 entries; the string `metabolic equivalent` (case-insensitive) appears **zero** times anywhere in the 1.5 MB release file. _release_ (queries in §1.3) |

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
- **One mismatch to weigh, not to hide.** `workload`'s `domainIncludes` is **`ExercisePlan` alone** _release_ — the *plan*, not the *action*. There is no `workload` on `ExerciseAction`. So conforming on the name is straightforward; conforming on the *domain* is not, because the map wants the frozen figure on the **Session Event** (an action), while schema.org hangs `workload` on the **Routine** (a plan). See §5 for how the mapping handles this and §7 for the app concepts left homeless.

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

| Term                       | Section                            | What that section means                            |
| -------------------------- | ---------------------------------- | -------------------------------------------------- |
| `ExerciseAction`           | **core** (no `isPartOf` at all)    | The plain vocabulary.                              |
| `exerciseType`, `distance` | **core**                           | The plain vocabulary.                              |
| `ExercisePlan`             | `https://health-lifesci.schema.org` | A **named section / view**, not a maturity tier.   |
| `PhysicalActivity`         | `https://health-lifesci.schema.org` | Same.                                              |
| `PhysicalActivityCategory` | `https://health-lifesci.schema.org` | Same.                                              |
| `workload`, `repetitions`… | `https://health-lifesci.schema.org` | Same.                                              |

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

1. **Low adoption.** `workload` reports `< 1K Domains` _page_ — schema.org's lowest usage band. Low adoption is a real argument about whether a future *importer* will ever meet this markup in the wild (ADR-0021's stated motive was that an importer becomes "a straight map"). It is **not** an argument about the term's standing in the vocabulary.
2. **A medical framing.** `PhysicalActivity` sits under `MedicalEntity`, and the health section is _"targeted at web use cases and is not designed for clinical markup or clinical data exchange"_ _page_. So the section disclaims clinical use — the direction that would have made it *too heavy* for this app, not too light. See §4.4 for what inheriting `MedicalEntity` actually drags along, which is the real cost here.

### 2.6 A caveat on the page instrument, stated rather than buried

Every `schema.org` page fetched carries `Note : You are viewing the development version of Schema.org.` — yet <https://schema.org/docs/howwework.html> says, verbatim:

> Note : the schema.org site contains the officially released version of schema.org, while staging.schema.org is the very latest work-in-progress development branch of schema.org containing more recent fixes and improvements but which may contain changes that do not represent the consensus of the wider community or of the project steering group.

_page_

These two statements are in tension, and this note does not resolve it — the banner looks like a site-build artifact on the released host, but that is an inference, not a source. **It does not affect any finding above**, because every Q4 and Q5 claim was independently confirmed against `schemaorg-current-https.jsonld`, which is a versioned release artifact rather than a rendered page, and the two agreed everywhere they overlapped. Where only a page can testify (the usage band, the presence or absence of a maturity banner) the claim is marked _page_ and should be re-read against a release-tagged host if a ticket ever turns on it.

---

## 3. Q6 — the six existing verbs, checked one at a time

`docs/eavt-vocabulary.md:311-313` declares `event/type` to be _"the event verb, a closed set of six"_ and names them. Checked against the release, the census is **four conform, two are home-made**:

| Verb in this repo    | In schema.org? | Parent (`rdfs:subClassOf`) | Section  | Written at                                                 |
| -------------------- | -------------- | -------------------------- | -------- | ---------------------------------------------------------- |
| `ConsumeAction`      | **Yes**        | `schema:Action`            | core     | `src/lib/stores/calorie.store.ts:171`                      |
| `WatchAction`        | **Yes**        | `schema:ConsumeAction`     | core     | `src/lib/media/engagement.ts:21`                           |
| `ReadAction`         | **Yes**        | `schema:ConsumeAction`     | core     | `src/lib/media/engagement.ts:54`                           |
| `ExerciseAction`     | **Yes**        | `schema:PlayAction`        | core     | `src/lib/habits/habits.ts:60`                              |
| `OccurrenceAction`   | **No**         | —                          | —        | `src/lib/cal_events/cal_events.ts:241`                     |
| `AcquisitionAction`  | **No**         | —                          | —        | `src/lib/ingestion/acquisition.ts:15`                      |

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

- **`OccurrenceAction` is a recorded decision.** ADR-0011 mints it in as many words: _"Their logged completions use the new `event/type: \"OccurrenceAction\"` rather than reusing `\"ExerciseAction\"`."_ and defends it in Consequences: _"The `ExerciseAction` / `OccurrenceAction` distinction preserves semantic clarity in the ledger history."_ _measured_ So the map is right to call ADR-0011 a live counter-precedent — but note **what** it is a counter-precedent to. ADR-0011 does not reject a schema.org name in favour of a coinage; it rejects **reusing `ExerciseAction` for calendar completions**, and schema.org offers no better name for "a scheduled appointment happened". It is a counter-precedent to *over*-conforming, not to conforming.
- **`AcquisitionAction` is undocumented.** `grep -rn 'AcquisitionAction' docs/adr/` returns **nothing** — no ADR mints it, argues for it, or mentions it. _measured_ It is declared in `docs/eavt-vocabulary.md:313` and `:350` and written at `src/lib/ingestion/acquisition.ts:15`, with no recorded reasoning anywhere. The ticket author's stated lack of confidence in it was well placed.

**And `AcquisitionAction` is the one coinage that had conformant alternatives.** Unlike "an appointment occurred", "I acquired a physical item" is squarely inside a family schema.org already models in detail — `TransferAction` has ten subclasses, all core, several of which distinguish exactly the thing this app's `event/status` of `wanted` / `owned` is tracking:

> **TakeAction** — The act of gaining ownership of an object from an origin. Reciprocal of GiveAction. … Unlike ReceiveAction, TakeAction implies that ownership has been transferred.
> **ReceiveAction** — The act of physically/electronically taking delivery of an object that has been transferred from an origin to a destination. … Unlike TakeAction, ReceiveAction does not imply that the ownership has been transferred (e.g. I can receive a package, but it does not mean the package is now mine).
> **BuyAction** — [`subClassOf TradeAction`] The act of giving money to a seller in exchange for goods or services rendered.

_release_ There is also `WantAction` (`subClassOf ReactAction`, core) — _"The act of expressing a desire about the object."_ _release_ — which is a published name for precisely the `wanted` half of this app's acquisition status.

**This is reported, not recommended.** Renaming a shipped verb in an append-only ledger is a migration question and it belongs to whoever owns the physical-items domain, not to this ticket. What #450 owes the map is the fact: **the repo has conformed four times, minted twice, recorded one of those two, and the unrecorded one is the only case where a schema.org name was available and not taken.**

### 3.4 One conformance nuance on the food verb, since it bears on the pattern

`ConsumeAction` is core and its use is conformant, but it is the **abstract parent**. schema.org publishes nine subclasses of it, two of which are the food cases exactly: `EatAction` — _"The act of swallowing solid objects."_ — and `DrinkAction` — _"The act of swallowing liquids."_ _release_ The app logs the parent for both.

That is worth naming because it shows the repo's conformance is at the level of **the family, not the leaf**, and an exercise ticket choosing between `ExerciseAction` (the parent-level act) and something narrower is already inside an established house style. It also matters for ADR-0060's millilitre work, where solid/liquid is a distinction the app *does* make elsewhere — but that is not this ticket's business either.
