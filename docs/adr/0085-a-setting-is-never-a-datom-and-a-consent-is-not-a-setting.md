# ADR 0085: A setting is never a datom, and a consent is not a setting

**Status:** Accepted  
**Date:** 2026-09-01  
**Amends:** ADR-0031 §2, ADR-0032 §2, ADR-0033 §2/§4 (the blob datoms those records put on `settings:global`), ADR-0054 §4 (the export consent is a consent, not a setting)  
**Implemented:** #288 — `stores/device-settings.ts`, `stores/consent.store.ts`, `NutritionTargetEditor`, `DailyDashboard`, `FoodSettingsSheet`, `FoodStager`, `LogSettingsSection`, `LogReviewSheet`

## Context

[ADR-0063](0063-a-setting-is-a-datom-only-if-its-past-matters.md) drew the line
through the middle of the settings: a setting is a datom **if its past values
mean something**, otherwise it is a view preference and lives in `localStorage`.
Under that test the fold state, the meter selection and the calorie rounding
left; the nutrition targets, the limits, the calculator's frozen plan, the inert
body profile and the two consents stayed.

The test held for eight days and then failed in the place it was least expected
to. [#274](https://github.com/palebluebytes/inventoria/issues/274) went looking
for a predicate a Facet-scoped wipe could be derived from, and found that
**every setting in the app lives on one entity**, `settings:global`, written by
both Facets: `settings/food/targets`, `settings/food/limits`,
`settings/food/profile`, `settings/food/calculated_targets` and
`settings/off_contribute` sit there beside the root's `settings/log_export`.
[ADR-0076](0076-a-facet-is-an-installable-face-onto-one-jar.md) §4 makes an
entity the unit a Facet owns, so a single shared settings entity is the one
place in the jar where ownership cannot be decided at all. Splitting it by
attribute is exactly what §4 forbids.

That is what forced the question, but it is not the reason for the answer. The
reason is that ADR-0063's test was asking about the wrong thing.

**"Do the past values matter?" is a question about a value; the ledger's
membership rule is about a kind.** The ledger records facts about the world you
tracked: you ate this, you read that, you did the habit on Tuesday. How the app
is configured is not one of those facts. ADR-0063 answered "in March I was
reaching toward 2,400 kcal" and treated it as a fact about the user, which it
is; what it is not is a record of anything that happened. A target is the line
the dashboard draws. Nothing was measured when it was set.

Applied honestly, the old test also does not stop. Almost any setting's past can
be made to sound meaningful in a sentence, which is why the rule produced a
list rather than a boundary, and why a reader adding a new setting had to guess
which side of a sentence it fell on.

**The alternatives that were live.**

- **Keep ADR-0063 and split `settings:global` into one entity per Facet.** This
  answers #274 and nothing else. It leaves the membership rule as a judgement
  call per setting, and leaves the ledger accumulating a datom every time
  somebody nudges a target.
- **Move everything, consents included, to `localStorage`.** Simple, and wrong
  in the one place it matters: a consent to publish your data into a public
  third-party database, held on a per-device store the user can silently clear,
  with no record of what was agreed or when. Rejected in §2.
- **A settings toggle paired with a separate audit datom.** Two records of one
  consent, free to disagree. Rejected in §2.

**Scope.** This record decides what may be a datom and where the two consents
live. It does not change what a target or a limit _means_ (ADR-0031 §2's
presence/absence model and ADR-0032's stay-under twin are untouched), it does
not change either consent's shape (ADR-0034 §8's model C and ADR-0054 §4's
per-channel export choice both stand), and it does not decide which surface
carries which control, which is
[ADR-0080](0080-a-facet-carries-a-jar-wide-control-only-where-losing-it-loses-data.md)'s.

## Decision

### 1. A setting is never a datom

The ledger records facts about the world you tracked. **How the app is
configured is not one of them**, whatever its past values would read like in a
sentence. Every application setting lives in `localStorage`, through
`stores/device-settings.ts`.

This replaces ADR-0063's test rather than refining it. That record's own worked
examples come out differently under this one, so there is no sentence of its
decision left to amend around.

`settings:global` does not get split. It **disappears**: nothing writes it, and
the `settings/` attribute namespace is retired whole.

The rule is categorical so that it can be applied by someone who has not read
this record. "Is this how the app is configured?" is answerable at the moment a
new setting is invented; "will its past values mean something in March?" is not.

### 2. A consent is not a setting, and it stays in the ledger

A consent is a **recorded act** — the same category as a logged meal, not the
same category as a folded panel. Something happened: at a moment you can name,
the user agreed to something they can state. That is a fact about the world, and
it is exactly what the ledger is for.

This is §1 forcing a distinction the vocabulary was blurring, **not an exception
to it**. The two consents were called settings because they are toggles on a
settings screen, which is a fact about where the control is drawn and not about
what the datom means.

Each consent gets **its own entity**, so no entity in the jar has two owners:

| Entity                        | Consent                                                     | Owner          |
| ----------------------------- | ----------------------------------------------------------- | -------------- |
| `consent:food_off_contribute` | Contributing corrected label data back to Open Food Facts   | food (Rations) |
| `consent:log_export`          | Exporting the root Facet's local logs                       | root           |
| `consent:food_log_export`     | Exporting Rations' local logs (ADR-0080 §5's second entity) | food (Rations) |

One attribute carries all three: **`consent/granted`**, a JSON boolean. Absent
means not granted, so an unwritten consent and a withdrawn one differ in the
ledger and read the same to the code that gates on them. _What_ was agreed is
the entity; _when_ is the datom's own stamp. Nothing else is stored, because
nothing else is known.

**Rejected: moving the consents to `localStorage` with everything else.** A
consent to publish your food data into a public third-party database is not
configuration, and a per-device store the user can clear without noticing is the
wrong place to keep the only evidence of it.

**Rejected: a settings toggle paired with a separate audit datom.** Two records
of one consent that are free to disagree, and a reader with no way to tell which
one the submit path actually checks.

### 3. The consents are named for what they govern, never for a Facet

ADR-0076 §2 makes a Facet id **build vocabulary**: it appears in the registry and
in the per-entry-point build constant, and it is never written to a datom. That
rules out the obvious naming, `consent:root/…` and `consent:rations/…`, and it
should: a datom naming an install would make the roster stable identity, and
this project changes the roster more readily than it changes an entity id.

So the discriminator is **what the consent is about**, and the two counts differ
because the two consents are about different kinds of thing:

- **`off_contribute` is one consent, because it governs an act on the world.**
  Contributing to Open Food Facts is the same act whichever screen offers it, so
  the root's food screen and Rations read and write the same entity. It carries
  the `food_` segment because the food Tracked Domain owns it, in the same sense
  `event:consume_` is food's.
- **`log_export` is one consent per Facet, because it governs an egress door**,
  and each Facet has its own. That count is ADR-0080 §5's, decided there and
  applied here. The root's door is the unqualified `consent:log_export`; the door
  on Rations' own settings surface is `consent:food_log_export`, named for the
  domain that registers the only channel there is.

**Two owned prefixes, not three registry entries.** `consent:food_` is food's and
`consent:log_export` is the root's; the two are prefix-disjoint, so a
prefix-scoped read can never take the other Facet's row. A new food consent needs
no registry edit. `consent:` bare is owned by nobody and must never be scoped by,
because it contains both.

**`consent:log_export` belongs to no Tracked Domain.** It is the root Facet's
directly: the log facility is machinery, not a tracked area of anyone's life.
ADR-0076 §4 describes the registry as recording "the entity prefixes a Facet's
domains own", and this is the first prefix that has no domain to hang from.
Recorded here rather than repaired here, because the registry it affects is
[#289](https://github.com/palebluebytes/inventoria/issues/289)'s to write.

### 4. `consent:food_log_export` is declared and not yet written

Rations has no settings surface until the split ships, so the second export
consent has no writer today and this change adds no dead constant for it. It is
declared in `docs/eavt-vocabulary.md` as decided-and-unbuilt, so the ticket that
builds Rations settings finds the name rather than inventing a second one.

Until then the root's Local Logs card gates food's only channel with the root's
own consent, which is what ships now and what ADR-0080 §5 was written to end.

### 5. A nutrition target is a setting, and its cost is stated, not discovered

`settings/food/targets`, `settings/food/limits`,
`settings/food/calculated_targets` and `settings/food/profile` move to
`localStorage`. They configure what the dashboard draws as your line; nothing
was measured when they were set.

The cost is real and it is named here so nobody meets it as a surprise:

- **`localStorage` is per-device and unsynced by design.** A target set on your
  phone never reaches your laptop.
- **They leave the Ledger export.** [ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md)
  exports datoms, so a target is no longer in the file. A user restoring a jar
  gets their meals and re-enters their goals.
- **Own-device convergence would carry your meals and not your goals.** The p2p
  arc (ADR-0072 through ADR-0075) converges the ledger, and these are no longer
  in it.

**The door, if that turns out to matter:** a target becomes a **recorded goal** —
the same category as a consent, an act with its own entity prefix and its own
moment — never a setting readmitted to the ledger. "I set a goal of 2,400 kcal
on the third of March" is a fact about something that happened. "The dashboard
draws its line at 2,400" is not. If the first one is what the app wants to keep,
it should say so and record it as one.

**The keys carry the domain, because a wipe will need them to.**
[ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §2 takes
"every `localStorage` record under the Facet's own namespaces" as well as the
Facet's datoms, so the four move to `inventoria_pref_food_*` rather than to four
unrelated names. **Four of food's existing device keys do not carry that segment** —
`inventoria_pref_visible_nutrients`, `inventoria_pref_round_nutrition`,
`inventoria_pref_calories_tracked` and `inventoria_pref_nutrition_panel_open` — which
is a fact the wipe inherits rather than one this record fixes: renaming a live key
loses the user's stored value, and there is no reason to spend that here.

**What this costs at the write path:** ADR-0033 §4 applied the calculator's plan
as one atomic append, so a mid-write failure could not strand new defaults over
stale overrides. `localStorage` has no transaction, so the three writes are now
sequential. The exposure is smaller than the guarantee that replaced it — the
writes are synchronous, in one function, with no await between them, and the
only realistic failure is a quota error that the store's guarded write swallows
per key. Recorded rather than claimed away.

### 6. What this does not disturb

- **The two earlier reasons for leaving the ledger stand and are untouched.**
  ADR-0034 §8 keeps secrets out because the ledger is undeletable and it syncs.
  ADR-0054 §4 keeps log records out because redaction there is a deletion and the
  cap removes entries. This record is a third reason, and it is about a kind
  rather than about a value's sensitivity.
- **ADR-0063's second half was right for a reason that survives.** View
  preferences were already in the right place; each keeps its own key and its own
  setter (ADR-0031 §2's rule); and the boot-timing argument — a ledger read
  returns the unset default until the worker, the WASM and OPFS are up, so any
  value the first paint depends on is wrong on screen for the whole of boot — now
  applies to every setting rather than to three of them. It is a consequence of
  this rule, not the reason for it.
- **Nothing about what a target, a limit or a consent _means_ changes.** Only
  where each is kept.

### 7. No migration

Map decision 8, and ADR-0063 set the precedent itself when secrets left: the old
`settings:global` datoms are abandoned and never read again. A user who had
customised a target meets the default once and sets it again.

## Consequences

- **`settings.store.ts` becomes `consent.store.ts`**, and holds two booleans read
  off `consent:%` entities. A module named for the category this record abolished
  would be the first thing to mislead the next reader.
- **`settings:global` has no writer left in `src/`.** The Facet-scoped wipe
  ([ADR-0079](0079-a-facet-scoped-wipe-is-the-third-sanctioned-deletion.md) §3)
  gets a jar with no multi-owner entity in it — which is what #274 needed and
  could not derive, and which #289 now has to keep true rather than establish.
- **Every food target is correct in the first frame**, for the same reason the
  meter selection has been since ADR-0063. `NutritionTargetEditor` loses the
  `$effect` that seeded three values once the ledger woke, and with it the
  seeding race that shape of initialisation always carries.
- **The ledger stops accumulating a datom per target nudge.** The editor debounces
  at 400ms and writes the whole blob, so a user tuning six nutrients appended six
  permanent rows for a line on a chart.
- **The consents gain a home that can be wiped by the Facet that owns them.** A
  food wipe retracts the consent you gave Rations and leaves the one you gave
  Inventoria, which is right: they were given to different doors.
- **A target no longer survives a device.** This is the sharp edge, it is §5's,
  and it is the one clause of this record most likely to be argued with. The
  answer to that argument is a recorded goal, not a readmitted setting.
- **`docs/eavt-vocabulary.md` loses its settings preamble and its `settings/`
  section**, and gains `consent/` and the two consent prefixes. The question it
  used to put to someone adding a setting — is this a datom? — has an answer now,
  so the preamble that asked it is deleted rather than reworded.
