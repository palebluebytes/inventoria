# Inventoria

A local-first Progressive Web App (PWA) for tracking physical items and temporal behaviors using an immutable ledger.

## Language

This is the ubiquitous language: the term as defined here is the term to use in code,
issue titles, tests, and prose. Each entry's `_Avoid_` line lists the synonyms that
have caused confusion, which are not stylistic preferences but names to stop using.

### Storage core

**Datom**:
The atomic unit of storage representing a single fact, consisting of an entity ID, an attribute, a value, a domain timestamp, and a hybrid logical clock stamp that gives it a deterministic total order (ADR-0020). Reads fold in clock order, not timestamp order. The full column list is in `docs/eavt-vocabulary.md`.
_Avoid_: Row, record, database entry

**Ledger**:
The append-only, immutable database table (`datoms`) containing the full chronological sequence of all datoms. Current state is derived by querying this historical log.
_Avoid_: Relational database, mutable table, state table

**Projection**:
A derived, read-only view of current state, produced by folding the Ledger's datoms forward through a pure function. A Projection takes no runtime parameters: it returns the full enriched set for one kind of entity, and any date, slot, or range narrowing is applied afterward by the UI. It is the only way the application reads state; the Ledger is never queried for "current" rows directly.
_Avoid_: View, read model, materialized view, query result

**Provenance**:
The immutable, original payload retrieved from an external API or scraper at the moment of ingestion, stored as a JSON blob alongside its extraction metadata (timestamp, source URI, adapter version). Ensures that future schema evolutions (e.g. EU DPP legislation updates) can remap historical data without network loss.
_Avoid_: Raw data, API response, backup payload

**Ledger export**:
Every row of the Ledger written to a file the user chooses, as NDJSON: one datom per line, raw rather than projected, superseded facts and base64 photos included. It is ledger-only, so the `localStorage` side-cars (the secrets and the Log facility) are not in it. See ADR-0064.
_Avoid_: Dump, snapshot, backup file (for the mechanism), sync

**Export envelope**:
The first line of a Ledger export, and the only line that is not a datom. It carries the file format's `schema_version`, the `exported_at` moment, the originating `device_id` and the `row_count` the Ledger held when the write began. A reader refuses an unfamiliar file on this line alone, before touching the rest. See ADR-0064 §2.
_Avoid_: Header, manifest, metadata block

**Ledger import**:
A Ledger export read back in, appended to whatever this device already holds. It **merges**: every datom in the file is added, nothing already present is removed or changed, and the same file imported twice adds nothing the second time, because the primary key spans the whole hybrid logical clock stamp. Making the file the only truth is `Wipe Database` and then an import, which stay two deliberate steps. The file is read twice, once to check every line and once to write it, so a damaged file is refused before any row is written. See ADR-0067.
_Avoid_: Restore, load, sync, merge conflict (there are none: the clock decides)

**Persistent storage**:
The browser's undertaking not to evict this origin's data to reclaim disk space, asked for once per session through `navigator.storage.persist()` and reported in Settings. Storage without it is _best-effort_, the standard's own word: the Ledger may be cleared with no warning and no action by the user. The state belongs to one browser profile rather than to the person using the app, so it is never a datom, and it is not a backup, because clearing site data, `Wipe Database` and a lost device each take the Ledger whatever the browser granted. See ADR-0065.
_Avoid_: Durable storage, backup, permanent; and "persistence" for what the Developer Options OPFS survival test proves, which is survival across a page reload rather than exemption from eviction

### Digital Twins

**Digital Twin**:
A virtual representation of a physical or distinct external item, tracked via static or slowly-changing attributes derived from external databases (e.g. Open Food Facts for food, TMDB for media).
_Avoid_: Product, item, asset

**Panel basis**:
What a `nutrition/info` panel's figures are measured against, held on its `serving_size` field: `100 g` for a reference food or a solid product, `100 ml` for a drink Open Food Facts publishes by volume, or the serving a label prints (`30 g`, or a bare `1 serving` of unknown weight). It is data, never an assumption — a per-100 panel is not necessarily a per-gram one, and `parseBasisQuantity` is the single reader that turns it into a divisor. A volume basis is carried as published and never converted to a weight. See ADR-0052.
_Avoid_: Serving size (when the basis is meant), per-100g, the panel's grams

**Amount unit**:
The unit an amount of a food is entered, logged and scaled in — `g` or `ml` for a food measured against its Panel basis, `serving` for one whose panel is a whole-serving total. It is read from the Panel basis and is never a separate choice, and nothing converts between a volume and a weight at any point (ADR-0060). Code asks `isMeasuredUnit` rather than testing for grams, because "is this amount a measurement?" is the real question at every scaler, label and edit gate. It is a persisted shape: it rides on `recipe/ingredients`, on the frozen `event/instantiation` rows, and inside the `event/quantity` string.
_Avoid_: Grams (when any measured amount is meant), the gram unit, weight

**Portion**:
One household measure a food's source publishes, carried on the twin's `food/portions` — `1 medium` standing at 118 g, `1 can (330 ml)` at 330 ml. It is source data and never a nutrition reading, and it is the app's whole answer to "how much is one of these?": tapping it fills the AmountField with the amount it stands at, in the unit that amount is stated in. That unit is a field of its own (`grams` or `millilitres`, exactly one present) rather than an overloaded number, so a reader that knows only weights sees no portion for a drink instead of treating a volume as one. A portion stated in a unit the field does not take offers no chip at all, because filling it in would be the density conversion the app refuses. See ADR-0030 and ADR-0060.
_Avoid_: Serving (which is the Panel basis, a different fact), portion size, household unit, gram weight

**Reference food**:
A generic, non-branded, standardised food entry — what the USDA FoodData Central search (Foundation + SR Legacy) returns and is _for_. Includes both raw whole foods and generic prepared staples (coffee, croissant, cheddar). This is the set the food search keeps; Brand-specific foods, packaged products, and Composite dishes are excluded from it and reached instead via the Open Food Facts barcode path (ADR-0034). See ADR-0042.
_Avoid_: Generic food, USDA food, ingredient (when a prepared reference item is meant)

**Search index**:
The committed artifact the food search reads, one row per Reference food: identity, the fields ranking reads, the macros a result row renders, the household portions, and the reference to any SR Legacy twin whose values the row borrowed. Generated from USDA's bulk archives with the reference-food filters already applied, so it holds the 4,238 survivors rather than all 7,974 food identities, and the filters run once per generation instead of once per keystroke. Every row carries an energy value, because a record that reports none cannot be logged and does not ship. A row's description is USDA's own, less the parts that do not name the food — a commercial origin, USDA's cataloguing qualifiers, and the parenthesised tag naming the population a designated record was published for are removed at generation time, so what ships is the name a person reads and searches. Where removing a tag leaves two rows with one name, the row with the fuller nutrient panel keeps it — a judgement about the record, never about whose food it is. The designation itself is not lost: it is carried on the row's `food/category`, which is where the ranking reads it. Under an Adjudicated head phrase it also holds one row per food rather than one per record: a flavoured, dehydrated or differently fortified form of a food it already keeps does not ship. See ADR-0047, ADR-0048, ADR-0056 and ADR-0061.
_Avoid_: Food index, USDA index, the bundle, offline database

**Adjudicated head phrase**:
A head phrase — the first comma-part of a USDA description — whose every row somebody has read one at a time, and the only place the Search index drops a row for being a variant of a food it keeps rather than for what the record is. Three have been read: `Milk`, `Yogurt` and `Soymilk`. `Beverages`, `Cheese`, `Ice cream` and every other head carrying a flavour ladder are deliberately not done, so a reader who assumes one of them was considered and kept will be wrong: it was never looked at. The reason for the drops is simplicity preferred to complete coverage, stated plainly rather than dressed as a claim about the records, and it costs real data — the surviving milks carry shallower nutrient panels than the fortified twins they beat. See ADR-0061.
_Avoid_: Adjudicated food, head word (which is the first word, not the first part), whitelist

**Nutrient store**:
The committed artifact holding every nutrient USDA reports for a Reference food, keyed by FDC nutrient id and carrying USDA's own published unit. It is a separate file from the Search index and is parsed lazily, because search never reads a nutrient and staging reads all of them. No coverage gate and none of USDA's per-record scaffolding — derivation codes, footnotes, sample counts. See ADR-0047.
_Avoid_: Nutrient table, nutrition bundle, micronutrient tail (which is what the store makes reachable, not the store)

**Twin alias**:
A name a Search index row also answers to: the description USDA published for the other record of the same merged identity, which the merge discarded when it kept the base record's name. `Spinach, mature` answers to `Spinach, raw`, `Millet, whole grain` to `Millet, raw`. It is **search-only** — the food is shown and staged under its own name, and unlike a Vocabulary map hit nothing is appended to what the card displays. It asserts retrievability, never identity: it says this row answers to that name, never that the two names are the same food. Carried in the row's `also`, and scored as a name in its own right, so a row is ranked as the best of all its names. A pair the Twin ledger refuses discards no name and so carries none: both records ship under their own. See ADR-0050 and ADR-0051.
_Avoid_: Synonym, alternative name, former name. Say **twin alias** in prose: bare "alias" is already taken three ways — a Curated stand-in's `aliases`, a Vocabulary map key, and `SearchHit.alias`, which is that key and never this.

**Twin ledger**:
The adjudication of every pair of USDA records sharing an `ndbNumber` — 190 of them — recording for each whether the two are one food. A shared number is USDA's evidence that they are, and it is not proof: 11243 holds a raw portabella and a grilled one, 9501 held Honeycrisp and Golden Delicious. Eight pairs are **refused**, and each of their records keys alone so the merge never sees them; the other 182 are confirmed, and are written down so that a pair the ledger does not name can be a generation failure rather than a silent default. The verdicts are code (`usda-twin-ledger.ts`); the reasoning behind each one is evidence and lives in the research note. Beside them, a short written list of **superseded records** answers the same module's converse — a record USDA numbered apart that names a food the corpus already carries under a fuller record, dropped by hand with its survivor named and checked at generation. See ADR-0051.
_Avoid_: Exclusion list, blocklist, pairing list (ADR-0048 §4 forbids a list that creates merges; this one only refuses them), twin merge (which is the thing being adjudicated)

**Vocabulary map**:
The table of phrases the Search index does not use, each mapped to the phrases it does — `aubergine` to `eggplant`, `courgette` to `zucchini`, `minced beef` to `ground beef`. It ships in two sections of the Search index and is read as one map: `vocabulary_off`, derived from Open Food Facts' ingredients taxonomy and carrying its ODbL licence, and `vocabulary_local`, eight everyday names OFF does not carry either — seven British (`gammon`, `caster sugar`) and one spelling (`soymilk`) — written by hand outside that derivative. It is a **retrieval fallback**: a query that already retrieves something is answered exactly as it is today. A food reached through it is displayed under both names — `Eggplant, raw (aubergine)` — so a search that quietly answered with another word says which word. The key is bracketed rather than comma-appended, because a comma made it read as one more of USDA's qualifiers and 211 of the 452 keys that lead anywhere share a word with the name they land on. See ADR-0049.
_Avoid_: Synonym list, alias table (a Curated stand-in's `aliases` are a different thing), thesaurus, spell-check

**Curated stand-in**:
One specific Open Food Facts product, pinned by hand, answering a search for a base ingredient that **no** composition table carries — not USDA Foundation, SR Legacy or Survey, not CIQUAL. Cacao nibs is the founding case. It is an enumerable exception list against a coverage hole, never a second composition table: the entity stays the real barcode, the origin still reads OFF, and the substitution is disclosed rather than hidden. Admission is evidential and the list is capped. See ADR-0046.
_Avoid_: Curated food, fallback food, default food, custom food (which means a user's own entry)

**Base ingredient**:
A raw or minimally-processed single whole food (an apple, raw spinach, dry rice) — a _subset_ of Reference food. Base ingredients rank first in the food search (raw-forward ordering). See ADR-0042.
_Avoid_: Whole food, raw food (as a category name), ingredient

**Composite dish**:
A multi-ingredient, home-prepared, or battered/deep-fried prepared food (potato salad, breaded fried chicken, casseroles). Not a Reference food: it is dropped from the food search, and is instead logged from its Base ingredients or captured via the barcode path. See ADR-0042.
_Avoid_: Prepared dish, meal, dish, recipe (a Recipe Twin is the app's own composite, distinct from a USDA-source dish)

**Brand-specific food**:
A food record naming a specific commercial brand (OCEAN SPRAY, GERBER, Grape-Nuts). Brand-specific foods belong to the barcode path (scan the product against Open Food Facts, ADR-0034) and are always dropped from the USDA reference-food search, even when the query names the brand. See ADR-0042.
_Avoid_: Branded product (when the `twin/brand` attribute is meant), product

**Plain twin**:
The shorter of two Reference foods whose names differ only by trailing qualifiers — `Alcoholic beverage, wine, table, white` beside `…, table, white, Riesling`, or `Oil, corn` beside `Oil, corn, peanut, and olive`. A food with a plain twin in the corpus ranks below it, so the varietal, the sharp sliced form and the salad-or-cooking grade all sort under the plain row rather than in front of it. A ranking key, never a filter: nothing is dropped for having a plain twin, and the flag is baked into the Search index because deciding it needs every description at once. See ADR-0055.
_Avoid_: Parent row, canonical form (which is what the `plain` key already means about a NAME), duplicate

**Shelf-label head**:
A head phrase USDA writes as the aisle a record was filed on rather than as the food's name — `Alcoholic beverage, wine, table, red`, `Beverages, tea, green`, `Fish, salmon`, `Nuts, almonds`. Eighteen of them cover 760 rows. The food's own name starts one or two words in, so the ranking keys that read where a typed word SITS measure from there; the tier a name reaches is unaffected, and a tea filed under `Beverages` is still a qualifier match. A shelf label's qualifiers name distinct foods, where an ordinary head's name parts or preparations of the food it already named — which is why `Beef, chuck, arm pot roast` is not one. See ADR-0042's #154 Amendment.
_Avoid_: Category head (a row's `foodCategory` is a different thing and decides a different key), group name, prefix, aisle

**Name part**:
The part of a USDA description that names the food itself: the head phrase, or the qualifier a Shelf-label head leads to. `Nuts, coconut milk, raw` names a milk and `Cheese, mozzarella, whole milk` names a cheese, though both are filed under a shelf label and both hold the word `milk`. A row a query reaches only PAST its name part merely **mentions** what was typed, and a mention does not retrieve — but only where some retrieved row answers on a higher relevance rung, which is what leaves `chili` returning the peppers whose qualifier holds the word beside the spice whose name does. Where nothing names the food, nothing is dropped: a typed `raw` still reaches all 1,444 rows that mention it. Asked of each expanded phrase separately, because a phrase is a query. See ADR-0062.
_Avoid_: Head phrase (which is the first comma-part, and is only the name part where the head is not a shelf label), food name, own name

**Separated fat**:
A USDA record of the fat taken off a food rather than of the food — `Beef, retail cuts, separable fat, raw` at 674 kcal, `Lamb, Australian, imported, fresh, seam fat, raw`, `Fat, chicken`. Fifty-one rows, all 444 to 902 kcal. Still a Reference food and still searchable; it simply never leads, which is what stopped a typed `beef` answering with the trimmings. The handle is a WHOLE qualifier, because `separable lean and fat` is the meat and `separable fat` is what came off it. See ADR-0042's #162 Amendment.
_Avoid_: Fat, trimmings, by-product (variety meats are USDA's by-products and are a different thing), part

**Composite of cuts**:
A USDA record published as the average of a food's retail cuts rather than as one of them — `Beef, composite of trimmed retail cuts, …`, `Pork, fresh, composite of trimmed leg, loin, shoulder, and spareribs, …`. Sixty-one rows under beef, pork, lamb, veal and game meat, and the generic sense of each of those words: it is the row that leads when someone types the bare animal. USDA's own marker is the phrase `composite of`, never the bare word, which also names a margarine blended from several brands. See ADR-0042's #162 Amendment.
_Avoid_: Whole food, generic row, average row, aggregate (each reads as a judgement rather than as what USDA published)

**Designated-population record**:
A USDA record published as reference composition for a documented population rather than for everybody — the `American Indian/Alaska Native Foods` category, which holds mutton, agave, cloudberries and seal oil. Still a Reference food, still searchable and loggable under its own name; it simply ranks below an undesignated row where the two answer a query equally well. The handle is the category, never the parenthesised tag in the description. See ADR-0055.
_Avoid_: Ethnic food, traditional food, cultural food (each reads as a judgement about the food rather than about who the record was published for)

**Manufacturing input**:
A USDA record specifying a food-industry ingredient sold to a factory rather than a food anyone buys or logs — a confection fat, a filling fat, a commodity flour graded by protein percentage. USDA marks them `industrial` in the description. Not a Reference food and not a Composite dish either: it is dropped by its own generation-time filter, and the retail equivalent it stands in front of (all-purpose flour, household shortening) stays. See ADR-0042.
_Avoid_: Commercial food, bulk ingredient, industrial food (which reads as a processing judgement rather than a market one)

### Habits

**Habit Lineage**:
A conceptual continuous habit that spans multiple immutable Habit Blueprints linked together chronologically.
_Avoid_: Habit history, habit chain

**Habit Blueprint**:
A strictly immutable definition profile establishing goals, schedules, and instrument requirements for a tracked behavior. Changes to a schedule create a new Blueprint in the Lineage.
_Avoid_: Routine, habit definition, plan

**Schedule Rule**:
A flexible JSON definition shared by both Habit Blueprints and Calendar Event Blueprints, describing recurrence frequency and constraints. Supports six paradigms: `daily_multiple` (count or Sub-Targets), `weekly_days` (specific days), `weekly_flexible` (N times per week), `monthly_fixed` (fixed day of month), `monthly_relative` (e.g. last Thursday), and `yearly_fixed` (specific month and day). All variants carry an optional `until` field (ISO date `"YYYY-MM-DD"`) marking when the recurrence ends.
_Avoid_: Frequency, time settings, schedule values, RRULE

**Sub-Target**:
A distinct, strictly identified temporal slot within a Schedule Rule (e.g., a specific time like "08:00"). If a Habit Blueprint or Calendar Event Blueprint uses Sub-Targets, a logged completion Event must explicitly reference one. An Event Blueprint with multiple Sub-Targets represents a single recurring event that occurs at several times per day (e.g. medication at 08:00 and 20:00).
_Avoid_: Time slot, session, checklist item

**Execution Event**:
A logged instance of a behavior or habit completion recorded as a timestamped action in the ledger. Qualitative and quantitative metrics are stored as a flexible JSON blob. Its status is `completed`, `exempt` (used to pause a streak gracefully without breaking it), or `uncompleted` (an append-only undo: a later datom that cancels the single most recent matching completion, since the ledger is never mutated in place). The datom `time` field captures the exact millisecond the user confirmed completion.
_Avoid_: Activity log, workout record, check-in

### Calendar

**Calendar Event Blueprint**:
An immutable scheduled appointment or recurring reminder entity (entity prefix `cal_event:`) with a required start datetime (`cal_event/dtstart`), an optional end datetime (`cal_event/dtend`), an optional description (`cal_event/description`), a Schedule Rule, and a boolean `cal_event/tracking` attribute. A non-recurring Event Blueprint is a single appointment with no Schedule Rule. It is the direct source for iCal VEVENT export in V2.
_Avoid_: Habit, event definition

**Compliance Event**:
A Calendar Event Blueprint with `cal_event/tracking: true`. Requires explicit user confirmation per projected slot. If the scheduled time passes without a tap, the slot is marked **missed**. Writes an Occurrence Event on confirmation. Used for medication, recurring tasks, and any event where non-completion is meaningful.
_Avoid_: Reminder, tracked event

**Appointment**:
A Calendar Event Blueprint with `cal_event/tracking: false`. Purely informational — it occupies a slot on the Agenda timeline as context but requires no user action. Once the scheduled time passes the slot auto-fades to **past** with no failure state. No Occurrence Event is written.
_Avoid_: Calendar event (when tracking is irrelevant), meeting

**Occurrence Event**:
A logged instance confirming that a projected Compliance Event slot actually happened, recorded as an `OccurrenceAction` in the ledger. The datom `time` field is the exact millisecond the user tapped confirmation, which may differ from the Blueprint's scheduled `dtstart` time slot. Until confirmed, projected slots exist only in memory — nothing is written to the ledger. Appointments never produce Occurrence Events.
_Avoid_: Calendar entry, completed event, confirmed appointment

**Agenda**:
The tab and view that presents a unified, date-navigable view of the user's day. It contains two sections: SCHEDULE (a chronological timeline mixing projected Calendar Event Blueprint slots and timed Habit Blueprint Sub-Targets, sorted by time) and HABITS (Habit Blueprints without specific intra-day times, e.g. weekly or flexible habits).
_Avoid_: Habits view, schedule view, calendar view

### Events

**Consumption Event**:
A logged instance of a digital twin or recipe intake recorded as a timestamped action in the ledger. Nutritional metrics are stored as a flexible JSON blob. When its target is a Recipe Twin, the Consumption Event is a Recipe Instantiation.
_Avoid_: Food log, meal record

**Recipe Twin**:
A reusable recipe **template**: a schema.org/Recipe (ADR-0021) holding a name, an ordered ingredient list of pure references to food Digital Twins with amounts, a yield, and optional description, source url, image, and instructions. It stores no nutrition of its own — per-serving macros derive from the referenced ingredient twins. It only _seeds_ a Recipe Instantiation with defaults; it never governs one. Unlike a food Digital Twin it is composite (built from references to other twins) and is a default, not a nutrition authority.
_Avoid_: Recipe (when the logged occasion is meant), recipe definition, Digital Twin (external-DB sense)

**Recipe Instantiation**:
The logging of one occasion of making or eating a Recipe Twin — a Consumption Event whose target is that twin. It _seeds_ from the template's ingredient list and yield, then may diverge freely: amounts changed, ingredients added or removed, yield adjusted. Its nutrition is derived from the referenced ingredient twins and captured onto the event when written, so a past instantiation never silently changes when an ingredient twin is later corrected; it is itself editable only by deliberate correction, exactly like any logged food. A template's instantiations over time are its history.
_Avoid_: Recipe log, recipe entry, instance (bare), cooked recipe

**Meal Type**:
A standardized classification (`meal_type`) used to organize Consumption Events chronologically and logically in UI timelines.
_Avoid_: mealType, meal-type

**Recent**:
The log sheet's default content for one Meal Type (ADR-0057): the distinct food Digital Twins previously logged at **that** meal, newest first, capped at twelve. It is a default rather than a result — judged on being apt, not complete, because search reaches everything else from the same screen — so it is never topped up from other meals to fill its cap, and a meal with no history correctly shows none. Scoping is read per Consumption Event from `meal_type`, so a twin logged at two meals is Recent for both. Membership still passes the catalogue rule (ADR-0035 §6).
_Avoid_: Recent list (when the unscoped pre-ADR-0057 behavior is meant), recently used, history, food log

**Past meal**:
A meal as it was logged on an earlier day: its foods _and_ their amounts. Copying one appends those entries to the meal you are viewing (ADR-0058) — wholesale, at the amounts recorded, on the current clock, and only into the same Meal Type. It is the counterpart to **Recent** and the distinction is the point: Recent offers you a food, a past meal offers you an occasion you actually ate, which is why the catalogue rule (ADR-0035 §6) filters the first and not the second. A logged Recipe Instantiation is reproduced from its frozen snapshot, never re-derived from the template.
_Avoid_: Repeat (that word means recurrence _scheduling_ in this app — `EventRecurrenceField`, `ScheduleRuleEditor`), duplicate, clone, re-log, copy meal

**Way in**:
One of the five ways to put something in a meal, each a control in that meal's section header: copy a **Past meal**, enter one yourself, log a recipe, scan a barcode, search (ADR-0059). There is no `+` — it never named an action, it opened a sheet that then asked which of these you meant, so it was a lobby rather than a door. Each way in opens its own single-purpose sheet carrying no method dock, since the header already chose. Every control's own name states its meal, because the header repeats for all four and four identical names on one screen cannot be told apart; the sheet's title drops it again, because by then the meal is settled by the tap that opened it. A way in whose sheet could only disappoint is absent rather than disabled — the past-meal control appears only once that meal has history.
_Avoid_: Entry / meal entry (this app spends _entry_ on a manually entered food, ADR-0035), add button, plus button, Door (ADR-0034 already uses that for the four routes into the label form), Method (that is a **FoodStager** staging tab, which is what a way in replaces)

**Way out**:
The one control that hands a logged meal to another person: it sits beside the meal's name inside that meal's nutrition panel, and it is the mirror of a **Way in** rather than a sixth control in the meal header, which gains nothing. The panel is reached by tapping the meal's name, which always works, or its subtotal line, which an empty meal does not have. The panel then _turns into_ the **Send code** and back: it opens no second surface, and once a code is minted there is no back button, because the code is live and an affordance that looked like undo would be one. It is present on every platform, iOS included: nothing about sending touches the storage partition, and it was hidden there only to avoid supporting a platform in some of its cases and not others. See ADR-0074 §1 and §3, and ADR-0082 §3.
_Avoid_: Share, export (that is the **Ledger export**), send button, handover, way in (it is deliberately not one)

**Engagement Event**:
A logged instance of watching a movie/show or reading a book, recorded as a timestamped action in the ledger (`WatchAction` or `ReadAction`) linking to a media Digital Twin. All media engagements share one closed status enum: `saved`, `started`, `progress`, `completed`.
_Avoid_: Consumption event (when referring to media), activity log

**Acquisition Event**:
A logged instance representing the ownership state of a physical Digital Twin, recorded as a timestamped action in the ledger with a status of either `owned` or `wanted`.
_Avoid_: Ownership event, item status, inventory log

### Sending and syncing

**Meal send**:
One person handing one **Past meal** to another. It is synchronous: both people are present at the same moment, the meal exists in exactly two places and never a third, and nothing is stored anywhere in between. What crosses is a **Meal payload**; what lands, on acceptance, is a re-minted **Consumption Event** on the recipient's own clock, in their Meal Type. The sender learns delivery and **never** acceptance, so declining is never socially visible. On iOS one case differs and only one: a **link** opened in a Safari tab cannot write to the installed app's jar, so that page accepts nothing and hands the **Send code** over to be pasted into **Scan** instead. Sending, and receiving in the same room, work there as anywhere. See ADR-0072, ADR-0073, ADR-0074 and ADR-0082.
_Avoid_: Share, sync (that is your own devices, and it is a different session model), transfer, send meal, meal sharing

**Send code**:
The single-use secret that addresses one Meal send: a room id and a fresh 256-bit AES-GCM key, about 100 characters, never fewer than 128 bits and never spoken aloud. One shape with two carriers, a QR in the same room and a **link** everywhere else (`/#r=…&k=…`, the secret in the fragment so it reaches no server). It dies on one successful delivery, on any refusal, on the sender cancelling, or after five minutes, and there is no retry on a spent one. Because a send is synchronous, a pasted code is already dead by the time it is scrollback. See ADR-0072 §3 to §6.
_Avoid_: Pairing secret (that is the own-device one, and it is remembered rather than per-send), password, invite, room id (which is half of it), wormhole code

**Meal payload**:
What crosses the wire in a Meal send: the **winning** datoms of one Past meal's reference closure, in the **Ledger export**'s NDJSON grammar but under its own `artifact` (`inventoria-meal`), its own `schema_version`, and an envelope declaring which `event:consume_` ids are the closure's roots. It omits exactly three attributes, `twin/raw_provenance`, `food/label_photos` and `food/photo_base64`, and carries every other one verbatim. It is never a Ledger export and the two readers refuse each other by name, because two formats whose merge rules differ must not share one. Bounded at 1 MiB of **decoded** bytes, counted as they decode. See ADR-0073.
_Avoid_: Meal export, meal file, share payload, ledger export, closure (bare)

**Receiving surface**:
The screen a Meal send lands on: the meal itself, with nothing in front of it, reached by opening a link or by pointing the **Scan** way in at a Send code, which reads a meal code as well as a barcode. It **is** the hold. A payload lives in memory for the life of this view and nowhere else, so **leaving is declining**, by any route and without being asked. There is no inbox, no standing receive control and no count badge: nothing listens for a send it was not asked for, so a badge could only ever be non-zero after a receive you started yourself, which makes it an affordance that lies. See ADR-0073 §10 and ADR-0074 §4 to §6.
_Avoid_: Inbox (there is none; the word survives only in the map that named it), receive screen, pending meals, notification, tray

**Arrival mark**:
The one attribute (`food/arrival`) recording that a food reached this device because somebody sent you a meal. It is the third sibling of `food/label_capture` and `food/manual_entry`, so it records _how this food came to be here_ and never _who sent it_. It is **display-only**: it changes what `foodSourceView` says and nothing else, because re-minting exists precisely to make the meal theirs. It is never written for a datom from one of your own devices. See ADR-0073 §11.
_Avoid_: Received flag, sender, shared-by, origin (that is the food's source), provenance (that is `twin/raw_provenance`)

**Relay**:
The Durable Object on the site's own Worker that holds at most two WebSockets for one room and forwards sealed frames it structurally cannot open. It may learn that two devices met, when and how much crossed; it holds **nothing that outlives a room**, and it runs with the script's invocation logs off. It is the one **operationally conditional** part of Inventoria: if running it stops being tenable, the send is removed and the Ledger export remains. See ADR-0072 §1 and §9 to §12.
_Avoid_: Server, rendezvous (there is none, deliberately), signalling server, sync server (nothing stores datoms), STUN, TURN

**Peer word**:
The one thing the Relay ever says, sent to both parties the moment a room holds two sockets. It exists because a party cannot speak before the other arrives — nothing is stored in between, so a frame sent alone has nowhere to go — and the peer's single frame is already spent on the delivery acknowledgement, so the readiness signal cannot come from them. The discipline that keeps it unambiguous is a register: **the relay originates text and the parties send binary**, and a party's text frame is refused rather than dropped. It is not a **Send code**, carries nothing about either device, and never crosses a room boundary.
_Avoid_: Handshake, hello, ready message, signalling (there is no rendezvous), presence (nothing is subscribed to)

**Paired Device**:
One of your own devices, remembered as `{ device_id, a name you typed, a 256-bit pairing secret }` in `localStorage` and **never** as a datom, because a revocation cannot live in an append-only log that the revoked device also writes to. Pairing is symmetric and pairwise: there is no main device, no hub and no revocation authority, and deleting a pairing on either side severs it completely with no message. Silence is the revocation signal, because a message can be suppressed. See ADR-0075 §3, §4 and §12.
_Avoid_: Trusted device, linked device, primary device, hub, account

**Version vector**:
What two **Paired Devices** exchange to converge: the greatest `(hlc_ms, hlc_ctr)` per originating `device_id`, read straight off `datoms` rather than stored anywhere. It is queried, not kept, so it can never fall out of step with the ledger; a first sync is just its empty case, and resuming a dropped socket costs nothing. A single scalar clock watermark is **wrong** rather than coarse, because a peer can hand you a row stamped below your maximum and a scalar filter would drop it silently. See ADR-0075 §6.
_Avoid_: High-water mark (it is per-device, not one number), sync cursor, import log (ADR-0067 §2 refuses one), last-synced timestamp

### Notes and checklists

**Checklist**:
An ordered, free-form scratchpad list of manually-ticked Checklist Items. It carries no Schedule Rule, no tracking, and no streak, and it never appears on the Agenda. Deliberately separate from the Agenda's scheduled obligations (Habit Blueprints, Compliance Events).
_Avoid_: To-do list, task list, agenda

**Checklist Item**:
A single user-authored entry in a Checklist, carrying a label and a checked/unchecked state. It is never a Habit Blueprint, Compliance Event, or Agenda entry, and ticking it produces no Execution Event or Occurrence Event — the tick is plain state, not a logged behavior.
_Avoid_: To-Do, Task, habit, completion

**Note**:
A free-form, user-authored entry with a title and a text body, where the body merges concurrent edits from multiple devices without conflict. Distinct from the `twin/note` annotation attribute on a Digital Twin, which is a single field rather than a standalone entity.
_Avoid_: twin/note (the Twin annotation field), memo, comment

### Local logs

**Log facility**:
The one module (`src/lib/logs/log-facility.ts`) that owns local diagnostic and
instrumentation records: their storage, their caps, their redaction and the
hand-export they leave by. Records are `localStorage` JSON under one namespaced key
per Log channel, never datoms, because redaction has to delete and the ledger is
append-only and syncs. It has no transport of any kind, so nothing it holds can leave
the device except through a file the user exports after reading it. See ADR-0054.
_Avoid_: Telemetry, analytics, tracking, the logger (`console.*` is not this)

**Log channel**:
A named stream inside the Log facility, declaring its `name`, `reader`, `cap` and
`sensitivity` (`personal` or `technical`). It may not exist without a **reader**, and
there are two kinds. A **question channel** names an open ticket and the decision that
ticket cannot take without the reading, points at a pre-registered bar, and is removed
once its question is answered; `search` is one. A **standing channel** does not end and
has no bar, so its reader names instead a **view in the app that displays it** — a
channel nobody can look at may not exist — and it is `technical`, never `personal`,
because a record that never ends must not be a record of what somebody was thinking
about eating. "It might be useful later" is a reader of neither kind. Declaring one
registers it. See ADR-0054 §2 and its Amendment of 2026-08-29.
_Avoid_: Log level, severity, category, stream

**Log counter**:
A named whole number a standing Log channel keeps beside its entries: it only ever
increases, is never shed, and is not subject to the `cap`. Counters exist because the
capped entry ring silently forgets its own denominator, so a rate computed from
retained entries is the rate of the last 200 of them wearing a lifetime label. A
counter is always a running total of a field the entries already record, never a new
fact, and it is cleared only when the channel is. See ADR-0054's Amendment of
2026-08-29.
_Avoid_: Metric, gauge, statistic, tally

**Search session**:
One visit to the food search: it opens when the search field first goes non-empty and
ends when the user abandons it, clears it, or stages a food. It leaves **one** entry
in the search Log channel, and only if it ever reached an empty result, holding the
last query that returned nothing plus the correction that answered it. The unit is
the session and never the search, because the field runs on a 120 ms debounce and one
typed phrase fires about eleven of them. See ADR-0053 §2.
_Avoid_: Search event, query log, keystroke, empty search (for the session itself)

**Scan session**:
One visit to the barcode path: it opens when a lookup starts and settles when the
user stages a food, opens a capture door, or leaves the scan without doing either.
It leaves **one** entry in the scan Log channel, holding what Open Food Facts
answered, whether the retry ran, and which of the four capture doors the user then
opened. The unit is the session and never the lookup, because the fact it exists to
record is a _sequence_ — an outcome, and then what the user did about it — and a
sequence split across two entries would have to be rejoined by the barcode, which
the channel is forbidden to carry. See ADR-0071 §2.
_Avoid_: Scan event, lookup log, barcode log, scan (for the session itself)

### Interface primitives

These ADRs establish this vocabulary and forbid alternatives to it. The `_Avoid_` lines
here matter more than most: the recurring failure is inventing a fourth thing that
already exists as one of these.

**BottomSheet**:
The one sheet primitive (`ui/BottomSheet.svelte`). Every sheet in the app is this
component, including the docked-footer and over-dialog variants. See ADR-0027 and
ADR-0028.
_Avoid_: Drawer, panel, tray, modal (when a sheet is meant), a second sheet component

**Modal**:
The centred dialog primitive (`ui/Modal.svelte`), distinct from BottomSheet by
position rather than by behaviour. See ADR-0027.
_Avoid_: Dialog, popup, overlay

**Segmented**:
A single-choice control whose selection must persist once made: mode switches, sex
and goal pickers (`ui/Segmented.svelte`). See ADR-0036.
_Avoid_: Tab bar (when no panel is switched), radio row, toggle

**ToggleGroup**:
The deselectable sibling of Segmented (`ui/ToggleGroup.svelte`): clicking the active
item clears the selection. Wraps rather than forcing equal widths. Use it wherever a
filter may be turned off again. See ADR-0040.
_Avoid_: Chip group, filter chips, multi-select

**Checkbox**:
The one checkbox (`ui/Checkbox.svelte`): a native `<input type="checkbox">` in the
`<label>` that names it, wearing the house skin. Every tick, consent box and
recording switch in the app is this component — the platform already supplies the
control, so bits-ui has nothing to add here. A name is not optional, and the row's
typography is the caller's `class`. See ADR-0068.
_Avoid_: Toggle, tick box, a second checkbox skin

**Badge**:
A display-only status or category label (`ui/Badge.svelte`). Its colour comes from
the shared `categoryBadgeVariant(category)` helper, never from a re-declared inline
map. See ADR-0040.
_Avoid_: Chip, pill, tag, label

**Button**:
The canonical interactive frame primitive (`ui/Button.svelte`). A control that toggles
a selection is a Button whose variant reflects the selected state, not a new
primitive. See ADR-0039 and ADR-0040.
_Avoid_: Selected chip, toggle button (as a distinct component)

**Card**:
The canonical container frame primitive (`ui/Card.svelte`), carrying the ADR-0038
edge and elevation tokens. See ADR-0039.
_Avoid_: Panel, box, tile, surface

**Meter**:
The shared proportional-readout primitive (`ui/Meter.svelte`) behind the nutrition
bars, the dashboard RDA cells, and the calorie ring. See ADR-0037.
_Avoid_: Progress bar, gauge, ring (as separate components)

**AmountField**:
The one control an amount of a food is typed into (`views/food/AmountField.svelte`):
the boxed number, the ×/÷ sum keys, the skim slider and the portion chips. It is a
food-screen control rather than a `ui/` primitive, but it is the only one of its kind
— every staging screen and every edit-amount sheet reaches an amount through it. It
takes its **Amount unit** as a prop and names it in its label, its suffix and its
slider scale, because a unit can never be typed into it. See ADR-0023 and ADR-0060.
_Avoid_: QuantityGrams, quantity field, gram field, gram picker

**Basis caption**:
The line above the AmountField naming what the panel's figures are measured per —
`Per 100 g`, `Per 100 ml`, `Per serving (30 g)`, `Per serving`. It answers a
different question from the control below it ("what are these figures per?" against
"what am I typing?"), and the two coincide only on a per-100 panel. See ADR-0060.
_Avoid_: Serving size (as a caption), per-100 label

**Chip**:
Not a thing. There is deliberately no `Chip` primitive; the space it would occupy is
covered by Badge (display), Button (selected), and ToggleGroup (deselectable). See
ADR-0040.
_Avoid_: Chip, pill (use Badge, Button, or ToggleGroup, whichever the behaviour calls
for)
