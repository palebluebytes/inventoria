# ADR 0037: A shared `Meter` primitive for the nutrition bars and the calorie ring

**Status:** Accepted  
**Date:** 2026-08-04  
**Amended by:** ADR-0061 (the display settings this record kept in the ledger moved out of it)  
**Implemented:** `ui/Meter.svelte`; `MacroMeters`, `DailyDashboard` RDA cells

## Context

The food dashboard shows nutrition progress in three places, and **none of them
was legible to assistive tech** — a search for `role="meter"`, `role="progressbar"`,
or `aria-valuenow` turned up nothing in the whole of `src/`.

- **MacroMeters** renders each macro/nutrient as a `.progress-bar-bg` track with a
  `.progress-bar-fill` div sized by `style="width: {fill}%"`; a nutrient with no
  target gets a striped `.no-target` track.
- **DailyDashboard**'s full-day RDA cells render the same shape under different
  names (`.rda-cell-bar` / `.rda-cell-bar-fill`), with an amber `over` state for a
  day total past its target.
- **CalorieRing** is a hand-computed SVG dial (`stroke-dashoffset`); a screen
  reader gets only the two `<span>` numbers, with no meter semantics at all.

The two bar surfaces are the same track-and-fill shape written twice, and the
value semantics are missing everywhere. bits-ui ships a `Meter` primitive that
supplies `role="meter"` + `aria-valuenow`/`min`/`max`; it is thin, but it is the
same headless-behaviour-plus-brutalist-skin split already used for `Slider`
(`QuantityGrams`), `Dialog` (`BottomSheet`, `Modal`), and `RadioGroup`
(`Segmented`, ADR-0036).

## Decision

**Introduce `ui/Meter.svelte` over bits-ui `Meter` for the two bar surfaces, and
give the calorie ring its meter semantics directly.**

- **A shared module for the bars.** `Meter.svelte` renders the track-and-fill bar
  and the meter semantics; `MacroMeters` and the RDA cells both render it (two
  real adapters, so the seam is genuine). The duplicated `.progress-bar-*` and
  `.rda-cell-bar-*` markup and CSS are removed in favour of one owned look (a 6px
  track, black fill, `border-radius: 0`), with an amber `over` state and a striped
  no-target state folded in.
- **Percent-based value model.** The bar is driven by `fill` (0–100, the width the
  callers already compute) with `aria-valuetext` carrying the human reading
  ("62 g of 90 g"). Callers pass a clamped percent plus the formatted strings they
  already hold; no raw grams or targets are threaded through, and the pure
  `buildNutrientMeters` / RDA view models are untouched.
- **No target is not a meter.** A nutrient with no configured target has no range
  to measure against, so `Meter` renders a striped, role-less track rather than a
  misleading empty progress bar (`fill === undefined`).
- **The ring carries aria directly.** The dial is a single bespoke SVG visual, not
  a track-and-fill bar, so routing it through the bar module would mean a
  visual-override slot used by exactly one caller. Instead the ring container gets
  `role="meter"` + `aria-valuemin`/`max`/`now` + `aria-valuetext`; its svg and
  numeric label are marked decorative so the reading is announced once.
- **bits-ui earns its place by consistency, not depth.** `Meter` is a shallow
  primitive — it sets three aria attributes. The leverage here is the shared
  module (the value semantics live in one place); wrapping bits rather than
  hand-writing `role="meter"` keeps the primitive vocabulary uniform with the
  other bits-backed controls.

## Consequences

- Every nutrition bar and the calorie dial now expose `role="meter"` +
  `aria-valuetext`; the dashboard's progress surface is legible non-visually for
  the first time.
- Two hand-drawn bar implementations collapse into one module. A future progress
  bar reaches for `Meter` instead of re-deriving a track-and-fill div.
- The class hooks change from MacroMeters-specific names (`.progress-bar-fill`,
  `.progress-bar-bg.no-target`) to the shared module's (`.meter-fill`,
  `[data-meter-state="empty"]`); four assertions in `food-ui.spec.ts` are
  rewritten to match, their intent (a targeted nutrient shows a fill; an
  untargeted one shows the empty track) preserved.
- The behaviour under these surfaces (`buildNutrientMeters` and the RDA row view
  models) is unchanged and still covered by its own unit tests below the UI seam.

## Amendment (2026-08-27): the ring is gone; calories are a bar like the rest

The decision above kept the calorie dial as a bespoke SVG visual and gave it
meter semantics of its own, on the reasoning that routing it through the bar
module would mean a visual-override slot with exactly one caller. That reasoning
was sound about the module; it was the dial itself that did not survive.

Calories now render as an ordinary `Meter` row at the head of `MacroMeters`.
`CalorieRing.svelte` is deleted, and with it the third meter surface: there are
two again, both bars, both the shared module.

- **`buildNutrientMeters` leads with a Calories meter**, in the same
  label/value/fill/target shape as every nutrient after it, filling toward the
  resolved `energy` target in kcal. It mirrors `buildNutrientPills`, which has
  always led with calories. Calories stay out of `NUTRIENT_CATALOGUE`, so they
  remain unselectable; that is now the only way they differ from a macro.
- **The one over-target rule is unchanged.** A day past its calorie target fills
  to 100% and stops, exactly as an over-target macro does. The amber `over` tint
  stays where ADR-0032 put it, on the stay-under limits.
- **`ui/Meter.svelte` is untouched.** The ring's removal takes a caller away from
  the module; it asks nothing new of it.
- **The dashboard aggregates are collapsible.** The bars were the tallest block on
  the screen and sat above the meals a user returns to through the day, so they
  fold away behind a titled header. The header also carries the way into the
  full-day RDA modal, which used to be an unlabelled tap on the whole aggregates
  block: with the block foldable, that tap would have taken the modal with it.
  The open/closed state is component state, not a setting — it is a "not now",
  and it opens fresh each visit.

The `.calories-num` / `.calories-sub` hooks the ring published are gone. The
day-total assertions in `food-ui.spec.ts` read `.macro-item.calories .macro-now`
instead, and `visual-catalog.spec.ts` drops the `.ring-container` mask that
existed only to hide the arc cap's antialiasing.

## Amendment (2026-08-28): the panel's fold is a stored preference

The amendment above called the aggregates fold "component state, not a setting
— it is a 'not now', and it opens fresh each visit." That was wrong about what
the fold means to a user. Someone who keeps the bars shut wants them shut, and
reopening them on every load makes the control something to re-apply rather
than something to set.

- **`settings/food/nutrition_panel_open` records it**, absent → open, only a
  stored `false` shutting it: the same shape `settings/food/round_nutrition`
  uses, and registered in `docs/eavt-vocabulary.md` beside it.
- **It rides the ledger, not `localStorage`.** The two things that leave the
  ledger do so because it is undeletable and it syncs — a secret must not be in
  it (ADR-0034 §8) and a log record has to be redactable and capped (ADR-0054
  §4). A display preference is neither, so it goes where the other display
  preferences already are.
- **Its own writer, `saveNutritionPanelOpen`.** ADR-0031 §2's rule: the settings
  screen does not own this fold, and saving a nutrient selection must not
  reopen a panel the user shut.
- **The view follows the store until the user taps it**, rather than seeding
  from it on mount. Seeding races: the settings query resolves asynchronously,
  so a mount-time read lands on the unset default and never corrects when the
  real datom arrives — the panel would reopen on every load whatever was
  stored. After a tap the local choice wins, so the panel flips under the finger
  while the write catches up.

The cost is a frame: the bars render open on first paint and fold once the
datoms resolve. That is what every other ledger-backed preference on this
screen already does, and the alternative is synchronous storage this value does
not otherwise justify.

## Amendment (2026-08-28): the fold is `localStorage`, because first paint waits for nothing

The amendment above put the fold in the ledger beside `round_nutrition` and
closed by saying the cost was "a frame: the bars render open on first paint and
fold once the datoms resolve". That was wrong by orders of magnitude, and it was
wrong about the kind of value this is.

Every ledger-backed store is asynchronous by construction. `createQueryStore`
holds an empty array until its first `dbClient.query` resolves, and that query
waits on the worker spawning, SQLite WASM loading and OPFS opening. Until it
does, a settings read returns the _unset default_. On a cold start that is
seconds of a panel the user had shut sitting open on screen, not a frame.

- **`localStorage` holds it** (`stores/device-settings.ts`), read synchronously, so
  the first frame is already correct. Absent still reads as open, so nothing
  changes for a user who never touched it.
- **This is a third reason to leave the ledger, and it is about _when_ a value
  can be read** rather than what it is. ADR-0034 §8 keeps secrets out because the
  ledger is undeletable and syncs; ADR-0054 §4 keeps log records out because
  redaction is a deletion. Neither applies to a fold. What applies is that the
  first paint depends on it.
- **`round_nutrition` and `visible_nutrients` stay where they are.** They change
  how a number formats, and the numbers are not there during boot either, so
  they can absorb the wait. A preference that decides whether a block of the page
  exists cannot. _(Overturned by ADR-0061: `visible_nutrients` decides which
  meters exist, so it has the same defect, and the line was drawn in the wrong
  place. Both moved.)_
- **The trade is sync and history**, and both are worth nothing here: a fold is
  view state, and appending a datom per toggle was polluting the ledger with it.

`settings/food/nutrition_panel_open` is therefore withdrawn before it ever
shipped, and its entry leaves `docs/eavt-vocabulary.md`.
