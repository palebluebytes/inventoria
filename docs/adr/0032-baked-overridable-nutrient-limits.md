# ADR 0032: Baked, user-overridable daily nutrient limits (the stay-under counterpart to ADR-0031)

**Status:** Accepted  
**Date:** 2026-07-31  
**Amended by:** ADR-0085 §1 (the limits blob is a device setting, not a datom); and the [Amendment](#amendment-2026-09-30-the-who-is-the-authority-the-set-is-three-and-the-overshoot-is-stated) below, which supersedes §1 and §4 of the original decision  
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

> **Superseded by the [Amendment](#amendment-2026-09-30-the-who-is-the-authority-the-set-is-three-and-the-overshoot-is-stated)
> (2026-09-30, #506): the set is **three** caps, the authority is the WHO rather than
> the FDA, two of the numbers below have moved, and cholesterol has left the set. This
> section never stated what qualifies a nutrient for a cap; the Amendment supplies that
> criterion. What stands: the unit invariant, the "new nutrient is a new key" move, and
> sugar's exclusion — though for a reason this section did not give.**

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

> **Partly superseded by the [Amendment](#amendment-2026-09-30-the-who-is-the-authority-the-set-is-three-and-the-overshoot-is-stated)
> (2026-09-30, #506): an over-cap row now also states **how far** over, as a
> percentage. Everything else in this section stands — modal-only, the reused amber
> primitive, the omitted-when-absent rule, and the deferred dashboard meter and
> top-of-modal cue, both of which remain deferred and were reconsidered under #506.**

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

## Amendment (2026-09-30): the WHO is the authority, the set is three, and the overshoot is stated

Issue [#506](https://github.com/palebluebytes/inventoria/issues/506) asked whether
ADR-0032's four caps are the right caps, on the strength of a measurement showing that
one serving of an ordinary reference food exhausts one. Both of the ticket's stated
doubts turn out to be wrong, and the caps changed anyway — for a different reason, and
so did the readout. This Amendment supersedes §1 and §4 in part; §2, §3 and §5 stand
untouched.

### 1. What the original decision was missing

§1 chose four nutrients without ever stating **what qualifies a nutrient for a cap**.
With no criterion, the set's shape could not be checked, its two absences could not be
told apart from oversights, and the question "are these the right caps?" had no test to
be answered against. That is the real defect #506 found, and it is upstream of every
number.

The criterion, now also carried in `BAKED_NUTRIENT_LIMITS_G`'s doc comment and in
`docs/reference/daily-nutrient-limits.md`:

> A nutrient gets a baked cap when a named authority publishes a **numeric daily
> ceiling** for **the quantity the panel actually carries**. The authority is the
> **WHO**. Where the WHO publishes a share of energy rather than a mass, it is
> converted at the 2,000-kcal reference diet the rest of the module is anchored to,
> rounded **down**, and the derivation is written down. A ceiling the app would have to
> **invent, soften, or borrow from a neighbouring quantity** is not a cap.

It is scoped to the limits set. The reach-toward targets are ADR-0031/0033's, rest on
the FDA Daily Values and the IOM AMDRs, and are untouched — including total fat, where
the WHO's ≤30%-of-energy figure (66.7 g) diverges from the FDA's 78 g DRV and the app
already happens to ship 67 g from the IOM AMDR.

**Why the WHO and not the FDA.** FDA-first was never argued; it was inherited from
whichever reference doc got transcribed first. The WHO publishes **intake**
recommendations for a global population; the FDA publishes **labelling reference
values** for a US market, and this codebase already reasons in EU jurisdiction (EU
1169/2011 in #495, an EU-hosted worker and bucket). One authority, applied when it is
inconvenient as well as when it is convenient — adopting the WHO where it is stricter
and refusing it where it is looser would not be alignment, it would be using the WHO as
a ratchet, and would leave no statable rule at all. **There is no fallback.** A second
link would have had exactly one user, cholesterol, and would have re-admitted by the
back door the judgement the criterion exists to remove. EFSA was considered and
publishes no numeric ceiling for any nutrient in this set.

### 2. The set: three caps

| key                     |    was |        now | source                                                |
| ----------------------- | -----: | ---------: | ----------------------------------------------------- |
| `sodium_content`        |  2.3 g |    **2 g** | WHO: "less than 2000 mg/day" of sodium                |
| `saturated_fat_content` |   20 g |   **22 g** | WHO 10% of energy → 22.22 g, rounded down             |
| `trans_fat_content`     |    2 g |        2 g | WHO 1% of energy → 2.22 g, rounded down               |
| `cholesterol_content`   |  0.3 g | **no cap** | the WHO publishes no ceiling                          |
| `sugar_content`         | no cap |     no cap | the WHO caps _free_ sugars; the panel carries _total_ |

Both derivations, and the WHO's strong-and-conditional pair for each fat ceiling, are
written out in `docs/reference/daily-nutrient-limits.md`. Rounding down is now a stated
convention rather than a number picked twice: it puts each stored cap below the strong
recommendation's figure and inside the conditional's "less than".

**Cholesterol keeps every gram of its visibility and loses only the amber.** It has no
reach-toward target and now no limit, so `buildDayRdaView`'s untracked loop places it in
the modal's **"Not tracked"** section as a plain value — the same treatment
`unsaturated_fat_content` already gets, and mechanically what the FDA's own label does
with trans fat: print the grams, publish no percentage. This needed no code beyond the
map, which is the clearest sign the original §4 rules were right.

A stored `settings/food/limits` override for `cholesterol_content` is silently dropped
by `LIMIT_KEYS`' filter in `device-settings.ts`. That is the intended outcome — the
nutrient has no cap to override — and needs no migration; the blob is a device setting
(ADR-0085 §1), not a datom.

### 3. The ticket's two doubts, both refuted

Recorded because the doubts were reasonable, well-sourced, and wrong, and the next
reader deserves to find that out here rather than re-deriving it.

**The trans-fat cap is not being spent by the wrong class of fat.** #506 held that the
WHO's <1%-of-energy target is for industrially-produced TFA and that its elimination
programme excludes ruminant TFA, so a cap spent by butter and cheese was spending it on
a class the source was not talking about. The 2023 WHO guideline says the opposite in
its Remarks: "TFA includes all fatty acids with a double bond in the trans
configuration, **regardless of whether the TFA come from ruminant sources or are
produced industrially**", and the Healthy diet fact sheet reads "no more than 1% of
total energy from trans fat **of any type**". The WHO could not separate the classes —
"the available data were too limited" — and no authority publishes a ruminant-specific
figure. **REPLACE is industrial-only, but it is an elimination programme and not the
source of the intake ceiling.** That conflation is traceable: this repo's own reference
doc cited REPLACE beside the ceiling, and `target-rationale.ts` showed the reader
"WHO REPLACE action package (eliminating industrial trans fat)" as a source for the cap.
The citation caused the ticket. It is corrected in both places; the number never moved.
(Incidentally, egg was among the ticket's ruminant examples. Eggs are poultry.)

**Cholesterol's DRV was not a fossil surviving on a label mandate.** #506 held that the
300 mg figure survives only because 21 CFR 101.9 still mandates the line. In fact the
FDA considered it in the 2016 final rule (81 FR 33742) — _after_ and _citing_ the
2015–2020 DGA's removal of the 300 mg limit — and affirmatively re-adopted it ("we
decline to revise § 101.9(c)(9) insofar as a DRV for cholesterol is concerned"),
newly extending it to children aged 1–3. The DGA walk-back is real and has gone further
than the ticket knew: the 2020–2025 edition set no figure and the **2025–2030 edition
does not mention cholesterol at all**, its Scientific Foundation calling the
quantitative limit "repealed". So cholesterol leaves this set not because its number was
stale, but because the criterion asks the WHO and the WHO does not address dietary
cholesterol. Against dropping it: 32% of the US population exceeds 300 mg on the FDA's
own NHANES figure in that same rule, and the app now says nothing about that beyond the
number itself.

### 4. The readout: an over-cap row states how far over

The independent defect, and the one a person actually meets. A limit row's fill was
`Math.min((total / target) * 100, 100)` with no percentage printed anywhere, so a day at
101% of a cap and a day at 400% rendered identically — full amber bar, value and cap in
grams, the reader left to divide two numbers. The amber said "you crossed a line" and
nothing about how far, which is precisely the information separating "I had an egg" from
"something is wrong here".

`DayRdaRow` gains an optional `overPct`, populated by the limits loop alone and only
when the row is over. `NutritionPanelCell` appends it to the existing muted target span
— `22.8 g` `/ 22 g · 104%` — and into `aria-valuetext`. Deliberately:

- **only when over.** Under the cap the bar already carries the proportion, and a quiet
  day stays quiet — §4's own rule.
- **muted, not amber.** The amber on the value has already done the attention-getting;
  a second amber element doubles the alarm without adding information. This follows
  ADR-0041's Amendment, which traded a visual cue for calmer copy in this same meter.
- **limits only, not reach-toward rows.** §4 rests the good/bad valence on the section
  heading rather than the colour, so the same amber already means two things. Magnitude
  is diagnostic for a breached cap and trivia for a passed goal: knowing you hit 130% of
  a protein target changes nothing you would do.
- **no display ceiling.** A `>999%` clamp would be an invented number.

**Three things were reconsidered and stay as §4 left them.** The at-cap boundary keeps
its strict `total > target` — a summed float day-total does not land on equality, and
for both derived fat caps the rounded-down figure means at-cap is genuinely under the
source's ceiling. The deferred **dashboard limit meter** and the deferred
**"Over your limit" top-of-modal cue** both stay deferred: answering "the readout is
uninformative" by making it louder rather than more informative is the ADR-0041 trade
run backwards. And a **per-serving** share of a daily cap stays refused — the 138% in
#506's measurement is a figure the app has never shown anyone, and `nutrient-display.ts`
already argues that a bar filling toward a _daily_ figure from a smaller grain reads as
that grain falling short. If it is ever wanted, it needs its own ADR and must beat that
argument rather than step around it.

### 5. The measurement, re-run against the caps that now ship

#506 was filed on `pnpm limits:census` over #241's ledger export — 172 live events
across 14 days. Moving two caps restales every figure quoted about caps, so the census
was re-run on the same export and the same script. **Before** is the caps as ADR-0032
shipped them; **after** is this Amendment's.

Biggest single serving as a share of its cap, all ordinary reference foods the corpus
ships, none paired or estimated:

| limit                                                    |        before |            after |
| -------------------------------------------------------- | ------------: | ---------------: |
| saturated fat — `Butter, stick, salted`, 22.709 g        |  114% of 20 g | **103% of 22 g** |
| cholesterol — `Eggs, Grade A, Large, egg whole`, 0.413 g | 138% of 0.3 g |       **no cap** |
| trans fat — `Butter, stick, salted`, 1.633 g             |    82% of 2 g |       82% of 2 g |
| sodium — `Bread, french or vienna`, 1.391 g              |  60% of 2.3 g |   **70% of 2 g** |

Days over cap, which is what tints a meter:

| limit         |  before |   after |
| ------------- | ------: | ------: |
| sodium        | 2 of 14 | 2 of 14 |
| saturated fat | 1 of 14 | 1 of 14 |
| cholesterol   | 2 of 14 |       — |
| trans fat     | 0 of 14 | 0 of 14 |

Three findings worth keeping:

1. **Realigning the caps moved no crossing in this population.** Sodium's two crossing
   days are 3.07 g and 2.35 g, over both 2.3 g and 2 g; saturated fat's single day is
   22.84 g, over both 20 g and 22 g. The caps moved and the amber fired on exactly the
   same days.
2. **The ticket's headline case is gone and the survivor is marginal.** The worst
   single-serving share was 138% (one egg against the cholesterol cap) and is now
   nothing. The only serving still exhausting a cap on its own is 22.709 g of saturated
   fat in a knob of butter, at 103% — which is a true and useful thing for a meter to
   say.
3. **#506's "2/1/2/0" was read in the wrong order** when the ticket was triaged. The
   script's order is sodium / saturated fat / cholesterol / trans fat, so sodium was
   always crossing twice and trans fat never once — not the reverse. Anyone re-reading
   the ticket thread should take the table above over the figures quoted there.

### 6. What this does not touch

- **#495 is unrevised.** It settled that a pairing's fill may supply a limit,
  partitioned by nutrient; what changed is the membership of the set it partitions,
  which follows from this ticket by construction. Its rule now reaches one
  lawfully-silent limit (trans fat) rather than two, and `scripts/limit-fill-census.mjs`
  loses cholesterol from its own table for the same reason. The **shipped** never-fill
  rule is unaffected: it keys off the EU mandatory declaration in
  `src/lib/food/marked-panel.ts`, never off `LIMIT_KEYS`.
- **The added-sugar follow-up got harder, not easier.** It is named in the original
  Consequences as extending this machinery by one key. Under this criterion it does
  **not** inherit a cap on arrival: the WHO's ceiling is for _free_ sugars, added sugars
  is a neighbouring quantity, and the FDA's exact 50 g added-sugars DRV is no longer a
  source this app reaches. The DGA 2025–2030 has meanwhile abandoned the daily frame
  entirely, publishing only "one meal should contain no more than 10 grams of added
  sugars". That effort must argue its own source.
- **No artifact staleness gate, and no visual baseline.** Neither byte-compared
  artifact reads `nutrition-targets.ts` or `target-rationale.ts`, and no catalogue
  baseline has ever photographed the full-day modal, so nothing under ADR-0099 §8 is
  owed.
