# EAVT Vocabulary

The entity prefixes and attribute namespaces the ledger actually uses.

This page is the canonical registry. [ADR-0014](adr/0014-namespace-prefixes-for-eavt-entity-identification.md)
records the _decision_ to namespace entities by a colon-prefix; the list of prefixes
grows with every new tracked domain and lives here instead, so the decision record
stays fixed while the registry stays current.

Terms in **bold** are defined in [CONTEXT.md](../CONTEXT.md). The reasoning behind
storing facts this way is in [State Is a Reading of the Past](append-only-ledger.md).

## The shape of a row

Every row in the `datoms` table is a **datom**: one immutable fact about one entity.
The name is Rich Hickey's, from
[Datomic](https://docs.datomic.com/whatis/data-model.html).

| Column      | Example              | Meaning                                                           |
| ----------- | -------------------- | ----------------------------------------------------------------- |
| `entity`    | `gtin:3017620422003` | A namespaced identifier                                           |
| `attribute` | `food/name`          | A namespaced key                                                  |
| `value`     | `Nutella`            | A primitive, or a stringified JSON blob                           |
| `time`      | `1717140000000`      | The domain timestamp (Unix ms), e.g. when the user confirmed      |
| `hlc_ms`    | `1717140000021`      | Hybrid Logical Clock physical component                           |
| `hlc_ctr`   | `0`                  | HLC logical counter, for same-millisecond tiebreaks and causality |
| `device_id` | `dev_7f3a`           | Originating device, giving a deterministic total order            |

Reads fold in **HLC** order, not `time` order. The wall clock is a domain fact about
when something happened; the clock that decides which datom wins is the HLC, per
[ADR-0020](adr/0020-logical-clock-ordering-over-wall-clock-key.md). The full DDL,
including indexes, is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Entity prefixes

An entity id begins with a prefix naming what kind of thing it is. Most **Projections**
scope their reads by these prefixes; two scope by attribute namespace instead, because
their entities are heterogeneously named.

Anything scoped by a **Facet**, such as a scoped wipe or a scoped export, scopes by entity
and never by attribute namespace, because `provenance/` and `event/` are each written by
several Tracked Domains ([ADR-0076](adr/0076-a-facet-is-an-installable-face-onto-one-jar.md) §4).
Which prefixes a Facet owns is declared in the Facet registry, not restated here.

### Digital Twins

| Prefix                    | Identifies                                                       | Seeded from                       |
| ------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| `gtin:`                   | A food **Digital Twin** keyed by barcode                         | Open Food Facts, a label capture  |
| `fdc:`                    | A food Digital Twin keyed by food id                             | USDA FoodData Central             |
| `food:custom_`            | A custom or photo-based food Digital Twin                        | Authored locally                  |
| `recipe:`                 | A composed recipe Digital Twin referencing ingredient twins      | Authored locally                  |
| `tmdb:movie:`, `tmdb:tv:` | A film or series media Digital Twin                              | TMDB                              |
| `isbn:`                   | A book media Digital Twin keyed by ISBN                          | Open Library                      |
| `olid:`                   | A book media Digital Twin with no ISBN, keyed by Open Library id | Open Library                      |
| `twin:`                   | A physical item Digital Twin, such as an instrument              | Authored locally, and the scraper |

_The scraper_ is `ingestion/json-ld.ts`, which reads a product page's JSON-LD.

The TMDB prefixes end in a **colon**, not an `_`: `tmdb:movie:550`. A table written
with an `_` describes no row that exists, and no reader would find one: the ingestion
registry matches an id against `scheme + ":"` for the schemes `tmdb:movie` and
`tmdb:tv` (`ingestion/registry.ts`). A `did:` id can carry further colons of its own,
so a second colon is not a TMDB tell.

#### Every `twin:` carries a second segment naming where it came from

A hand-authored item is `twin:manual_`, minted at
`views/items/ItemManualForm.svelte`. The scraper mints the other seven, one per
identifier the page carried: `twin:gtin_`, `twin:isbn_`, `twin:sku_`, `twin:asin_`,
`twin:dpp_`, `twin:url_` for a page identified only by its address, and
`twin:temp_` for one with no identifier and no address. **Prefixes are compared by
containment, never by equality**: a read scoped to `twin:` takes all eight, which is
correct because all eight are the physical-item domain's
([ADR-0086](adr/0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) §8).

The scraper reads a product page and does not know which identifier it will find
until it has. It used to pick its **entity prefix** that way too, which made it the
one minting site whose identity was decided by an external document: it minted
`gtin:` and collided with food, and `isbn:` and collided with media, and for a `did:`
or `gs1:` `@id` it took the entity id from the page whole, so this table could
declare a prefix and never bound what followed it. ADR-0086 §3 ended all three. The
identifier is now the suffix and is written as an `item/` attribute besides, so
nothing is lost and determinism is kept.

`gtin:` still has two minting sites and they are both food's: Open Food Facts, and a
label capture keyed on a scanned barcode (`views/food/LogFoodSheet.svelte` into
`saveLabelFood`).

There is **no `settings:` prefix**. It was the `settings:global` entity, retired with
the whole `settings/` namespace when a setting stopped being a datom
([ADR-0085](adr/0085-a-setting-is-never-a-datom-and-a-consent-is-not-a-setting.md)),
and nothing mints it.

### Blueprints

| Prefix       | Identifies                     |
| ------------ | ------------------------------ |
| `habit:`     | A **Habit Blueprint**          |
| `cal_event:` | A **Calendar Event Blueprint** |

### Events

| Prefix           | Identifies               |
| ---------------- | ------------------------ |
| `event:consume_` | A **Consumption Event**  |
| `event:execute_` | An **Execution Event**   |
| `event:engage_`  | An **Engagement Event**  |
| `event:occur_`   | An **Occurrence Event**  |
| `event:acquire_` | An **Acquisition Event** |

A Consumption Event minted by accepting a meal somebody sent you keeps the same
`event:consume_` prefix, and its local part is **derived** rather than random: it is a
digest of the payload's declared closure root, so accepting the same meal twice writes it
once and `INSERT OR IGNORE` absorbs the second. No new prefix, and nothing about the sender
is encoded in it. See
[ADR-0073](adr/0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) §5.

### Op-logs

| Prefix   | Identifies                                                          |
| -------- | ------------------------------------------------------------------- |
| `notes:` | The **Note** and **Checklist** CRDT op-log, one entity: `notes:doc` |

The only prefix with a fixed, single entity behind it, and the only domain with no
**Projection**: its op-log is read by a direct SELECT
([ADR-0018](adr/0018-notes-checklist-crdt-oplog-in-ledger.md)).

## Attribute namespaces

An attribute key begins with a namespace naming the family of facts it belongs to.
The attributes listed below are representative, not exhaustive; the source under
`src/` is the complete list.

### `food/`

Food Digital Twins.

- `name`, `photo_base64`, `category`, `scientific_name` (food-identity record metadata).
  `name` is the food's DISPLAY name, not the source's own: a bundled USDA food reached
  through the Vocabulary map carries the name that reached it too, `Eggplant, raw,
aubergine`, because several independent readers show a food's name and only one of them
  goes through the search mapper
  ([ADR-0049](adr/0049-a-derived-vocabulary-for-food-search.md), the #140 Amendment).
  The source's untouched description stays in `provenance/raw.raw_data`, which is
  what any reader deciding something ABOUT the food (rather than showing it) must read.
  `deriveNovaVerdict` does, and declines to judge a payload carrying no such record.
- `ingredients_text`: Open Food Facts' raw ingredients string, distinct from a recipe's
  structured `recipe/ingredients`.
- `portions`: an ordered list of household measures
  (`{ label, amount, unit, grams | millilitres }`), each resolving to an amount in the
  unit its own magnitude is stated in
  ([ADR-0030](adr/0030-expanded-food-twin-source-data.md),
  [ADR-0060](adr/0060-an-amount-is-entered-in-its-panels-unit.md) §6). `grams` and
  `millilitres` are siblings and exactly one of them is present, so a reader that knows
  only `grams` sees no portion for a drink rather than a weight it never was. Nothing
  converts between the two, at any point.
- `assessment`: one atomic Open Food Facts blob of consumer signals with no schema.org
  counterpart (`nova_group`, `nutri_score`, `eco_score`, `nutrient_levels`, `allergens`,
  `additives`, `labels`; ADR-0030). Read back by
  [ADR-0041](adr/0041-nova-processing-badge.md) and
  [ADR-0043](adr/0043-off-assessment-signals-and-ingredients-contribution.md).
- `label_photos`: an ordered `string[]` of captured label photos (base64), first entry
  is the display photo. A photo-less capture omits it, and `photo_base64` mirrors
  `label_photos[0]` so the singular-photo display surfaces are unchanged
  ([ADR-0034](adr/0034-label-photo-food-capture.md) §5).
- `label_capture`: the user-origin provenance envelope written when a food is captured
  from its label (`{ adapter: "label", adapter_version, method: "manual" | "ai-confirmed",
basis, fields }`). It is a sibling of `provenance/raw`, never a second one, so a
  found-but-poor `gtin:` twin enriched in place keeps both origins auditable
  (ADR-0034 §7).
- `manual_entry`: the user-origin provenance envelope for the Custom chooser's three
  intents (`{ adapter: "manual", adapter_version, kind: "quick_estimate" | "menu" |
"plate_estimate", fields }`), a sibling of `label_capture`. Its `kind` is the single
  source of truth for Recent/Search reusability: only `menu` is reusable
  ([ADR-0035](adr/0035-custom-food-intent-chooser.md) §6).
- `ingredients`: a single descriptive free-text string on a manual `food:custom_` menu
  dish (allergens, memory). Distinct from Open Food Facts' `ingredients_text` and from a
  recipe's structured `recipe/ingredients`, and it never computes calories (ADR-0035 §4).
- `arrival`: the user-origin provenance envelope written when a food reaches this device
  because somebody sent you a meal (`{ adapter: "send", adapter_version, received_at }`),
  the third sibling of `label_capture` and `manual_entry`. It records **how this food came
  to be here and never who sent it**: no sender identity exists anywhere in the ledger, the
  envelope or the wire. It is written on accept, alongside a re-minted Consumption Event,
  and it is **display-only**. `foodSourceView` reads it, and without it a received
  `food:custom_` twin would fall through that function's last branch and claim the
  recipient hand-authored it. It never gates reuse, never hides a food from Recent or
  search, and is never written when a datom arrives from one of your **own** devices
  ([ADR-0073](adr/0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) §11,
  [ADR-0075](adr/0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md)
  §13).

Note that `nutrition/info`, `food/brand`, and `portions` may be user-written on a
`gtin:` twin as a label correction, not only OFF-sourced (ADR-0034 §6). `food/brand`
may also be user-written as a menu dish's "Place" on a `food:custom_` twin
(ADR-0035 §4).

### `nutrition/`

Nutrition panels on food-bearing twins (schema.org/NutritionInformation).

- `info`: one atomic panel blob (`serving_size`, the Panel basis: `100 g`, or
  `100 ml` for a drink OFF publishes by volume (ADR-0052), or the serving a label
  prints; plus `calories`, `protein_content`,
  `fat_content`, `carbohydrate_content`, and so on) plus the twelve Nutrition-Facts
  micronutrient extensions in grams, which have no schema.org counterpart (ADR-0030):
  `vitamin_d`, `calcium`, `iron`, `potassium`, `vitamin_a`, `vitamin_c`, `vitamin_e`,
  `vitamin_b6`, `vitamin_b12`, `folate`, `magnesium`, `zinc`.

### `recipe/`

Recipe twins (schema.org/Recipe).

- `name`, `description`, `url`, `image`, `yield`.
- `instructions`: ordered HowToStep text.
- `ingredients`: pure `{ ref, amount, unit }` references. Nutrition is derived, never
  stored.

### `media/`

Media Digital Twins.

- `title`, `director` or `author`, `release_date`, `poster_url`, `blurb`, `subject`,
  `first_publish_year`.

### `item/`

Physical item twins, and those alone. It was `twin/` until
[ADR-0086](adr/0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) §5.

- `name`, `brand`, `image`, `note`, `description`, `tags`, `source_url`.
- `gtin`, `isbn`, `sku`, `asin`, `dpp`: whichever identifier the scraped page carried.
  These are things an item **has**. A GTIN is the identity of the packaged food it was
  printed for, and an item merely bears one, which is why the scraper mints `twin:` and
  writes the barcode here.

The old name was never a domain namespace. It was the generic descriptive shell any
ingested entity got, named after the first domain that used it, so a read scoped to
`twin/%` saw food as well as physical items. `ACQUISITION_LIBRARY` was scoped that way,
which listed every logged food in the Items tab as a nameless _wanted_ item (#280). The
spelling is very plausibly why: `twin:` is an entity prefix physical items own outright
and `twin/` was an attribute namespace nobody owned, one character apart, with opposite
scoping rules.

### `provenance/`

Where an ingested record came from, for every domain. It is deliberately owned by nobody,
because it names the ingestion machinery rather than a domain, and nothing may scope by it
([ADR-0076](adr/0076-a-facet-is-an-installable-face-onto-one-jar.md) §4).

- `raw`: the **Provenance** blob, attached by the ingestion registry to every twin it
  mints. Where two records from one source were merged to complete a panel, it also names
  the record that filled the gaps and the fields it supplied (`merged_from`,
  [ADR-0045](adr/0045-usda-stays-the-base-food-composition-authority.md) §4). It was
  `provenance/raw` until ADR-0086 §5.

### `habit/`

Habit Blueprints.

- `name`, `category`, `instrument`, `schedule_rules`, `status`.
- `replaces`: the **Habit Lineage** link.

### `cal_event/`

Calendar Event Blueprints.

- `dtstart`, `dtend`, `title`, `description`, `tracking`, `timed`, `schedule_rules`.

### `event/`

Every logged Event.

- `type`: the event verb, a closed set of six. `ConsumeAction` (food),
  `WatchAction` and `ReadAction` (media), `ExerciseAction` (habits),
  `OccurrenceAction` (calendar), `AcquisitionAction` (physical items).
- `target`: polymorphic. It references **any** twin, across all four food prefixes
  (`gtin:`, `fdc:`, `food:custom_`, `recipe:`) as well as media and physical-item
  twins. Also `target_id`.
- `status`: the meaning depends on `type`. For media Engagement Events it is the
  shared four-value enum `saved`, `started`, `progress`, `completed`. For Acquisition
  Events it is `wanted` or `owned`. For Execution Events it is `completed`, `exempt`,
  or `uncompleted`.
- `quantity`: a **formatted string**, not a number (`"30g"`, `"330ml"`,
  `"1 serving"`), written and parsed by `src/lib/food/recipe-ingredient.ts`. The
  unit is the one the food's Panel basis is measured in, never a separate choice
  ([ADR-0060](adr/0060-an-amount-is-entered-in-its-panels-unit.md)). Forward-only:
  a receipt keeps the string it was written with, so a drink logged before that
  record still reads `"330g"` and is never re-rendered from its twin's current
  panel.
- `rating`: an optional 1 to 5 scale.
- `season`, `episode`, `review`, `pages_read`, `instrument_used`, `slot_id`,
  `metadata`.
- `meal_type`: the **Meal Type**.
- `replaced_by`: the correction link written when a logged event is superseded
  ([ADR-0022](adr/0022-recipe-instantiations-as-editable-snapshots.md)).
- `metrics`: the frozen breakdown scaled to the amount logged. The
  `{ calories, protein, fat, carbs }` headline plus every extra nutrient the food
  carried, each under its `nutrition/info` panel name such as `fiber_content` or
  `sodium_content`, and the micronutrients. A nutrient the food never reported is
  absent, never `0` (ADR-0030).
- `instantiation`: a logged recipe's frozen **Recipe Instantiation** snapshot.
  Holds `based_on`, `yield`, and per-row
  `{ ref, name, amount, unit, calories, protein, fat, carbs, ... }` carrying the same
  full breakdown.

Note that there is **no `acquisition/` namespace**. A physical item's wanted-to-owned
state is not an attribute on the twin: it is folded from `event:acquire_` events
carrying `event/type: "AcquisitionAction"`, `event/target` pointing at the twin, and
`event/status` of `wanted` or `owned`. The fold lives in
`src/lib/acquisition/state.ts`, which is a module path, not an attribute prefix.

### There is no `settings/` and no `consent/`

Neither namespace exists, and no attribute of either is read. A setting is never a
datom: the ledger records facts about the world you tracked, and how the app is
configured is not one of them. Every setting lives in `localStorage` through
`src/lib/stores/device-settings.ts`, per
[ADR-0085](adr/0085-a-setting-is-never-a-datom-and-a-consent-is-not-a-setting.md).
That record retired `settings/off_contribute`, `settings/log_export`,
`settings/food/targets`, `settings/food/limits`, `settings/food/profile` and
`settings/food/calculated_targets`, along with the `settings:global` entity they all
sat on.

`consent/granted` and the `consent:` entity prefix went one record later, under
[ADR-0086](adr/0086-an-entity-has-exactly-one-owner-and-the-owner-is-a-tracked-domain.md) §2.
ADR-0085 §2 had kept two consents in the ledger as recorded acts, and neither was
one. Each only seeded a checkbox that is shown and answered again every time, so
what the ledger held was a default. The agreement is the per-capture tick and the
reviewed export payload, and neither of those is recorded anywhere.

### `notes/`

The **Note** and **Checklist** op-log.

- `op`: one CRDT operation delta
  ([ADR-0018](adr/0018-notes-checklist-crdt-oplog-in-ledger.md)).
