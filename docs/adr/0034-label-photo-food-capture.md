# ADR 0034: Capture a full-fidelity food twin from its label photo (barcode-optional, OFF-gap-filling)

**Status:** Accepted; not yet implemented (specced 2026-08-01, this ADR)
**Date:** 2026-08-01

## Context

Inventoria's food section reads product data from Open Food Facts by barcode:
`FoodStager.svelte`'s Scan tab drives the native `BarcodeDetector`, and
`lookupBarcode` (`src/lib/food/open-food-facts.ts`) resolves a barcode to a full
`EntityPayload` — name, a complete `nutrition/info` panel (macros, the
sat/fibre/sugar/salt fats, the twelve micronutrients of ADR-0030), portions, and
`twin/raw_provenance`. When that lookup fails the only fallback is the **Custom
tab**, whose `saveCustomFood` (`src/lib/stores/calorie.store.ts`) captures \*\*name

- four macros + one optional photo\*\* — no full panel, no micros, no portions. A
  food entered that way is a second-class twin, visibly poorer than an OFF-sourced
  one.

A grounding investigation (three real products photographed, 2026-07-31, recorded
on the [wayfinder map (#47)](https://github.com/inkpot-monkey/inventoria/issues/47))
showed the gap is **threefold**, not just "product not in OFF":

- a peanut butter **in OFF but with a blank name** (completeness 0.78);
- an olive oil **in OFF with a generic name** ("Aceite", completeness 0.38), its
  label spanning two sides of one bottle;
- an Indian paste **not in OFF at all**, whose barcode also **failed automated
  decode** until preprocessing.

⇒ OFF data can be **missing**, **found-but-poor**, or **unreadable**. This ADR
decides the flow that fills all three: from one or more photos of a product's
label the user creates a **full-fidelity local food twin** — name + a complete
`nutrition/info` panel + portions — **indistinguishable from an OFF-sourced
twin**; the app **proactively detects** the gap and guides the user into the
flow; and the captured data can **optionally be contributed back to Open Food
Facts**.

Each design decision below was grilled and closed as a child ticket of the
wayfinder map; this ADR is the terminal synthesis and, with its
`ready-for-agent` tickets, the hand-off to implementation — a separate effort, as
ADR-0030's and ADR-0031's were. The closed tickets it folds:

- [#48 — define "poor or missing data" and when to trigger](https://github.com/inkpot-monkey/inventoria/issues/48) (the trigger);
- [#49 — multimodal-LLM cost & accuracy research](https://github.com/inkpot-monkey/inventoria/issues/49) → `docs/research/49-multimodal-llm-nutrition-extraction.md`;
- [#50 — OFF write-API + auth research](https://github.com/inkpot-monkey/inventoria/issues/50) → `docs/research/50-open-food-facts-write-api.md`;
- [#51 — the extraction mechanism](https://github.com/inkpot-monkey/inventoria/issues/51) (the guided-manual / AI-autofill deferral);
- [#52 — the full-panel confirm/entry form](https://github.com/inkpot-monkey/inventoria/issues/52) (Variant B "Read-along");
- [#53 — the end-to-end flow, placement, identity & provenance](https://github.com/inkpot-monkey/inventoria/issues/53) → `docs/design/53-label-capture-flow.md`;
- [#54 — the OFF contribution consent + submission UX](https://github.com/inkpot-monkey/inventoria/issues/54).

**Scope.** Structured label capture into a full local twin, plus an optional
structured contribution back to OFF. Ruled **out** (map Out of scope): uploading
the user's photos _to_ OFF (v1 sends structured data only; the reverse — showing
OFF's _own_ photos in-app — is in); book-cover / non-food barcode scanning; and
improving OFF text-search / USDA hydration.

## Decision

### 1. The trigger: one flow reached four ways, a soft nudge (#48)

There is **one** capture surface (Decision 2), reached through **four doors**, and
the app **nudges rather than blocks** — the user can always dismiss and keep the
poor data.

- **Missing (404):** `lookupBarcode` throws `ProductNotFoundError` → the existing
  "Add it as a custom entry" hand-off.
- **Found-but-poor:** the staged OFF twin trips the poor-quality predicate → a
  soft nudge to improve it.
- **Unreadable:** the scanner can't decode after a persistent attempt → a
  "photograph the label" escape, elevated after ~10 s.
- **Always-on manual:** the Custom tab as reached today (a homemade food, no
  label) — no nudge.

**The poor-quality predicate.** A twin is _poor_ when its **name is blank or
`"Unknown"`**, **or** any **core macro is missing** (calories / protein / fat /
carbohydrate). A short _generic_ name triggers only with a corroborator (a
missing macro **or** OFF `completeness` below ~0.5). **Sub-macros and micros never
trigger** — a label that omits vitamin B12 is not "poor". Consuming
`completeness` requires `lookupBarcode` to **surface it** on the payload (today it
is dropped in `mapOffProductToPayload`).

**Guidance contract.** Each door carries reason-specific copy and hands the flow
the **barcode**, any **partial OFF payload**, the **`completeness`**, and any
**photo** already taken, so the form arrives prefilled and correctly keyed
(Decisions 5–6).

### 2. Placement: the Custom tab _becomes_ the full-panel form (#53 D1)

The Custom tab in `FoodStager.svelte` **is upgraded in place** into the #52
full-panel form — no new "Label" tab; the bar stays `🔍 Search · 📷 Scan · ✏️
Custom`. All four doors resolve here. The four-macro grid is subsumed: the form
leads with **Macros** and keeps a sticky Save bar, so the fast path stays "type
name + calories → Save" without scrolling past the micros. **Photo is optional** —
always-on manual entry uses the form with no photo (the identity-card thumbnail is
simply absent). Only the three barcode/label doors arrive with photos.

Rationale: one custom-entry mental model, not two; the scan-404 "Add it" hand-off
already targets Custom, so no re-routing; the fast path is preserved by the form's
own layout.

### 3. The full-panel confirm/entry form: Variant B, "Read-along" (#52)

Mobile-first, one responsive `max-width: 34rem` column (three variants
prototyped; B chosen, A/C dropped). Reference asset: the uncommitted prototype at
`src/lib/views/food/_prototype-52/` (run `?demo=labelform`) + its `NOTES.md`.

- **Sticky identity-card header:** label photo thumbnail on the left (tap →
  full-screen reader), Product name + Brand stacked beside it.
- **Basis toggle** (`per 100 g | serving`) below the header, resolving to the
  panel's `serving_size` string (`100 g` / `N g` / `1 serving`).
- **Read-along body:** a flat grouped list of every row — Macros ·
  fats/fibre/sugar/salt · the twelve vitamins & minerals · Portions — nothing
  hidden, transcribed top-to-bottom. Each section header has a one-tap **"none on
  label"** bulk-skip; each row has a **∅ "not on label"** toggle.
- **Grams stored, mg/µg typed** via the real `parseNutrientEntry` ⇆
  `nutrientDisplayValue` round-trip (the ADR-0031 idiom). **Absent ≠ 0** — an
  untouched or skipped row is **omitted** from the saved panel, never written as
  `0` (ADR-0030 / #28).
- **Thumb-zone sticky Save bar** with running kcal.

**One form serves both extraction modes** (Decision 4): it consumes an
`AIAutofillResult` (`src/lib/food/ai-autofill.ts`) — for guided-manual that
result is empty (blank rows); for AI-confirm it is prefilled, with a restrained
**amber left-rule** on prefilled rows that **clears on edit**, plus an "N to
review" chip and a "Review & save" CTA.

### 4. Extraction: v1 is guided-manual, AI-autofill deferred behind a committed seam (#51, grounded in #49)

**v1 = guided-manual transcription** — the photo shown beside the form, the human
reads the label into the rows; **no model call**. AI-autofill is **deferred, not
dropped**, behind the already-committed `AIAutofillResult` seam
(`src/lib/food/ai-autofill.ts`, commit `72115d9`): a later body-swap of
`autofillFromPackageImage` to a real multimodal-LLM call, consumed by the _same_
confirm form (Decision 3). Guided-manual is exactly the **empty-result** case, so
the form is built **once** for both.

Grounding (#49): cost is a **non-issue** (~$0.006–0.02 per label), so the map's
original cost caution is retired; the residual risk is **value fidelity** —
structured output guarantees the panel's _shape_, never its _truth_ — which is why
the model output is a **proposal the user confirms**, never written un-reviewed.
The default model would be **Haiku 4.5**, escalating to **Sonnet 5** for
dense/multilingual labels. The AI-vs-real-labels prototype moves to that future
effort.

### 5. Capture: a multi-photo array with a swipeable reader (#53 D2)

One food accepts **N photos** (the olive-oil label spanned two sides). Stored as
an ordered array **`food/label_photos: string[]`** (base64), first = display. For
display compatibility the flow **also mirrors `label_photos[0]` into the existing
singular `food/photo_base64`**, so every current display surface (staged card,
consumption views, ingredient picker) is unchanged — the array is purely
additive; **absent `food/label_photos` ⇒ a photo-less manual entry**.

Presentation: the identity-card thumbnail shows the first photo with a **"+N"**
badge; tapping opens a **swipeable** full-screen gallery. An **"+ Add photo"**
affordance appends another shot (the same `<input type=file accept=image/*
capture=environment>` idiom already in `FoodStager`); a photo can be removed
before save. **No pixel-stitching in v1** — the human reads across images. The
full set is what a future AI call (#49) sends and what the OFF contribution
(Decision 8) could one day upload, so capturing all photos now is not
speculative.

### 6. Save semantics: the key follows the barcode (#53 D3a)

| Door                   | Barcode? | Entity             | Save action                                          |
| ---------------------- | -------- | ------------------ | ---------------------------------------------------- |
| Missing (404)          | known    | `gtin:<code>`      | **mint** the twin there                              |
| Found-but-poor         | known    | `gtin:<code>`      | **append** corrected datoms (latest-wins supersedes) |
| Unreadable → typed     | known    | `gtin:<code>`      | mint / append as above                               |
| Unreadable → no number | none     | `food:custom_<id>` | mint                                                 |
| Always-on manual       | none     | `food:custom_<id>` | mint                                                 |

`handleBarcodeLookup` already does a **local-first** lookup
(`getLocalFoodTwin("gtin:"+code)` before OFF), so a twin saved at `gtin:<code>` is
exactly what the next scan returns — a correction **surfaces on re-scan**, where a
separate `food:custom_` would orphan it and let the poor OFF data resurface.
**Enrich-in-place is a plain append** — the ledger is append-only, latest-wins per
attribute; appending `food/name` + `nutrition/info` (+ brand, portions, photos,
provenance) to an existing `gtin:` entity supersedes the poor OFF values on the
next folded read, no delete, no migration. `saveCustomFood` already has the seam
(`customEntityId`): pass `gtin:<code>` to enrich, omit to mint `food:custom_`.
This matches OFF's own barcode identity and #50's **upsert-by-barcode** write, so
a `gtin:` twin is a clean 1:1 map to what Decision 8 contributes; a barcode-less
`food:custom_` twin is **correctly not contributable**.

A **new `saveLabelFood`** writer widens the too-narrow `saveCustomFood` for the
full panel:

```ts
saveLabelFood({
  name, brand?, nutrition: NutritionInfo, portions?: Portion[],
  labelPhotos: string[], labelCapture: LabelCapture,
  entityId?: string,          // gtin:<code> to enrich | undefined to mint food:custom_
}): Promise<string>
```

### 7. Provenance: a distinct `food/label_capture` attribute + origin badge (#53 D3b)

Enrich-in-place means a found-but-poor `gtin:` twin holds **both** OFF-sourced and
user-entered data. The origin of each must stay legible **without clobbering**
OFF's `twin/raw_provenance` — a second `twin/raw_provenance` datom would
latest-wins-supersede the OFF blob. So user origin is recorded under a **new
sibling attribute**:

```jsonc
"food/label_capture": {
  "adapter": "label",
  "adapter_version": 1,
  "method": "manual",          // "manual" (v1) | "ai-confirmed" (deferred #49/#51)
  "basis": "100 g",            // the #52 basis toggle → serving_size string
  "fields": ["name", "nutriments", "portions"]  // what the user supplied/edited
}
```

It follows the `RawProvenance` spirit (`src/lib/food/provenance.ts`: pure,
deterministic, no clock — the Datom's `time` is the capture basis) but is a
sibling, so OFF's provenance survives beside it and the twin's dual origin is
auditable. Photos are **referenced, not duplicated** — they live once in
`food/label_photos[]`. The **presence** of `food/label_capture` drives an advisory
badge: **"✏️ edited from label"** on a `gtin:` twin that also has OFF provenance,
**"✏️ your entry"** on a `food:custom_` twin with none. The badge does not change
logging.

### 8. OFF contribution: direct browser POST, no backend (#54, grounded in #50)

Contribution is **offered only** for a `gtin:` twin **and** a logged-in OFF user
(a barcode-less `food:custom_` has nothing to upsert under).

- **Transport.** A **direct browser POST** to the legacy
  `POST /cgi/product_jqm2.pl` (urlencoded, upsert-by-barcode). A live CORS spike
  (#54) confirmed OFF returns `Access-Control-Allow-Origin: *` and preflight-allows
  `POST` on **staging and prod** — so the write lands **and** the response is
  readable, **no backend required**. The v3 JSON PATCH API is **not** used: it
  still can't carry nutriments (re-verified against its write schema, #50). Kept
  behind a **swappable `submitToOpenFoodFacts` seam** (`open-food-facts.ts`,
  currently a stub).
- **Auth.** The **user's own** OFF `user_id` + `password` sent as **body params**
  (cookie auth is impossible under `ACAO:*`; anonymous writes 403). No anonymous
  write, no shippable app secret is viable in a static SPA (#50).
- **Secrets leave the ledger.** New principle: **secrets never live in the
  append-only EAVT ledger** (it is undeletable and syncs). OFF creds **and** the
  existing `settings/usda_api_key` / `settings/tmdb_api_key` move to
  **`localStorage`** via masked Settings fields. **No migration** — pre-release,
  no existing users; the old datoms are simply abandoned.
- **Consent — model C.** A Settings **master toggle, default-off**, _seeds_ an
  **always-shown-before-submit per-capture checkbox**. Submission is opt-in every
  time.
- **Payload.** **Structured data only** — name / brand / serving / the full
  `nutriment_*` panel; **replace** name + nutriments, **`add_`** tags; **no photo
  upload in v1** (deferred to lived experience).
- **Read feature.** Surface OFF's **own** front + nutrition photos (already in
  `twin/raw_provenance`) inline in the found-but-poor review, to compare against
  the user's capture.
- **Feedback & environment.** Readable success / auth / data-quality / network
  outcomes (defensive parse — 403s come back as HTML). Server target is
  env-driven (`VITE_OFF_WRITE_HOST`: staging `world.openfoodfacts.net` in dev,
  prod in build). **Online-only**, with a persistent "Contribute to OFF"
  affordance on the twin for manual retry.

**Amendment (2026-08-05):** The **Payload** bullet above under-specifies two
name/identity fields, and the shipped write path (`buildOffWriteBody`, #61)
followed it literally. (1) **Categories must be contributed.** OFF's
language-neutral identity for "what this product is" lives in the **categories
taxonomy** (`en:peanut-butters`), not the name — and `buildOffWriteBody` never
sends it, though our read mapper already stores `food/category`. The payload must
also emit **`add_categories`** (append, like `add_brands`); OFF's
`taxonomy_suggestions` endpoint lets the capture form offer a localized
type-ahead. (2) **The name is language-keyed.** A bare `product_name` (what we
send today) has no `product_name_<lc>` suffix or `lang` field; OFF's docs warn
this can clobber another language's name on a shared barcode — a latent write bug,
tracked as a riskier separate follow-up. Full detail and the OFF-taxonomy
grounding are in `docs/research/50-open-food-facts-write-api.md` → Addendum
(2026-08-05); the categories fix is cut as
[#84](https://github.com/inkpot-monkey/inventoria/issues/84).

## Consequences

- **`lookupBarcode` / `mapOffProductToPayload` must surface `completeness`** on the
  payload — the poor-quality predicate (Decision 1) consumes it.
- **`FoodChoice` and `StagerSeed` (custom cases) widen** from `{name, calories,
protein, fat, carbs, photo_base64}` to seed the full panel + barcode +
  partial-payload + `completeness`, so the four doors prefill the form
  (`src/lib/food/food-staging.ts`).
- **A new `saveLabelFood` writer** joins `saveCustomFood`; the too-narrow
  `saveCustomFood` stays for the plain fast path or is folded in as the writer's
  no-panel case (implementer's call).
- **New / changed food-twin attributes** to register in
  `docs/eavt-vocabulary.html`: `food/label_photos` (`string[]`),
  `food/label_capture` (object), and the reuse of `nutrition/info`, `twin/brand`,
  `food/portions` on a `gtin:` twin now written by the user.
- **The Custom tab is no longer the four-macro grid** — it is the full-panel form;
  the fast path survives via Macros-first + sticky Save.
- **Secrets move out of the EAVT ledger into `localStorage`** — a small settings
  refactor touching the existing USDA/TMDB keys too, not just the new OFF creds.
- **The `submitToOpenFoodFacts` stub becomes a real direct POST**; a new
  `VITE_OFF_WRITE_HOST` env var selects staging vs prod.
- **AI-autofill stays deferred** behind the `AIAutofillResult` seam — the form is
  built for both modes now, the model call arrives in a separate future effort.

## Alternatives considered

- **A fourth "Label" tab** instead of upgrading Custom in place. Rejected (#53):
  two custom-entry mental models where one suffices, and the scan-404 hand-off
  already routes to Custom.
- **Keying captured twins at `food:custom_` even when a barcode exists.** Rejected
  (#53): it orphans the correction from the local-first `gtin:` lookup, so the
  poor OFF data resurfaces on the next scan and the twin can't be contributed.
- **Overwriting `twin/raw_provenance` to mark user edits.** Rejected (#53):
  latest-wins would erase OFF's raw response; a sibling `food/label_capture`
  attribute keeps both origins auditable.
- **AI-autofill in v1.** Deferred (#51): the extraction _mechanism_ is decoupled
  behind the `AIAutofillResult` seam so the whole flow ships on guided-manual now;
  value-fidelity (not cost, #49) is the open risk, handled by confirm-before-save
  when the model arrives.
- **The OFF v3 JSON write API.** Rejected (#50/#54): it does not yet carry
  nutriments; the legacy `product_jqm2.pl` upsert does.
- **A backend proxy for the OFF write.** Rejected (#54): the live CORS spike
  proved a direct browser POST both lands and is readable, so a backend is
  unnecessary in a static SPA.
- **Keeping secrets in the EAVT ledger** (as USDA/TMDB keys are today). Rejected
  (#54): the ledger is append-only, undeletable, and syncs — the wrong home for a
  password; `localStorage` is the new rule.
- **Anonymous / app-secret OFF writes.** Rejected (#50): OFF has no anonymous
  write, and no app secret is safely shippable in a static SPA — contribution
  gates on the user's own OFF login.
- **Uploading the user's label photos to OFF in v1.** Out of scope (#54):
  structured data only; photo upload is deferred to lived experience.
