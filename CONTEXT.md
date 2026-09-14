# Inventoria

A local-first Progressive Web App (PWA) for tracking physical items and temporal behaviors using an immutable ledger.

## Language

This is the ubiquitous language: the term as defined here is the term to use in code,
issue titles, tests, and prose. Each entry's `_Avoid_` line lists the synonyms that
have caused confusion, which are not stylistic preferences but names to stop using.

### Storage core

**Datom**:
The atomic unit of storage representing a single fact, consisting of an entity ID, an attribute, a value, a domain timestamp, and a hybrid logical clock stamp that gives it a deterministic total order (ADR-0020). Reads fold in clock order, not timestamp order. The full column list is in `docs/eavt-vocabulary.md`.
_Avoid_: Row (a stored fact is never a row — **Row** names the list-line UI primitive), record, database entry

**Ledger**:
The append-only, immutable database table (`datoms`) containing the full chronological sequence of all datoms. Current state is derived by querying this historical log.
_Avoid_: Relational database, mutable table, state table

**Jar**:
Everything the browser keeps for this origin: the OPFS database file (`/inventoria.db`) holding the Ledger, and the `localStorage` side-cars beside it (the secrets and the Log facility). One jar per origin, shared by every Facet — two scopes on one origin read and write the same Ledger, which is what lets the root Inventoria show food the Food Facet logged. A separate origin would be a second jar, and the two halves could then be reunited only by pointing device convergence across origins rather than across devices. Not a synonym for Ledger: the storage grant and the side-cars are jar-wide and are not ledger rows. See ADR-0076.
_Avoid_: Database (ambiguous between the file and the `datoms` table), storage, the DB, site data

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

**Setting**:
How the app is configured, as opposed to a fact about the world you tracked. Never a datom: every setting lives in `localStorage` through `src/lib/stores/device-settings.ts`, whatever its past values would read like in a sentence, so a nutrition target is a setting and so is a folded panel. That makes every setting per-device, unsynced, and absent from the Ledger export, which is a cost ADR-0085 §5 states rather than leaves to be found. A **Consent** is not a datom either, and is not stored at all.
_Avoid_: Preference and configuration as separate categories (they are the same category now), option, ledger setting

**Consent**:
An answer given at the point of the act it authorises, and nowhere else: the per-capture checkbox ticked before a contribution is submitted, the exact payload read before an export is written. It is not stored, and there is no consent entity and no `consent/` attribute. ADR-0085 §2 kept two in the Ledger as recorded acts and ADR-0086 §2 found neither was one — each merely seeded a box that is shown and answered again every time, which makes it a **Setting**. The switch on a settings screen is therefore the default for a consent and never the consent, and a design that gates an act on the switch alone has moved the agreement away from the act. See ADR-0086 §2.
_Avoid_: Consent datom, consent entity, master consent, permission (which is the browser's word for a prompt); and calling the settings switch a consent

**Persistent storage**:
The browser's undertaking not to evict this origin's data to reclaim disk space, asked for once per session through `navigator.storage.persist()` and reported in Settings and on Rations settings, the badge being the one place either app says the Ledger may be evicted (ADR-0080 §2). Storage without it is _best-effort_, the standard's own word: the Ledger may be cleared with no warning and no action by the user. The state belongs to one browser profile rather than to the person using the app, so it is never a datom, and it is not a backup, because clearing site data, `Wipe Database` and a lost device each take the Ledger whatever the browser granted. See ADR-0065.
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
A generic, non-branded, standardised food entry — what the USDA FoodData Central search (Foundation + SR Legacy) returns and is _for_. It is a food **as bought and not yet cooked**: a record USDA cooked before it measured it is not a Reference food and does not ship, which is what makes every shipped panel a figure for the thing you put on the scales. Drying, curing, smoking and roasting happen before the purchase, so dried apricots and roasted peanuts are Reference foods; the line is a whole-foods shop, and a food you could scoop out of a bin with no label on it is one. Includes generic uncooked staples (flour, oats, cheddar). This is the set the food search keeps; Brand-specific foods, packaged products, and Composite dishes are excluded from it and reached instead via the Open Food Facts barcode path (ADR-0034). It is a food **as bought** rather than a USDA record as published: where several records describe one food, the corpus holds one Reference food, and two records are one food when you would write one word for them in a food diary. A variety, a part and a fat content are different foods; a trim and a grade are the same food, and a preparation is not a food at all. Fourteen foods left the corpus when that rule shipped, because USDA publishes them cooked and no other way — mutton, turkey breast and escarole among them, listed in ADR-0104. See ADR-0042, ADR-0103 and ADR-0104.
_Avoid_: Generic food, USDA food, ingredient (when a prepared reference item is meant), USDA record (which is what several of them collapse from)

**Search index**:
The committed artifact the food search reads, one row per Reference food: identity, the fields ranking reads, the macros a result row renders, the household portions, and the reference to any SR Legacy twin whose values the row borrowed. Generated from USDA's bulk archives with the reference-food filters already applied, so it holds the 2,484 survivors rather than all 7,974 food identities, and the filters run once per generation instead of once per keystroke. Every row carries an energy value, because a record that reports none cannot be logged and does not ship. A row's description is USDA's own, less the parts that do not name the food — a commercial origin, USDA's cataloguing qualifiers, every spelling of the uncooked state, an enrichment word whose counterpart no longer ships, a comparative qualifier nothing contests, and the parenthesised tag naming the population a designated record was published for are all removed at generation time, and USDA's `mature seeds` is written `dried` because that is the word a cook uses, so what ships is the name a person reads and searches. Where removing a tag leaves two rows with one name, the row with the fuller nutrient panel keeps it — a judgement about the record, never about whose food it is. The designation itself is not lost: it is carried on the row's `food/category`, which is where the ranking reads it. Under an Adjudicated head phrase it also holds one row per food rather than one per record: a flavoured, dehydrated or differently fortified form of a food it already keeps does not ship. Corpus-wide it holds one row per Collapse group rather than one per USDA record, so the records that differ only on a Collapsing axis ship as the group's Representative and the rest do not ship at all. The ranking's base-ingredient preference is carried on the row rather than read off the name, because a corpus of uncooked foods says `raw` on every row or on none. See ADR-0047, ADR-0048, ADR-0056, ADR-0061, ADR-0103 and ADR-0104.
_Avoid_: Food index, USDA index, the bundle, offline database

**Adjudicated head phrase**:
A head phrase — the first comma-part of a USDA description — whose every row somebody has read one at a time, and the only place the Search index drops a row for being a variant of a food it keeps rather than for what the record is. Reading a head is what licenses a drop and never a collapse: a collapse leaves the group's Representative behind and so fires everywhere, where a drop leaves nothing and so fires only here. Four have been read: `Milk`, `Yogurt`, `Soymilk` and `Egg`. `Beverages`, `Cheese`, `Ice cream` and every other head carrying a flavour ladder are deliberately not done, so a reader who assumes one of them was considered and kept will be wrong: it was never looked at. The reason for the drops is simplicity preferred to complete coverage, stated plainly rather than dressed as a claim about the records, and it costs real data — the surviving milks carry shallower nutrient panels than the fortified twins they beat. See ADR-0061.
_Avoid_: Adjudicated food, head word (which is the first word, not the first part), whitelist, read head (say Adjudicated head phrase)

**Collapsing axis**:
A dimension the USDA records under one head vary along that names something done to a food **after it was bought**, or a trade specification a shopper never sees — a preparation, a trim, a grade, a separable-fat statement. It never distinguishes a Reference food: the records that differ only along one collapse into a single row. The classification is a property of the axis and holds corpus-wide, and it is decided by what the axis IS rather than by how far it moves the calories — a threshold was built for that job and refuted, because the axis wanted as a row moved the number 2% and the axis refused moved it 34%. See ADR-0103.
_Avoid_: Noise axis, qualifier, non-distinguishing variant, form (which named a staging picker that was refused)

**Distinguishing axis**:
A dimension the USDA records under one head vary along that names something true of a food **when it was bought** — a variety, a part, a fat content, a cut, a dried state. Each of its values is a different Reference food and gets its own row. Drying distinguishes: dried apricots are bought as dried apricots, and there is no fresh apricot behind them. See ADR-0103.
_Avoid_: Form, variant axis, real axis

**Residual description**:
What a USDA description reads as once every Collapsing axis segment is struck out of it. It is the key that decides which records are one food, and nothing displays it. Records are grouped on it with commas, hyphens, slashes and repeated whitespace normalised away, because USDA spells one cut several ways — `Beef, round, top round, steak` and `Beef, round, top round steak` are one food — and a difference of punctuation is not a difference of food. Nothing carrying meaning is normalised. See ADR-0103.
_Avoid_: Stripped name, canonical name (which is the shipped name, a different thing), base description

**Collapse group**:
The set of USDA records sharing one Residual description, which is to say the records of one food at every preparation, trim and grade USDA published it at. A group of one is the ordinary case: three-quarters of the corpus carries a preparation word and most of those records have no sibling to merge with, which is why collapsing removes far fewer rows than dropping every cooked record would — and why dropping them instead would delete quinoa, teff, spelt, mutton and fifteen other head phrases outright. See ADR-0103.
_Avoid_: Duplicate set, permutation group, cluster

**Representative**:
The one record of a Collapse group whose panel the Search index ships, chosen by the fuller nutrient panel and then the lower `fdcId`. It is always a record USDA published, never an average of the group: an average is a number nobody measured and no `fdc:` entity can carry. A record is eligible to represent a group only where the name the group ships under stays true of it, so a record stating a preparation or a separation — `cooked`, `separable lean only` — stands for nothing. Trim and grade refuse nothing: the group exists because those are the same food, and refusing a record for stating one would re-import the distinction the collapse just erased. The spread the group loses is real and is not recorded anywhere on the row — on beef sirloin, 12% of the calories across trim and 6% across grade. See ADR-0103.
_Avoid_: Winner, canonical record, survivor (which is ADR-0051's word for a twin merge), average row

**Coverage hole**:
A Collapse group of more than one record where no record is eligible to be its Representative. It ships anyway: its fullest-panel record under that record's whole, unstripped name, which is the treatment a group of one already gets — `Quinoa, cooked` is the only quinoa USDA publishes and ships saying so. What a hole forbids is the strip, never the row, so it blocks no head and a Curated stand-in improves it rather than gating it. No instance has been demonstrated: plain skinless chicken breast was named as the confirmed one and is not, `fdc:171077` being a plain raw breast at 120 kcal. See ADR-0046 and ADR-0103.
_Avoid_: Missing food, gap, null row

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
_Avoid_: Branded product (when the `food/brand` or `item/brand` attribute is meant), product

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

**Rank mark**:
What a list uses to say which row won, and never with a number (ADR-0090). Two of them, one channel each: the top-ranked row inverts, ink on paper, and the two below it carry a stepping left edge, `--edge-thick` then `--edge`, over the `--edge-thin` every row rests on. Both are static, and a rank mark may not appear over a list that has ranked nothing — **Recent** is a chronology, and crowning its newest entry claims an order it does not have, which is the defect the record was written against. It is a separate channel from the keyboard highlight, which is a ring that moves with the arrow keys: one mark cannot answer both "what won" and "where you are", and until ADR-0090 one mark was doing both, badly, because it was bits-ui's `highlighted` all along.
_Avoid_: Highlight (that is the moving ring), selected, active, first result, top hit, rank number (§2 is that there is no number)

**Past meal**:
A meal as it was logged on an earlier day: its foods _and_ their amounts. Copying one appends those entries to the meal you are viewing (ADR-0058) — wholesale, at the amounts recorded, on the current clock, and only into the same Meal Type. It is the counterpart to **Recent** and the distinction is the point: Recent offers you a food, a past meal offers you an occasion you actually ate, which is why the catalogue rule (ADR-0035 §6) filters the first and not the second. A logged Recipe Instantiation is reproduced from its frozen snapshot, never re-derived from the template.
_Avoid_: Repeat (that word means recurrence _scheduling_ in this app — `EventRecurrenceField`, `ScheduleRuleEditor`), duplicate, clone, re-log, copy meal

**Way in**:
One of the five ways to put something in a meal: copy a **Past meal**, enter one yourself, log a recipe, scan a barcode, search (ADR-0059). All five sit on the day's **Way-in bar**, and none is a control in a meal's header any more (ADR-0101 §1). There is no `+` — it never named an action, it opened a sheet that then asked which of these you meant, so it was a lobby rather than a door. Each way in opens its own single-purpose sheet carrying no method dock, since the bar already chose. Every control's own name states its meal, because the roster is drawn once per meal and four identical names cannot be told apart; the sheet's title drops it again, because by then the meal is settled by the tap that opened it. Its caption on the bar drops it too, and for a sharper version of the same reason: there is one bar for the whole day, so a caption naming a meal would be wrong three times in four the moment a tab moved. A way in whose sheet could only disappoint is absent rather than disabled — the past-meal control appears only once that meal has history.
_Avoid_: Entry / meal entry (this app spends _entry_ on a manually entered food, ADR-0035), add button, plus button, Door (ADR-0034 already uses that for the routes into the label form), Method (that is a **FoodStager** staging tab, which is what a way in replaces)

**Way-in bar**:
The one surface the day's five **Way in**s live on — a tab list of the four meal types, and below it the five ways into whichever meal is selected (ADR-0101). One bar per day, not one row per meal, which is what took twenty controls down to five. The rail below the tabs is the selected tab's **panel** and not a row of toggles wearing tab roles: its contents belong to the chosen meal and change with it, since the past-meal control appears only for a meal with history. The meal is **chosen and never inferred** — the clock picks the first one and only a tab moves it afterwards, because a target that decides where a tap lands may not move on its own. Below `BREAKPOINTS.sheet` it is pinned to the visible **Band**'s bottom edge, where the hand is; at and above it, sticky at the head of the day's column, where a bar rising from the far end of a large screen would be imitating a device that is not there. It shares one slot with the **Selection bar** and folds out of it when a Selection takes the screen, on both layouts — a control that cannot act does not hold space. It links nowhere, so it is not a way out of the Facet (ADR-0078 §1).
_Avoid_: **Dock** (that word is the pinned foot of a _sheet_), meal bar, add bar, footer, action bar, toolbar, sticky bar, tab bar (the **Selection bar** covers one of those, and this is not it)

**Way out**:
The one control that hands logged food to another person: it sits beside the panel's name inside a nutrition panel, and it is the mirror of a **Way in** rather than a sixth control in the meal header, which gains nothing. There is one on a meal's own panel, one on the full day's and one on a **Selection**'s, the same control at three scales — a meal's panel is reached by tapping the meal's name, which always works, or its subtotal line, which an empty meal does not have, and a Selection's by the hand-off verb on the **Selection bar**. Every scale costs the same two taps, which is why the Selection bar's verb is a door to the panel rather than a one-tap route to a code. The panel then _turns into_ the **Send code** and back: it opens no second surface, and once a code is minted there is no back button, because the code is live and an affordance that looked like undo would be one. It is present on every platform, iOS included: nothing about sending touches the storage partition, and it was hidden there only to avoid supporting a platform in some of its cases and not others. See ADR-0074 §1 and §3 and its 2026-09-01 amendment, ADR-0082 §3, and ADR-0088 §9.
_Avoid_: Share, export (that is the **Ledger export**), send button, handover (that is the **Code handover**, which is the recipient's page and not this control), way in (it is deliberately not one)
**Selection**:
The set of logged foods a long-press picked out, held as Consumption Event ids. It is **not** meal-scoped — a banana from breakfast and a coffee from dinner may sit in one Selection — but it **is** day-scoped: changing the viewed date clears it, and an id that leaves the day is pruned, because a count naming foods you cannot see is an affordance that lies. Long-press is the only way into one; a day-level Select control was drawn and refused, so the verbs it carries ship behind a gesture nothing advertises. **A finished verb ends it**, whatever the verb did to the foods — a Selection is the subject of a verb, and a verb that has run has no subject left. A failure is not a finish and keeps it, and so does a food a run merely skipped, which is how the one status line still has a bar to sit on. See ADR-0088 §1 and §4, and its amendments.
_Avoid_: Multi-select, checked items, marked foods, batch, selection mode (the **mode** is the bar's, not the set's)

**Selection bar**:
The strip a **Selection** raises at the foot of the Food screen: a `✕` and four drawn verb marks. The `✕` leads so no status line can wrap it away, and it is the only one on screen, because a selected row swaps its own remove mark for the tick. The bar writes nothing — it carried an `N selected ›` control, which both restated what the ticked rows already say and served as the unmarked door to the Selection's nutrition panel; the hand-off verb now opens that panel, which is where the **Way out** lives. The count survives on the verbs' own labels, so a screen reader still hears the size of what it is about to act on. One status line serves every verb and is silent on success. The bar deliberately covers the tab bar, which is what makes a Selection a mode, and is why `Escape` and the platform back gesture both leave it. Labelled verbs were measured and do not fit at 360px, which is why the marks are drawn rather than written. See ADR-0088 §2 and §3.
_Avoid_: Action bar, contextual action bar, CAB, toolbar, multi-select bar, batch bar, bottom bar (that is the tab bar this one covers)

**Provisional figure**:
A logged figure drawn at what it _would_ become, shown while a Scale preview is live: inverted, ink fill with paper text, so what is projected can never be read as what is stored. Its box is present at rest with only its colours switching, and a negative margin cancels its horizontal padding, because **a row may not change geometry between previewing and not** — not its height, its width or its order. The preview surface is the real list of foods; nothing copies that list into the control, and no total is stated, since amounts do not sum across a mixed selection (ADR-0060) and this app does not lead with calories. See ADR-0088 §5 and §6.
_Avoid_: Chip, pill, badge (**Badge** is a different, display-only thing), ghost value, preview badge, pending state, dirty state

**Engagement Event**:
A logged instance of watching a movie/show or reading a book, recorded as a timestamped action in the ledger (`WatchAction` or `ReadAction`) linking to a media Digital Twin. All media engagements share one closed status enum: `saved`, `started`, `progress`, `completed`.
_Avoid_: Consumption event (when referring to media), activity log

**Acquisition Event**:
A logged instance representing the ownership state of a physical Digital Twin, recorded as a timestamped action in the ledger with a status of either `owned` or `wanted`.
_Avoid_: Ownership event, item status, inventory log

### Sending and syncing

**Meal send**:
One person handing a **Past meal** to another, or a whole day's worth of them. It is synchronous: both people are present at the same moment, the food exists in exactly two places and never a third, and nothing is stored anywhere in between. What crosses is a **Meal payload**; what lands, on acceptance, is a re-minted **Consumption Event** on the recipient's own clock and day, in **the Meal Type its own event carries** — so a day arrives as a day rather than as one enormous breakfast. The sender learns delivery and **never** acceptance, so declining is never socially visible. On iOS one case differs and only one: a **link** opened in a Safari tab cannot write to the installed app's jar, so that page accepts nothing and hands the **Send code** over to be pasted into **Scan** instead. Sending, and receiving in the same room, work there as anywhere. See ADR-0072, ADR-0073, ADR-0074 and ADR-0082.
_Avoid_: Share, sync (that is your own devices, and it is a different session model), transfer, send meal, meal sharing

**Send code**:
The single-use secret that addresses one Meal send: a room id and a fresh 256-bit AES-GCM key, about 100 characters, never fewer than 128 bits and never spoken aloud. One shape with two carriers, a QR in the same room and a **link** everywhere else (`/food/#r=…&k=…`, the secret in the fragment so it reaches no server, minted at Rations because a meal is Rations' — ADR-0084 §5). It dies on one successful delivery, on any refusal, on the sender cancelling, or after five minutes, and there is no retry on a spent one. Because a send is synchronous, a pasted code is already dead by the time it is scrollback. See ADR-0072 §3 to §6.
_Avoid_: **Pairing code** (both are per-act; they differ in what they address and in what they carry — a Send code addresses a meal on its way to another person, a Pairing code addresses one of your own devices and carries no pairing secret. Which Facet mints one no longer tells them apart: Rations mints both since ADR-0103 §10), pairing secret (what a Pairing code exists to avoid carrying), password, invite, room id (which is half of it), wormhole code

**Meal payload**:
What crosses the wire in a Meal send: the **winning** datoms of one Past meal's reference closure, in the **Ledger export**'s NDJSON grammar but under its own `artifact` (`inventoria-meal`), its own `schema_version`, and an envelope declaring which `event:consume_` ids are the closure's roots. It omits exactly three attributes, `twin/raw_provenance`, `food/label_photos` and `food/photo_base64`, and carries every other one verbatim. It is never a Ledger export and the two readers refuse each other by name, because two formats whose merge rules differ must not share one. Bounded at 1 MiB of **decoded** bytes, counted as they decode. See ADR-0073.
_Avoid_: Meal export, meal file, share payload, ledger export, closure (bare)

**Receiving surface**:
The screen a Meal send lands on: the meal itself, with nothing in front of it, reached by opening a link or by pointing the **Scan** way in at a Send code, which reads a meal code as well as a barcode. It **is** the hold. A payload lives in memory for the life of this view and nowhere else, so **leaving is declining**, by any route and without being asked. There is no inbox, no standing receive control and no count badge: nothing listens for a send it was not asked for, so a badge could only ever be non-zero after a receive you started yourself, which makes it an affordance that lies. See ADR-0073 §10 and ADR-0074 §4 to §6.
_Avoid_: Inbox (there is none; the word survives only in the map that named it), receive screen, pending meals, notification, tray

**Code handover**:
What an iOS Safari tab shows in place of the **Receiving surface**: the **Send code** as its whole link, a control that copies it, and two sentences, which are open Inventoria and paste this into **Scan**, and, if you have not installed it yet, add it to the Home Screen first and come back. It is **one page with one wording and no branch**, because the page can always know it is not the installed copy and can never know whether an installed copy exists. It joins no room, opens no ledger, asks for no persistence, and cleans the URL anyway. The name it tells you to open follows whichever Facet holds the meal. See ADR-0082 §2, §5, §6, §8 and §9.
_Avoid_: Fallback page, iOS receive screen, install prompt (it prompts nothing and detects nothing), receiving surface (this is what stands in for one), handover (bare, on the sender's side that is the **Way out**)

**Arrival mark**:
The one attribute (`food/arrival`) recording that a food reached this device because somebody sent you a meal. It is the third sibling of `food/label_capture` and `food/manual_entry`, so it records _how this food came to be here_ and never _who sent it_. It is **display-only**: it changes what `foodSourceView` says and nothing else, because re-minting exists precisely to make the meal theirs. It is never written for a datom from one of your own devices. See ADR-0073 §11.
_Avoid_: Received flag, sender, shared-by, origin (that is the food's source), provenance (that is `twin/raw_provenance`)

**Relay**:
The Durable Object on the site's own Worker that holds at most two WebSockets for one room and forwards sealed frames it structurally cannot open. Its bounds are **two sockets and five minutes, and nothing else**, for every room alike — it is never told which kind of room it is holding, because telling it would hand the operator a free classification. It may learn that two devices met, when and how much crossed; it holds **nothing that outlives a room**, and it runs with the script's invocation logs off. What the platform retains about a room is a separate question from what the Relay holds, and the object is named by a **hash** of the room id so the retained name is not the string that crosses in a code. It is the one **operationally conditional** part of Inventoria: if running it stops being tenable, the send is removed and the Ledger export remains. See ADR-0072 §1 and §9 to §12 and its 2026-09-07 Amendment, and ADR-0096 §8.
_Avoid_: Server, rendezvous (there is none, deliberately), signalling server, STUN, TURN, **Store** (the Relay still holds nothing that outlives a room; the thing that retains is a separate noun)

**Peer word**:
The one thing the Relay ever says, sent to both parties the moment a room holds two sockets. It exists because a party cannot speak before the other arrives — nothing is stored in between, so a frame sent alone has nowhere to go — and the readiness signal cannot come from the peer for the same reason, since a readiness frame into an empty room is exactly the frame that cannot be parked. The discipline that keeps it unambiguous is a register: **the relay originates text and the parties send binary**, and a party's text frame is refused rather than dropped. It is not a **Send code**, carries nothing about either device, and never crosses a room boundary.
_Avoid_: Handshake, hello, ready message, signalling (there is no rendezvous), presence (nothing is subscribed to)

**Paired Device**:
One of your own devices, held in `localStorage` and **never** as a datom, because a revocation cannot live in an append-only log that the revoked device also writes to. **The record holds derived, per-lane chain state and never a reusable credential**: nothing in it can regenerate the pairing, only advance it, so a stolen record opens at most one outstanding **Deposit** per **Lane**. It also holds the peer's last-stated **Device roster**, replaced whole by each Deposit, **how many consecutive unproductive Wakes this pairing has burned** and **the day it last produced something**, coarsened to the calendar date and never finer. No pairing secret is remembered — it is destroyed at the end of **Pairing**. The name is typed **locally, about the peer, after the act**, and a row reads by short `device_id` until it is named. Pairing is symmetric and pairwise: there is no main device, no hub and no revocation authority, and deleting a pairing on either side severs it with no message. **Unpairing is two-phase, and the ordering is the whole mechanism**: the record is marked revoked and kept whole, both lane objects are deleted, and only then is the record removed — so a withdrawal that could not reach the Store is **pending** rather than lost, and is retried on any later open. A marked record is deposited to, collected from and stated to nobody from the mark onward. The surface claims exactly what the deletes achieve: _unpairing removes anything that has not yet been picked up_, scoped to those two devices, with the qualifier that a peer which has not noticed may leave one more sealed object nothing can open. **Where another pairing would still stand it says one thing more**, because revocation across a household completes at the rate of its least-used device: _your other devices are not unpaired from it here; each device is unpaired on itself, so one you have not opened stays paired with it until you do._ It states what the act does and never what the household looks like, and at a household of two it is not said at all. Silence is the revocation signal, because a message can be suppressed. At K = 200 consecutive unproductive Wakes a pairing **stops**: this device touches neither of its keys again and the section shows the **one-sided state**. The stop is lossless and it never unpairs — both ledgers are intact, the Store still holds the outstanding delta, and the way back is the user's, which is to unpair here too or to pair again. The list of them is the **Paired devices** section, which is also where the act lives: one module, drawn on the root's Settings and again on **Rations settings**, because a Rations user has no route to the root's copy (ADR-0078 §7) and a pending revocation or a stopped pairing the user cannot reach is stranded (ADR-0103 §10). **Every row names what its lane carries**, in the **Tracked Domains**' own names, which is the only place the app can explain an absence the user would otherwise read as a sync failure. A **Facet-scoped wipe** does not unpair: the record is about devices, and severing the lane in the same act would guarantee the wipe never reached the peer (ADR-0103 §8). That section's last-met date and one-sided state are **the only staleness this design ever shows**: no spinner, no toast and no badge anywhere, because the stale device cannot know what it has not got and opening it _is_ the Collection. See ADR-0075 §3, §4 and §12, and ADR-0096 §9 and §11.
_Avoid_: Trusted device, linked device, primary device, hub, account, **Devices screen** (ADR-0075 §4's phrase, retired — the screen never existed and now never will)

**Version vector**:
What two **Paired Devices** exchange to converge: the greatest `(hlc_ms, hlc_ctr)` per originating `device_id`, read straight off `datoms` rather than stored anywhere. It is queried, not kept, so it can never fall out of step with the ledger; a first sync is just its empty case, and resuming a dropped socket costs nothing. A single scalar clock watermark is **wrong** rather than coarse, because a peer can hand you a row stamped below your maximum and a scalar filter would drop it silently. See ADR-0075 §6.
_Avoid_: High-water mark (it is per-device, not one number), sync cursor, import log (ADR-0067 §2 refuses one), last-synced timestamp

**Store**:
The bucket a **Deposit** waits in, so that two **Paired Devices** converge without both being awake. It holds sealed objects at keys nobody can enumerate, none larger than 16 MiB, none older than 30 days; for each **Lane** it holds at most one, its depositor's outstanding delta, until its collector acknowledges it. Unlike the **Relay** it is not met by construction — five clauses, five mechanisms, only one of them the platform's — and it never holds enough to reconstruct a ledger, because a first sync never crosses it. It is the second **operationally conditional** part of Inventoria: if running it stops being tenable, the Deposit is removed and convergence between two devices that are awake together remains. See ADR-0096 §1.
_Avoid_: Mailbox (it holds one object per Lane, not a queue), inbox, sync server (it stores sealed bytes and never datoms it can read), backup (it offers no recovery), replica, cloud, bucket (that is the implementation)

**Deposit**:
One sealed object at a **Lane**'s current chain index, carrying a **Device roster** and beside it an acknowledgement and a delta, **either of which may be empty** — a device with nothing to send still deposits, or its peer's chain stalls. It is triggered by the delta growing rather than by the open, because there is no dependable end of a session and a deposit fired at open goes out before that session's meals exist; every rewrite before a **Collection** lands on the same address, which is what makes depositing on every change cost nothing of the address chain. It is rewritten in place at the same index with the full outstanding delta until the peer's acknowledgement arrives, under a conditional write whose refusal means the object is gone — **answered by an unconditional write at the same index, which may not advance the lane and may not advance what that index will be taken to have brought**. See ADR-0096 §3 and §5.
_Avoid_: Message, upload, push (which is refused outright), packet, delta (bare — that is what a Deposit carries), blob

**Device roster**:
The `device_id`s a device states **it** is paired with, riding every **Deposit** beside the datoms. **The peer of the Lane it rides is not in it**, because that peer already knows and the rule is the _least_ that answers a question its peer cannot otherwise answer — a narrowing of ADR-0096 §6's unqualified _the set of `device_id`s it is paired with_, written here so the glossary does not say one thing while the wire says another. An empty roster is therefore a household of two, and it is a statement; **a Deposit that states none at all is silence**, which only a build predating the roster can leave, and the two never collapse. It is what a device says about _itself_ and the whole of the closed list of such things: a second member costs an ADR amendment. The ledger cannot answer it, because `datoms` carries `device_id` in its primary key but that set only ever grows, so it names a phone sold two years ago forever — only a device can say it is _still_ paired. It travels **one hop** and is never relayed, it **supersedes** rather than accumulating, and it is **never merged** with the local list, because two rosters disagreeing is legitimate under pairwise pairing and reconciling them would invent an authority the design was built without. **Typed names do not cross**: an id resolves to a name locally exactly where a name is wanted, and where it does not resolve the honest sentence names nobody. It is automatic, with no toggle and no consent, and it is **a list you go and look at, never an event** — a notification or a badge would deliver by observation what ADR-0075 §14.6 refuses to deliver by message. See ADR-0096 §6.
_Avoid_: Device list, contacts, peers (bare), household (as a name for **this list** — the word itself is ordinary prose for your own set of devices, which is what a roster makes a statement about and what ADR-0096 §10 prices), directory, address book, announcement

**Collection**:
Taking a peer's **Deposit**, which is a `GET`, the seal verified to its final chunk, the rows imported, **the acknowledgement deposited on this device's own Lane**, the collect **Lane** advanced, and only then a `DELETE`. It commits on the acknowledgement rather than on the import: a Collection whose acknowledgement does not land advances nothing and deletes nothing, and is retried whole from the `GET` — because the depositor keeps rewriting at that index, so an acknowledgement sent against an older take would credit it with rows that arrived after. A take that has not settled is what stops a **Wake** counting as productive. See ADR-0096 §5 and §11.
_Avoid_: Fetch, download, poll, receive, pickup, read (bare — a Collection deposits and deletes too)

**Lane**:
One direction of one pairing; a pairing has two. Its address and its seal key come off one ratchet under different labels, indexed on collections and never on the clock, so an address is fixed by the absence itself and rotates at the first contact afterwards. A **Wake** touches exactly one key per Lane, which is what keeps the operator from joining one exchange to the next. See ADR-0096 §3 and §4.
_Avoid_: Channel, queue, mailbox, direction (bare), stream

**Lane scope**:
The **Tracked Domains** a pairing carries, and the whole of what narrows it: a pairing carries the rows of the domains held by the **Facet** the pairing act ran in, and the root's scope is the whole **Jar**. Each side states its Facet's domains when the first sync opens and the scope is the **intersection**, so root to root is the whole Jar, Rations to Rations is food, and Rations to root is food, with nobody choosing. **It binds rows and never the peer**: nothing learns which Facets the other device has installed, and a Rations-only phone paired with a laptop that also has the root is ordinary rather than an edge case. It is not a promise that the root cannot see what lands, because one origin is one Jar (#286). The predicate is **derived** from `src/lib/facets/registry.ts` and never authored, the same derivation a **Facet-scoped wipe** takes its own from. It is kept on the **Paired Device** record, one pairing per device pair, and pairing again re-scopes it: widening leaves the new domains' marks absent, which is a first sync of them, and narrowing leaves the dropped domains' marks standing. The act lives on both Facets' settings surfaces, so a pairing made from Rations is a food lane and one made from the root is jar-wide. See ADR-0103 §1 to §4 and §10.
_Avoid_: Filter, partition, allowlist, sync scope, Facet scope (which is a URL path in the manifest)

**Wake**:
One open of the app, however long it stays open. It is the unit convergence is priced in, and the unit the design's promise is stated in — _your data reaches your other device the first time you open the app on each of them; the batch after that needs a second open on each_. **A wake is not one sync.** A session syncs as often as it has reason to: it **deposits** whenever its delta grows, debounced by seconds and flushed best-effort on hide, and it **collects** on open and then no more than hourly, skipped when nothing has changed locally and nothing is owed. Both bounds are rate limits rather than a schedule, which is why the promise stays stated in opens and no duration appears in it. A Wake is **productive** for a pairing when an acknowledgement arrived or a **Collection settled**, and a Wake that was productive in none of its syncs burns one of that pairing's K = 200; a take that imported rows and settled nothing is **not** productive, because it will repeat identically. The count is in Wakes and never in syncs — a session that polls eight times against an absent peer is one unproductive Wake, or K = 200 quietly becomes K = 25. **A wake is an open of a Facet**, and it **serves** every lane that Facet's scope meets while depositing only the domains that Facet holds: a root wake carries whatever the lane is, and a Rations wake on a jar-wide lane carries food and its deletions and leaves the other five domains to the root's wake. A lane a Facet meets no part of is not touched at all, and burns none of that pairing's K — the counter is per-pairing and blind to which Facet woke, or a pairing served by both would count toward 200 twice. **Two wakes at one origin never overlap**: each of a wake's syncs is an **Errand** and runs inside an origin-scoped lock, so the loser waits and then finds the lane already advanced. See ADR-0096 §3, §7 and §11, §3's 2026-09-06 Amendment, the 2026-09-13 Amendment, and ADR-0103 §9.
_Avoid_: Session (which is the Relay's room), sync, tick, poll, app launch (an already-open app that is reopened is a new wake)

**Errand**:
One of a **Wake**'s syncs, run whole and alone: either a full round — collect, acknowledge, deposit — across every **Paired Device**, or the deposit-only round the delta growing triggers. It is the unit of serialisation and that is why it has a name: an errand reads a **Lane**'s standing before it writes one, so two that interleaved would settle their disagreement before either wrote, and a lock around a write alone would close nothing. **Two errands never overlap at one origin** — a browser tab beside the installed app is two opens over one jar and one **Ledger** — and the loser waits rather than skipping, because a wake that declined to run is an open that did not collect. Where the runtime will not give up a lock the errand runs anyway, in all three shapes of that: no Web Locks at all, an accessor that throws, and a request refused before it was ever granted. `src/lib/p2p/wake-lock.ts`, and see ADR-0096's 2026-09-13 Amendment.
_Avoid_: Job, task, run, cycle, transaction (nothing here rolls back), sync (which is what an errand does, not what it is)

**Pairing**:
The act that makes two of your own devices **Paired Devices**: a **Pairing code** shown on one and read on the other, then a whole foreground first sync, shown on both sides. It starts from the **Paired devices** section — the root's Settings, or **Rations settings** — which expands in place rather than opening a second surface. **It is not complete until the first sync completes**, and it leaves nothing behind if abandoned — no row exists on either side until then. It is **idempotent and replacing**, keyed by `device_id`, and it promises nothing about _which_ device it will pair, because that is not learned until the act is spent. See ADR-0096 §8.
_Avoid_: Linking, connecting, adding a device, sync setup, **Devices screen**, Scan (the reader control is **"Read a code"**, because Scan is already Rations' way in and this reader refuses what that one accepts)

**Pairing code**:
The single-use secret addressing one **Pairing** act: a room id and a fresh 256-bit key, the **Send code**'s shape put to a different job, minted wherever the act runs, which is either Facet's settings surface. Two carriers, a QR and the bare code pasted, and **never a link** — there is no distance to cross between two devices you are holding, and a URL-shaped QR is a link in the operating system's hands whatever this app calls it, so the code **must not parse as a URL**. Dead when the pairing completes, on cancel, or after five minutes. It **carries no pairing secret**: that is minted inside the sealed room, so a photograph of a spent code is worth nothing. See ADR-0096 §8.
_Avoid_: **Send code** (that is Rations' and addresses a meal), pairing secret (which no longer crosses in the code), pairing link, invite, QR (that is one of its two carriers)

### Notes and checklists

**Checklist**:
An ordered, free-form scratchpad list of manually-ticked Checklist Items. It carries no Schedule Rule, no tracking, and no streak, and it never appears on the Agenda. Deliberately separate from the Agenda's scheduled obligations (Habit Blueprints, Compliance Events).
_Avoid_: To-do list, task list, agenda

**Checklist Item**:
A single user-authored entry in a Checklist, carrying a label and a checked/unchecked state. It is never a Habit Blueprint, Compliance Event, or Agenda entry, and ticking it produces no Execution Event or Occurrence Event — the tick is plain state, not a logged behavior.
_Avoid_: To-Do, Task, habit, completion

**Note**:
A free-form, user-authored entry with a title and a text body, where the body merges concurrent edits from multiple devices without conflict. Distinct from the `item/note` annotation attribute on a physical item Digital Twin, which is a single field rather than a standalone entity.
_Avoid_: item/note (the Twin annotation field), memo, comment

### Local logs

**Log facility**:
The one module (`src/lib/logs/log-facility.ts`) that owns local diagnostic and
instrumentation records: their caps, their retention, their redaction and
the hand-export they leave by. Records are `localStorage` JSON under one namespaced key
per Log channel, never datoms, because redaction has to delete and the ledger is
append-only and syncs. Where those keys are and what they hold is the Log keyspace's,
one module below it. It records **completely** and gates only on a Log level, and the
whole of its protection sits at the export: it has no transport of any kind, so nothing
it holds can leave the device except through a file the user exports after reading it,
and the payload that leaves is the payload that was reviewed. See ADR-0092.
_Avoid_: Telemetry, analytics, tracking, the logger (`console.*` is not this)

**Log channel**:
A named stream inside the Log facility, declaring its `name`, the Tracked Domain whose
act writes it — or `null` for a **jar-wide** channel, where the app itself is the author
and no domain owns it, which every Facet then shows and exports and no Facet-scoped wipe
takes (ADR-0092 §13) — its
`purpose`, its `cap`, its optional counters and its `parse`. The owning domain is what a
Facet's Local Logs card is derived from — a Facet carries the channels it authors and
only those (ADR-0080 §1's clause (b)), and the owner is a domain rather than a Facet
because the root holds every domain (ADR-0086 §1). A channel is a **namespace and a
consent unit**, never a gate: it owns the storage key, the recording switch and the
export selection, while what is captured is decided by the Log level and the dial. Three
exist: `search`, `scan` and `app`. It carries no severity, no sensitivity and no kind,
and it is not removed when a question it was cut for is answered. See ADR-0092 §1 and §2.
_Avoid_: Kind, sensitivity, category, severity, stream

**Log level**:
The severity carried by every record in the Log facility, on OpenTelemetry's
`SeverityNumber` scale, at four anchors: **ERROR 17** (the app failed at something the
user asked for), **WARN 13** (a dependency failed or the app degraded and the user may
not have noticed), **INFO 9** (something the user did, which completed) and **DEBUG 5**
(the app's internal trace, and any field whose only reader is a person reproducing a
bug). It is the severity of what happened, never the importance of the record. It decides
exactly one thing — **what is captured** at a given dial position — and deliberately
nothing about **retention** (the ring keeps its last `cap` records by age, because a log
is read as a sequence and shedding by level deletes the context around the record it
saves) and nothing about **disclosure** (the export carries the dial as a label and
applies no filter). What it buys after capture is that a reader can tell an error from a
boot line. It rides on the record's envelope beside the version rather than inside the
entry, so a reader can sort by it without parsing, including records whose channel cannot.
See ADR-0092 §3, §5, §6 and §10.1.
_Avoid_: Priority, importance, verbosity (that is the dial), trace level, log kind

**The dial**:
The single facility-wide threshold on the Log level that decides what is captured, at
three positions: **Errors & warnings** (≥ 13), **Normal** (≥ 9, the default) and
**Noisy** (≥ 5). It is a threshold on a continuous scale rather than three categories, so
a position includes everything more severe automatically. It is a **budget** device and
never a privacy one, it lives in `localStorage` beside the pause and never in a
`settings/` datom, and it is not an off switch — that is the per-channel recording pause.
One dial for the whole facility is a deliberate departure from every framework surveyed,
which resolve a dial per logger; those arbitrate no shared ceiling and this one governs
256 KiB split three ways. Turn it down and you keep the rate, you lose the detail. See
ADR-0092 §4.
_Avoid_: Log level (that is the field), verbosity setting, debug mode, switch

**Log counter**:
A named whole number a Log channel keeps beside its entries, under its own storage key:
it only ever increases, is never shed, and is not subject to the `cap`. Counters exist
because the entry ring is a recency window that silently forgets its own denominator, so
a rate computed from retained entries is the rate of the last 200 of them wearing a
lifetime label — and a rate is therefore read from a counter and never from the ring. A counter is always a
running total of a field the entries already record, never a new fact. **The dial does
not gate a counter and the pause does**, so a counter and its entries can disagree for
two reasons: a redaction that did not decrement, and a record the dial suppressed after
it was tallied. Cleared only when the channel is, and taken by a Facet-scoped wipe. See
ADR-0092 §9.
_Avoid_: Metric, gauge, statistic, tally

**Log keyspace**:
The `localStorage` keys the Log facility writes under, and the one module
(`src/lib/logs/log-keyspace.ts`) that builds one or reads or writes under one. Four
shapes: a Log channel's records (`inventoria_log_<name>`) and its Log counters
(`inventoria_log_<name>_counters`), and the two the facility holds for itself, the
per-channel recording pause and the dial — both a character outside the channel prefix,
so no channel name reaches either. A channel **claims** every key its name derives,
written or not, which is what a declaration is refused against and what a Facet-scoped
wipe takes; the counters suffix sits inside the channel keyspace, so `<x>_counters`
claims `<x>`'s counter key and is refused in either order of arrival. See ADR-0092 §9 and
its Amendment of 2026-09-05.
_Avoid_: Namespace (that is a Log channel), key prefix, storage schema

**Search session**:
One visit to the food search: it opens when the search field first goes non-empty and
ends when the user abandons it, clears it, or stages a food. It leaves **one** entry in
the search Log channel — **every session, not only the ones that reached an empty
result** — holding the final query, the outcome, and at the `Noisy` dial position the
sequence of debounced fires on the way there. A fire records a prefix length and a result
count rather than the query text again. The unit is the session and never the search,
because the field runs on a 120 ms debounce and one typed phrase fires about eleven of
them. Recording the successes too is what first gives ADR-0053 §7's bar a denominator.
See ADR-0053 §2 and its Amendment of 2026-09-03.
_Avoid_: Search event, query log, keystroke, empty search (for the session itself)

**Scan session**:
One visit to the barcode path: it opens when a lookup starts and settles when the user
stages a food, opens a capture door, or leaves the scan without doing either. It leaves
**one** entry in the scan Log channel, holding what Open Food Facts answered (`found`,
`absent`, `unreachable` or `refused`), how many times the retry asked (`single`,
`retried` or `gate_skipped`), which of the four capture doors the user then opened, and
whether it reached one of those endings at all — a session that was simply left says so,
and is kept out of the two counters #208 reads. A barcode the app already holds is **not**
a scan session: it short-circuits before Open Food Facts is asked, so there is no outcome
and no attempt to record. The unit is the
session and never the lookup, because the fact it exists to record is a _sequence_ — an
outcome, and then what the user did about it — and a sequence split across two entries
would have to be rejoined by the barcode, which the channel is forbidden to carry. See
ADR-0071 §2, and its Amendment of 2026-09-03 for why that prohibition is a purpose
argument rather than a sensitivity marking.
_Avoid_: Scan event, lookup log, barcode log, scan (for the session itself)

### Facets

**Tracked Domain**:
A kind of thing the app records, carrying its own entity prefixes, its own attributes and its own fold. There are seven, and they come in two kinds. **Six are content domains**: a content domain records a kind of thing the user tracks, carries exactly one screen and sits in at least one Facet, and the three go together — one domain is one screen, never a fraction of one or two of them (ADR-0078 §2), which is what lets a Facet's screens be worked out from the domains it holds rather than listed again beside them (ADR-0083 §4): food, media, physical items, habits, calendar events, and notes and checklists. The seventh is the **Jar domain**, which is not a content domain: it has no screen and joins no Facet. `ContentDomainId` in `src/lib/facets/registry.ts` is the six as a type, for anything whose meaning is which Facets it belongs to. Notes is the content domain that keeps no Projection — it is a Loro CRDT op-log under the single entity `notes:doc`, read by a direct SELECT (ADR-0018) — and that is an exception to be aware of rather than a route to copy. [docs/how-to-add-a-tracked-domain.md](docs/how-to-add-a-tracked-domain.md) is the route for adding one; this entry is the roster, and the route points here rather than restating it.
_Avoid_: Domain (bare — "domain timestamp" and "domain logic" already use the word for other things), area, feature, vertical, tab

**Jar domain**:
The seventh **Tracked Domain**: the jar's own record of what has been done to it, owning the entity prefix `deletion:` and nothing else. It is not the **Jar**, which is where things are kept, and it is not a seventh kind of content. It exists because a **Carried deletion** has to be a datom and that datom needs an owner, and the owner cannot be any Facet's domain: a **Facet-scoped wipe** must never delete the record of a Facet-scoped wipe. So it has **no screen and belongs to no Facet**, which is what keeps `deletion:` out of every Facet's derived prefix set as arithmetic rather than as a rule anyone has to remember. ADR-0086 §1's sentence survives word for word and its subject widens: a Tracked Domain need not have a screen and need not join a Facet (ADR-0096 §13). `scripts/entity-ownership-check.mjs` carries the biconditional that holds the two cases apart — a domain with views is declared by at least one Facet, and a domain with no views is declared by none. Named for the class, which admits one member; a second costs an amendment.
_Avoid_: Jar (bare — that is the storage), System domain, Meta domain, Admin domain, Ledger domain (the Ledger is one thing in the Jar, and this records acts against the whole of it)

**Facet**:
A named, icon-bearing face onto the Jar that can be installed on its own, carrying its own manifest, name, icon, scope and start URL. Installability is what makes it one: a face nobody can install is a tab, and calling it a Facet buys nothing. A Facet is composed of a whole number of Tracked Domains, never a fraction of one, and it owns those domains' **entities** and never their attribute namespaces — `provenance/` and `event/` are written by several domains at once, so anything scoped by an attribute reaches rows a Facet does not own. Facets overlap rather than partition: Inventoria holds all six content domains, including the ones another Facet also holds. It does not hold the **Jar domain**, and nor may any Facet: a Facet-scoped wipe must never delete the record of a Facet-scoped wipe (ADR-0096 §13). The app ships two, **Inventoria** and **Rations**, which became installable at #305 when it got a manifest of its own; the roster and how a Facet declares itself are ADR-0076's, and `src/lib/facets/registry.ts` is what the build reads. Settings is a screen of the root Facet, not a screen every Facet carries.
_Avoid_: App (which already means Inventoria-the-PWA), Edition (which implies the same content repackaged, not different content), Surface, Tab (a Facet contains tabs), View (which is a Svelte component), Module, Sub-app

**Facet exit**:
The root's labelled link to another Facet, opening it in a browser tab (`FacetExit`). It is the **single sanctioned exit** and the only shape it could take: `beforeinstallprompt` fires for the current document's manifest, so no control at `/` can install `/food/` — the user has to be standing on a `/food/` document — and navigating in place would land them in a Facet with no door back. The label says where the tap goes, because a disguised exit is the trap the rule exists to stop, and an install decision belongs in a browser, which is the only place Back works. Only the root has one, which is a consequence of prefix matching rather than an exception: every other Facet's scope sits inside the root's. See ADR-0078 §3 and §4.
_Avoid_: Door (spent on ADR-0034's four routes into the label form), Way in (that is a control in a meal's header), install button (it is not one and could not be)

**Facet-scoped wipe**:
The third sanctioned deletion (ADR-0079 §1): every datom whose entity carries one of a Facet's prefixes, and every `localStorage` record it owns, removed in one act. The predicate is **derived** from `src/lib/facets/registry.ts` and never authored, because a second hand-written list drifts the first time a prefix is added and reports success having missed rows. It is sanctioned only where the rows it takes are **closed under reference** — nothing surviving points at anything removed — which is the condition a fourth deletion inherits. There is one, Rations', and it is called **"Delete all my food data"** on screen and never "Wipe Rations": in a standalone install a Facet's own name reads as the whole app. Its confirmation counts against the ledger rather than reciting policy, and an export sits beside it, which is what makes the delete defensible (§5, §6).
_Avoid_: Wipe Rations (the user-facing name is about food, not the Facet), Clear (which is the jar-wide `Wipe Database`), Purge, Reset, Tombstone (rejected in ADR-0079 — a wipe that grows the file is a lie)

**Jar-wide wipe**:
The whole jar emptied in one act, behind the root's **"Wipe Database"** — the first of ADR-0079 §1's sanctioned deletions, and the only total one. **It unpairs**, because otherwise it is a no-op with extra steps: it empties `datoms` and every **Version vector** goes empty, so the next **Wake** is the empty-vector case and the whole **Ledger** comes back (ADR-0096 §12). Re-pairing afterwards honestly means _pull it all back from the laptop_, which is ADR-0067's two-deliberate-steps argument applied to convergence instead of to import. Its order **inverts** the **Facet-scoped wipe**'s: the pairings are marked first, because a half-done jar-wide wipe lets a peer put the data back where a half-done Facet wipe merely leaves some of it. Outside the ledger it takes two `localStorage` records and no others — the **Paired Device** list and the **Deletion notice** — on the rule that it takes what would otherwise make the wipe a lie. It carries no **Carried deletion**: it takes the `deletion:` rows too, and it has just unpaired every peer that could have been told. `src/lib/jar-wipe.ts`.
_Avoid_: Clear (that is the worker message and the `db.client` method, not the act), Reset, Factory reset, Delete everything, Nuke

**Carried deletion**:
A **Facet-scoped wipe** written down as a datom, so a peer that was asleep applies it instead of handing the rows back. It is one entity per act under `deletion:`, owned by the **Jar domain**, carrying `deletion/prefixes` and nothing else: the prefix list the wiping device derived from its own registry at the instant of the act, then frozen. Frozen rather than re-derived, because two devices are not on the same build and a re-derivation against the peer's registry would delete less on an older peer and more on a newer one while both reported success. The peer's delete is a **fourth sanctioned deletion** that meets ADR-0079 §1's closure condition by inheriting the local wipe's proof, since it removes the same set by the same predicate — literally the same function under the same predicate, so it is the same act rather than a re-enactment of it. It takes rows stamped at or before the act and nothing after. It is a **standing predicate** rather than an event: new to a device it takes what it covers there, once; ever after it **refuses** what arrives, so a peer that slept through the wipe cannot re-supply the rows one hop out. Nothing re-evaluates a held one against rows already there, which is what keeps a user-chosen **Ledger import** exempt rather than merely deferred. Afterwards the peer shows a **Deletion notice**. See ADR-0096 §12 and §13.
_Avoid_: Tombstone (spent on the retraction row ADR-0079 refused, and this is not one), remote wipe, delete marker, sync delete, wipe record

**Deletion notice**:
The one-shot sentence a device shows after applying a **Carried deletion**: what went from **this** device, counted, and said once. It is a completed act and never a prompt, and it carries **no undo**, which would be the recoverability claim ADR-0096 §17 refuses. It names the Tracked Domains this build recognised among the carried prefixes rather than a label the wiping device froze, because a peer that does not recognise a prefix deleted nothing under it. It is kept in `localStorage` until it is read and could not be a datom: it is a fact about this device's own copy, and a datom would travel. Two acts arriving before one reading merge into one notice rather than queueing. The root Facet draws it and Rations does not, which is now a fact about the surface rather than about the **Wake**: both Facets wake and either can apply a Carried deletion, so Rations listens and records, and a notice its open leaves waits to be read on the next open of the root.
_Avoid_: Toast, banner, alert (`Alert` is the primitive it is drawn with, not what it is), sync warning, undo prompt

**Un-precached artifact**:
A file the build ships that a given Facet chose not to keep on the device, so reaching it needs a network. There are two, both the root's and both Rations': the **Nutrient store** a staged food's panel is read out of, and the barcode reader's WASM (ADR-0077 §5). Asking for one and getting nothing is an offline user rather than a broken build, and the app says so in one sentence built by `needsNetworkLine` — never a fetch error, and never silence, which is what both paths did before #307. A response that arrives and is not `ok` is the other thing and keeps the error naming the file: something served it, so the network worked. Rations precaches all three artifacts and reaches none of this (ADR-0047 §11, ADR-0077 §4).
_Avoid_: Missing asset (nothing is missing — the file is deployed), cache miss (which names the mechanism, not what the user is), offline error

**Hand-off**:
An arrival or a departure that crosses the app's boundary carrying a thing — a shared URL, a receive link, a scanned code — as distinct from a navigation, which carries nothing and is what ADR-0078 §1 makes unexpressible inside a Facet. A hand-off belongs to the Facet that owns the entities it carries or would mint, and one spanning more than one Facet has no owner and is offered by neither (ADR-0084 §1, §2). There are two: `?url=` at the root, and the p2p receive link at Rations.
_Avoid_: Route, deep link, intent, entry point (which names the URL, not what arrives at it)

### Interface primitives

These ADRs establish this vocabulary and forbid alternatives to it. The `_Avoid_` lines
here matter more than most: the recurring failure is inventing a fourth thing that
already exists as one of these.

What **earns** a new member is ADR-0100: reach (a change of one mind landing in two or
more copies, after subtracting every site an existing member already serves) or a gap
the platform and the roster both lack, and then the deletion test — it must remove more
surface than it adds, and never widen an existing member's variant axis to absorb a
stranger. A member is named for its purpose or for the platform control it wraps, never
for its appearance, and it lands with every copy converted in one change.

This section is the prose half of the roster; `tests/unit/support/ui-roster.ts` is the
machine-readable half a gate reads, and the two are edited together. A member's
**internal class names are its own** — a caller reaches a primitive's look by handing it
a `class`, never by writing one of its names — and
`tests/unit/primitive-internals.test.ts` holds that at zero (#413).

**BottomSheet**:
The one sheet primitive (`ui/BottomSheet.svelte`). Every sheet in the app is this
component, including the docked-footer and over-dialog variants. On a phone it is
also the _only_ overlay shape: a centred card is this primitive above 768px — its
`centred` prop, which does nothing at all below that width — and never a hand-rolled
`translate(-50%, -50%)`. Six surfaces re-derived that box until #329 folded them on.
A sheet opened over a sheet _replaces_ it there rather than stacking on it, and is a
Back stop while it is open.
See ADR-0027, ADR-0028 and ADR-0089 §6, §7.
_Avoid_: Drawer, panel, tray, modal (when a sheet is meant), a second sheet component

**Modal**:
The dialog shell every overlay is built on (`ui/Modal.svelte`): the portal, the focus
trap, the backdrop and its layer, and nothing about where a card sits. It is not a
peer of BottomSheet and not a second overlay shape — it is what BottomSheet is made
of. Three files import it: BottomSheet, `views/food/LabelPhotoReader.svelte` — the
one screen it carries, full-bleed rather than a card — and `ui/BottomSheetDemo.svelte`,
where it stands in for a bits-ui dialog the harness raises a sheet over. Reach for
BottomSheet; reach for this only when a surface needs a dialog's machinery around
something that is not a sheet.
See ADR-0027 and ADR-0089 §6.
_Avoid_: Dialog, popup, overlay, centred card (which is BottomSheet's `centred`)

**Back stop**:
Something the platform's Back gesture dismisses instead of leaving the app — an open
sheet, or a mode that has taken the ordinary way off a screen away, which today is a
live Selection covering the tab bar. They form one stack (`ui/back-stack.ts`), one
history entry each, dismissed topmost-first, because Back is a single resource and
two owners of the top entry cannot both be right. A dialog that is not a sheet is
not one of these yet, and Back still leaves the app with `LabelPhotoReader` open.
See ADR-0089 §7 and ADR-0088 §3.
_Avoid_: History entry, route, back handler, dismissable, back button (which is the
sheet header's `onBack`, a different control)

**Visible band**:
The part of the page a person can actually see right now, published by
`ui/viewport-inset.ts` as `--vv-h`, `--vv-top` and `--vv-bottom`. Not a component: a
measurement, and the only honest one when a software keyboard is up — every viewport
unit (`vh`, `svh`, `dvh`, `lvh`) was measured inert in that state. A surface pinned
over the page sizes itself against the band; the shell does not. See ADR-0089.
_Avoid_: Viewport (when the band is meant), visual viewport (as a layout measure),
keyboard height, safe height

**Dock**:
The pinned region at the foot of a sheet, below its scrolling body — a field, a
primary action, or both (`BottomSheet`'s `footer`, `FoodStager`'s `.dock`). It never
scrolls, and with a keyboard raised the header and the dock's field are the two
things guaranteed on screen. A control that cannot act does not hold space in it.
See ADR-0027 §Decision and ADR-0089 §8.
_Avoid_: Footer, action bar, toolbar, sticky bar, **Way-in bar** (that is a permanent bar on the day, not the foot of a sheet)

**Shell**:
The box a Facet's screens are drawn into — one centred, capped column that is the
only thing on the page which scrolls. There are two of them, `App.svelte` and
`Rations.svelte`, and **one rule**: `.main` in `src/app.css`, shared, because a
rule copied into both shells is the same defect twice and was. Its width is
`--measure-solo` (54rem) below the **shell breakpoint** and `--measure` (72rem)
above it, where Rations spends the extra on a `--rail` (22rem) beside the
timeline. The shell breakpoint is `breakpoints.ts`'s `shell`, 1180px, and it is
the second of the app's two shape breakpoints: 768 carries the overlay's shape and
the root's Sidebar flip, 1180 carries this. See ADR-0091 §2 and §8.
_Avoid_: Layout, container, wrapper, page (which is the surface inside the shell),
frame (spent on the brutalist edge/elevation tokens)

**Rail**:
The second region Rations' shell opens above the shell breakpoint, to the right of
the meal timeline, holding the day's numbers — a month calendar over the Nutrition
accordion. It is reference material beside the subject, which is why it takes the
right and the timeline keeps the reading edge. It is deliberately **not pinned**:
pinning wants the rail held as one unit and its blocks are siblings of the
timeline rather than children of a rail, so a pinned rail is a rail with a real
element and that is the trigger to reopen it. See ADR-0091 §2 and §4.
_Avoid_: Sidebar (the root's navigation is a Sidebar and this navigates nothing),
aside, panel, right column

**Month calendar**:
The rail's top block (`views/food/MonthCalendar.svelte`), and the week strip
(`views/food/WeekStrip.svelte`) one scale up rather than a second date control —
exactly one of the two is on screen at any width, and the day screen owns the
swap so neither component asks how wide the window is. It **marks the days that have food on them**, which is
the whole of why it earns the room: a month grid without the marks is only a date
picker, and the strip is already a good one in less space. A day with food carries
a bar, not a dot, since `--radius` is 0; today and the selected day are two
different marks, because both can be true at once. The marks read a pure fold of
day keys (`food/logged-days.ts`) that converts through local calendar fields and
never an ISO string. See ADR-0091 §1 and §2.
_Avoid_: Date picker, datepicker, mini calendar, month view, Agenda (which is the
Calendar domain's screen)

**Page**:
A whole-screen surface Rations shows instead of the day, above the shell
breakpoint only: Settings, Recipes, Reports. The header's icons are its navigation
and the title is the way back. A page **reuses the sheet it replaces** through
`BottomSheet`'s `inline` rather than restating it, so a control cannot drift
between the two. Below the breakpoint there are no pages and the same icons open
sheets. See ADR-0091 §5.
_Avoid_: Route (nothing navigates and there is no router), tab, view, screen

**Report**:
A reading of the ledger over a period, computed when its page renders and stored
nowhere. **A report is never a datom** — it is a question asked of the facts, so it
cannot fall out of step with them and needs no attribute of its own. A day with
nothing logged is absent from one rather than plotted as a zero. There are three
(`food/reports.ts`): the energy on each day, where that energy came from by the
Atwater factors, and the foods logged most often, counted by name so one food
reached three ways is one answer. The **period** is weekly, monthly, yearly or a
custom range, and the three fixed ones are rolling rather than calendar-aligned.
Reports is a page or nothing, so a phone never sees one. See ADR-0091 §6 and §7.
_Avoid_: Summary, stat, analytics, insight, dashboard (that word is the day's)

**Best match**:
The mark on the top-ranked row of a _ranked_ list: the row inverts, and the two
below it carry a stepping left edge. It says which one won and never carries a
number. It may not appear over a list that has not ranked anything — Recent is a
chronology, and crowning its newest entry is a claim it does not make. See ADR-0090.
_Avoid_: Top hit, first result, selected, highlighted (that is the other mark)

**Highlight**:
The moving mark that says where the arrow keys are, drawn as a ring. A separate
channel from **Best match** because it answers a different question: what won does
not move, where you are does. Decoupled from bits-ui's automatic first-candidate
highlight, which used to supply both and meant neither. See ADR-0090 §3.
_Avoid_: Selected, active, focused row, best match

**SecretField**:
The one masked field with a way to reveal it (`ui/SecretField.svelte`): `ui/Input` in a
box, with an eye button pinned over the field's right edge that flips `type` between
`password` and `text`. It owns the mask state, the toggle, and the toggle's accessible
name — built here from one `reveals` word, so "Show …" and "Hide …" cannot be worded
two ways or half-shipped. The toggle sits **over** the field rather than beside it, and
that is measured: a flex sibling let the field's intrinsic monospace width overflow its
sheet. The `padding-right` it costs and the button's width are one token, so the gap
cannot drift from the thing it leaves room for, and `z-index: 2` keeps the button above
`ui/Input`'s own `z-index: 1` — without it the button takes no clicks. No bits-ui: the
platform has `type="password"` (ADR-0068 §1). The two copies it replaced had each been
fixed twice for one cause — `z-index: 2` at #375, `2.75rem → var(--tap-min)` at #361 —
which is the bill ADR-0100 §1's trigger was paid in.
See ADR-0100, ADR-0093 and ADR-0095 §3.
_Avoid_: Password field, PasswordInput, a second reveal toggle, `.reveal-toggle` as a
caller's class

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

**Disclosure**:
The one control that opens one region (`ui/Disclosure.svelte`): the `<button>`, its
`aria-expanded`, the `aria-controls` naming the region, the tap floor, the focus ring
and the mark beside the label. **Not a bits-ui `Accordion`** — every one of that
component's contributions is between-item behaviour, it omits the header/region links
anyway, and its content mounts and unmounts rather than carrying the `hidden` attribute
`aria-expanded` describes (ADR-0068 §1, as amended). `RecipeBuilder`'s accordion is the
counter-example and stays on bits: many items, roving focus, a multiple-open policy.
It owns the **trigger and not the region**, because at four of its five sites the two
boxes have different parents; `controls` is a required prop instead, so a trigger with
no region is unexpressible, and `tests/unit/disclosure.test.ts` resolves every id.
Three visual shapes cost **zero variants**: the mark is a snippet (a hole, free however
many callers fill it), defaulting to the drawn caret and switched off with `mark={null}`
where the label _is_ the mark. The caret is drawn because `▸`/`▾` fall outside every
unicode-range Epilogue is served in. The cap-height repair lives here; the title's
size, weight, tracking and case do **not** — those are the caller's, or a section
header's look would bind every future disclosure.
See ADR-0100 and ADR-0068 §1.
_Avoid_: Accordion (for one item), Collapsible, Expander, InfoToggle, a second
disclosure, and the five it replaced — `.aggregates-toggle`, `.header-icon-btn`'s ⓘ,
two `.info-btn` copies and `EndingLine`'s `.plain`

**FieldCaption**:
The line that names the control under it (`ui/FieldCaption.svelte`): a real `<label>`
and the `for` that binds it, which is what no class can carry and why this is a
component rather than a rule (ADR-0100 §4). Its look — `--step-n1`, weight 800,
uppercase, ink — is `.field-caption` in `src/app.css`, declared there because a caption
over a **group** cannot be a `<label for>` at all: a radio row, a toggle row and a
segmented date range have no one labelable control, so `ui/Segmented`, `ui/ToggleGroup`
and bits-ui's `DateRangePicker.Label` name theirs with a `<span id>` and
`aria-labelledby` and reach the same class. `for` is required and takes no fallback.
The **gap under it is the caller's**, not the primitive's, because eight of the sites
sit in a flex column that already gaps them. There are **no variants**: `MediaEngagementModal`'s
mono ink chip was the one caller that wanted one and converged instead, since a branch
serving one caller is the sentence ADR-0040 refused `Chip` with. Seventeen rules in
eight settings went at #383, two of them outside the type scale and two not uppercase.
`tests/unit/field-caption.test.ts` holds both halves at zero: every `<label for>` in
`src/` is this component's, and no rule outside `app.css` redeclares the look.
See ADR-0100 and ADR-0095 §3.
_Avoid_: Label, FormLabel, field label, a second caption skin, and the eight it
replaced — `.form-group label` (×4), `.field-label` (two files, two elements),
`.nudge-label`, `.fl`, `.kcal-label` / `.mini-flabel`, `.cf-lbl`, `.cf-reason-code`'s
type, `.cf-pack > span` and `ReadPairingCode`'s `.label`. A `<label>` that **wraps**
its control is a different device and stays one: there the label is the tap target
(`ui/Checkbox`, `AmountField`, `NutrientCard`).

**Input**:
The one single-line field (`ui/Input.svelte`): a native `<input>` in a wrapper, wearing
the house field skin, with `--tap-min` declared rather than arrived at by arithmetic.
Its `class` is the **wrapper's, not the field's** — a caller says where the field sits
(`flex: 1`, a width) and never what it looks like, and reaches the field itself only to
pad it for an adornment it draws over the top, through `:global(input)`. `...rest`
carries the platform and a11y attributes (`autocomplete`, `min`, `onblur`, `aria-*`)
and is not a styling channel. Unlike Textarea and Select there is **no census**: a
checkbox, a file picker and a range slider are correctly not this component, which is
the line ADR-0095 §3 draws and the counts behind it. See ADR-0038 and ADR-0093.
_Avoid_: Text field, TextInput, a second field skin, and the family #375 deleted —
`.retro-input` (four files, byte-identical, no ADR behind it, and worn inside Rations)
and `.full-width` / `.has-reveal` as skin classes. `.input-number-brutal` went at #379,
where it shared one rule with a `.select-brutal` — this skin transcribed, minus the floor
it gained at #336 — so porting only the selects would have kept half the copy.
Note the one asymmetry with Textarea:
this primitive has a wrapper and Textarea does not, so a caller's class lands on the box
here and on the field there.

**Textarea**:
The one multi-line field (`ui/Textarea.svelte`): a native `<textarea>` wearing the same
house field skin `ui/Input` draws, because the two stand beside each other in one form
and a description with a different edge from the name above it is two looks in one box.
Every multi-line field in the app is this component — the population goes to zero, which
is what a `<button>`'s never does, so a census in `tests/unit/ui-primitives.test.ts`
asserts the tree holds exactly one `<textarea>` and it is this file. The platform already
resizes, participates in a form and carries `maxlength`, so bits-ui has nothing to add.
Its **height axis is `rows`** and nothing else, defaulting to 3; a field that fills a
region says so in its `class`, as `NoteEditor` does. It resizes vertically only.
See ADR-0036, ADR-0068 §1, ADR-0093 and ADR-0095 §3, which is the rule the census
is an instance of.
_Avoid_: Multi-line input, note field, comment box, a second textarea skin, and the nine
it replaced — `.textarea-brutal`, `.retro-textarea`, `.desc-textarea`, `.cf-ingredients`,
`.mini-ingredients`, `.tarea`, `.note-body` as a skin (it is a fill rule now), and the
bare `textarea` element selectors in `ItemManualForm` and `ItemEditModal`

**Select**:
The one select (`ui/Select.svelte`): a native `<select>` wearing the same house field
skin `ui/Input` and `ui/Textarea` draw, because all three stand beside each other in one
form. Not a bits-ui listbox — here the platform supplies _more_, not less: a native
select opens the OS picker, whose rows are full-width and far above `--tap-min`, correct
with every assistive technology and zero code, so adopting a portalled listbox would
replace a control that already satisfies ADR-0093 with one this project would then have
to floor itself. Its **interior is data** — `options: { value, label }[]`, no `children`
— because a snippet hands the interior back to the call site, which is where the copies
came from. Its **value is generic**, so a rating binds `number | undefined` without a
`Number()` at the write site. It takes an `id` and no `label`, as `ui/Input` does, and
its `class` is the **wrapper's**, not the field's. `appearance: none` removes the UA's
arrow only — the OS picker still opens — and the mark drawn in its place is knowingly
the third copy of the shared triangle, which #317 owns. Its population went 7 to 0
across #378, #379 and #380, and a census in `tests/unit/ui-primitives.test.ts` holds it
there — the same guard `ui/Textarea` carries, and for the reason ADR-0095 §3 gives.
See ADR-0036, ADR-0068 §1, ADR-0093 and ADR-0095, whose worked example is this
component's bits-ui refusal.
_Avoid_: Dropdown, picker, combobox (that is a search field with a list), a second select
skin, and the three it replaced — `.custom-select` (gone at #378), `.select-brutal`
(gone at #379, four selects on one rule) and `.retro-select` (gone at #380, two selects
including the `number | undefined` rating the generic was written for)

**Badge**:
A display-only status or category label (`ui/Badge.svelte`). Its colour comes from
the shared `categoryBadgeVariant(category)` helper, never from a re-declared inline
map. See ADR-0040.
_Avoid_: Chip, pill, tag, label

**Button**:
The canonical interactive frame primitive (`ui/Button.svelte`). A control that toggles
a selection is a Button whose variant reflects the selected state, not a new
primitive. It carries the tap floor on **both** axes, which matters for a button whose
whole content is a mark: `variant="ghost"` plus a mark element is what a bare icon
control is, and there is deliberately no `IconButton` — "icon" names the mark, and a
control you press is a Button (ADR-0100 §6). Where a mark can be **content**, it is; the
`::before` recipe in ADR-0098 §3 is for a mark with no element to hang on, and its last
four wearers left at #316 and #390.
See ADR-0039, ADR-0040, ADR-0098 §2 and ADR-0100.
_Avoid_: Selected chip, toggle button (as a distinct component), IconButton, and the
four bespoke mark buttons it replaced — two `.info-btn`, `.card-reset`, `.nudge-reset`

**Card**:
The canonical container frame primitive (`ui/Card.svelte`), carrying the ADR-0038
edge and elevation tokens. See ADR-0039.
_Avoid_: Panel, box, tile, surface

**Row**:
The one horizontal list line (`ui/Row.svelte`): an optional lead mark, a title over
a muted subtitle, a trailing mark, and an optional corner. It is Card's flat sibling
— thin edge, no radius, no shadow, no press-flush — and it picks its own element:
a native `<button>` when it is clickable and holds no corner, a `div role="button"`
otherwise, because HTML forbids the remove ✕ inside a button. A chooser tile is a
Row, not a Card; the food line (`views/food/FoodItemRow.svelte`) is a Row wearing
food formatting. It is a screen line and never a stored fact — that is a **Datom**.
It carries the ADR-0038 frame tokens and ADR-0039's `class`-only styling channel;
the two element modes are #319's own rule and have no ADR of their own.
_Avoid_: List item, tile, ListRow, a second row component

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
