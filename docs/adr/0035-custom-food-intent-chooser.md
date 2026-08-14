# ADR 0035: The Custom tab becomes an intent chooser — quick-estimate, from-a-menu, from-a-plate-photo

**Status:** Accepted  
**Date:** 2026-08-03  
**Implemented:** `17382f7`, `915a732`, `c696190`, `f7f3054`; `ManualEntryFlow.svelte`

## Context

ADR-0034 upgraded the **Custom tab** of `FoodStager.svelte` into a full-panel
"Read-along" **label form** — a transcription surface for a _packaged_ nutrition
label, reached through four doors: three barcode-driven (a barcode **missing**
from Open Food Facts, an OFF twin **found-but-poor**, a barcode **unreadable**)
and one **always-on manual** tap (ADR-0034 §1, §2).

That form is the right tool for a food that _has a printed panel_. But a packaged
food almost always has a **barcode**, so it also has the Scan door — and the label
form is where those scans land. The manual Custom tap, meanwhile, is
overwhelmingly used for food that has **no label at all**: a restaurant meal, a
pub dinner, a takeaway. For those, a twelve-micronutrient read-along form is the
wrong shape — there is nothing to read along _to_. The user just wants to record
a calorie figure quickly, or the calorie figure a UK menu is legally required to
print, or a guess from a photo of the plate in front of them.

So the manual entry point and the barcode-label entry point have **diverged into
two different jobs** wearing one form. This ADR splits them: the manual Custom tab
becomes a small **chooser of three eating-out / estimation intents**, and the
ADR-0034 label form is **removed from the manual chooser but kept intact** for the
three barcode doors, where a packaged label genuinely belongs.

This **amends ADR-0034 §1 (the "always-on manual" door) and §2 (Custom tab
_becomes_ the form)**: after this ADR the Custom tab is a chooser, not the form;
the form is reached only via the three barcode doors. ADR-0034's scan capture,
save semantics (§6), `food/label_capture` provenance (§7), and OFF contribution
(§8) are otherwise untouched.

**Scope.** Three new manual intents (quick estimate, from a menu, from a plate
photo) as purpose-built mini-forms behind a chooser, a new `food/manual_entry`
provenance envelope, a new descriptive `food/ingredients` attribute, Recent/Search
filtering by intent, and a deferred `PlateEstimator` seam. Ruled **out**: any
change to the label form's internals, the barcode doors, or OFF contribution; a
real plate-estimation model call (deferred behind the seam, as ADR-0034 §4
deferred label AI-autofill); gram-scaling or partial-portion logging for these
intents (v1 logs the whole thing).

## Decision

### 1. The Custom tab becomes an intent chooser (amends ADR-0034 §2)

Tapping **Custom** (`✏️`, tab name unchanged) no longer opens the label form. It
opens a small **chooser** of three intents:

- **⚡ Quick estimate** — log a calorie figure fast.
- **📋 From a menu** — a named dish with the menu's calorie figure, ingredients
  optional.
- **🍽️ From a photo** — a plate photo; fill in (v1) or, later, an AI estimate.

Each intent is its **own purpose-built mini-form**, not a morph of one shared
form — the fields diverge enough that one form would Frankenstein. The label form
is **not** an option in this chooser.

Rationale: the manual job (food without a label) and the barcode-label job have
diverged; a chooser gives each intent a form sized to it and keeps the fast path
genuinely fast.

### 2. The label form stays, reachable only from the barcode doors (amends ADR-0034 §1)

ADR-0034's full-panel "Read-along" form is **kept intact**. It is removed from the
manual chooser (Decision 1) but still reached from the three **barcode-driven
doors** — missing, found-but-poor, unreadable — exactly as ADR-0034 §1 specified.
ADR-0034 §1's fourth door, **"always-on manual"**, is retired: manual entry now
routes to the chooser, not the label form. Nothing about scan capture, the
poor-quality predicate, save-by-barcode (§6), `food/label_capture` (§7), or OFF
contribution (§8) changes.

### 3. Quick estimate: calories + name + optional photo, one-off

The fastest path. Fields:

- **Calories (kcal)** — a number-pad entry (reuse the ADR-0023 numeric-first
  amount-entry idiom already built).
- **Name** — one line; **defaults to the meal name** if left blank ("Lunch",
  "Dinner"), so the day's list is never an anonymous "600 kcal".
- **Photo** — **optional**, the same `<input type=file accept=image/* capture=environment>`
  idiom as the label form; stored on the food (`food/photo_base64`, and mirrored
  into `food/label_photos[0]` per ADR-0034 §5's display-compat rule).

**No macros.** A quick estimate is honest about being calories-only.

**One-off.** It mints a `food:custom_` twin (the ledger needs a target) but is
**excluded from Recent/Search** (Decision 6) — a vague estimate is not a reusable
catalogue food.

### 4. From a menu: dish + calories required; place, ingredients, photo optional; reusable

The UK-menu case (menus are legally required to print calories). Fields:

- **Dish name** — required.
- **Calories (kcal)** — required; the one hard number the menu gives.
- **Place** — optional, stored as **`twin/brand`** (reusing the existing
  attribute) so "Piri chicken" is recognisable as _Nando's_ Piri chicken.
- **Ingredients** — optional, a **single free-text field** stored as a new
  **`food/ingredients`** attribute. **Descriptive only** — it is for memory,
  allergens, and future reference; it **never computes calories** (the menu's
  figure is authoritative). Structured ingredient rows (the recipe
  `IngredientListEditor`) are deliberately _not_ reused here — they would imply
  derived calories and conflict with the menu number.
- **Photo** — optional (of the menu or the dish).

**Reusable.** A menu dish is a real named food you return to, so it minted
`food:custom_` twin **appears in Recent/Search** (Decision 6). Macros are absent
(a menu rarely prints them); calories-only, per Decision 7.

### 5. From a photo of a plate: deferred estimator, blank-on-capture in v1, one-off

Estimating an unknown restaurant plate's calories is a **different task** from
OCR-ing a printed panel — so it is a **sibling extractor**, `PlateEstimator`,
not a reuse of ADR-0034's label `autofillFromPackageImage`.

**v1 fabricates nothing.** Mirroring ADR-0034 §4 (label AI-autofill deferred
behind the `AIAutofillResult` seam, v1 uses the empty result and calls no model),
the plate flow in v1 is: capture/pick a plate photo → a **blank** menu-style
review form opens with the **photo attached** → the user fills it in → save. The
`PlateEstimator` seam is wired but v1 calls its **empty variant**; **no model
call, no fabricated numbers.**

**The deferred real path.** When a real estimator lands, it returns a **proposal**
`{ name, estimated calories, ingredients[] }` that prefills the **same
menu-style review form** — a food name, an estimated calorie count, and the
identified foods, which is exactly the menu form's shape minus "Place". Under the
same **confirm-before-save** contract as ADR-0034 §3/§4, the proposal is never
written un-reviewed. The natural transport is the Workers-AI provider seam +
Settings API-key gate being stood up for label AI-autofill (map #62), but v1 does
**not depend on that landing** — the seam is independent and stubbed empty.

**One-off.** Like a quick estimate, a plate estimate mints a `food:custom_` twin
**excluded from Recent/Search** (Decision 6).

### 6. Provenance: a new `food/manual_entry` envelope keyed by `kind`

The three intents are neither ingested (`twin/raw_provenance`) nor label reads
(`food/label_capture`), so overloading either is wrong. A **new sibling
envelope** records manual-entry origin:

```jsonc
"food/manual_entry": {
  "adapter": "manual",
  "adapter_version": 1,
  "kind": "quick_estimate",   // "quick_estimate" | "menu" | "plate_estimate"
  "fields": ["name", "calories", "ingredients"]  // what the user supplied
}
```

Built by a pure, clock-free **`buildManualEntry(...)`** alongside
`buildLabelCapture` in `src/lib/food/provenance.ts` (same `RawProvenance` spirit —
the Datom's `time` is the entry basis). The **`kind`** discriminator is the single
source of truth for the reusability rule of Decisions 3–5: **Recent/Search
excludes `quick_estimate` and `plate_estimate`, includes `menu`.** Filtering keys
off this one field in one place.

### 7. Logging: whole-portion, calories frozen, macros omitted (absent ≠ 0)

All three intents mint a `food:custom_` twin and append **one consumption event
at `"1 serving"`** — the whole thing. **No gram scaling and no partial-portion
entry in v1** (edit later if you ate half). The event **freezes `calories` only
and omits protein/fat/carbs entirely** — consistent with ADR-0030 / #28's
**absent ≠ 0** rule. So these entries move the daily **calorie ring** but leave
the **macro meters** untouched, rather than silently claiming "0 g protein". The
dashboard must treat an omitted macro on an event as _not counted_, never as 0.

## Consequences

- **The Custom tab is no longer the label form** — it is a three-intent chooser
  (Decision 1); the label form is reached only via the three barcode doors
  (Decision 2). ADR-0034 §1's "always-on manual" door and §2's "Custom _becomes_
  the form" are amended accordingly.
- **`FoodChoice` / the stager↔host contract widens** to carry the three manual
  intents and their fields (`src/lib/food/food-staging.ts`), routed through
  `LogFoodSheet.handleChoose` to the writers.
- **A new `food/ingredients` (free text) attribute** and the reuse of `twin/brand`
  for "Place" on a `food:custom_` twin — both to register in
  `docs/eavt-vocabulary.md`.
- **A new `food/manual_entry` provenance attribute** (object, `kind`-keyed) with a
  `buildManualEntry` builder in `provenance.ts` — to register in the EAVT
  vocabulary beside `food/label_capture`.
- **Recent/Search gain an intent filter** keyed on `food/manual_entry.kind`
  (exclude `quick_estimate` + `plate_estimate`).
- **The writer path**: quick-estimate / menu / plate all persist through a
  manual-entry writer (extend `saveCustomFood` or a sibling) that stamps
  `food/manual_entry`; menu additionally writes `twin/brand` + `food/ingredients`;
  all mint `food:custom_`, none enrich a `gtin:` twin.
- **A new `PlateEstimator` seam** (`src/lib/food/`) sibling to the label
  `autofillFromPackageImage`, with an empty variant used by v1 — the real model
  call is a separate future effort (map #62 transport), no dependency for v1.
- **Consumption events may freeze calories with macros omitted** — the dashboard's
  macro-meter aggregation must treat omitted macros as not-counted (verify it does
  not coerce to 0).
- **Editing a logged manual entry re-opens its OWN mini-form**, prefilled from the
  twin (`kind`, name, calories, Place, ingredients, photo), and re-saves through
  the manual-entry writer — so the re-saved twin stays a manual entry of the same
  `kind` and a menu dish stays in Recent. It must NOT fall back to the label form
  (which would strip `food/manual_entry` and drop the dish from the catalogue).
- **Docs to update after acceptance**: the EAVT-vocabulary updates above.

## Alternatives considered

- **Keep "Enter nutrition label" as a fourth option in the chooser.** Rejected —
  a packaged food has a barcode and belongs in Scan → the label form; a manual
  label read duplicates that door and re-clutters the manual path this ADR is
  clearing.
- **Delete the label form entirely.** Rejected — the barcode doors (missing /
  poor / unreadable) still need the full-panel capture ADR-0034 built; only the
  manual entry point to it is removed.
- **New top-level tabs (Search · Scan · Custom · Menu · Photo).** Rejected —
  crowds the tab bar and blurs "Custom" against the new intents; a chooser keeps
  one manual mental model.
- **One Custom form with mode toggles.** Rejected — the intents' fields diverge
  enough (calories-only vs dish+place+ingredients vs photo-first) that a morphing
  form becomes a Frankenstein.
- **Structured ingredient rows for the menu dish** (reuse the recipe
  `IngredientListEditor`). Rejected — it implies calories _derived_ from
  ingredients, conflicting with the authoritative menu figure; free text is
  descriptive-only.
- **Overloading `food/label_capture` with new `method` values for the manual
  intents.** Rejected — conflates "read a label" with "estimated a plate";
  a sibling `food/manual_entry` keeps the adapter/method semantics ADR-0034 set.
- **Storing omitted macros as 0.** Rejected — false precision that would move the
  macro meters; absent ≠ 0 (ADR-0030 / #28).
- **A real plate-estimation model call in v1.** Deferred — the estimator is
  decoupled behind the `PlateEstimator` seam so the flow ships now on
  blank-on-capture; fabricating numbers (a mock stub returned to the user) is
  rejected outright as dishonest, exactly as ADR-0034 §4 uses the _empty_ result,
  not the mock.
- **Reusable quick-estimate / plate entries in Recent.** Rejected — a vague
  estimate is not a catalogue food; only the named menu dish is reusable.
