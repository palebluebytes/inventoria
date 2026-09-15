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
