# Daily nutrient limits (stay-under reference values)

**Purpose:** primary-source basis for Inventoria's **limit** ("stay-under") daily
targets — the nutrients the food panel renders a _fill-toward-a-cap_ bar for, tinting
amber and stating the overshoot as a percentage once the day's total exceeds the limit
— mapped to the food-panel breakdown keys, with each published limit converted to
grams for storage. This is the inverting counterpart to the reach-toward references
(`fda-daily-values.md`, `active-adult-macros.md`): those record amounts you aim **up**
toward, this one records caps you keep **under**. Decided in issue #43 / ADR-0032, and
re-sourced in issue #506 (ADR-0032's Amendment of 2026-09-30).

## What qualifies as a cap, and who says so

> A nutrient gets a baked cap when a named authority publishes a **numeric daily
> ceiling** for **the quantity the panel actually carries**. The authority is the
> **WHO**. Where the WHO publishes a share of energy rather than a mass, it is
> converted at the 2,000-kcal reference diet the rest of the module is anchored to,
> rounded **down**, and the derivation is written down here. A ceiling the app would
> have to **invent, soften, or borrow from a neighbouring quantity** is not a cap.

Two consequences worth stating before the table, because both are absences a reader
will otherwise come looking for:

- **Cholesterol has no cap.** The WHO publishes no dietary-cholesterol ceiling. See
  "Where other authorities differ" below for the FDA figure this app used until #506
  and why it is no longer reached for.
- **Total sugar has no cap.** The WHO's ceiling is for _free_ sugars; the panel
  carries _total_ sugars. That is a neighbouring quantity, so the criterion refuses
  it — see the section at the foot of this page.

The criterion is scoped to **this** set. The reach-toward targets rest on the FDA
Daily Values and the IOM AMDRs (ADR-0031/0033) and are not governed by it.

## Sources (primary only)

- **WHO — _Saturated fatty acid and trans-fatty acid intake for adults and children:
  WHO guideline_.** Geneva: World Health Organization, 17 July 2023. ISBN
  978-92-4-007363-0.
  https://www.who.int/publications/i/item/9789240073630
  The operative recommendations for both the saturated-fat and trans-fat caps below.
- **WHO — _Guideline: Sodium intake for adults and children_.** Geneva: World Health
  Organization, 2012 (reprinted 2014). ISBN 978-92-4-150483-6.
  https://www.who.int/publications/i/item/9789241504836
  - "WHO recommends a reduction to <2 g/day sodium (5 g/day salt) in adults (strong
    recommendation)."
  - Restated unchanged in _Use of lower-sodium salt substitutes: WHO guideline_
    (27 January 2025) and in the fact sheets below.
- **WHO — "Sodium reduction" fact sheet** (last updated 11 May 2026):
  https://www.who.int/news-room/fact-sheets/detail/sodium-reduction
  - "For adults, WHO recommends less than 2000 mg/day of sodium (equivalent to less
    than 5 g/day salt)."
- **WHO — "Healthy diet" fact sheet** (last updated 26 January 2026):
  https://www.who.int/news-room/fact-sheets/detail/healthy-diet
  - "No more than 10% of total energy intake should come from saturated fat and no
    more than 1% of total energy from trans fat **of any type**."
  - "In adults, salt intake should be limited to less than 5 grams per day (2 grams
    per day sodium)."

**EFSA was considered and is not a source here.** It publishes no numeric ceiling for
any nutrient in this set: its trans-fat advice is "as low as possible", it proposed no
cholesterol reference value, and its 2022 opinion on dietary sugars could set **no**
tolerable upper intake level. A link in the chain that has never yielded a number
would be ceremony, so the chain is one link long.

---

## Limits table

Conversion: mass values in mg → value / 1,000 g; g stays g. A share of energy is
converted at 2,000 kcal and 9 kcal/g, then rounded **down**. Every stored limit is in
**grams** (the panel's canonical mass unit — ADR-0021, one fixed unit per field).

| Nutrient      | Panel key               | Published limit | Gram-equivalent | Source                       |
| ------------- | ----------------------- | --------------- | --------------- | ---------------------------- |
| Sodium        | `sodium_content`        | < 2,000 mg      | 2 g             | WHO sodium guideline (2012)  |
| Saturated fat | `saturated_fat_content` | 10% of energy   | 22 g            | WHO SFA/TFA guideline (2023) |
| Trans fat     | `trans_fat_content`     | 1% of energy    | 2 g             | WHO SFA/TFA guideline (2023) |

---

## The two energy-share derivations

The WHO states both fat ceilings as a share of total energy, and states each one
twice — a **strong** recommendation at the figure, and a **conditional** one below it.
Rounding down lands the stored cap under both arms, which is why the direction is a
convention here rather than a tidy number picked twice.

### Saturated fat — 10% of energy → 22 g

> "1. WHO recommends that adults and children reduce saturated fatty acid intake to
> 10% of total energy intake (strong recommendation). 2. WHO suggests further reducing saturated fatty acid intake to less than 10% of
> total energy intake (conditional recommendation)."

```
WHO ceiling      : saturated fat ≤ 10% of total energy intake
Reference diet   : 2,000 kcal/day
10% of energy    : 2,000 kcal × 0.10 = 200 kcal
Energy per gram  : 9 kcal/g (Atwater factor for fat)
Grams            : 200 kcal ÷ 9 kcal/g = 22.22 g  →  rounded down to 22 g
```

22 g sits below the strong recommendation's 22.22 g and inside the conditional
recommendation's "less than 10%".

### Trans fat — 1% of energy → 2 g

> "1. WHO recommends that adults and children reduce trans-fatty acid intake to 1% of
> total energy intake (strong recommendation). 2. WHO suggests further reducing trans-fatty acid intake to less than 1% of total
> energy intake (conditional recommendation)."

```
WHO ceiling      : trans fat ≤ 1% of total energy intake
Reference diet   : 2,000 kcal/day
1% of energy     : 2,000 kcal × 0.01 = 20 kcal
Energy per gram  : 9 kcal/g
Grams            : 20 kcal ÷ 9 kcal/g = 2.22 g  →  rounded down to 2 g
```

**This ceiling covers ruminant trans fat as well as industrially-produced.** The
guideline says so in its Remarks, and the point is load-bearing for anyone looking at
an amber trans-fat row after eating butter or cheese:

> "For the purposes of these recommendations, TFA includes all fatty acids with a
> double bond in the trans configuration, **regardless of whether the TFA come from
> ruminant sources or are produced industrially**."

The WHO could not separate the two classes: "It was not possible to assess threshold
effects for industrially produced TFA and ruminant TFA separately because the
available data were too limited", and "the available evidence did not support making a
distinction between industrially produced and ruminant TFA". No authority publishes a
ruminant-specific figure.

Do **not** cite the WHO **REPLACE** action package for this cap. REPLACE is an
_elimination programme_ for industrially-produced trans fat and makes no ruminant
recommendation; it is not the source of the <1%-of-energy intake ceiling, and reading
it as such is what produced issue #506. The 2023 guideline is the source.

---

## Unit subtleties that affect the stored-gram value

- **Sodium — 2,000 mg, not "salt".** The WHO figure is for the element sodium, not
  sodium chloride (2 g sodium ≈ 5 g salt, which is the same recommendation stated the
  other way). Panel data must supply sodium, not salt.
- **Saturated fat — 22 g, derived, not transcribed.** Distinct from _total_ fat (78 g
  in `fda-daily-values.md`, a reach-toward reference-diet figure). Only the saturated
  fraction is a limit here.
- **Trans fat — 2 g, derived, and covering all trans fat.** See above. The FDA
  publishes no trans-fat Daily Value at all; its label rule prints grams with no %DV
  and says only "as low as possible", which is not a numeric ceiling and so could
  never have qualified under the criterion.

---

## Where other authorities differ

The criterion names one authority so that the set stays mutually comparable against a
single reference diet. Others publish numbers, and they are recorded here so that
noticing one is not a reason to re-open the caps. **None of these is the source.**

| Nutrient      | This app (WHO) | FDA DRV, 21 CFR 101.9(c)(9) | DGA 2025–2030   |
| ------------- | -------------- | --------------------------- | --------------- |
| Sodium        | **2 g**        | 2.3 g — looser              | < 2,300 mg      |
| Saturated fat | **22 g**       | 20 g — stricter             | 10% of calories |
| Trans fat     | **2 g**        | none published              | not mentioned   |
| Cholesterol   | **no cap**     | 0.3 g                       | not mentioned   |

So the realignment is not a ratchet in either direction: it loosened saturated fat and
tightened sodium.

- **The FDA's 20 g saturated-fat DRV is 9% of a 2,000-kcal diet, not 10%.** Anyone
  checking this page's derivation will compute 10% of 2,000 kcal, get 22.22 g, and
  wonder whether the older 20 g was a transcription error. It was not: 20 g is the
  DRV as published, and it is simply stricter than the WHO share it resembles.
- **Cholesterol's 300 mg FDA DRV is live, and is still not a cap here.** It is a
  _labelling_ reference value; the criterion asks for a published daily ceiling from
  the WHO, and the WHO does not address dietary cholesterol. The intake-guidance
  record has moved the same way: the 2015–2020 Dietary Guidelines for Americans
  dropped the 300 mg limit in terms ("The Key Recommendation from the 2010 Dietary
  Guidelines to limit consumption of dietary cholesterol to 300 mg per day is not
  included in the 2015 edition"), the 2020–2025 edition set no figure, and the
  2025–2030 edition does not mention cholesterol at all — its Scientific Foundation
  describes "quantitative limits on total fat and dietary cholesterol" as "repealed".
  The FDA nonetheless re-adopted the DRV deliberately in the 2016 final rule
  (81 FR 33742), citing that removal, so the number is not a fossil — it is a live
  labelling value this app does not reach for. Cholesterol remains fully visible in
  the day modal's "Not tracked" section as an uncapped figure.
- **Total fat** diverges too — the WHO suggests ≤ 30% of energy (66.7 g) against the
  FDA's 78 g DRV — but total fat is a **reach-toward** target governed by
  ADR-0031/0033, and the app already ships 67 g from the IOM AMDR at 30% of energy.
  Nothing on this page reaches it.

---

## Total sugar is deliberately **not** here

The obvious further limit is absent on purpose, and for the criterion's "borrow"
clause rather than for want of any number. The panel's `sugar_content` key is
schema.org `sugarContent`, i.e. **total** sugars (intrinsic sugar in fruit and milk
included). Every published ceiling is for a _neighbouring_ quantity:

- the **WHO** caps **free sugars** at < 10% of total energy ("equivalent to 50 g …
  for a person of healthy body weight consuming about 2000 calories per day"), with a
  further suggestion of 5% or less — free sugars being added sugars plus those in
  honey, syrups and fruit juices;
- the **FDA** publishes a 50 g DRV for **added sugars** specifically;
- the **DGA 2025–2030** has abandoned the daily frame altogether, giving only a
  per-eating-occasion figure: "one meal should contain no more than 10 grams of added
  sugars."

Capping total sugar at any of these would flag a bowl of fruit as over limit — a
semantically wrong comparison against a quantity the panel does not carry. So sugar
stays a captured field with no cap (ADR-0032 "Out of scope"), and an
`added_sugar_content` key remains a data-first twin-expansion effort. Note for
whoever takes it: under this criterion that key does **not** inherit a cap
automatically, because the WHO's figure is for free sugars and added sugars is again a
neighbouring quantity. That effort will need to argue its own source.

---

## How to bake this in

Store a limits map keyed by the food-panel breakdown key, all values in **grams** (no
energy member — there is no calorie limit). Drop-in values for the reference module:

```ts
// Daily nutrient limits ("stay under"): the WHO sodium ceiling plus the WHO
// <10%- and <1%-of-energy fat ceilings, converted at 2,000 kcal and rounded down.
// Values in GRAMS. See daily-nutrient-limits.md.
export const BAKED_NUTRIENT_LIMITS_G = {
  sodium_content: 2, // WHO: "less than 2000 mg/day" of sodium (not salt)
  saturated_fat_content: 22, // WHO 10% energy: 200 kcal / 9 kcal/g = 22.2 g, rounded down
  trans_fat_content: 2, // WHO 1% energy: 20 kcal / 9 kcal/g = 2.2 g, rounded down
} as const;
```

A user override layers over these exactly as the reach-toward targets do (absent →
this baked cap, `> 0` → the user's cap, `0` → opt out of a limit), but with **no**
always-on clamp — unlike energy in the reach-toward set, no limit is mandatory.

---

## Correction (2026-09-30, issue #506)

This page previously sourced three of four caps to the FDA Daily Reference Values and
attributed the trans-fat ceiling to the WHO "Healthy diet" fact sheet **plus the WHO
REPLACE action package**. Both were wrong in ways worth recording, because the second
caused a filed ticket:

1. **REPLACE was the wrong citation.** It is an industrial-only elimination
   programme, and citing it alongside the ceiling implied the 2 g cap was about
   industrially-produced trans fat — which led to a reasonable doubt (#506) that the
   cap was being spent by ruminant trans fat the source "was not talking about". The
   2023 WHO guideline says the opposite in terms: the ceiling covers ruminant and
   industrial TFA alike. The number was right; the citation was not.
2. **There was no stated criterion for membership,** so the set's shape could not be
   checked and its two absences could not be distinguished from oversights.

#506 supplied the criterion, moved the authority to the WHO, and the set went from
four caps to three. Sodium 2.3 g → 2 g, saturated fat 20 g → 22 g, trans fat
unchanged at 2 g, cholesterol removed. The full argument, the measurement it was
tested against, and the rendering change that accompanied it are in **ADR-0032's
Amendment of 2026-09-30**.
