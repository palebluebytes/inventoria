# ADR 0061: A setting is a datom only if its past values matter

**Status:** Accepted  
**Date:** 2026-08-28  
**Amends:** ADR-0037 (the amendment that kept the display settings in the ledger)  
**Implemented:** `stores/device-settings.ts`; `settings.store.ts`, `NutritionTargetEditor`, `FoodSettingsSheet`, `SettingsView`, `ingestion/fetcher.ts`

## Context

Every application setting was a datom on `settings:global`, because that is where
settings went. Nothing had ever asked whether they all belonged there.

Two of them did not, and it showed. The dashboard's nutrition panel remembers
whether it is folded. Stored as a datom, a panel the user had shut came back
**open for several seconds** on every refresh before folding itself.

The cause is structural, not a bug to fix in place. Every ledger-backed store is
asynchronous by construction: `createQueryStore` holds an empty array until its
first `dbClient.query` resolves, and that query waits on the worker spawning,
SQLite WASM loading, and OPFS opening. Until it does, a settings read returns the
**unset default**. Any value the first paint depends on is therefore wrong on
screen for the whole of the database's boot.

`settings/food/visible_nutrients` has the same defect and had simply never been
named: the dashboard draws the default four meters, then swaps in the user's
selection once the ledger wakes. `settings/food/round_nutrition` shares it in a
milder form, since the numbers it formats are not there during boot either.

There was a second, quieter cost. The ledger is append-only, so folding a panel
appended a datom that is kept forever. "The panel was shut on Tuesday" is not
history. It is noise in an immutable log whose value is that everything in it
means something.

And a third: because `saveSettings` wrote several unrelated attributes at once,
three separate screens each had to read the others' values through their own save
call so as not to clobber them. `SettingsView`, `FoodSettingsSheet` and
`NutritionTargetEditor` all carried a comment explaining this. That hazard is a
symptom of unrelated things sharing a writer.

## Decision

**A setting is a datom only if its past values mean something. Otherwise it is a
view preference and lives in `localStorage`.**

The test is deliberately about meaning, not about mechanism, so it can be applied
to a setting that does not exist yet.

- **Past values matter → the ledger.** A nutrition target does: "in March I was
  reaching toward 2,400 kcal" is a fact about the user, and the ledger is a record
  of facts. A consent does, twice over — what was agreed, and when. So
  `settings/food/targets`, `settings/food/limits`,
  `settings/food/calculated_targets`, `settings/food/profile`,
  `settings/off_contribute` and `settings/log_export` all stay exactly where they
  are.
- **Only the current value matters → `localStorage`.** Which nutrients a meter row
  shows, how many decimal places a kcal figure reads at, and whether a panel is
  folded are properties of the view, not of the user. So is the scraper proxy a
  browser must route an HTML fetch through: it is configuration for one device.
  They move to `stores/device-settings.ts`: `visible_nutrients`,
  `round_nutrition`, the panel fold, and `scraper_proxy_url`.
- **The timing follows from the meaning, and confirms it.** A preference that only
  matters now is exactly the kind the first paint needs now, and `localStorage` is
  synchronous. The two halves of the rule agree on every value tested against
  them, which is why the rule is stated as one line rather than as a list of
  exceptions.
- **This is a third reason to leave the ledger**, and it is distinct from the two
  already recorded. ADR-0034 §8 keeps secrets out because the ledger is
  undeletable and it syncs. ADR-0054 §4 keeps log records out because redaction
  there is a deletion and the cap removes entries. Both are about what the value
  _is_. This one is about whether its history is worth keeping.
- **Each preference gets its own key and its own setter.** The rule ADR-0031 §2
  applies to the datom writers applies here for the same reason: a screen that
  does not own a preference must not be able to overwrite it.
- **No migration.** The project is pre-release and ADR-0034 §8 set the precedent
  when secrets left the ledger: the old datoms are abandoned, never read again. A
  user who had customised these meets the defaults once and sets them again. Both
  attributes keep their absent-means-on shape in `localStorage`, so nothing else
  changes underneath them.

## Consequences

- The nutrition panel, the meter selection and the calorie precision are correct
  in the first frame. Nothing renders a default it then has to correct.
- `saveSettings` is gone. It bundled four unrelated attributes, which is why all
  three screens touching one of them had to read the others through; one attribute
  is left, so it becomes `saveOffContribute`, and every settings writer in the
  module now touches only itself. `SettingsView` writes no datom at all.
- `SETTINGS_STRING_ATTRS` is gone with it: every value the ledger still holds is a
  blob or a boolean, so nothing needs a string decoded by hand.
- `saveCalculatorPlan` loses `visible_nutrients` from its atomic append. What that
  transaction protects is the defaults-versus-overrides pair (ADR-0033 §4), which
  is intact. The worst a half-applied plan can now cost is a meter row shown or
  not shown, where before it could not cost even that.
- `NutritionTargetEditor` no longer seeds these two from an effect. They are read
  synchronously at construction, which removes the seeding race that form of
  initialisation always carries.
- The ledger stops accumulating a datom per fold, per meter toggled, per rounding
  switch.
- `docs/eavt-vocabulary.md` states the test in its settings preamble, so the next
  person adding a setting is asked the question before they add an attribute.
- These four no longer sync between devices and are absent in a private window.
  For view state and one device's proxy that is the right trade, and it is the
  price the rule names. The proxy keeps its `VITE_SCRAPER_PROXY_URL` fallback, so a
  dev with a `.env` is unaffected either way.
