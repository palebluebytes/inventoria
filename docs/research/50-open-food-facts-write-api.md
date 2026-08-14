# Research: Open Food Facts contribution / write API + auth (#50)

**Parent map:** [#47](https://github.com/palebluebytes/inventoria/issues/47) — label-photo food-capture flow.
**Grounds:** `submitToOpenFoodFacts(barcode, {name, calories, protein, fat, carbs})` and (indirectly) `autofillFromPackageImage(imageBase64)` in `src/lib/food/open-food-facts.ts` / `src/lib/food/ai-autofill.ts`.
**Date:** 2026-07-31. **Status:** research only — no submission code written.

> **Doc-anchor correction:** the URL the stub's TODO points at,
> `https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-write/`, now **404s**.
> The write tutorial was renamed to
> [`tutorial-off-api`](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/).
> The authoritative machine-readable contract is the OpenAPI source in the
> `openfoodfacts-server` repo under `docs/api/ref/` (`api.yaml` legacy/v2, `api-v3.yaml` v3);
> every parameter name below is quoted from those specs.

---

## 1. Write API

### Two write paths: legacy CGI (primary) and a new v3 JSON PATCH

|                    | Legacy (use this today)                | v3 JSON                                                                  |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| Endpoint           | `POST /cgi/product_jqm2.pl`            | `PATCH /api/v3/product/{code}`                                           |
| Body               | `multipart/form-data` (flat key/value) | `application/json` (structured)                                          |
| Covers nutriments? | **Yes**                                | **No** — nutriments not yet supported                                    |
| Status             | Documented, stable                     | "deployed in production, but still under development, and it may change" |

- Legacy "Edit Product" endpoint: [api.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/api.yaml); tutorial: [tutorial-off-api](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/).
- v3 "Create or Update Product": [api-v3.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/api-v3.yaml). Verbatim: _"New API to send structured product data in a JSON format instead of in a flattened list of key / value pairs field as-in the current product add / edit API… Important: this new Product WRITE API has been deployed in production, but it is still under development, and it may change."_
- v3 currently supports only: language-specific fields (product name, ingredients text), tags fields (categories, labels), packaging fields, and image _selection_. **No v3 nutriment write is documented.** ([api-v3.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/api-v3.yaml))

**Decision for us:** because we write **nutriments**, target the legacy `cgi/product_jqm2.pl`. It carries every field we need; v3 PATCH does not yet.

### New product vs edit — same upsert-by-barcode call

Both endpoints upsert by barcode. Legacy spec, verbatim: _"If the barcode exists then you will be editing the existing product, However if it doesn't you will be creating a new product with that unique barcode, and adding properties to the product."_ ([api.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/api.yaml))

**Minimum to create a new product:** the request body marks only `code` as required; plus write auth (`user_id`/`password`) and a User-Agent. So minimally `code` + auth. Everything else is optional additive data. ([add_or_edit_a_product.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/add_or_edit_a_product.yaml)) The v3 PATCH also supports a **dry-run**: pass the literal path value `test` instead of a barcode to validate without writing. ([api-v3.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/api-v3.yaml))

### Field contract (`cgi/product_jqm2.pl`) — exact parameter names

All quoted from [add_or_edit_a_product.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/add_or_edit_a_product.yaml) unless noted.

| Data                 | Exact parameter                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barcode              | `code` (required)                                                                                                                                                                       |
| Product name         | `product_name` ("backward compatibility only"); **preferred** `product_name_<lc>`, e.g. `product_name_en`                                                                               |
| Brand                | `brands` (comma-separated)                                                                                                                                                              |
| Quantity             | `quantity` (value + unit, e.g. `"500 g"`)                                                                                                                                               |
| Categories           | `categories` (comma-separated)                                                                                                                                                          |
| Labels               | `labels` (comma-separated)                                                                                                                                                              |
| Ingredients          | `ingredients_text` (backward-compat); **preferred** `ingredients_text_<lc>`, e.g. `ingredients_text_en`                                                                                 |
| Field language       | `lc` (interface/field language), `lang` (main product language)                                                                                                                         |
| Serving size         | `serving_size`                                                                                                                                                                          |
| Nutrition basis      | `nutrition_data_per` — enum **`"100g"`** or **`"serving"`**                                                                                                                             |
| No nutrition on pack | `no_nutrition_data=on` ([cheatsheet](https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/))                                                                         |
| Nutriment value      | `nutriment_<nutrient_id>` — `nutrient_id` from OFF's nutrients taxonomy: `energy-kj`, `energy-kcal`, `fat`, `saturated-fat`, `proteins`, `carbohydrates`, `sugars`, `salt`, `sodium`, … |
| Nutriment unit       | `nutriment_<nutrient_id>_unit`                                                                                                                                                          |
| As-prepared value    | `nutriment_<nutrient_id>_prepared` ([cheatsheet](https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/))                                                             |

Two load-bearing nuances:

- **`nutrition_data_per` is global.** Verbatim: _"this field applies to all nutriment fields… if its value is changed, all nutrients should be supplied, so that we don't have existing values per 100g when the new values are per serving, or vice versa."_ Our panel stores per-100g, so post `nutrition_data_per=100g` and send the full set together. ([add_or_edit_a_product.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/add_or_edit_a_product.yaml))
- **Append vs replace on tag lists.** Plain `categories=` / `brands=` / `labels=` **replace**. Prefix with `add_` (`add_categories`, `add_labels`, `add_brands`) to **append** to existing lists — important when enriching a poor existing product rather than clobbering it. ([cheatsheet](https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/))

> **Mapping note (our `NutritionInfo` → OFF):** our read mapper (`open-food-facts.ts`) reads `*_100g` fields; the write side is the mirror — post `nutriment_energy-kcal`, `nutriment_proteins`, `nutriment_fat`, `nutriment_carbohydrates`, `nutriment_sugars`, `nutriment_saturated-fat`, `nutriment_fiber`, `nutriment_sodium`, plus the twelve micronutrient ids (`nutriment_vitamin-d`, `nutriment_calcium`, …, folate = `nutriment_vitamin-b9`), each with `nutrition_data_per=100g`. Note the current stub only carries 4 macros — a full-panel contribution (map #47 decision 3) needs the wider set.

### Label photo upload

Two endpoints exist.

- **Legacy multipart:** `POST /cgi/product_image_upload.pl` (`multipart/form-data`). Fields ([add_photo_to_existing_product.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/add_photo_to_existing_product.yaml)):
  - `code` — barcode (required)
  - `imagefield` — required, pattern `{front|ingredients|nutrition|packaging}_<2-letter-lang>` (e.g. `front_en`, `nutrition_en`) or `other`. _"The first image of a product is always selected as front picture."_
  - `imgupload_<imagefield>` — the binary; the field name is **dynamic** (`imgupload_front_en` when `imagefield=front_en`). Allowed: `gif|jpeg|jpg|png|heic`.
- **v3 base64:** `POST /api/v3/product/{code}/images` — image as base64 in `image_data_base64` with an optional `selected` object to crop/select for front/ingredients/nutrition/packaging per language; creates the product if missing. ([api-v3.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/api-v3.yaml)) This is the cleaner path for our base64-in-hand capture flow (`food/photo_base64`).
- **OCR trigger:** `GET /cgi/ingredients.pl` ("OCR on Ingredients"; params `id`, `code`, `process_image`, `ocr_engine`). Verbatim: _"Open Food Facts uses optical character recognition (OCR) to retrieve nutritional data and other information from the product labels."_ Crop existing images via `POST /cgi/product_image_crop.pl`. ([api.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/api.yaml))

---

## 2. Authentication

Source: [API index / Authentication](https://openfoodfacts.github.io/openfoodfacts-server/api/) ([raw index.md](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/index.md)).

- **Reads:** no auth beyond a custom User-Agent. Verbatim: _"READ operations… do not require authentication other than the custom User-Agent."_ (Matches our existing `lookupBarcode`.)
- **Writes:** require a user account, one of two ways:
  1. **Session cookie (preferred).** Log in via `GET /cgi/session.pl`, reuse the `session` cookie. Caveat, verbatim: _"the session must always be used from the same IP address, and there's a limit on sessions per user (currently 10)…"_
  2. **Credentials as body params.** _"include your account credentials as parameters… where `user_id` is your username and `password` is your password (do this on POST / PUT / DELETE requests, not on GET)."_ **`user_id` is the username, NOT the email.**
- **Basic Auth** is _not_ used for the API — it appears only as the staging anti-indexing gate (§3), unrelated to write auth.
- **OAuth / Keycloak:** future, not yet usable. Verbatim: _"Open Food Facts is migrating to Keycloak… OIDC-based authentication (OAuth 2.0 bearer tokens) will be supported in the future. The legacy username/password approach will remain available for backward compatibility."_ Treat OAuth as not-yet-available.

### Anonymous / attributed contribution & the app-account model

Writes are documented as requiring auth — there is **no documented pure-anonymous product write** via the API. OFF instead supports a **single global "app" account** with per-end-user attribution params ([change_ref_properties.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/change_ref_properties.yaml)):

- `comment` — _"A comment on the contribution. It will be shown in product changes history."_
- `app_name` — _"Name of the app providing the information"_
- `app_version` — _"Version of the app providing the information"_
- `app_uuid` — _"When an app uses a single user to log its contributions… provide an identifier (eg: an sha1 of the username) that's privacy preserving… In case we have trouble with one of your user, it helps our moderators revert edits."_

> **Flagged / unconfirmed:** I did not find a current primary API doc stating what happens to a genuinely unauthenticated edit. The web UI historically attributes anonymous edits to an IP-derived pseudo-user, but that is not asserted in today's API docs — so do not rely on anonymous writes.

### Browser / client-side-SPA credential implications (Inventoria is a Vite SPA — no server)

This is the critical constraint for a client-side SPA with **no backend to hold secrets**:

- OFF anticipates browser callers and lets you **pass `User-Agent` as a body param** when the real header can't be set: verbatim _"some times it's not possible to modify such a header (eg. request using JavaScript in a browser)… you can override it with this parameter."_ ([change_ref_properties.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/change_ref_properties.yaml))
- **But** the docs offer _no_ guidance on securely holding an OFF password in a browser (flagged: unaddressed in primary docs). The two workable models for us are:
  1. **User supplies their own OFF login** (username + password, or a session cookie obtained via `session.pl`) — the credential belongs to the user, never a shipped secret. Consent-gated. This is the SPA-safe model.
  2. **A shipped global app account** — would embed a shared password in client JS, i.e. a public secret anyone can extract. **Not viable for a static SPA** without a proxy/backend. If OFF app-account attribution is desired, it needs a server-side relay, which #47 does not currently have.
- CORS is a live open question for a browser POST to `cgi/product_jqm2.pl` — **not confirmed** in the primary docs; must be verified against staging before committing to a direct-from-browser write (see fog below).

---

## 3. Etiquette & safety

Source: [raw index.md](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/index.md).

- **Rate limits (verbatim):**
  - _"**15 req/min/IP address** for all read product queries… **There is no limit on product write queries.**"_
  - _"**10 req/min/IP address** for all search queries… don't use it for a search-as-you-type feature, you would be blocked very quickly."_
  - _"If your requests come from your users directly (ex: mobile app), the rate limits apply per user."_
  - Global anti-crawl limits also apply; exceeding returns **HTTP 503**.
  - (Older community docs mention a 2 req/min _facet_ limit — **unconfirmed** in today's primary doc; not relied upon.)
- **User-Agent (required) — exact format, verbatim:** _"The User-Agent should be in the form of `AppName/Version (ContactEmail)`. For example, `MyApp/1.0 (myapp@example.com)`."_ The OpenAPI `userAgentAuth` scheme phrases it as `app_name/app_version (URL or contact info)` — email **or** URL is acceptable. _"If we cannot identify the source of problematic API queries, we may have to block them."_ Concretely for us, e.g. `Inventoria/<version> (thomas@palebluebytes.space)`.
- **Staging / test environment (verbatim):**
  - _"Staging: `https://world.openfoodfacts.net`… Consider using the staging environment if you are not in a production scenario."_
  - _"Staging require an http basic auth to avoid search engine indexing. The username is `off`, and the password `off`."_ — the `off`/`off` Basic-Auth gate is confirmed and is **only** an anti-indexing gate, separate from product-write auth.
  - The write tutorial's own curl examples target `world.openfoodfacts.net`, confirming test-on-staging is the recommended path. Production host is `world.openfoodfacts.org`.

---

## 4. Data-quality expectations for a "good" contribution

Sources: [contribute page](https://world.openfoodfacts.org/contribute), [Data quality stats wiki](https://wiki.openfoodfacts.org/Data_quality_stats), the image `imagefield` taxonomy, and [add_or_edit_a_product.yaml](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/docs/api/ref/requestBodies/add_or_edit_a_product.yaml).

- **Photos are source-of-truth.** OFF's four canonical selectable image roles are **`front`, `ingredients`, `nutrition`, `packaging`** (each per-language). A good contribution ideally supplies all four. _"The first photo uploaded for a product is auto-selected as the product's front photo."_
- **Core structured fields OFF wants:** `product_name_<lc>`, `brands`, `quantity`, `categories`, `labels`, `ingredients_text_<lc>`, the nutrition facts (`nutriment_*` + `nutrition_data_per` + `serving_size`).
- **Completeness / data-quality program:** OFF runs automated data-quality checks and a public [Data quality stats](https://wiki.openfoodfacts.org/Data_quality_stats) dashboard. The v3 write even returns quality errors inline (e.g. _"Sugars higher than carbohydrates" → "Nutrients not updated"_), so the capture flow should sanity-check values before submitting. Robotoff (OFF's AI) derives further data from the photos.
- **Peer-correction & terms caveat:** the API index warns data is _"provided voluntarily by users… no assurances that the data is accurate, complete, or reliable"_; contributions _"can be edited, corrected or completed by other contributors."_ ([terms-of-use](https://world.openfoodfacts.org/terms-of-use))

> **Flagged:** no single primary page says "don't submit junk" in those words. The anti-junk posture is expressed structurally — the data-quality warning system, the `comment` field, `app_uuid` so moderators can revert a bad actor, and peer correction. The strongest concrete "good contribution" target is: **four label photos (front/ingredients/nutrition/packaging) + name + brand + quantity + categories + ingredients + full nutrition facts + serving size.**

---

## Bottom line for #54 (OFF contribution consent + submission UX)

[#54](https://github.com/palebluebytes/inventoria/issues/47) is blocked on this. Concrete answers:

- **Auth model (SPA-safe):** the **user supplies their own OFF credentials** — `user_id` (username, _not_ email) + `password` posted as body params on the write, or a session cookie from `GET /cgi/session.pl`. A **shipped global app account is NOT viable** for a static Vite SPA (it would embed a public secret); OFF's app-account attribution (`app_name`/`app_version`/`app_uuid`) only works safely with a server-side relay, which #47 doesn't have. OAuth/Keycloak is future, not usable yet. So #54's consent UX should gate on the user's own OFF login.
- **Write endpoint:** `POST /cgi/product_jqm2.pl` as `multipart/form-data` (it carries nutriments; v3 PATCH does not yet). Upsert-by-barcode — same call creates a new product or edits an existing one. Use `add_`-prefixed tag fields when enriching an existing poor product rather than replacing.
- **Photo upload:** v3 `POST /api/v3/product/{code}/images` (base64 `image_data_base64` — fits our `food/photo_base64` capture) or legacy `POST /cgi/product_image_upload.pl`; OCR via `GET /cgi/ingredients.pl`.
- **Staging target:** `https://world.openfoodfacts.net` behind HTTP Basic-Auth `off`/`off` (anti-indexing gate only). Exercise all contributions here first; production is `world.openfoodfacts.org`.
- **Required header:** `User-Agent: AppName/Version (contact)`, e.g. `Inventoria/<version> (thomas@palebluebytes.space)`; pass it as a body param if the browser blocks the header. Writes are unlimited; reads 15/min, search 10/min per IP.
- **Minimum good field set:** `code`, `product_name_en`, `brands`, `quantity`, `categories`, `ingredients_text_en`, `serving_size`, `nutrition_data_per=100g` + the `nutriment_<id>`/`nutriment_<id>_unit` panel, plus a front photo (ideally also nutrition + ingredients photos). Validate values (e.g. sugars ≤ carbs) before posting.

### Open questions this research surfaced (for the map)

- **CORS from the browser:** whether a direct SPA POST to `cgi/product_jqm2.pl` is allowed cross-origin is **not documented**; must be verified against staging before committing to server-less writes (a proxy may be unavoidable).
- **Full-panel write vs the 4-macro stub:** `submitToOpenFoodFacts` currently only accepts name + 4 macros; contributing a full twin (map decision 3) needs the wider `nutriment_*` set + serving + tags + photos — the stub signature will need to grow.

## Addendum (2026-08-05): categories, the language-keyed name, and the `taxonomy_suggestions` type-ahead

Follow-up dig (verified against OFF's [API intro](https://openfoodfacts.github.io/openfoodfacts-server/api/) + [cheatsheet](https://openfoodfacts.github.io/openfoodfacts-server/api/ref-cheatsheet/) and the [dart SDK docs](https://github.com/openfoodfacts/openfoodfacts-dart/blob/master/DOCUMENTATION.md)), prompted by "how does OFF handle a Spanish-labelled product". Two of the shipped #61 write path's fields (`buildOffWriteBody`, `src/lib/food/open-food-facts.ts`) diverge from the "minimum good field set" this research already named, so recording the specifics.

**A name is language-keyed; there is no single `product_name`.** OFF stores the name per language as `product_name_<lc>` (`product_name_en`, `product_name_es`, …). Each product carries **`lang`** (the language printed on the front of the pack) and **`lc`** (the interface/request language). The bare `product_name` is only a fallback OFF resolves against the product's `lang`. Names are **transcribed as printed, never translated** — cross-language equivalence is _not_ carried by the name. OFF's docs explicitly warn: use the language-suffixed field on write, "otherwise you might accidentally corrupt products by overwriting proper-language data with improper-language data."
⇒ **Shipped gap:** `buildOffWriteBody` sets a **bare `product_name`** (`open-food-facts.ts:428`) with no `_<lc>` suffix and no `lang` — the exact pattern OFF warns can clobber another language's name on a shared barcode.

**Categories are the language-neutral identity — and we don't send them.** "This is peanut butter" is carried not by the name but by the **categories taxonomy** node (`en:peanut-butters`), which OFF canonicalizes from whatever language/synonym you submit ("crema de cacahuete" → `en:peanut-butters`). `add_categories` **appends** (same idiom as the already-wired `add_brands`), so enriching never clobbers an existing list — and there is **no language-slot corruption risk**, unlike the name. Our **read** mapper already stores this as `food/category` (`open-food-facts.ts:234`), but the **write** never sends it ⇒ identity comes _in_ and never goes back _out_. `categories` was in this doc's own §"Minimum good field set"; #61 dropped it.

**OFF has a live category type-ahead — the user never has to guess.**

- Autocomplete: `GET /api/v3/taxonomy_suggestions?tagtype=categories&string=<prefix>&lc=<lang>&limit=N` (legacy: `GET /cgi/suggest.pl?tagtype=categories&term=…`) → localized matches as you type.
- Full dump (offline/seed): `GET /api/v2/taxonomy?tagtype=categories`.
  This turns a category field from "free-text and hope it matches" into a debounced type-ahead over OFF's canonical, localized list — the same widget vocabulary as the #65 food-search **bits-ui Combobox**, backed by a remote fetch instead of the local index. It rides the existing browser-side OFF GET infra (`lookupBarcode`), so no backend (consistent with ADR-0034 §8 / #54), and degrades to plain free-text offline (OFF re-canonicalizes on write regardless).

**Watch-outs for the implementer.**

- **Comma is OFF's category separator** — a single free-text category containing a comma splits into multiple. For a one-box input, document "one category" or split-and-trim intentionally; don't post a raw comma-bearing string blind.
- **Don't force `en:` taxonomy IDs on the user** — free text in the label's language is correct and sufficient; OFF canonicalizes server-side. Pre-fill `en:`-prefixed ids only from a known-good source (an existing `food/category`, or a future extractor).

**Recommended landing (→ ticket, ADR-0034 §8 amendment).** Add `category?` to `OffContribution`; emit `add_categories` (append) in `buildOffWriteBody`; **seed** it from the existing `food/category`; add a category field on the capture form — ideally the `taxonomy_suggestions`-backed Combobox, storing the canonical id, degrading to free-text. Feed a future #62 vision-extractor category guess through `taxonomy_suggestions` before pre-fill. Keep the **`product_name_<lc>` + `lang`** fix as a **separate, riskier follow-up** (it changes name-write semantics; categories is the safe, high-value one to do first).
