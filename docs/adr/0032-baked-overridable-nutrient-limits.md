# ADR 0032: Baked, user-overridable daily nutrient limits (the stay-under counterpart to ADR-0031)

**Status:** Accepted  
**Date:** 2026-07-31  
**Amended by:** ADR-0085 §1 (the limits blob is a device setting, not a datom)  
**Implemented:** #43 (`600a602`, `792e28b`, `755e664`, `496f484`, `f20625d`)

## Context

ADR-0031 gave the food panel a **reach-toward** model: energy, the macros, fibre, and
the twelve label micronutrients each get a baked, user-overridable daily target you aim
_up_ toward, with a fill bar and an amber tint once you pass it. It **deliberately
deferred** the other half — the **limit** nutrients (sodium, saturated fat, trans fat,
cholesterol, sugar) — recording that "a 'stay-under' semantic with amber-past-100%
rendering is a deliberately deferred follow-up" and "the 'stay-under' view is a later
effort."

This ADR is that follow-up (issue #43). It decides the **limit** model: which nutrients
get a cap, where the cap numbers come from, how a user overrides them, and how a day is
rendered against them. It mirrors ADR-0031 point-for-point but **inverts the meaning** —
the bar fills toward a cap and amber marks _exceeding_ it (over = bad), where the
reach-toward bar's amber marks _reaching_ a goal.

The primary-source numbers are transcribed into a new reference asset beside the
reach-toward ones: `docs/reference/daily-nutrient-limits.md` (FDA Daily Reference Values
for sodium / saturated fat / cholesterol, plus the WHO <1%-energy trans-fat ceiling).
Implementation is a separate effort, as ADR-0031's was.

## Decision

### 1. The limit set is four nutrients; sugar is deferred

The baked limit map carries exactly four keys — **`sodium_content` 2.3 g** (2,300 mg),
**`saturated_fat_content` 20 g**, **`cholesterol_content` 0.3 g** (300 mg), and
**`trans_fat_content` 2 g** — every value in the panel's canonical unit (grams),
transcribed from `docs/reference/daily-nutrient-limits.md`. The first three are FDA DRVs
(21 CFR 101.9(c)(9)); trans fat has no FDA DV, so its cap is the WHO guideline
(< 1% of energy ≈ 2.22 g at 2,000 kcal, rounded to 2 g). There is **no energy/calorie
limit** — the limit set has no always-on member.

`unsaturated_fat_content` stays untargeted (no meaningful cap), surfacing only in the
modal's "Not tracked" section when a day carries it.

**Total sugar is removed from the display catalogue, not limited** (see Out of scope).

This obeys the panel invariant (ADR-0021: one fixed unit per field) and the "new nutrient
is a new key" move — a future limit (e.g. added sugars) is one more entry, no schema
change.

### 2. Overrides are a separate blob datom, with the same presence/absence semantics

Limit overrides live in their **own blob datom** `settings/food/limits` — parallel to,
and independent of, the reach-toward `settings/food/targets` — a **partial**
`{ key: number }` map filtered to the four-key limit set, each value in grams. A separate
datom (not a fold into `settings/food/targets`) keeps each attribute **self-describing**:
`targets` is unambiguously reach-toward, `limits` unambiguously stay-under, and neither
blob can leak a key into the other's semantics. This is the same
blob-per-coherent-preference-set granularity ADR-0031 chose (and ADR-0009 established);
"aim for" and "stay under" are two coherent sets a user edits as distinct groups.

**Presence/absence in that map is the model** — three states per key, identical to the
reach-toward blob:

- **absent** → use the baked cap (the common case);
- **`> 0`** → an override cap; use this number instead;
- **`0`** → an explicit **opt-out**; the nutrient has _no_ limit (no bar; it falls to the
  modal's "Not tracked" section if the day carried it).

A **merge resolver** `resolveNutrientLimits` layers `override ?? baked` per key into the
resolved limits map the modal builder reads. Unlike `resolveNutrientTargets`, it carries
**no energy-clamp special case** — no limit is mandatory, so every key honours the `0`
opt-out uniformly. It reuses the existing `parseNutrientEntry`/`formatNutrientValue`
round-trip for display-unit entry at the editor edge; storage stays grams end-to-end.

### 3. Settings editor: a new "Limits" section of toggle-less cards

The Nutrition Display card grows a third section — **"Limits"** (shared
`SECTION_LIMITS` constant, so the editor and the modal name the group identically, as
`SECTION_MACROS`/`SECTION_MICROS` already do) — below "Vitamins & minerals". Its cards
reuse the shared `NutrientCard`, but rendered like the **Calories** card
(`hasVisibility=false`): **plain, toggle-less** cards, since a limit is not a dashboard
meter this effort (Decision 4) and so has no visibility to toggle. Each card is the same
allowance idiom — a numeric input in the nutrient's display unit (mg/g), its unit column,
and a `↺` reset — reading placeholder-vs-value for custom-vs-default.

- **`0` opt-out** shows an inline **"no limit"** hint (the stay-under analogue of the
  reach-toward "hidden — no meter" hint).
- The limit cards write **`settings/food/limits`** via their own
  `editLimit`/`resetLimit`/`saveFoodLimits` path. Critically, that path **never touches
  `visible_nutrients`**: the reach-toward editor auto-tracks a positive custom target
  into the dashboard selection, but a limit has no dashboard meter, so it must not.

### 4. Rendering is the full-day modal only; the dashboard meter is deferred

Limits render in the **full-day RDA-vs-target modal** (ADR-0031 §4), not on the always-on
dashboard summary meters, this effort. `buildDayRdaView` gains a fifth section —
`limits: DayRdaRow[]` — ordered:

> Biggest gaps → Energy & macros → Vitamins & minerals → **Limits** → Not tracked

The limit rows reuse the existing `DayRdaRow` shape and the `rdaCell` snippet **unchanged**
— fill the bar toward the cap, tint amber (`--rda-over`) once over. The amber primitive is
reused as-is: mechanically a limit bar is identical to a reach-toward bar (fill toward a
number, amber past it); what makes crossing the line _bad_ rather than _good_ is the
**grouping** ("Limits" section), not a new colour — so the two-tone brutalist palette
(ADR-0003) gains no red alarm colour.

Rendering rules **invert the absent case** (issue #43 story 5):

- a limit **present and under** its cap → a fill bar toward the cap;
- a limit **present and over** → bar full + amber (the warning);
- a limit the day carried **none** of → **omitted from the Limits section entirely**
  (a "bad" nutrient at zero is ideal, not a gap — it must stay quiet, unlike a
  reach-toward nutrient's `— / target` shortfall row);
- a limit **opted out** (`0`) → falls to "Not tracked" as a plain value if the day
  carried it.

The **"Not tracked" section** correspondingly shrinks to only the truly-untargeted
nutrients a day carried — unsaturated fat, plus any reach-toward or limit `0` opt-outs.
`buildDayRdaView`'s untracked filter gains a `!hasLimit` clause.

The **"Biggest gaps" strip stays a pure reach-toward shortfall ranking** — a limit
_overage_ is the opposite signal ("eat less", not "eat more"), so limits never enter the
gaps pool (they fall out naturally: gaps ranks over the macro/micro rows only). A
prominent "over your limit" cue is a deferred follow-up (see Consequences).

### 5. Register the new attribute

`settings/food/limits` joins `settings/food/{visible_nutrients,round_nutrition,targets}`
in `docs/eavt-vocabulary.md`. As with ADR-0031, there are no existing users, so no
migration is needed.

## Consequences

- **A new blob attribute** `settings/food/limits` is added, read-folded and filtered to
  the four-key limit set exactly as `settings/food/targets` is to the reach-toward set,
  and written by an independent `saveFoodLimits`.
- **A new baked map + resolver** (`BAKED_NUTRIENT_LIMITS_G`, `LIMIT_KEYS`,
  `resolveNutrientLimits`) sit beside the reach-toward ones in
  `src/lib/food/nutrition-targets.ts`, transcribed from the new reference doc; a corrected
  DV/WHO figure moves the doc and the module together.
- **The full-day modal gains a "Limits" section** and its "Not tracked" section shrinks;
  the dashboard summary meters are **unchanged** this effort.
- **`sugar_content` disappears from every display surface** (meter, pill, breakdown,
  modal, editor) while staying a captured schema.org field in the freeze path — the
  consumption snapshot (ADR-0022) is untouched and past logs keep their sugar totals.
- **The consumption snapshot is untouched.** Limits are a display-time denominator only,
  like targets — no `event/metrics` or recipe-instantiation changes.
- **Deferred follow-ups**, each named here so they are not lost:
  - an **`over`-capable dashboard limit meter** — extending `buildNutrientMeters` /
    `MacroMeters` with a kind/`over` notion and a limit selection model, so a tracked
    limit shows on the always-on summary with inverted amber;
  - a prominent **"Over your limit" cue** at the top of the modal (the stay-under analogue
    of the Biggest-gaps strip), pairing with the dashboard meter above;
  - an **`added_sugar_content` key and its 50 g FDA limit**, a data-first twin-expansion
    effort (ADR-0030 territory) into which this stay-under machinery extends by one key.

## Out of scope

- **Total sugar as a limit.** The FDA 50 g DV is for **added** sugars; the panel's
  `sugar_content` is schema.org `sugarContent` = **total** sugars. Capping total sugar at
  an added-sugar number is a semantically wrong comparison (fruit and milk sugars would
  count against it), and no authoritative _total_-sugar daily limit exists to bake
  instead. So sugar is removed from the display catalogue now (kept as captured data) and
  a correct `added_sugar_content` limit is deferred to the twin-expansion follow-up above.
- **A calorie limit.** The reach-toward set makes energy an always-on _target_; there is
  no corresponding stay-under calorie cap in this effort.
- **Dashboard summary rendering of limits** (deferred, above).

## Alternatives considered

- **Folding limits into `settings/food/targets` with a per-key kind.** Rejected: the
  "kind" is already derivable from the key (a key belongs to exactly one baked map), so a
  per-key tag is redundant; and a single blob mixing "aim for" and "stay under" values
  under an attribute ADR-0031 named "the reach-toward overrides" loses the self-describing
  clarity a separate `settings/food/limits` datom keeps, while gaining nothing.
- **A distinct colour (red) for over-limit.** Rejected: it adds an alarm colour the
  brutalist-minimal palette (ADR-0003) avoids and implies a severity hierarchy the app
  doesn't otherwise express. The over-limit _valence_ is already legible from the "Limits"
  grouping; the amber `--rda-over` primitive means "over the line" consistently, with the
  section supplying good-vs-bad.
- **Rendering limits on the dashboard meters this effort.** Deferred: the meter builder
  clamps fill to 100 with no `over` concept, so limits there need a kind/`over` rework and
  a selection-model decision — enough weight for its own pass. The modal already is the
  "everything against target" surface and carries all the machinery.
- **A 0 g / "any is over" trans-fat limit** (literal to "as low as possible"). Rejected:
  0 breaks the `value / cap` fill math and renders a permanently-amber alarm the instant
  any trans fat appears; the WHO <1%-energy 2 g ceiling is citable and makes the bar a
  useful signal rather than a constant warning.
- **Showing an absent limit as `— / cap`** (parallel to the reach-toward absent row).
  Rejected: a "bad" nutrient the day carried none of is ideal, not a gap — surfacing it
  would nag; issue #43 story 5 requires it stay quiet, so absent limits are omitted.
